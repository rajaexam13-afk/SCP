from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional, List
import json

from core.database import get_db
from core.security import get_current_user
from models.tenant import Tenant, User, UserRole
from core.config import settings

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


# ── Role update ────────────────────────────────────────────────

class UpdateRoleRequest(BaseModel):
    role: UserRole


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: UpdateRoleRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == user.tenant_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.role = body.role
    await db.commit()
    return {"status": "updated", "user_id": user_id, "role": body.role}


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == user.tenant_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_active = False
    await db.commit()
    return {"status": "deactivated"}


# ── AI-led user management ────────────────────────────────────

class AIManageRequest(BaseModel):
    prompt: str


@router.post("/users/ai-manage")
async def ai_manage_users(
    body: AIManageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Parse a natural-language admin command and execute it."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    # Gather current user list for context
    result = await db.execute(
        select(User).where(User.tenant_id == user.tenant_id, User.is_active == True)
    )
    current_users = result.scalars().all()
    user_list_json = json.dumps([
        {"id": u.id, "name": u.name, "email": u.email, "role": u.role}
        for u in current_users
    ])

    system_prompt = f"""You are an admin assistant for a demand planning SaaS platform called DemandIQ.
The admin is managing their team. You will receive a natural-language instruction and must decide what action to take.

Current team members:
{user_list_json}

Available roles: admin, planner, analyst, viewer

You must respond ONLY with a JSON object (no markdown, no explanation) in one of these formats:

1. Invite a new user:
{{"action":"invite","email":"...","name":"...","role":"planner|analyst|viewer|admin","message":"Human-friendly confirmation"}}

2. Change a user's role:
{{"action":"update_role","user_id":"...","role":"...","message":"Human-friendly confirmation"}}

3. Deactivate/remove a user:
{{"action":"deactivate","user_id":"...","message":"Human-friendly confirmation"}}

4. List / answer a question (no action needed):
{{"action":"info","message":"Your answer here"}}

5. If the request is ambiguous or you need more info:
{{"action":"clarify","message":"What you need clarified"}}

Match users by name or email (case-insensitive). If multiple matches exist, ask for clarification."""

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": body.prompt},
            ],
            temperature=0,
            max_tokens=400,
        )
        raw = response.choices[0].message.content.strip()
        decision = json.loads(raw)
    except Exception as e:
        return {"action": "error", "message": f"AI parsing failed: {str(e)}. Please try again or use manual controls."}

    action = decision.get("action")
    from core.security import hash_password
    import secrets

    if action == "invite":
        temp_pw = secrets.token_urlsafe(12)
        new_user = User(
            tenant_id=user.tenant_id,
            email=decision["email"],
            name=decision.get("name", decision["email"].split("@")[0].title()),
            hashed_pw=hash_password(temp_pw),
            role=decision.get("role", "planner"),
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        return {
            "action": "invite",
            "message": decision.get("message", f"Invited {decision['email']}"),
            "temp_password": temp_pw,
            "user": {"id": new_user.id, "name": new_user.name, "email": new_user.email, "role": new_user.role},
        }

    elif action == "update_role":
        target_result = await db.execute(
            select(User).where(User.id == decision["user_id"], User.tenant_id == user.tenant_id)
        )
        target = target_result.scalar_one_or_none()
        if target:
            target.role = decision["role"]
            await db.commit()
        return {"action": "update_role", "message": decision.get("message", "Role updated")}

    elif action == "deactivate":
        if decision["user_id"] == user.id:
            return {"action": "error", "message": "You cannot remove yourself from the team."}
        target_result = await db.execute(
            select(User).where(User.id == decision["user_id"], User.tenant_id == user.tenant_id)
        )
        target = target_result.scalar_one_or_none()
        if target:
            target.is_active = False
            await db.commit()
        return {"action": "deactivate", "message": decision.get("message", "User removed")}

    else:
        return {"action": action, "message": decision.get("message", "")}


# ── Tenant settings update ────────────────────────────────────

class TenantUpdateRequest(BaseModel):
    name:              Optional[str] = None
    industry:          Optional[str] = None
    timezone:          Optional[str] = None
    fiscal_year_start: Optional[int] = None   # month 1-12
    modules:           Optional[dict] = None  # {"retail": true, "cpg": false, ...}


@router.put("/me")
async def update_tenant_settings(
    body: TenantUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if body.name:
        tenant.name = body.name
    if body.industry:
        tenant.industry = body.industry

    # Merge settings JSON
    try:
        current_settings = json.loads(tenant.settings or "{}")
    except Exception:
        current_settings = {}

    if body.timezone:
        current_settings["timezone"] = body.timezone
    if body.fiscal_year_start is not None:
        current_settings["fiscal_year_start"] = body.fiscal_year_start
    if body.modules is not None:
        current_settings["modules"] = body.modules

    tenant.settings = json.dumps(current_settings)
    await db.commit()

    return {
        "id": tenant.id,
        "name": tenant.name,
        "industry": tenant.industry,
        "plan_tier": tenant.plan_tier,
        "settings": current_settings,
    }
