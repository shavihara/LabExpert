import os
import base64
import json
import hmac
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, Any
from sqlalchemy import text
from fastapi import Request
from config.database import engine, prepare
from services.admin_user_service import AdminUserService, AdminSessionService
import bcrypt

ADMIN_JWT_SECRET = os.getenv("ADMIN_JWT_SECRET", "dev-admin-secret")
ADMIN_JWT_EXP_MIN = int(os.getenv("ADMIN_JWT_EXP_MIN", "30"))

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64url_decode(s: str) -> bytes:
    pad = 4 - (len(s) % 4)
    if pad and pad < 4:
        s += "=" * pad
    return base64.urlsafe_b64decode(s)

def sign_jwt(payload: Dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = _b64url(json.dumps(header, separators=(",", ":")).encode())
    p = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    to_sign = f"{h}.{p}".encode()
    sig = hmac.new(ADMIN_JWT_SECRET.encode(), to_sign, hashlib.sha256).digest()
    return f"{h}.{p}.{_b64url(sig)}"

def verify_jwt(token: str) -> Dict[str, Any] | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h, p, s = parts
        to_sign = f"{h}.{p}".encode()
        expected = hmac.new(ADMIN_JWT_SECRET.encode(), to_sign, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64url_decode(s)):
            return None
        payload = json.loads(_b64url_decode(p))
        if "exp" in payload:
            if datetime.fromtimestamp(payload["exp"], tz=timezone.utc) < datetime.now(tz=timezone.utc):
                return None
        return payload
    except Exception:
        return None

def issue_admin_tokens(admin: Dict[str, Any]) -> Dict[str, Any]:
    sid = AdminSessionService.create(admin["id"])
    exp = datetime.now(tz=timezone.utc) + timedelta(minutes=ADMIN_JWT_EXP_MIN)
    payload = {
        "uid": admin["id"],
        "sid": sid,
        "role": admin.get("role", "admin"),
        "ver": int(admin.get("token_version", 0)),
        "exp": int(exp.timestamp()),
        "iat": int(datetime.now(tz=timezone.utc).timestamp()),
    }
    token = sign_jwt(payload)
    csrf = secrets.token_hex(16)
    return {"token": token, "csrf": csrf, "sid": sid}

def log_attempt(email: str, ip: str, ua: str, success: bool):
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO admin_login_attempts (email, ip, user_agent, success) VALUES (:e, :i, :u, :s)"),
            {"e": email, "i": ip, "u": ua, "s": 1 if success else 0},
        )

class RateLimiter:
    def __init__(self, max_attempts: int = 5, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window = window_seconds
        self.store: Dict[str, list[int]] = {}

    def allow(self, key: str) -> bool:
        now = int(datetime.now().timestamp())
        arr = self.store.get(key, [])
        arr = [t for t in arr if now - t <= self.window]
        allowed = len(arr) < self.max_attempts
        if allowed:
            arr.append(now)
        self.store[key] = arr
        return allowed

rate_limiter = RateLimiter()

def validate_password(pw: str, hash_str: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hash_str.encode())
    except Exception:
        return False