from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import uuid

from core.database import get_db
from core.security import get_current_user
from models.tenant import User
from models.notification import Notification, NotificationType

router = APIRouter()


# ── seed mock notifications so UI is never empty ───────────────
_MOCK = [
    {
        "type": "exception",
        "title": "High MAPE detected — SKU-0042",
        "message": "Forecast error for Beverages Product 42 exceeded 25% threshold for 3 consecutive weeks.",
        "link": "/dashboard/forecasts",
        "age_minutes": 5,
    },
    {
        "type": "approval",
        "title": "Scenario pending review",
        "message": "\"Promo Uplift Q3\" scenario submitted by Alice Chen requires your approval.",
        "link": "/dashboard/scenarios",
        "age_minutes": 32,
    },
    {
        "type": "forecast",
        "title": "Forecast run completed",
        "message": "Statistical forecast for 13-week horizon finished. 1,247 SKUs processed, 47 exceptions flagged.",
        "link": "/dashboard/overview",
        "age_minutes": 90,
    },
    {
        "type": "upload",
        "title": "Data upload processed",
        "message": "sales_data_june.xlsx ingested successfully — 48,392 rows loaded into ClickHouse.",
        "link": "/dashboard/data",
        "age_minutes": 180,
    },
    {
        "type": "exception",
        "title": "Systematic bias — DC-East cluster",
        "message": "12 SKUs in DC-East show consistent over-forecast bias >8%. Review recommended.",
        "link": "/dashboard/forecasts",
        "age_minutes": 320,
    },
    {
        "type": "approval",
        "title": "Scenario approved",
        "message": "\"Summer Clearance\" scenario has been approved and locked as the new consensus plan.",
        "link": "/dashboard/scenarios",
        "age_minutes": 600,
        "is_read": True,
    },
    {
        "type": "system",
        "title": "New team member joined",
        "message": "Bob Martinez joined your workspace with the Planner role.",
        "link": "/dashboard/settings",
        "age_minutes": 1440,
        "is_read": True,
    },
]


def _mock_notifications(tenant_id: str, user_id: str):
    now = datetime.utcnow()
    return [
        {
            "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{tenant_id}-{i}")),
            "tenant_id": tenant_id,
            "user_id": user_id,
            "type": m["type"],
            "title": m["title"],
            "message": m["message"],
            "link": m.get("link"),
            "is_read": m.get("is_read", False),
            "created_at": (now - timedelta(minutes=m["age_minutes"])).isoformat(),
        }
        for i, m in enumerate(_MOCK)
    ]


def _fmt_age(iso: str) -> str:
    dt = datetime.fromisoformat(iso)
    diff = datetime.utcnow() - dt
    minutes = int(diff.total_seconds() / 60)
    if minutes < 1:   return "just now"
    if minutes < 60:  return f"{minutes}m ago"
    if minutes < 1440: return f"{minutes // 60}h ago"
    return f"{minutes // 1440}d ago"


@router.get("")
async def list_notifications(
    unread_only: bool = False,
    type: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return notifications for the current user (falls back to mock data)."""
    try:
        q = select(Notification).where(
            Notification.tenant_id == user.tenant_id,
        ).order_by(Notification.created_at.desc()).limit(50)

        result = await db.execute(q)
        rows = result.scalars().all()

        if rows:
            items = [
                {
                    "id": n.id,
                    "type": n.type,
                    "title": n.title,
                    "message": n.message,
                    "link": n.link,
                    "is_read": n.is_read,
                    "created_at": n.created_at.isoformat() if n.created_at else None,
                    "age": _fmt_age(n.created_at.isoformat()) if n.created_at else "",
                }
                for n in rows
            ]
        else:
            items = [
                {**n, "age": _fmt_age(n["created_at"])}
                for n in _mock_notifications(user.tenant_id, user.id)
            ]
    except Exception:
        items = [
            {**n, "age": _fmt_age(n["created_at"])}
            for n in _mock_notifications(user.tenant_id, user.id)
        ]

    if unread_only:
        items = [n for n in items if not n["is_read"]]
    if type:
        items = [n for n in items if n["type"] == type]

    unread_count = sum(1 for n in items if not n["is_read"])
    return {"items": items, "unread_count": unread_count}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a notification as read."""
    try:
        await db.execute(
            update(Notification)
            .where(Notification.id == notification_id, Notification.tenant_id == user.tenant_id)
            .values(is_read=True)
        )
        await db.commit()
    except Exception:
        pass  # Mock data — no DB record to update
    return {"status": "ok"}


@router.post("/mark-all-read")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read."""
    try:
        await db.execute(
            update(Notification)
            .where(Notification.tenant_id == user.tenant_id, Notification.is_read == False)
            .values(is_read=True)
        )
        await db.commit()
    except Exception:
        pass
    return {"status": "ok"}
