from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text

from core.config import settings
from core.database import init_db, engine
from core.seed_enterprise import seed_enterprise_tree
from routers import auth, tenants, data, forecasts, scenarios, dashboards, notifications


async def _run_migrations():
    """
    Idempotent ALTER TABLE migrations — adds columns that may not exist yet.
    Safe to run on every startup.
    """
    async with engine.begin() as conn:
        # Add tree-hierarchy columns
        await conn.execute(text("""
            ALTER TABLE scenarios
                ADD COLUMN IF NOT EXISTS parent_id    UUID REFERENCES scenarios(id) ON DELETE SET NULL,
                ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT false;
        """))
        # Add commit_mode as a belt-and-suspenders measure alongside init_db()
        await conn.execute(text("""
            ALTER TABLE scenarios
                ADD COLUMN IF NOT EXISTS commit_mode VARCHAR(10) NOT NULL DEFAULT 'manual';
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_scenarios_parent_id ON scenarios(parent_id);
        """))
        # Repair any rows that have a NULL commit_mode (can happen when the column
        # was added to an existing table via a path that bypassed the DEFAULT clause).
        await conn.execute(text("""
            UPDATE scenarios SET commit_mode = 'manual' WHERE commit_mode IS NULL;
        """))
        # Add is_public column for scenario visibility (public = visible to all tenant users).
        await conn.execute(text("""
            ALTER TABLE scenarios
                ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;
        """))
        # Change parent_id FK from SET NULL to CASCADE so that deleting a parent
        # also deletes all of its child scenarios (and their deltas) recursively.
        await conn.execute(text("""
            ALTER TABLE scenarios
                DROP CONSTRAINT IF EXISTS scenarios_parent_id_fkey;
        """))
        await conn.execute(text("""
            ALTER TABLE scenarios
                ADD CONSTRAINT scenarios_parent_id_fkey
                    FOREIGN KEY (parent_id) REFERENCES scenarios(id) ON DELETE CASCADE;
        """))
        # Ensure scenario_deltas.scenario_id FK is ON DELETE CASCADE.
        # The table may have been created before this was added to the model.
        await conn.execute(text("""
            ALTER TABLE scenario_deltas
                DROP CONSTRAINT IF EXISTS scenario_deltas_scenario_id_fkey;
        """))
        await conn.execute(text("""
            ALTER TABLE scenario_deltas
                ADD CONSTRAINT scenario_deltas_scenario_id_fkey
                    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE;
        """))
        # Same for scenario_comments
        await conn.execute(text("""
            ALTER TABLE scenario_comments
                DROP CONSTRAINT IF EXISTS scenario_comments_scenario_id_fkey;
        """))
        await conn.execute(text("""
            ALTER TABLE scenario_comments
                ADD CONSTRAINT scenario_comments_scenario_id_fkey
                    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE;
        """))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _run_migrations()
    await seed_enterprise_tree()
    yield


app = FastAPI(
    title="DemandIQ API",
    version="0.1.0",
    description="Intelligent demand planning platform API",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── Middleware ────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────
app.include_router(auth.router,          prefix="/auth",          tags=["Auth"])
app.include_router(tenants.router,       prefix="/tenants",       tags=["Tenants"])
app.include_router(data.router,          prefix="/data",          tags=["Data"])
app.include_router(forecasts.router,     prefix="/forecasts",     tags=["Forecasts"])
app.include_router(scenarios.router,     prefix="/scenarios",     tags=["Scenarios"])
app.include_router(dashboards.router,    prefix="/dashboards",    tags=["Dashboards"])
app.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
