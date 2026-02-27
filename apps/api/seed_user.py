"""
One-time seed script: creates a demo admin user directly in the DB.
Run inside the api container: python seed_user.py

Credentials: admin@demo.com / admin123
"""
import asyncio
import uuid
from sqlalchemy import text
from core.database import AsyncSessionLocal
import bcrypt
def hash_password(pw): return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

TENANT_ID = "00000000-0000-0000-0000-000000000001"
USER_ID   = "00000000-0000-0000-0000-000000000002"
EMAIL     = "admin@demo.com"
PASSWORD  = "admin123"
NAME      = "Demo Admin"
COMPANY   = "Demo Corp"


async def seed():
    async with AsyncSessionLocal() as db:
        # Clean up old seed data
        await db.execute(text("DELETE FROM users   WHERE id = :id"), {"id": USER_ID})
        await db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": TENANT_ID})

        # Insert tenant
        await db.execute(text("""
            INSERT INTO tenants (id, name, slug, plan_tier, is_active, settings, created_at, updated_at)
            VALUES (:id, :name, :slug, 'free', true, '{}', NOW(), NOW())
        """), {"id": TENANT_ID, "name": COMPANY, "slug": "demo-corp-seed"})

        # Insert user
        hashed = hash_password(PASSWORD)
        await db.execute(text("""
            INSERT INTO users (id, tenant_id, email, name, hashed_pw, role, is_active, created_at, updated_at)
            VALUES (:id, :tenant_id, :email, :name, :hashed_pw, 'admin', true, NOW(), NOW())
        """), {"id": USER_ID, "tenant_id": TENANT_ID, "email": EMAIL, "name": NAME, "hashed_pw": hashed})

        await db.commit()
        print(f"Created user: {EMAIL} / {PASSWORD}")
        print(f"User ID:   {USER_ID}")
        print(f"Tenant ID: {TENANT_ID}")


asyncio.run(seed())
