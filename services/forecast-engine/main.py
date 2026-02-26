"""
DemandIQ Forecast Engine
Runs demand forecasting jobs per tenant using AutoML model selection.
"""
import logging
import asyncio
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import numpy as np
import clickhouse_connect
from pipeline.automl import AutoMLForecaster
from reconciliation.hierarchical import HierarchicalReconciler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DemandIQ Forecast Engine", version="0.1.0")


class ForecastRequest(BaseModel):
    tenant_id: str
    model_type: str = "auto"
    horizon_weeks: int = 13
    sku_filter: Optional[list] = None  # None = all SKUs


class ForecastResponse(BaseModel):
    status: str
    skus_processed: int
    job_id: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/forecast/run")
async def run_forecast(body: ForecastRequest, background_tasks: BackgroundTasks):
    import uuid
    job_id = str(uuid.uuid4())
    background_tasks.add_task(
        _run_forecast_job,
        job_id=job_id,
        tenant_id=body.tenant_id,
        model_type=body.model_type,
        horizon_weeks=body.horizon_weeks,
        sku_filter=body.sku_filter,
    )
    return {"status": "queued", "job_id": job_id}


async def _run_forecast_job(
    job_id: str,
    tenant_id: str,
    model_type: str,
    horizon_weeks: int,
    sku_filter: Optional[list],
):
    """
    Full forecast pipeline for all SKUs of a tenant:
    1. Load actuals from ClickHouse
    2. Run AutoML per SKU
    3. Hierarchical reconciliation (bottom-up)
    4. Compute accuracy metrics
    5. Write results back to ClickHouse
    """
    logger.info(f"[{job_id}] Starting forecast job for tenant {tenant_id}")

    try:
        ch = _get_ch_client()
        forecaster = AutoMLForecaster(horizon=horizon_weeks)
        reconciler = HierarchicalReconciler()

        # Step 1: Load historical actuals
        query = f"""
            SELECT sku_id, sku_name, location_id, period, value
            FROM demand.actuals
            WHERE tenant_id = '{tenant_id}'
              AND measure_id = 'sales_qty'
              {"AND sku_id IN (" + ",".join(f"'{s}'" for s in sku_filter) + ")" if sku_filter else ""}
            ORDER BY sku_id, location_id, period
        """
        result = ch.query(query)
        df = pd.DataFrame(result.result_rows, columns=["sku_id", "sku_name", "location_id", "period", "value"])
        df["period"] = pd.to_datetime(df["period"])

        if df.empty:
            logger.warning(f"[{job_id}] No actuals found for tenant {tenant_id}")
            return

        # Step 2: Run AutoML per SKU × Location combination
        sku_location_groups = df.groupby(["sku_id", "location_id"])
        all_forecasts = []
        all_metrics = []

        for (sku_id, location_id), group in sku_location_groups:
            ts = group.set_index("period")["value"].sort_index()
            sku_name = group["sku_name"].iloc[0]

            try:
                result = forecaster.fit_predict(ts, horizon=horizon_weeks, model_override=model_type)
                forecasts = result["forecast"]
                lower = result.get("lower", [f * 0.88 for f in forecasts])
                upper = result.get("upper", [f * 1.12 for f in forecasts])
                model_used = result.get("model", "auto")
                mape_cv = result.get("mape_cv", 0.0)

                # Generate future periods
                last_date = ts.index.max()
                future_dates = pd.date_range(start=last_date + pd.Timedelta(weeks=1), periods=horizon_weeks, freq="W")

                for i, date in enumerate(future_dates):
                    all_forecasts.append({
                        "tenant_id": tenant_id,
                        "sku_id": sku_id,
                        "sku_name": sku_name,
                        "location_id": location_id,
                        "period": date.date().isoformat(),
                        "value": max(0, forecasts[i]),
                        "lower_bound": max(0, lower[i]),
                        "upper_bound": upper[i],
                        "model_used": model_used,
                        "confidence": 1.0 - mape_cv,
                    })

                # Compute accuracy on holdout (last 4 weeks)
                if len(ts) >= 8:
                    holdout = ts.iloc[-4:]
                    train = ts.iloc[:-4]
                    holdout_result = forecaster.fit_predict(train, horizon=4, model_override=model_type)
                    pred = np.array(holdout_result["forecast"])[:4]
                    actual = holdout.values
                    mape = float(np.mean(np.abs((actual - pred) / (actual + 1e-8))))
                    bias = float(np.mean((pred - actual) / (actual + 1e-8)))

                    all_metrics.append({
                        "tenant_id": tenant_id,
                        "sku_id": sku_id,
                        "sku_name": sku_name,
                        "location_id": location_id,
                        "period": last_date.date().isoformat(),
                        "mape": mape,
                        "wmape": mape,
                        "bias": bias,
                        "rmse": float(np.sqrt(np.mean((pred - actual) ** 2))),
                        "model_used": model_used,
                    })

            except Exception as e:
                logger.error(f"[{job_id}] Failed for SKU {sku_id}/{location_id}: {e}")
                continue

        # Step 3: Write forecast to ClickHouse
        if all_forecasts:
            forecast_df = pd.DataFrame(all_forecasts)
            ch.insert_df("demand.base_plan_values", forecast_df, column_names=forecast_df.columns.tolist())
            logger.info(f"[{job_id}] Written {len(all_forecasts)} forecast rows")

        if all_metrics:
            metrics_df = pd.DataFrame(all_metrics)
            ch.insert_df("demand.forecast_metrics", metrics_df, column_names=metrics_df.columns.tolist())
            logger.info(f"[{job_id}] Written {len(all_metrics)} metric rows")

        logger.info(f"[{job_id}] Completed. SKUs: {sku_location_groups.ngroups}")

    except Exception as e:
        logger.error(f"[{job_id}] Fatal error: {e}")
        raise


def _get_ch_client():
    import os
    return clickhouse_connect.get_client(
        host=os.getenv("CLICKHOUSE_HOST", "clickhouse"),
        port=int(os.getenv("CLICKHOUSE_PORT", "8123")),
        username=os.getenv("CLICKHOUSE_USER", "dpuser"),
        password=os.getenv("CLICKHOUSE_PASSWORD", "dppassword"),
        database=os.getenv("CLICKHOUSE_DB", "demand"),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
