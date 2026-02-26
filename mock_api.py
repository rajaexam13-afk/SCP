"""
Lightweight mock API for DemandIQ — handles /auth/login and /auth/register
without requiring PostgreSQL/Redis/ClickHouse.
Uses pure-stdlib HMAC-SHA256 JWT signing (no PyJWT dependency needed).
"""
import uuid, hashlib, time, hmac as _hmac, base64, json
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

SECRET = b"change-me-in-production"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _make_jwt(payload: dict) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64url(json.dumps(payload).encode())
    msg = f"{header}.{body}".encode()
    sig = _b64url(_hmac.new(SECRET, msg, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


def _token(user_id: str, tenant_id: str, role: str) -> str:
    return _make_jwt({
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "exp": int(time.time()) + 60 * 60 * 24 * 7,
    })


app = FastAPI(title="DemandIQ Mock API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory stores ──────────────────────────────────────────────────────────
users: dict[str, dict] = {}
tenants: dict[str, dict] = {}


def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


# ── Models ────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    company: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0-mock"}


@app.post("/auth/register", status_code=201)
def register(body: RegisterRequest):
    if body.email in users:
        raise HTTPException(status_code=400, detail="Email already registered")

    tenant_id = str(uuid.uuid4())
    slug = body.company.lower().replace(" ", "-")[:50] + "-" + tenant_id[:8]
    tenants[tenant_id] = {"id": tenant_id, "name": body.company, "slug": slug}

    user_id = str(uuid.uuid4())
    users[body.email] = {
        "id": user_id,
        "tenant_id": tenant_id,
        "email": body.email,
        "name": body.name,
        "role": "admin",
        "hashed_pw": _hash(body.password),
    }

    u = users[body.email]
    return {
        "token": _token(u["id"], u["tenant_id"], u["role"]),
        "user": {
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "role": u["role"],
            "tenant_id": u["tenant_id"],
            "tenant_name": tenants[u["tenant_id"]]["name"],
        },
    }


@app.post("/auth/login")
def login(body: LoginRequest):
    u = users.get(body.email)
    if not u or u["hashed_pw"] != _hash(body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return {
        "token": _token(u["id"], u["tenant_id"], u["role"]),
        "user": {
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "role": u["role"],
            "tenant_id": u["tenant_id"],
            "tenant_name": tenants[u["tenant_id"]]["name"],
        },
    }


# ── Stub endpoints to avoid 404s on dashboard load ───────────────────────────
@app.get("/notifications/")
def notifications():
    return []

@app.get("/forecasts/")
def forecasts():
    return []

@app.get("/dashboards/")
def dashboards():
    return []

@app.get("/scenarios/")
def scenarios():
    return []

@app.get("/data/upload-url")
def upload_url():
    return {"url": "", "fields": {}}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
