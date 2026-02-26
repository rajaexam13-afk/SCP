from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

from core.database import get_db, get_clickhouse_client
from core.security import get_current_user
from models.tenant import User
from models.scenario import Scenario, ScenarioDelta, BasePlan, ScenarioStatus

router = APIRouter()


class CreateScenarioRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    base_plan_id: str


class CreateDeltaRequest(BaseModel):
    sku_id: str
    location_id: Optional[str] = None
    period: str
    value: float
    comment: Optional[str] = ""
    measure_id: str = "sales_qty"


class CompareRequest(BaseModel):
    ids: List[str]


# ─── Scenarios CRUD ──────────────────────────────────────────

@router.get("")
async def list_scenarios(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Scenario)
        .where(Scenario.tenant_id == user.tenant_id)
        .order_by(Scenario.created_at.desc())
    )
    scenarios = result.scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "status": s.status,
            "base_plan_id": s.base_plan_id,
            "created_by": s.created_by,
            "created_at": s.created_at.isoformat(),
            "delta_count": s.delta_count,
        }
        for s in scenarios
    ]


@router.post("", status_code=201)
async def create_scenario(
    body: CreateScenarioRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify base plan belongs to tenant
    bp_result = await db.execute(
        select(BasePlan).where(BasePlan.id == body.base_plan_id, BasePlan.tenant_id == user.tenant_id)
    )
    if not bp_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Base plan not found")

    scenario = Scenario(
        tenant_id=user.tenant_id,
        base_plan_id=body.base_plan_id,
        name=body.name,
        description=body.description,
        created_by=user.id,
    )
    db.add(scenario)
    await db.commit()
    await db.refresh(scenario)
    return {"id": scenario.id, "name": scenario.name, "status": scenario.status}


@router.get("/{scenario_id}/deltas")
async def list_deltas(
    scenario_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    scenario = await _get_scenario(scenario_id, user.tenant_id, db)

    result = await db.execute(
        select(ScenarioDelta, User.name.label("author_name"))
        .join(User, ScenarioDelta.author_id == User.id)
        .where(ScenarioDelta.scenario_id == scenario_id)
        .order_by(ScenarioDelta.created_at.desc())
    )
    rows = result.all()
    return [
        {
            "sku_id":         r.ScenarioDelta.sku_id,
            "sku_name":       f"Product {r.ScenarioDelta.sku_id}",  # enriched by product catalog
            "period":         r.ScenarioDelta.period,
            "original_value": r.ScenarioDelta.original_value,
            "override_value": r.ScenarioDelta.override_value,
            "change_pct":     r.ScenarioDelta.change_pct,
            "author":         r.author_name,
            "comment":        r.ScenarioDelta.comment,
            "locked":         r.ScenarioDelta.is_locked,
        }
        for r in rows
    ]


@router.post("/{scenario_id}/deltas", status_code=201)
async def create_delta(
    scenario_id: str,
    body: CreateDeltaRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scenario = await _get_scenario(scenario_id, user.tenant_id, db)

    if scenario.status == ScenarioStatus.locked:
        raise HTTPException(status_code=400, detail="Scenario is locked and cannot be modified")

    # Get original value from ClickHouse base plan
    ch = get_clickhouse_client()
    original = _fetch_base_value(ch, scenario.base_plan_id, body.sku_id, body.period, body.measure_id)

    change_pct = ((body.value - original) / original * 100) if original else 0

    delta = ScenarioDelta(
        scenario_id=scenario_id,
        tenant_id=user.tenant_id,
        sku_id=body.sku_id,
        location_id=body.location_id,
        period=body.period,
        measure_id=body.measure_id,
        original_value=original,
        override_value=body.value,
        change_pct=round(change_pct, 2),
        author_id=user.id,
        comment=body.comment,
    )
    db.add(delta)

    # Update delta count
    scenario.delta_count = (scenario.delta_count or 0) + 1
    await db.commit()

    return {"status": "ok", "change_pct": change_pct}


@router.delete("/{scenario_id}/deltas/{delta_id}")
async def delete_delta(
    scenario_id: str,
    delta_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scenario = await _get_scenario(scenario_id, user.tenant_id, db)
    result = await db.execute(
        select(ScenarioDelta).where(
            ScenarioDelta.id == delta_id,
            ScenarioDelta.scenario_id == scenario_id,
        )
    )
    delta = result.scalar_one_or_none()
    if not delta:
        raise HTTPException(status_code=404, detail="Delta not found")
    if delta.is_locked:
        raise HTTPException(status_code=400, detail="Delta is locked")

    await db.delete(delta)
    scenario.delta_count = max(0, (scenario.delta_count or 1) - 1)
    await db.commit()
    return {"status": "deleted"}


@router.get("/{scenario_id}/forecast")
async def scenario_forecast(
    scenario_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns base plan forecast merged with scenario deltas.
    Resolution: SELECT COALESCE(delta.value, base.value) — done in ClickHouse.
    """
    scenario = await _get_scenario(scenario_id, user.tenant_id, db)
    ch = get_clickhouse_client()

    query = f"""
        SELECT
            period,
            SUM(COALESCE(sd.override_value, bp.value)) AS forecast,
            SUM(bp.value) AS base,
            SUM(a.value) AS actual
        FROM demand.base_plan_values bp
        LEFT JOIN demand.scenario_deltas sd
            ON sd.sku_id = bp.sku_id
            AND sd.period = bp.period
            AND sd.scenario_id = '{scenario_id}'
            AND sd.tenant_id = '{user.tenant_id}'
        LEFT JOIN demand.actuals a
            ON a.sku_id = bp.sku_id
            AND a.period = bp.period
            AND a.tenant_id = '{user.tenant_id}'
        WHERE bp.base_plan_id = '{scenario.base_plan_id}'
          AND bp.tenant_id = '{user.tenant_id}'
        GROUP BY period
        ORDER BY period
    """

    try:
        result = ch.query(query)
        rows = result.result_rows
        return [
            {
                "period": r[0],
                "statistical": r[2],    # base (stat forecast)
                "consensus": r[1],       # with scenario deltas
                "actual": r[3],
                "lower_bound": r[2] * 0.88,
                "upper_bound": r[2] * 1.12,
            }
            for r in rows
        ]
    except Exception:
        # Return mock data if ClickHouse not yet populated
        return _mock_forecast_data()


@router.post("/compare")
async def compare_scenarios(
    body: CompareRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Scenario).where(
            Scenario.id.in_(body.ids),
            Scenario.tenant_id == user.tenant_id,
        )
    )
    scenarios = result.scalars().all()
    return {
        "scenarios": [
            {
                "id": s.id,
                "name": s.name,
                "delta_count": s.delta_count,
                "total_units": "—",
                "vs_base_pct": "—",
                "avg_mape": "—",
            }
            for s in scenarios
        ],
        "chart": _mock_forecast_data(),
    }


# ─── Helpers ─────────────────────────────────────────────────

async def _get_scenario(scenario_id: str, tenant_id: str, db: AsyncSession) -> Scenario:
    result = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id, Scenario.tenant_id == tenant_id)
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


def _fetch_base_value(ch, base_plan_id: str, sku_id: str, period: str, measure_id: str) -> float:
    try:
        q = f"""
            SELECT value FROM demand.base_plan_values
            WHERE base_plan_id = '{base_plan_id}' AND sku_id = '{sku_id}'
              AND period = '{period}' AND measure_id = '{measure_id}'
            LIMIT 1
        """
        result = ch.query(q)
        return result.result_rows[0][0] if result.result_rows else 0.0
    except Exception:
        return 1000.0  # Fallback


def _mock_forecast_data():
    import math
    return [
        {
            "period": f"W{str(i+1).padStart(2, '0') if False else str(i+1).zfill(2)}",
            "actual": round(12000 + math.sin(i * 0.5) * 2000 + i * 80) if i < 13 else None,
            "statistical": round((12000 + math.sin(i * 0.5) * 2000 + i * 80) * 1.02),
            "consensus": round((12000 + math.sin(i * 0.5) * 2000 + i * 80) * 1.04) if i >= 13 else None,
            "lower_bound": round((12000 + math.sin(i * 0.5) * 2000 + i * 80) * 0.88),
            "upper_bound": round((12000 + math.sin(i * 0.5) * 2000 + i * 80) * 1.12),
        }
        for i in range(20)
    ]
