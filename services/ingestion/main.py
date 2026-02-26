"""
DemandIQ Data Ingestion Service
Handles Excel/CSV parsing, ERP data extraction, schema mapping,
data quality checks, and loading into ClickHouse.
"""
import logging
import io
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import numpy as np

from parsers.excel import ExcelParser
from parsers.csv_parser import CSVParser

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DemandIQ Ingestion Service", version="0.1.0")

# In-memory upload store (replace with MinIO in production)
_upload_store: dict = {}


@app.get("/health")
def health():
    return {"status": "ok"}


class IngestRequest(BaseModel):
    upload_id: str
    tenant_id: str
    schema_id: str
    mappings: dict


@app.post("/uploads/store", status_code=201)
async def store_upload(
    upload_id: str = Form(...),
    tenant_id: str = Form(...),
    filename: str = Form(...),
    file: UploadFile = File(...),
):
    content = await file.read()
    _upload_store[upload_id] = {
        "tenant_id": tenant_id,
        "filename": filename,
        "content": content,
        "content_type": file.content_type,
    }
    logger.info(f"Stored upload {upload_id}: {filename} ({len(content)} bytes)")
    return {"status": "stored"}


@app.get("/uploads/{upload_id}/preview")
async def preview_upload(upload_id: str):
    if upload_id not in _upload_store:
        raise HTTPException(status_code=404, detail="Upload not found")

    stored = _upload_store[upload_id]
    content = stored["content"]
    filename = stored["filename"]

    if filename.endswith((".xlsx", ".xls")):
        parser = ExcelParser()
    else:
        parser = CSVParser()

    df = parser.parse(io.BytesIO(content))
    return {
        "columns": df.columns.tolist(),
        "total_rows": len(df),
        "sample_rows": df.head(5).to_dict("records"),
    }


@app.post("/ingest")
async def ingest_data(body: IngestRequest, background_tasks: BackgroundTasks):
    if body.upload_id not in _upload_store:
        raise HTTPException(status_code=404, detail="Upload not found. Call /uploads/store first.")

    background_tasks.add_task(
        _run_ingestion_pipeline,
        upload_id=body.upload_id,
        tenant_id=body.tenant_id,
        schema_id=body.schema_id,
        mappings=body.mappings,
    )
    return {"status": "ingestion_started"}


async def _run_ingestion_pipeline(upload_id: str, tenant_id: str, schema_id: str, mappings: dict):
    """
    Full ingestion pipeline:
    1. Parse file
    2. Apply column mappings → canonical model
    3. Run data quality checks
    4. Normalize time periods
    5. Load into ClickHouse
    """
    from parsers.excel import ExcelParser
    from parsers.csv_parser import CSVParser
    from quality_checks import run_quality_checks
    import clickhouse_connect
    import os

    stored = _upload_store.get(upload_id)
    if not stored:
        return

    logger.info(f"[{upload_id}] Starting ingestion for tenant {tenant_id}")

    try:
        content = stored["content"]
        filename = stored["filename"]

        # Step 1: Parse
        if filename.endswith((".xlsx", ".xls")):
            df = ExcelParser().parse(io.BytesIO(content))
        else:
            df = CSVParser().parse(io.BytesIO(content))

        logger.info(f"[{upload_id}] Parsed {len(df)} rows, {len(df.columns)} columns")

        # Step 2: Apply mappings
        canonical = _apply_mappings(df, mappings, tenant_id)

        # Step 3: Quality checks
        issues = run_quality_checks(canonical)
        logger.info(f"[{upload_id}] Quality checks: {issues}")

        # Step 4: Load to ClickHouse
        ch = clickhouse_connect.get_client(
            host=os.getenv("CLICKHOUSE_HOST", "clickhouse"),
            username=os.getenv("CLICKHOUSE_USER", "dpuser"),
            password=os.getenv("CLICKHOUSE_PASSWORD", "dppassword"),
            database=os.getenv("CLICKHOUSE_DB", "demand"),
        )

        # Remove rows with null key fields
        canonical = canonical.dropna(subset=["sku_id", "period", "value"])
        canonical["value"] = pd.to_numeric(canonical["value"], errors="coerce").fillna(0)

        if len(canonical) > 0:
            ch.insert_df("demand.actuals", canonical, column_names=canonical.columns.tolist())
            logger.info(f"[{upload_id}] Loaded {len(canonical)} rows into ClickHouse")

        # Update SKU/location masters
        _update_product_master(ch, canonical)

    except Exception as e:
        logger.error(f"[{upload_id}] Ingestion failed: {e}")
        raise


def _apply_mappings(df: pd.DataFrame, mappings: dict, tenant_id: str) -> pd.DataFrame:
    """
    Apply the customer's column mappings to produce the canonical model.
    Canonical columns: tenant_id, sku_id, sku_name, location_id, channel_id, period, measure_id, value
    """
    canonical = pd.DataFrame()
    canonical["tenant_id"] = tenant_id

    # Required mappings
    if "product_id" in mappings and mappings["product_id"] in df.columns:
        canonical["sku_id"] = df[mappings["product_id"]].astype(str)
    else:
        raise ValueError("product_id mapping is required")

    if "time_key" in mappings and mappings["time_key"] in df.columns:
        canonical["period"] = pd.to_datetime(df[mappings["time_key"]], infer_datetime_format=True, errors="coerce")
        # Normalize to Monday of the week
        canonical["period"] = canonical["period"].dt.to_period("W").dt.start_time
    else:
        raise ValueError("time_key mapping is required")

    if "value" in mappings and mappings["value"] in df.columns:
        canonical["value"] = pd.to_numeric(df[mappings["value"]], errors="coerce")
    else:
        raise ValueError("value mapping is required")

    # Optional mappings
    canonical["sku_name"] = df[mappings["product_name"]].astype(str) if "product_name" in mappings and mappings["product_name"] in df.columns else canonical["sku_id"]
    canonical["location_id"] = df[mappings["location_id"]].astype(str) if "location_id" in mappings and mappings["location_id"] in df.columns else "DEFAULT"
    canonical["channel_id"] = df[mappings["channel_id"]].astype(str) if "channel_id" in mappings and mappings["channel_id"] in df.columns else "DEFAULT"
    canonical["measure_id"] = df[mappings["measure_id"]].astype(str) if "measure_id" in mappings and mappings["measure_id"] in df.columns else "sales_qty"

    canonical["source"] = "file"
    canonical["upload_id"] = "placeholder"

    return canonical


def _update_product_master(ch, df: pd.DataFrame):
    """Upsert product master from actuals data."""
    products = df[["tenant_id", "sku_id", "sku_name"]].drop_duplicates("sku_id")
    if len(products) > 0:
        ch.insert_df("demand.products", products, column_names=["tenant_id", "sku_id", "sku_name"])
