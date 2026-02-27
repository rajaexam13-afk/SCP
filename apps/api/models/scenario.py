import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Float, Integer
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship
from core.database import Base, TimestampMixin
import enum


class ScenarioStatus(str, enum.Enum):
    draft    = "draft"
    review   = "review"
    approved = "approved"
    locked   = "locked"


class Scenario(Base, TimestampMixin):
    """
    A scenario stores ONLY deltas (overrides) relative to a base plan.
    No data is copied. Query-time resolution merges base + deltas.
    Scenarios can be nested: parent_id references another Scenario,
    forming a tree (e.g. Enterprise → Optimistic, Conservative).
    """
    __tablename__ = "scenarios"

    id           = Column(PG_UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id    = Column(PG_UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    base_plan_id = Column(PG_UUID(as_uuid=False), nullable=False)  # ClickHouse base plan ref
    parent_id    = Column(PG_UUID(as_uuid=False), ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True, index=True)
    name         = Column(String(255), nullable=False)
    description  = Column(Text, default="")
    status       = Column(String(20), default="draft", nullable=False)
    created_by   = Column(PG_UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    delta_count  = Column(Integer, default=0)
    is_protected = Column(Boolean, default=False, nullable=False)  # Cannot be deleted

    creator      = relationship("User", foreign_keys=[created_by])
    deltas       = relationship("ScenarioDelta", back_populates="scenario", cascade="all, delete-orphan")
    comments     = relationship("ScenarioComment", back_populates="scenario", cascade="all, delete-orphan")
    children     = relationship("Scenario", foreign_keys="Scenario.parent_id", backref="parent", lazy="selectin")


class ScenarioDelta(Base, TimestampMixin):
    """
    A single delta: one override for one SKU+location+period combination.
    Stored as-is — resolution happens at query time in ClickHouse.
    """
    __tablename__ = "scenario_deltas"

    id              = Column(PG_UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_id     = Column(PG_UUID(as_uuid=False), ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id       = Column(PG_UUID(as_uuid=False), nullable=False, index=True)

    # Dimension keys
    sku_id          = Column(String(100), nullable=False)
    location_id     = Column(String(100))
    channel_id      = Column(String(100))
    period          = Column(String(20), nullable=False)  # YYYY-WW or YYYY-MM-DD

    # Override
    measure_id      = Column(String(50), default="sales_qty")
    original_value  = Column(Float, nullable=False)
    override_value  = Column(Float, nullable=False)
    change_pct      = Column(Float)         # Computed on write for display

    # Metadata
    author_id       = Column(PG_UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    comment         = Column(Text, default="")
    is_locked       = Column(Boolean, default=False)
    delta_type      = Column(String(20), default="absolute")  # absolute | relative | factor

    scenario        = relationship("Scenario", back_populates="deltas")
    author          = relationship("User", foreign_keys=[author_id])


class ScenarioComment(Base, TimestampMixin):
    __tablename__ = "scenario_comments"

    id          = Column(PG_UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_id = Column(PG_UUID(as_uuid=False), ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id   = Column(PG_UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    content     = Column(Text, nullable=False)
    ref_sku_id  = Column(String(100))   # Optional: comment anchored to a specific SKU
    ref_period  = Column(String(20))    # Optional: comment anchored to a specific period

    scenario    = relationship("Scenario", back_populates="comments")
    author      = relationship("User", foreign_keys=[author_id])


class BasePlan(Base, TimestampMixin):
    """
    Metadata about a locked base plan snapshot.
    The actual forecast values live in ClickHouse.
    """
    __tablename__ = "base_plans"

    id          = Column(PG_UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id   = Column(PG_UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name        = Column(String(255), nullable=False)
    period      = Column(String(100))       # e.g. "2025 Q1-Q4"
    is_locked   = Column(Boolean, default=False)
    locked_by   = Column(PG_UUID(as_uuid=False), ForeignKey("users.id"))
    sku_count   = Column(Integer, default=0)
    row_count   = Column(Integer, default=0)
