import uuid
import enum
from sqlalchemy import Column, String, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from core.database import Base, TimestampMixin


class NotificationType(str, enum.Enum):
    exception = "exception"
    approval  = "approval"
    upload    = "upload"
    forecast  = "forecast"
    system    = "system"


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id        = Column(PG_UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(PG_UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id   = Column(PG_UUID(as_uuid=False), ForeignKey("users.id",   ondelete="CASCADE"), nullable=True)
    type      = Column(String(20), nullable=False)
    title     = Column(String(255), nullable=False)
    message   = Column(Text)
    link      = Column(String(500))
    is_read   = Column(Boolean, default=False)
    meta      = Column(Text, default="{}")
