from datetime import datetime, timedelta
import secrets
import re
from sqlalchemy import text
from config.database import engine, prepare

PASSWORD_MIN_LENGTH = 8

def password_meets_policy(pw: str) -> bool:
    if len(pw) < PASSWORD_MIN_LENGTH:
        return False
    if not re.search(r"[A-Z]", pw):
        return False
    if not re.search(r"[a-z]", pw):
        return False
    if not re.search(r"\d", pw):
        return False
    return True

class AdminUserService:
    @staticmethod
    def find_by_email(email: str):
        email_norm = (email or "").strip().lower()
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT * FROM admin_users WHERE LOWER(email) = :email LIMIT 1"),
                {"email": email_norm}
            ).mappings().fetchone()
        return ({k: row[k] for k in row.keys()}) if row else None

    @staticmethod
    def find_by_id(admin_id: int):
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT * FROM admin_users WHERE id = :id LIMIT 1"),
                {"id": admin_id}
            ).mappings().fetchone()
        return ({k: row[k] for k in row.keys()}) if row else None

    @staticmethod
    def create_admin(email: str, password_hash: str, role: str = "admin"):
        now = datetime.now().isoformat()
        email_norm = (email or "").strip().lower()
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO admin_users (email, password_hash, role, is_active, must_change_password, created_at)
                    VALUES (:email, :password_hash, :role, 1, 1, :created_at)
                    """
                ),
                {"email": email_norm, "password_hash": password_hash, "role": role, "created_at": now},
            )
        return AdminUserService.find_by_email(email_norm)

    @staticmethod
    def update_last_login(admin_id: int):
        now = datetime.now().isoformat()
        with engine.begin() as conn:
            conn.execute(text("UPDATE admin_users SET last_login = :now WHERE id = :id"), {"now": now, "id": admin_id})

    @staticmethod
    def set_password(admin_id: int, password_hash: str):
        now = datetime.now().isoformat()
        with engine.begin() as conn:
            conn.execute(text("UPDATE admin_users SET password_hash = :ph, updated_at = :now WHERE id = :id"), {"ph": password_hash, "now": now, "id": admin_id})

    @staticmethod
    def increment_token_version(admin_id: int):
        with engine.begin() as conn:
            conn.execute(text("UPDATE admin_users SET token_version = token_version + 1 WHERE id = :id"), {"id": admin_id})

    @staticmethod
    def clear_force_change(admin_id: int):
        with engine.begin() as conn:
            conn.execute(text("UPDATE admin_users SET must_change_password = 0 WHERE id = :id"), {"id": admin_id})

    @staticmethod
    def list_admins():
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT id, email, role, is_active, last_login, created_at FROM admin_users ORDER BY created_at DESC")
            ).mappings().fetchall()
        return [{k: r[k] for k in r.keys()} for r in rows]

    @staticmethod
    def set_active(admin_id: int, active: bool):
        with engine.begin() as conn:
            conn.execute(text("UPDATE admin_users SET is_active = :a WHERE id = :id"), {"a": 1 if active else 0, "id": admin_id})

    @staticmethod
    def set_role(admin_id: int, role: str):
        with engine.begin() as conn:
            conn.execute(text("UPDATE admin_users SET role = :r WHERE id = :id"), {"r": role, "id": admin_id})

    @staticmethod
    def add_password_history(admin_id: int, password_hash: str):
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO admin_password_history (admin_user_id, password_hash) VALUES (:id, :ph)"), {"id": admin_id, "ph": password_hash})

    @staticmethod
    def password_in_history(admin_id: int, password: str, limit: int = 5) -> bool:
        import bcrypt
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT password_hash FROM admin_password_history WHERE admin_user_id = :id ORDER BY created_at DESC LIMIT :limit"),
                {"id": admin_id, "limit": limit}
            ).mappings().fetchall()
        hashes = [r.get("password_hash") for r in rows]
        for h in hashes:
            try:
                if bcrypt.checkpw(password.encode(), h.encode()):
                    return True
            except Exception:
                continue
        return False

class AdminSessionService:
    @staticmethod
    def create(admin_user_id: int) -> str:
        sid = secrets.token_hex(16)
        now = datetime.now().isoformat()
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO admin_sessions (admin_user_id, session_id, is_active, last_activity_at, created_at) VALUES (:uid, :sid, 1, :now, :now)"), {"uid": admin_user_id, "sid": sid, "now": now})
        return sid

    @staticmethod
    def update_activity(session_id: str):
        now = datetime.now().isoformat()
        with engine.begin() as conn:
            conn.execute(text("UPDATE admin_sessions SET last_activity_at = :now WHERE session_id = :sid"), {"now": now, "sid": session_id})

    @staticmethod
    def find(session_id: str):
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT * FROM admin_sessions WHERE session_id = :sid LIMIT 1"),
                {"sid": session_id}
            ).mappings().fetchone()
        return ({k: row[k] for k in row.keys()}) if row else None

    @staticmethod
    def invalidate(session_id: str):
        with engine.begin() as conn:
            conn.execute(text("UPDATE admin_sessions SET is_active = 0 WHERE session_id = :sid"), {"sid": session_id})