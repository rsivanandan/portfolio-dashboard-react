"""
Authentication module — JWT-based login/signup with refresh tokens.

Design decisions:
  - Access token:  short-lived (24 h), returned in JSON response body
  - Refresh token: long-lived (7 d), sent as httpOnly cookie (XSS-safe)
  - Passwords:     bcrypt-hashed, never stored in plain text
  - First signup:  auto-approved + is_admin = True
  - Subsequent:    is_approved = False until an admin approves
  - JWT secret:    read from JWT_SECRET env var; random fallback for dev
"""

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, field_validator

# ── Config ────────────────────────────────────────────────────────────────────

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "investments.db")

_secret_env = os.environ.get("JWT_SECRET", "")
JWT_SECRET: str = _secret_env if _secret_env else os.urandom(32).hex()
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
REFRESH_TOKEN_EXPIRE_DAYS = 7

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_users_table():
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            hashed_password TEXT    NOT NULL,
            is_admin        INTEGER NOT NULL DEFAULT 0,
            is_approved     INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


# ── JWT helpers ───────────────────────────────────────────────────────────────

def _make_token(payload: dict, expire_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {**payload, "iat": now, "exp": now + expire_delta}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: int, username: str, is_admin: bool) -> str:
    return _make_token(
        {"sub": str(user_id), "username": username, "is_admin": is_admin, "type": "access"},
        timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    )


def create_refresh_token(user_id: int) -> str:
    return _make_token(
        {"sub": str(user_id), "type": "refresh"},
        timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != expected_type:
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Auth dependency ───────────────────────────────────────────────────────────

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Strip accidental surrounding quotes (common when copy-pasting from JSON)
    raw_token = credentials.credentials.strip('"').strip("'")
    payload = decode_token(raw_token, expected_type="access")
    user_id = int(payload["sub"])

    conn = get_conn()
    row = conn.execute(
        "SELECT id, username, email, is_admin, is_approved FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    if not row["is_approved"]:
        raise HTTPException(status_code=403, detail="Account pending approval")
    return dict(row)


def require_admin(current_user: dict = Depends(get_current_user)):
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    username: str
    email: str
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 32:
            raise ValueError("Username must be at most 32 characters")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, _ and -")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool
    is_approved: bool
    created_at: str


# ── Routes ────────────────────────────────────────────────────────────────────

def _set_refresh_cookie(response: Response, token: str):
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=False,       # set to True behind HTTPS in production
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )


@auth_router.post("/signup", status_code=201)
def signup(body: SignupRequest, response: Response):
    ensure_users_table()
    conn = get_conn()
    try:
        # First user ever → auto-admin + auto-approved
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        is_first = count == 0

        hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
        try:
            cur = conn.execute(
                """INSERT INTO users (username, email, hashed_password, is_admin, is_approved)
                   VALUES (?, ?, ?, ?, ?)""",
                (body.username, body.email, hashed, int(is_first), int(is_first)),
            )
            conn.commit()
        except sqlite3.IntegrityError as e:
            msg = str(e)
            if "username" in msg:
                raise HTTPException(400, "Username already taken")
            raise HTTPException(400, "Email already registered")

        user_id = cur.lastrowid

        if is_first:
            access = create_access_token(user_id, body.username, is_admin=True)
            refresh = create_refresh_token(user_id)
            _set_refresh_cookie(response, refresh)
            return {
                "access_token": access,
                "token_type": "bearer",
                "user": {"id": user_id, "username": body.username,
                         "is_admin": True, "is_approved": True},
                "message": "Account created. You are the admin.",
            }
        else:
            return {
                "access_token": None,
                "token_type": None,
                "user": None,
                "message": "Account created. Waiting for admin approval before you can log in.",
            }
    finally:
        conn.close()


@auth_router.post("/login")
def login(body: LoginRequest, response: Response):
    ensure_users_table()
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT id, username, email, hashed_password, is_admin, is_approved FROM users WHERE username = ?",
            (body.username,),
        ).fetchone()

        if not row:
            raise HTTPException(401, "Invalid username or password")

        if not bcrypt.checkpw(body.password.encode(), row["hashed_password"].encode()):
            raise HTTPException(401, "Invalid username or password")

        if not row["is_approved"]:
            raise HTTPException(403, "Account pending admin approval")

        access = create_access_token(row["id"], row["username"], bool(row["is_admin"]))
        refresh = create_refresh_token(row["id"])
        _set_refresh_cookie(response, refresh)

        return {
            "access_token": access,
            "token_type": "bearer",
            "user": {
                "id": row["id"],
                "username": row["username"],
                "email": row["email"],
                "is_admin": bool(row["is_admin"]),
                "is_approved": bool(row["is_approved"]),
            },
        }
    finally:
        conn.close()


@auth_router.post("/refresh")
def refresh(response: Response, refresh_token: Optional[str] = Cookie(default=None)):
    if not refresh_token:
        raise HTTPException(401, "No refresh token")

    payload = decode_token(refresh_token, expected_type="refresh")
    user_id = int(payload["sub"])

    conn = get_conn()
    row = conn.execute(
        "SELECT id, username, is_admin, is_approved FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(401, "User not found")
    if not row["is_approved"]:
        raise HTTPException(403, "Account pending approval")

    access = create_access_token(row["id"], row["username"], bool(row["is_admin"]))
    new_refresh = create_refresh_token(row["id"])
    _set_refresh_cookie(response, new_refresh)

    return {
        "access_token": access,
        "token_type": "bearer",
        "user": {
            "id": row["id"],
            "username": row["username"],
            "is_admin": bool(row["is_admin"]),
            "is_approved": bool(row["is_approved"]),
        },
    }


@auth_router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="refresh_token", path="/api/auth")
    return {"message": "Logged out"}


@auth_router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user


@auth_router.get("/users")
def list_users(admin: dict = Depends(require_admin)):
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, username, email, is_admin, is_approved, created_at FROM users ORDER BY created_at"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@auth_router.put("/users/{user_id}/approve")
def approve_user(user_id: int, admin: dict = Depends(require_admin)):
    conn = get_conn()
    try:
        conn.execute("UPDATE users SET is_approved = 1 WHERE id = ?", (user_id,))
        conn.commit()
        if conn.total_changes == 0:
            raise HTTPException(404, "User not found")
        return {"message": "User approved"}
    finally:
        conn.close()


@auth_router.put("/users/{user_id}/revoke")
def revoke_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(400, "Cannot revoke yourself")
    conn = get_conn()
    try:
        conn.execute("UPDATE users SET is_approved = 0 WHERE id = ?", (user_id,))
        conn.commit()
        return {"message": "User revoked"}
    finally:
        conn.close()


@auth_router.put("/users/{user_id}/make-admin")
def make_admin(user_id: int, admin: dict = Depends(require_admin)):
    conn = get_conn()
    try:
        conn.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (user_id,))
        conn.commit()
        return {"message": "User promoted to admin"}
    finally:
        conn.close()
