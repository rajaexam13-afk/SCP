from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from core.database import get_db
from core.security import get_current_user
from models.tenant import Tenant, User, UserRole

router = APIRouter()


@router.get("/me")
async def get_my_tenant(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "industry": tenant.industry,
        "plan_tier": tenant.plan_tier,
        "sku_limit": tenant.sku_limit,
    }


@router.get("/users")
async def list_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role not in ("admin",):
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(
        select(User).where(User.tenant_id == user.tenant_id, User.is_active == True)
    )
    users = result.scalars().all()
    return [
        {"id": u.id, "name": u.name, "email": u.email, "role": u.role}
        for u in users
    ]


class InviteUserRequest(BaseModel):
    email: str
    name: str
    role: UserRole = UserRole.planner


@router.post("/users/invite", status_code=201)
async def invite_user(
    body: InviteUserRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    from core.security import hash_password
    import secrets

    temp_password = secrets.token_urlsafe(12)
    new_user = User(
        tenant_id=user.tenant_id,
        email=body.email,
        name=body.name,
        hashed_pw=hash_password(temp_password),
        role=body.role,
    )
    db.add(new_user)
    await db.commit()

    # In production: send invite email with temp password / magic link
    return {"status": "invited", "temp_password": temp_password}
