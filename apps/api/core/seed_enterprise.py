"""
Seeds the protected 'Enterprise' scenario tree for every tenant on startup.
Idempotent — skips if Enterprise scenario already exists.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from core.database import AsyncSessionLocal
from models.scenario import Scenario, BasePlan

logger = logging.getLogger(__name__)

# Fixed IDs so the seed is idempotent across restarts
SEED_BASE_PLAN_ID   = "00000000-0000-0000-0000-100000000001"
SEED_ENTERPRISE_ID  = "00000000-0000-0000-0000-200000000001"
SEED_OPTIMISTIC_ID  = "00000000-0000-0000-0000-200000000002"
SEED_CONSERVATIVE_ID= "00000000-0000-0000-0000-200000000003"
SEED_TENANT_ID      = "00000000-0000-0000-0000-000000000001"
SEED_USER_ID        = "00000000-0000-0000-0000-000000000002"


async def seed_enterprise_tree():
    """
    Creates for the demo tenant:
      BasePlan  → 'FY2025 Baseline'
      Scenario  → 'Enterprise'         (root, protected, no parent)
        └─ 'Optimistic Q3'             (child of Enterprise)
        └─ 'Conservative Q3'           (child of Enterprise)
    """
    async with AsyncSessionLocal() as db:
        # Check if Enterprise already seeded
        existing = await db.execute(
            select(Scenario).where(Scenario.id == SEED_ENTERPRISE_ID)
        )
        if existing.scalar_one_or_none():
            logger.info("[seed] Enterprise scenario already exists — skipping")
            return

        # Check seed tenant/user exist (set by seed_user.py)
        tenant_check = await db.execute(
            text("SELECT id FROM tenants WHERE id = :id"),
            {"id": SEED_TENANT_ID},
        )
        if not tenant_check.scalar_one_or_none():
            logger.info("[seed] Demo tenant not found — skipping enterprise seed")
            return

        logger.info("[seed] Seeding Enterprise scenario tree...")

        # 1. Base plan (metadata row — ClickHouse holds actual values)
        bp_check = await db.execute(
            select(BasePlan).where(BasePlan.id == SEED_BASE_PLAN_ID)
        )
        if not bp_check.scalar_one_or_none():
            bp = BasePlan(
                id=SEED_BASE_PLAN_ID,
                tenant_id=SEED_TENANT_ID,
                name="FY2025 Baseline",
                period="Jan 2025 – Dec 2025",
                is_locked=True,
                locked_by=SEED_USER_ID,
                sku_count=312,
                row_count=16224,
            )
            db.add(bp)
            await db.flush()

        # 2. Enterprise root scenario (protected)
        enterprise = Scenario(
            id=SEED_ENTERPRISE_ID,
            tenant_id=SEED_TENANT_ID,
            base_plan_id=SEED_BASE_PLAN_ID,
            parent_id=None,
            name="Enterprise",
            description="Master enterprise plan — locked, not deletable. Branch from this to create variants.",
            status="approved",
            created_by=SEED_USER_ID,
            delta_count=0,
            is_protected=True,
            is_public=True,
        )
        db.add(enterprise)
        await db.flush()

        # 3. Optimistic child — manual sync so it stays independent by default
        optimistic = Scenario(
            id=SEED_OPTIMISTIC_ID,
            tenant_id=SEED_TENANT_ID,
            base_plan_id=SEED_BASE_PLAN_ID,
            parent_id=SEED_ENTERPRISE_ID,
            name="Optimistic Q3",
            description="Summer promo drives +15% lift in top 50 SKUs",
            status="draft",
            created_by=SEED_USER_ID,
            delta_count=0,
            is_protected=False,
            commit_mode="manual",
            is_public=True,
        )
        db.add(optimistic)

        # 4. Conservative child — manual sync so it stays independent by default
        conservative = Scenario(
            id=SEED_CONSERVATIVE_ID,
            tenant_id=SEED_TENANT_ID,
            base_plan_id=SEED_BASE_PLAN_ID,
            parent_id=SEED_ENTERPRISE_ID,
            name="Conservative Q3",
            description="Supply constraints — cut 10% across electronics category",
            status="draft",
            created_by=SEED_USER_ID,
            delta_count=0,
            is_protected=False,
            commit_mode="manual",
            is_public=True,
        )
        db.add(conservative)

        await db.commit()
        logger.info("[seed] Enterprise scenario tree created successfully")
