from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
import uuid
import httpx

from core.database import get_db
from core.security import get_current_user
from core.config import settings
from models.tenant import User

router = APIRouter()


class SchemaMappingRequest(BaseModel):
    mappings: dict  # {"product_id": "Article_Number", "time_key": "Cal_Week", ...}


@router.post("/upload", status_code=201)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Accept Excel or CSV file, store in MinIO, queue for ingestion."""
    allowed = {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
        "application/octet-stream",
    }
    if file.content_type not in allowed and not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="Only Excel (.xlsx, .xls) or CSV files are accepted")

    upload_id = str(uuid.uuid4())
    content = await file.read()

    # Store in MinIO via ingestion service
    background_tasks.add_task(
        _send_to_ingestion,
        upload_id=upload_id,
        tenant_id=user.tenant_id,
        filename=file.filename,
        content=content,
        content_type=file.content_type,
    )

    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "size": len(content),
        "status": "uploaded",
    }


@router.get("/uploads/{upload_id}/preview")
async def get_upload_preview(
    upload_id: str,
    user: User = Depends(get_current_user),
):
    """Returns column names and sample rows from the uploaded file."""
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"http://ingestion:8001/uploads/{upload_id}/preview",
                headers={"X-Tenant-ID": user.tenant_id},
                timeout=10.0,
            )
            return res.json()
    except Exception:
        # Return mock for development
        return {
            "columns": [
                "Article_Number", "Article_Description", "Plant",
                "Sales_Org", "Distribution_Channel", "Cal_Week",
                "Net_Sales_Qty", "Gross_Revenue", "Promo_Flag"
            ],
            "sample_rows": 5,
            "total_rows": 52440,
        }


@router.post("/uploads/{upload_id}/schema")
async def save_schema_mapping(
    upload_id: str,
    body: SchemaMappingRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Saves column mapping and triggers data ingestion pipeline."""
    from models.tenant import DataSchema
    import json

    schema = DataSchema(
        tenant_id=user.tenant_id,
        name=f"Upload {upload_id[:8]}",
        source_type="file",
        mappings=json.dumps(body.mappings),
    )
    db.add(schema)
    await db.commit()

    background_tasks.add_task(
        _trigger_ingestion,
        upload_id=upload_id,
        tenant_id=user.tenant_id,
        schema_id=schema.id,
        mappings=body.mappings,
    )

    return {"status": "ingestion_queued", "schema_id": schema.id}


@router.get("/schemas")
async def list_schemas(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from models.tenant import DataSchema
    result = await db.execute(
        select(DataSchema).where(DataSchema.tenant_id == user.tenant_id, DataSchema.is_active == True)
    )
    schemas = result.scalars().all()
    return [{"id": s.id, "name": s.name, "source_type": s.source_type} for s in schemas]


@router.get("/quality")
async def get_data_quality(user: User = Depends(get_current_user)):
    """Returns data quality check results from last ingestion."""
    # In production: query ingestion service or cached results
    return {
        "score": 74,
        "last_run": "2025-06-10T14:23:00Z",
        "checks": [
            {"name": "Missing values",      "status": "warn", "message": "2.3% null location_id", "affected_rows": 1204},
            {"name": "Date continuity",     "status": "pass", "message": "No gaps detected",       "affected_rows": 0},
            {"name": "Negative sales",      "status": "fail", "message": "47 rows negative",       "affected_rows": 47},
            {"name": "Duplicate records",   "status": "pass", "message": "No duplicates",          "affected_rows": 0},
            {"name": "Outliers (3σ)",       "status": "warn", "message": "134 outlier points",     "affected_rows": 134},
        ],
    }


async def _send_to_ingestion(upload_id: str, tenant_id: str, filename: str, content: bytes, content_type: str):
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "http://ingestion:8001/uploads/store",
                data={"upload_id": upload_id, "tenant_id": tenant_id, "filename": filename},
                files={"file": (filename, content, content_type)},
                timeout=30.0,
            )
    except Exception:
        pass


async def _trigger_ingestion(upload_id: str, tenant_id: str, schema_id: str, mappings: dict):
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "http://ingestion:8001/ingest",
                json={"upload_id": upload_id, "tenant_id": tenant_id, "schema_id": schema_id, "mappings": mappings},
                timeout=5.0,
            )
    except Exception:
        pass


@router.get("/connectors")
async def list_connectors(user: User = Depends(get_current_user)):
    return [
        {"id": "csv",  "name": "CSV/Excel", "status": "connected"},
        {"id": "sap",  "name": "SAP",       "status": "available"},
        {"id": "oracle","name": "Oracle",   "status": "available"},
    ]
