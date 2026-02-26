import uuid
import enum
from sqlalchemy import Column, String, Boolean, ForeignKey, Enum, Text
from core.database import Base, TimestampMixin


class NotificationType(str, enum.Enum):
    exception = "exception"
    approval  = "approval"
    upload    = "upload"
    forecast  = "forecast"
    system    = "system"


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id        = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id   = Column(String, ForeignKey("users.id",   ondelete="CASCADE"), nullable=True)
    type      = Column(Enum(NotificationType), nullable=False)
    title     = Column(String(255), nullable=False)
    message   = Column(Text)
    link      = Column(String(500))
    is_read   = Column(Boolean, default=False)
    meta      = Column(Text, default="{}")
