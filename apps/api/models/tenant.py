import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Enum, Text, Integer
from sqlalchemy.orm import relationship
from core.database import Base, TimestampMixin
import enum


class PlanTier(str, enum.Enum):
    free    = "free"
    starter = "starter"
    growth  = "growth"
    scale   = "scale"


class UserRole(str, enum.Enum):
    admin   = "admin"
    planner = "planner"
    analyst = "analyst"
    viewer  = "viewer"


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String(255), nullable=False)
    slug        = Column(String(100), unique=True, nullable=False, index=True)
    industry    = Column(String(100))
    plan_tier   = Column(Enum(PlanTier), default=PlanTier.free, nullable=False)
    sku_limit   = Column(Integer, default=500)
    is_active   = Column(Boolean, default=True)
    settings    = Column(Text, default="{}")  # JSON blob for tenant config

    users       = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    schemas     = relationship("DataSchema", back_populates="tenant", cascade="all, delete-orphan")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id   = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email       = Column(String(255), nullable=False, index=True)
    name        = Column(String(255), nullable=False)
    hashed_pw   = Column(String(255), nullable=False)
    role        = Column(Enum(UserRole), default=UserRole.planner, nullable=False)
    is_active   = Column(Boolean, default=True)

    tenant      = relationship("Tenant", back_populates="users")

    __table_args__ = (
        # Email must be unique per tenant
        {"schema": None},
    )


class DataSchema(Base, TimestampMixin):
    __tablename__ = "data_schemas"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id   = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name        = Column(String(255), nullable=False)
    source_type = Column(String(50))        # csv, excel, sap, oracle...
    mappings    = Column(Text, default="{}")  # JSON: {"product_id": "Article_Number", ...}
    is_active   = Column(Boolean, default=True)

    tenant      = relationship("Tenant", back_populates="schemas")
