-- ─── DemandIQ PostgreSQL Schema ─────────────────────────────────────
-- Multi-tenant, row-level security enforced at application layer.
-- Tenant isolation: every table has tenant_id indexed column.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fast text search on SKU names

-- ─── Tenants ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    industry    VARCHAR(100),
    plan_tier   VARCHAR(20)  NOT NULL DEFAULT 'free'
                CHECK (plan_tier IN ('free','starter','growth','scale')),
    sku_limit   INTEGER NOT NULL DEFAULT 500,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    settings    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ─── Users ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       VARCHAR(255) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    hashed_pw   VARCHAR(255) NOT NULL,
    role        VARCHAR(20)  NOT NULL DEFAULT 'planner'
                CHECK (role IN ('admin','planner','analyst','viewer')),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- ─── Data Schemas (column mapping configs) ───────────────────────────
CREATE TABLE IF NOT EXISTS data_schemas (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    source_type VARCHAR(50),  -- csv, excel, sap, oracle, jde, d365
    mappings    JSONB NOT NULL DEFAULT '{}',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_schemas_tenant_id ON data_schemas(tenant_id);

-- ─── Base Plans ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS base_plans (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    period      VARCHAR(100),       -- "2025 Full Year"
    is_locked   BOOLEAN NOT NULL DEFAULT false,
    locked_by   UUID REFERENCES users(id),
    locked_at   TIMESTAMPTZ,
    sku_count   INTEGER DEFAULT 0,
    row_count   INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_base_plans_tenant_id ON base_plans(tenant_id);

-- ─── Scenarios ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenarios (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    base_plan_id UUID NOT NULL REFERENCES base_plans(id),
    name         VARCHAR(255) NOT NULL,
    description  TEXT DEFAULT '',
    status       VARCHAR(20) NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','review','approved','locked')),
    created_by   UUID NOT NULL REFERENCES users(id),
    delta_count  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenarios_tenant_id ON scenarios(tenant_id);
CREATE INDEX idx_scenarios_status ON scenarios(status);

-- ─── Scenario Deltas (THE CORE: only store changes) ──────────────────
CREATE TABLE IF NOT EXISTS scenario_deltas (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id     UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL,
    -- Dimension keys
    sku_id          VARCHAR(100) NOT NULL,
    location_id     VARCHAR(100),
    channel_id      VARCHAR(100),
    period          VARCHAR(20) NOT NULL,  -- YYYY-WW or YYYY-MM-DD
    measure_id      VARCHAR(50) NOT NULL DEFAULT 'sales_qty',
    -- Values
    original_value  NUMERIC(18,4) NOT NULL,
    override_value  NUMERIC(18,4) NOT NULL,
    change_pct      NUMERIC(10,4),
    -- Metadata
    author_id       UUID NOT NULL REFERENCES users(id),
    comment         TEXT DEFAULT '',
    is_locked       BOOLEAN NOT NULL DEFAULT false,
    delta_type      VARCHAR(20) NOT NULL DEFAULT 'absolute',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deltas_scenario_id ON scenario_deltas(scenario_id);
CREATE INDEX idx_deltas_tenant_id ON scenario_deltas(tenant_id);
CREATE INDEX idx_deltas_sku_period ON scenario_deltas(sku_id, period);

-- ─── Scenario Comments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenario_comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    ref_sku_id  VARCHAR(100),
    ref_period  VARCHAR(20),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_scenario_id ON scenario_comments(scenario_id);

-- ─── Saved Dashboard Views ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_views (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by  UUID NOT NULL REFERENCES users(id),
    title       VARCHAR(255) NOT NULL,
    prompt      TEXT NOT NULL,
    viz_type    VARCHAR(30) NOT NULL,
    query_sql   TEXT,
    viz_config  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saved_views_tenant_id ON saved_views(tenant_id);

-- ─── Audit Log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL,
    user_id     UUID NOT NULL REFERENCES users(id),
    action      VARCHAR(100) NOT NULL,  -- 'scenario.delta.created', 'plan.locked', etc.
    entity_type VARCHAR(50),
    entity_id   VARCHAR(100),
    before_val  JSONB,
    after_val   JSONB,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_id ON audit_log(tenant_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- ─── Updated_at trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['tenants','users','data_schemas','base_plans','scenarios','scenario_deltas']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
        EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
    END LOOP;
END $$;
