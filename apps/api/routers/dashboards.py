from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid
import json

from core.database import get_db, get_clickhouse_client
from core.security import get_current_user
from core.config import settings
from models.tenant import User

router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str
    context: Optional[dict] = None


class SaveViewRequest(BaseModel):
    viz_result: dict


# ─── In-memory saved views (replace with DB model in production) ──

@router.post("/generate")
async def generate_dashboard(
    body: GenerateRequest,
    user: User = Depends(get_current_user),
):
    """
    Uses LLM to parse user prompt → generates SQL → executes → returns viz config.
    """
    from openai import AsyncOpenAI

    if not settings.OPENAI_API_KEY:
        # Return mock viz for demo
        return _mock_viz(body.prompt)

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    system_prompt = """You are a demand planning SQL expert. Convert user questions into:
1. A ClickHouse SQL query against these tables:
   - demand.actuals (tenant_id, sku_id, sku_name, location_id, period, value, measure_id)
   - demand.forecast_values (tenant_id, sku_id, sku_name, period, stat_forecast, consensus_value, actual_value)
   - demand.forecast_metrics (tenant_id, sku_id, sku_name, period, mape, wmape, bias)
2. A visualization type: bar | line | heatmap | table | kpi
3. A chart config (xKey, yKey, lines, etc.)

Always filter: WHERE tenant_id = '{tenant_id}'
Respond ONLY with JSON: {"title": "...", "type": "...", "query": "...", "config": {...}}"""

    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt.replace("{tenant_id}", user.tenant_id)},
                {"role": "user", "content": body.prompt},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        parsed = json.loads(response.choices[0].message.content)

        # Execute the generated query in ClickHouse
        ch = get_clickhouse_client()
        try:
            result = ch.query(parsed["query"])
            data = [dict(zip(result.column_names, row)) for row in result.result_rows]
        except Exception as e:
            data = []

        return {
            "id": str(uuid.uuid4()),
            "title": parsed.get("title", body.prompt[:60]),
            "type": parsed.get("type", "table"),
            "query": parsed.get("query", ""),
            "config": parsed.get("config", {}),
            "data": data,
            "prompt": body.prompt,
        }

    except Exception as e:
        return _mock_viz(body.prompt)


@router.get("/saved-views")
async def list_saved_views(user: User = Depends(get_current_user)):
    # In production: query SavedView model from DB with tenant_id filter
    return []


@router.post("/saved-views", status_code=201)
async def save_view(
    body: SaveViewRequest,
    user: User = Depends(get_current_user),
):
    # In production: persist to DB
    view_id = str(uuid.uuid4())
    return {"id": view_id, "status": "saved"}


@router.delete("/saved-views/{view_id}")
async def delete_view(view_id: str, user: User = Depends(get_current_user)):
    return {"status": "deleted"}


def _mock_viz(prompt: str) -> dict:
    """Return a mock visualization for demo/development."""
    import random
    import math

    categories = ["Beverages", "Dairy", "Snacks", "Personal Care", "Household"]
    data = [
        {"name": cat, "value": round(random.uniform(5, 30), 1), "mape": round(random.uniform(5, 30), 1)}
        for cat in categories
    ]

    return {
        "id": str(uuid.uuid4()),
        "title": f"Analysis: {prompt[:60]}",
        "type": "bar",
        "query": f"-- AI-generated query for: {prompt}\nSELECT sku_name, avg(mape) FROM demand.forecast_metrics GROUP BY sku_name ORDER BY 2 DESC LIMIT 20",
        "config": {"xKey": "name", "yKey": "value"},
        "data": data,
        "prompt": prompt,
    }
