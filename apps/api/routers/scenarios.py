from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, delete as sql_delete
from pydantic import BaseModel
from typing import Optional, List

from core.database import get_db, get_clickhouse_client
from core.security import get_current_user
from models.tenant import User
from models.scenario import Scenario, ScenarioDelta, BasePlan, ScenarioStatus, CommitMode

router = APIRouter()


# ─── Pydantic schemas ─────────────────────────────────────────

class CreateScenarioRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    base_plan_id: Optional[str] = None   # Required only for root scenarios
    parent_id: Optional[str] = None      # Branch from an existing scenario
    commit_mode: Optional[str] = "manual"  # "auto" or "manual" (only meaningful for child scenarios)
    is_public: Optional[bool] = True     # False = private (only visible to creator)


class CreateDeltaRequest(BaseModel):
    sku_id: str
    location_id: Optional[str] = None
    period: str
    value: float
    comment: Optional[str] = ""
    measure_id: str = "sales_qty"


class CompareRequest(BaseModel):
    ids: List[str]


# ─── Serialisation helpers ────────────────────────────────────

def _sc_dict(s: Scenario, depth: int = 0) -> dict:
    return {
        "id":           s.id,
        "name":         s.name,
        "description":  s.description,
        "status":       s.status,
        "base_plan_id": s.base_plan_id,
        "parent_id":    s.parent_id,
        "created_by":   s.created_by,
        "created_at":   s.created_at.isoformat(),
        "delta_count":  s.delta_count,
        "is_protected": s.is_protected,
        "is_public":    s.is_public if s.is_public is not None else True,
        "commit_mode":  s.commit_mode or "manual",
        "depth":        depth,
    }


def _delta_dict(d: ScenarioDelta, author_name: str = "") -> dict:
    return {
        "id":             d.id,
        "sku_id":         d.sku_id,
        "location_id":    d.location_id,
        "channel_id":     d.channel_id,
        "period":         d.period,
        "measure_id":     d.measure_id,
        "original_value": d.original_value,
        "override_value": d.override_value,
        "change_pct":     d.change_pct,
        "author":         author_name,
        "comment":        d.comment,
        "locked":         d.is_locked,
    }


def _set_depths(node: dict, depth: int = 0) -> None:
    node["depth"] = depth
    for child in node.get("children", []):
        _set_depths(child, depth + 1)


# ─── Scenarios CRUD ──────────────────────────────────────────

@router.get("")
async def list_scenarios(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Scenario)
        .where(
            Scenario.tenant_id == user.tenant_id,
            or_(Scenario.is_public == True, Scenario.created_by == user.id),
        )
        .order_by(Scenario.created_at.desc())
    )
    return [_sc_dict(s) for s in result.scalars().all()]


@router.get("/tree")
async def get_scenario_tree(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns scenarios as a nested tree (flat query + Python assembly).
    No lazy-loading — safe for async SQLAlchemy.
    delta_count is computed from the actual rows in scenario_deltas so that
    stale values on the Scenario row never cause the sidebar to show wrong counts.
    """
    result = await db.execute(
        select(Scenario)
        .where(
            Scenario.tenant_id == user.tenant_id,
            or_(Scenario.is_public == True, Scenario.created_by == user.id),
        )
        .order_by(Scenario.created_at.asc())
    )
    all_scenarios = result.scalars().all()

    # Compute REAL delta counts directly from the delta rows — single extra query.
    # This is the authoritative count and is immune to the manually-maintained
    # delta_count field getting out of sync due to historical bugs.
    counts_result = await db.execute(
        select(ScenarioDelta.scenario_id, func.count(ScenarioDelta.id).label("cnt"))
        .where(ScenarioDelta.tenant_id == user.tenant_id)
        .group_by(ScenarioDelta.scenario_id)
    )
    actual_counts: dict[str, int] = {row.scenario_id: row.cnt for row in counts_result.all()}

    # Build tree in Python: no ORM relationship access needed
    nodes: dict = {}
    for s in all_scenarios:
        node = {**_sc_dict(s), "children": []}
        node["delta_count"] = actual_counts.get(s.id, 0)
        nodes[s.id] = node

    roots = []
    for s in all_scenarios:
        node = nodes[s.id]
        if s.parent_id and s.parent_id in nodes:
            nodes[s.parent_id]["children"].append(node)
        elif not s.parent_id:
            roots.append(node)

    for root in roots:
        _set_depths(root, 0)
    return roots


@router.post("", status_code=201)
async def create_scenario(
    body: CreateScenarioRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a scenario.
    - parent_id given  → inherits base_plan_id from parent; no need to supply one.
    - no parent_id     → base_plan_id is required and must exist.
    """
    effective_base_plan_id = body.base_plan_id

    if body.parent_id:
        parent_result = await db.execute(
            select(Scenario).where(
                Scenario.id == body.parent_id,
                Scenario.tenant_id == user.tenant_id,
            )
        )
        parent = parent_result.scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent scenario not found")
        effective_base_plan_id = parent.base_plan_id
    else:
        if not effective_base_plan_id:
            raise HTTPException(status_code=422, detail="base_plan_id is required for root scenarios")
        bp_result = await db.execute(
            select(BasePlan).where(
                BasePlan.id == effective_base_plan_id,
                BasePlan.tenant_id == user.tenant_id,
            )
        )
        if not bp_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Base plan not found")

    effective_commit_mode = "manual"
    if body.parent_id and body.commit_mode in ("auto", "manual"):
        effective_commit_mode = body.commit_mode

    scenario = Scenario(
        tenant_id=user.tenant_id,
        base_plan_id=effective_base_plan_id,
        parent_id=body.parent_id,
        name=body.name,
        description=body.description or "",
        created_by=user.id,
        commit_mode=effective_commit_mode,
        is_public=body.is_public if body.is_public is not None else True,
    )
    db.add(scenario)
    await db.commit()
    await db.refresh(scenario)
    return _sc_dict(scenario)


@router.delete("/{scenario_id}")
async def delete_scenario(
    scenario_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scenario = await _get_scenario(scenario_id, user.tenant_id, db)
    if scenario.is_protected:
        raise HTTPException(
            status_code=403,
            detail=f"'{scenario.name}' is a protected scenario and cannot be deleted",
        )
    # BFS — collect the target + all descendants so nothing is orphaned.
    # This works regardless of whether the DB FK is CASCADE or SET NULL.
    all_ids: list[str] = []
    frontier: list[str] = [scenario_id]
    while frontier:
        all_ids.extend(frontier)
        children = await db.execute(
            select(Scenario.id).where(
                Scenario.parent_id.in_(frontier),
                Scenario.tenant_id == user.tenant_id,
            )
        )
        frontier = [r[0] for r in children.all()]

    await db.execute(
        sql_delete(Scenario).where(
            Scenario.id.in_(all_ids),
            Scenario.tenant_id == user.tenant_id,
        )
    )
    await db.commit()
    return {"status": "deleted", "id": scenario_id, "total_deleted": len(all_ids)}


@router.patch("/{scenario_id}/status")
async def update_status(
    scenario_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scenario = await _get_scenario(scenario_id, user.tenant_id, db)
    new_status = body.get("status")
    if new_status not in {"draft", "review", "approved", "locked"}:
        raise HTTPException(status_code=422, detail="Invalid status")
    scenario.status = new_status
    await db.commit()
    return {"id": scenario.id, "status": scenario.status}


@router.patch("/{scenario_id}/commit-mode")
async def update_commit_mode(
    scenario_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Switch a child scenario between auto and manual commit mode."""
    scenario = await _get_scenario(scenario_id, user.tenant_id, db)
    if not scenario.parent_id:
        raise HTTPException(status_code=400, detail="Root scenarios do not have a commit mode")
    mode = body.get("commit_mode")
    if mode not in ("auto", "manual"):
        raise HTTPException(status_code=422, detail="commit_mode must be 'auto' or 'manual'")
    scenario.commit_mode = mode
    await db.commit()
    return {"id": scenario.id, "commit_mode": scenario.commit_mode}


@router.patch("/{scenario_id}/visibility")
async def update_visibility(
    scenario_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a scenario between public (visible to all tenant members) and private (creator only)."""
    scenario = await _get_scenario(scenario_id, user.tenant_id, db)
    if scenario.created_by != user.id:
        raise HTTPException(status_code=403, detail="Only the scenario creator can change its visibility")
    is_public = body.get("is_public")
    if not isinstance(is_public, bool):
        raise HTTPException(status_code=422, detail="is_public must be a boolean")
    scenario.is_public = is_public
    await db.commit()
    return {"id": scenario.id, "is_public": scenario.is_public}


# ─── Deltas ──────────────────────────────────────────────────

@router.get("/{scenario_id}/deltas")
async def list_deltas(
    scenario_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_scenario(scenario_id, user.tenant_id, db)
    result = await db.execute(
        select(ScenarioDelta, User.name.label("author_name"))
        .outerjoin(User, ScenarioDelta.author_id == User.id)
        .where(ScenarioDelta.scenario_id == scenario_id)
        .order_by(ScenarioDelta.created_at.desc())
    )
    return [_delta_dict(r.ScenarioDelta, r.author_name or "") for r in result.all()]


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

    ch = get_clickhouse_client()
    original = _fetch_base_value(ch, scenario.base_plan_id, body.sku_id, body.period, body.measure_id)
    change_pct = ((body.value - original) / original * 100) if original else 0

    # Write the delta ONLY to the explicitly targeted scenario.
    # No automatic fan-out to children — use the /sync endpoint for that.
    db.add(ScenarioDelta(
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
    ))
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


@router.post("/{scenario_id}/deltas/{delta_id}/promote", status_code=201)
async def promote_delta_to_parent(
    scenario_id: str,
    delta_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Copy a child delta up to the parent scenario."""
    child = await _get_scenario(scenario_id, user.tenant_id, db)
    if not child.parent_id:
        raise HTTPException(status_code=400, detail="Root scenarios have no parent to promote to")

    delta_result = await db.execute(
        select(ScenarioDelta).where(
            ScenarioDelta.id == delta_id,
            ScenarioDelta.scenario_id == scenario_id,
            ScenarioDelta.tenant_id == user.tenant_id,
        )
    )
    delta = delta_result.scalar_one_or_none()
    if not delta:
        raise HTTPException(status_code=404, detail="Delta not found")

    parent_result = await db.execute(
        select(Scenario).where(
            Scenario.id == child.parent_id,
            Scenario.tenant_id == user.tenant_id,
        )
    )
    parent = parent_result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent scenario not found")
    if parent.status == ScenarioStatus.locked:
        raise HTTPException(status_code=400, detail="Parent scenario is locked")

    # Prevent duplicate — parent already has an override for this cell
    existing = await db.execute(
        select(ScenarioDelta).where(
            ScenarioDelta.scenario_id == parent.id,
            ScenarioDelta.sku_id == delta.sku_id,
            ScenarioDelta.period == delta.period,
            ScenarioDelta.measure_id == delta.measure_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Parent already has a delta for this SKU+period. Remove the parent override first.",
        )

    db.add(ScenarioDelta(
        scenario_id=parent.id,
        tenant_id=user.tenant_id,
        sku_id=delta.sku_id,
        location_id=delta.location_id,
        channel_id=delta.channel_id,
        period=delta.period,
        measure_id=delta.measure_id,
        original_value=delta.original_value,
        override_value=delta.override_value,
        change_pct=delta.change_pct,
        author_id=user.id,
        comment=f"Promoted from '{child.name}'",
    ))
    parent.delta_count = (parent.delta_count or 0) + 1
    await db.commit()
    return {"status": "promoted", "parent_id": parent.id, "parent_name": parent.name}


@router.post("/{scenario_id}/promote-all", status_code=201)
async def promote_all_to_parent(
    scenario_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Copy all unlocked child deltas to the parent scenario, skipping conflicts."""
    child = await _get_scenario(scenario_id, user.tenant_id, db)
    if not child.parent_id:
        raise HTTPException(status_code=400, detail="Root scenarios have no parent to promote to")

    parent_result = await db.execute(
        select(Scenario).where(
            Scenario.id == child.parent_id,
            Scenario.tenant_id == user.tenant_id,
        )
    )
    parent = parent_result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent scenario not found")
    if parent.status == ScenarioStatus.locked:
        raise HTTPException(status_code=400, detail="Parent scenario is locked")

    child_deltas_result = await db.execute(
        select(ScenarioDelta).where(
            ScenarioDelta.scenario_id == scenario_id,
            ScenarioDelta.tenant_id == user.tenant_id,
            ScenarioDelta.is_locked == False,
        )
    )
    child_deltas = child_deltas_result.scalars().all()

    parent_deltas_result = await db.execute(
        select(ScenarioDelta).where(
            ScenarioDelta.scenario_id == parent.id,
            ScenarioDelta.tenant_id == user.tenant_id,
        )
    )
    parent_keys = {
        (d.sku_id, d.location_id or "", d.channel_id or "", d.period, d.measure_id)
        for d in parent_deltas_result.scalars().all()
    }

    promoted = 0
    skipped = 0
    for delta in child_deltas:
        key = (delta.sku_id, delta.location_id or "", delta.channel_id or "", delta.period, delta.measure_id)
        if key not in parent_keys:
            db.add(ScenarioDelta(
                scenario_id=parent.id,
                tenant_id=user.tenant_id,
                sku_id=delta.sku_id,
                location_id=delta.location_id,
                channel_id=delta.channel_id,
                period=delta.period,
                measure_id=delta.measure_id,
                original_value=delta.original_value,
                override_value=delta.override_value,
                change_pct=delta.change_pct,
                author_id=user.id,
                comment=f"Promoted from '{child.name}'",
            ))
            promoted += 1
        else:
            skipped += 1

    if promoted > 0:
        parent.delta_count = (parent.delta_count or 0) + promoted
    await db.commit()
    return {"status": "promoted", "promoted": promoted, "skipped": skipped, "parent_id": parent.id}


@router.get("/{scenario_id}/pending-sync")
async def get_pending_sync(
    scenario_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return parent deltas that are not yet applied in this child scenario."""
    child = await _get_scenario(scenario_id, user.tenant_id, db)
    if not child.parent_id:
        return []

    parent_result = await db.execute(
        select(ScenarioDelta).where(
            ScenarioDelta.scenario_id == child.parent_id,
            ScenarioDelta.tenant_id == user.tenant_id,
        )
    )
    parent_deltas = parent_result.scalars().all()

    child_result = await db.execute(
        select(ScenarioDelta).where(
            ScenarioDelta.scenario_id == scenario_id,
            ScenarioDelta.tenant_id == user.tenant_id,
        )
    )
    child_keys = {
        (d.sku_id, d.location_id or "", d.channel_id or "", d.period, d.measure_id)
        for d in child_result.scalars().all()
    }

    pending = [
        d for d in parent_deltas
        if (d.sku_id, d.location_id or "", d.channel_id or "", d.period, d.measure_id) not in child_keys
    ]
    return [_delta_dict(d) for d in pending]


@router.post("/{scenario_id}/sync", status_code=201)
async def sync_from_parent(
    scenario_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pull all pending parent deltas into this child scenario."""
    child = await _get_scenario(scenario_id, user.tenant_id, db)
    if not child.parent_id:
        raise HTTPException(status_code=400, detail="Root scenarios have no parent to sync from")
    if child.status == ScenarioStatus.locked:
        raise HTTPException(status_code=400, detail="Locked scenario cannot be synced")

    parent_result = await db.execute(
        select(ScenarioDelta).where(
            ScenarioDelta.scenario_id == child.parent_id,
            ScenarioDelta.tenant_id == user.tenant_id,
        )
    )
    parent_deltas = parent_result.scalars().all()

    child_result = await db.execute(
        select(ScenarioDelta).where(
            ScenarioDelta.scenario_id == scenario_id,
            ScenarioDelta.tenant_id == user.tenant_id,
        )
    )
    child_keys = {
        (d.sku_id, d.location_id or "", d.channel_id or "", d.period, d.measure_id)
        for d in child_result.scalars().all()
    }

    synced = 0
    for pd in parent_deltas:
        key = (pd.sku_id, pd.location_id or "", pd.channel_id or "", pd.period, pd.measure_id)
        if key not in child_keys:
            db.add(ScenarioDelta(
                scenario_id=child.id,
                tenant_id=user.tenant_id,
                sku_id=pd.sku_id,
                location_id=pd.location_id,
                channel_id=pd.channel_id,
                period=pd.period,
                measure_id=pd.measure_id,
                original_value=pd.original_value,
                override_value=pd.override_value,
                change_pct=pd.change_pct,
                author_id=user.id,
                comment="Synced from parent scenario",
            ))
            synced += 1

    child.delta_count = (child.delta_count or 0) + synced
    await db.commit()
    return {"status": "synced", "count": synced}


# ─── Forecast ────────────────────────────────────────────────

@router.get("/{scenario_id}/forecast")
async def scenario_forecast(
    scenario_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scenario = await _get_scenario(scenario_id, user.tenant_id, db)
    ch = get_clickhouse_client()

    query = f"""
        SELECT period,
               SUM(COALESCE(sd.override_value, bp.value)) AS forecast,
               SUM(bp.value) AS base,
               SUM(a.value)  AS actual
        FROM demand.base_plan_values bp
        LEFT JOIN demand.scenario_deltas sd
            ON sd.sku_id = bp.sku_id AND sd.period = bp.period
            AND sd.scenario_id = '{scenario_id}'
            AND sd.tenant_id   = '{user.tenant_id}'
        LEFT JOIN demand.actuals a
            ON a.sku_id = bp.sku_id AND a.period = bp.period
            AND a.tenant_id = '{user.tenant_id}'
        WHERE bp.base_plan_id = '{scenario.base_plan_id}'
          AND bp.tenant_id    = '{user.tenant_id}'
        GROUP BY period ORDER BY period
    """

    try:
        rows = ch.query(query).result_rows
        return [
            {
                "period":      r[0],
                "statistical": r[2],
                "consensus":   r[1],
                "actual":      r[3],
                "lower_bound": r[2] * 0.88,
                "upper_bound": r[2] * 1.12,
            }
            for r in rows
        ]
    except Exception:
        return _mock_forecast_data(scenario_id)


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
    return {
        "scenarios": [
            {"id": s.id, "name": s.name, "delta_count": s.delta_count,
             "total_units": "—", "vs_base_pct": "—", "avg_mape": "—"}
            for s in result.scalars().all()
        ],
        "chart": _mock_forecast_data(),
    }


# ─── Helpers ─────────────────────────────────────────────────

async def _get_scenario(scenario_id: str, tenant_id: str, db: AsyncSession) -> Scenario:
    result = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id, Scenario.tenant_id == tenant_id)
    )
    sc = result.scalar_one_or_none()
    if not sc:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return sc


def _fetch_base_value(ch, base_plan_id: str, sku_id: str, period: str, measure_id: str) -> float:
    try:
        result = ch.query(
            f"SELECT value FROM demand.base_plan_values "
            f"WHERE base_plan_id='{base_plan_id}' AND sku_id='{sku_id}' "
            f"AND period='{period}' AND measure_id='{measure_id}' LIMIT 1"
        )
        return result.result_rows[0][0] if result.result_rows else 0.0
    except Exception:
        return 1000.0


def _mock_forecast_data(scenario_id: str = ""):
    """
    Returns deterministic mock forecast data.
    scenario_id is used to produce a small but consistent per-scenario offset
    so that different scenarios are visually distinguishable in the chart even
    when ClickHouse is unavailable.
    """
    import math
    # Derive a stable ±15 % scale factor from the scenario_id string
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(scenario_id)) if scenario_id else 0
    factor = 1.0 + ((seed % 31) - 15) / 100  # maps to [0.85, 1.15]
    return [
        {
            "period":      f"W{str(i + 1).zfill(2)}",
            "actual":      round((12000 + math.sin(i * 0.5) * 2000 + i * 80) * factor) if i < 13 else None,
            "statistical": round((12000 + math.sin(i * 0.5) * 2000 + i * 80) * factor * 1.02),
            "consensus":   round((12000 + math.sin(i * 0.5) * 2000 + i * 80) * factor * 1.04) if i >= 13 else None,
            "lower_bound": round((12000 + math.sin(i * 0.5) * 2000 + i * 80) * factor * 0.88),
            "upper_bound": round((12000 + math.sin(i * 0.5) * 2000 + i * 80) * factor * 1.12),
        }
        for i in range(20)
    ]
