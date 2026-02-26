-- ─── DemandIQ ClickHouse Schema ──────────────────────────────────────
-- Analytical layer: billions of demand signal rows, columnar compression,
-- sub-second aggregation for dashboards and scenario resolution.

-- ─── Actuals (historical demand signal) ──────────────────────────────
CREATE TABLE IF NOT EXISTS demand.actuals (
    tenant_id    String,
    sku_id       String,
    sku_name     String,
    location_id  String,
    channel_id   String,
    period       Date,         -- Normalized to ISO date (Monday of week)
    period_label String,       -- Display label: "2025-W23", "Jan 2025"
    measure_id   String,       -- sales_qty, revenue, units, volume
    value        Float64,
    currency     String DEFAULT 'USD',
    source       String,       -- erp, pos, file
    upload_id    String,
    created_at   DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(period))
ORDER BY (tenant_id, sku_id, location_id, channel_id, period, measure_id)
SETTINGS index_granularity = 8192;

-- ─── Base Plan Values (stat forecast locked as base) ─────────────────
CREATE TABLE IF NOT EXISTS demand.base_plan_values (
    tenant_id    String,
    base_plan_id String,
    sku_id       String,
    sku_name     String,
    location_id  String,
    channel_id   String,
    period       Date,
    period_label String,
    measure_id   String,
    value        Float64,     -- Forecasted value
    model_used   String,      -- arima, prophet, lgbm, ensemble, etc.
    confidence   Float32,     -- Model confidence score
    lower_bound  Float64,
    upper_bound  Float64,
    created_at   DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(period))
ORDER BY (tenant_id, base_plan_id, sku_id, location_id, period, measure_id)
SETTINGS index_granularity = 8192;

-- ─── Scenario Deltas (delta engine — query-time merge) ───────────────
-- NOTE: Deltas are also in PostgreSQL for CRUD.
-- This ClickHouse table enables fast analytical merge at query time.
CREATE TABLE IF NOT EXISTS demand.scenario_deltas (
    tenant_id      String,
    scenario_id    String,
    base_plan_id   String,
    sku_id         String,
    location_id    String,
    channel_id     String,
    period         Date,
    period_label   String,
    measure_id     String,
    original_value Float64,
    override_value Float64,   -- The actual override value stored here
    change_pct     Float32,
    author_id      String,
    created_at     DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(created_at)   -- Latest override wins
PARTITION BY (tenant_id, toYYYYMM(period))
ORDER BY (tenant_id, scenario_id, sku_id, location_id, channel_id, period, measure_id)
SETTINGS index_granularity = 8192;

-- ─── Forecast Values (merged view: stat + consensus) ─────────────────
CREATE TABLE IF NOT EXISTS demand.forecast_values (
    tenant_id       String,
    base_plan_id    String,
    sku_id          String,
    sku_name        String,
    location_id     String,
    channel_id      String,
    period          Date,
    period_label    String,
    measure_id      String,
    stat_forecast   Float64,
    consensus_value Float64,
    actual_value    Float64,
    budget_value    Float64,
    created_at      DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(period))
ORDER BY (tenant_id, base_plan_id, sku_id, location_id, period, measure_id)
SETTINGS index_granularity = 8192;

-- ─── Forecast Metrics (accuracy KPIs per SKU) ────────────────────────
CREATE TABLE IF NOT EXISTS demand.forecast_metrics (
    tenant_id   String,
    sku_id      String,
    sku_name    String,
    location_id String,
    period      Date,
    mape        Float32,   -- Mean Absolute Percentage Error
    wmape       Float32,   -- Weighted MAPE
    bias        Float32,   -- Forecast Bias (positive = over-forecast)
    rmse        Float32,
    model_used  String,
    created_at  DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(period))
ORDER BY (tenant_id, sku_id, location_id, period)
SETTINGS index_granularity = 8192;

-- ─── Scenario Resolution View ─────────────────────────────────────────
-- Merges base plan + scenario deltas at query time (no data copy).
CREATE VIEW IF NOT EXISTS demand.scenario_resolved AS
SELECT
    bp.tenant_id,
    bp.base_plan_id,
    sd.scenario_id,
    bp.sku_id,
    bp.sku_name,
    bp.location_id,
    bp.channel_id,
    bp.period,
    bp.period_label,
    bp.measure_id,
    COALESCE(sd.override_value, bp.value) AS resolved_value,
    bp.value AS base_value,
    sd.override_value,
    sd.change_pct,
    sd.author_id
FROM demand.base_plan_values bp
LEFT JOIN demand.scenario_deltas sd
    ON sd.tenant_id    = bp.tenant_id
    AND sd.base_plan_id = bp.base_plan_id
    AND sd.sku_id       = bp.sku_id
    AND sd.location_id  = bp.location_id
    AND sd.period       = bp.period
    AND sd.measure_id   = bp.measure_id;

-- ─── Product Master (dimensional data) ───────────────────────────────
CREATE TABLE IF NOT EXISTS demand.products (
    tenant_id    String,
    sku_id       String,
    sku_name     String,
    category_l1  String,
    category_l2  String,
    category_l3  String,
    brand        String,
    is_active    UInt8 DEFAULT 1,
    attributes   String DEFAULT '{}',  -- JSON blob for custom attributes
    updated_at   DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, sku_id);

-- ─── Location Master ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demand.locations (
    tenant_id    String,
    location_id  String,
    location_name String,
    location_type String,  -- store, warehouse, region, country
    parent_id    String,
    attributes   String DEFAULT '{}',
    updated_at   DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, location_id);
