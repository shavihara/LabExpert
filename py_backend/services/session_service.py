import secrets
import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy import text
from config.database import engine
import sqlite3
import time

logger = logging.getLogger(__name__)

class SessionService:
    @staticmethod
    def find_by_token(token):
        stmt = text("""
                    SELECT s.*, u.name, u.email, u.role
                    FROM sessions s
                             JOIN users u ON s.user_id = u.id
                    WHERE s.token = :token
                      AND s.is_active = 1
                      AND s.expires_at > :now
                    """)
        now = datetime.now().isoformat()

        with engine.connect() as conn:
            result = conn.execute(stmt, {"token": token, "now": now})
            row = result.fetchone()
            if row:
                return {
                    'id': row[0],  # s.id
                    'user_id': row[1],  # s.user_id
                    'token': row[2],  # s.token
                    'ip_address': row[3],  # s.ip_address
                    'expires_at': row[4],  # s.expires_at
                    'is_active': row[5],  # s.is_active
                    'last_activity': row[6],  # s.last_activity
                    'created_at': row[7],  # s.created_at
                    'name': row[8],  # u.name
                    'email': row[9],  # u.email
                    'role': row[10]  # u.role
                }
            return None

    @staticmethod
    def invalidate(token):
        stmt = text("""
                    UPDATE sessions
                    SET is_active = 0,
                        expires_at = :now
                    WHERE token = :token
                    """)
        now = datetime.now().isoformat()
    
        with engine.begin() as conn:
            result = conn.execute(stmt, {"token": token, "now": now})
            return result.rowcount > 0
    
    @staticmethod
    def invalidate_old_sessions(user_id):
        stmt = text("""
                    UPDATE sessions
                    SET is_active = 0,
                        expires_at = :now
                    WHERE user_id = :user_id
                      AND is_active = 1
                    """)
        now = datetime.now().isoformat()
    
        with engine.begin() as conn:
            conn.execute(stmt, {"user_id": user_id, "now": now})

    @staticmethod
    def create(user_id, ip_address):
        # Invalidate old sessions first
        SessionService.invalidate_old_sessions(user_id)
        
        token = secrets.token_hex(32)  # generates a secure 64-char token
        expires_at = (datetime.now() + timedelta(days=7)).isoformat()
        now = datetime.now().isoformat()
    
        stmt = text("""
                    INSERT INTO sessions (user_id, token, ip_address, expires_at, is_active, last_activity)
                    VALUES (:user_id, :token, :ip_address, :expires_at, 1, :now)
                    """)
    
        with engine.begin() as conn:
            conn.execute(stmt, {
                "user_id": user_id,
                "token": token,
                "ip_address": ip_address,
                "expires_at": expires_at,
                "now": now
            })
    
        return token

    @staticmethod
    def update_activity(token):
        stmt = text("""
                    UPDATE sessions
                    SET last_activity = :now
                    WHERE token = :token
                      AND is_active = 1
                    """)
        now = datetime.now().isoformat()

        with engine.begin() as conn:
            conn.execute(stmt, {"token": token, "now": now})

    @staticmethod
    def count_active():
        now = datetime.now().isoformat()
        stmt = text("""
            SELECT COUNT(*) 
            FROM sessions 
            WHERE is_active = 1 AND expires_at > :now
        """)
        with engine.connect() as conn:
            result = conn.execute(stmt, {"now": now})
            return result.scalar() or 0

    @staticmethod
    def get_active(limit=5):
        now = datetime.now().isoformat()
        stmt = text("""
            SELECT s.user_id, u.name, u.email, s.last_activity 
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.is_active = 1 AND s.expires_at > :now
            ORDER BY s.last_activity DESC 
            LIMIT :limit
        """)
        with engine.connect() as conn:
            result = conn.execute(stmt, {"now": now, "limit": limit})
            return [
                {
                    "user_id": row[0],
                    "name": row[1],
                    "email": row[2],
                    "last_activity": row[3]
                } for row in result.fetchall()
            ]

    @staticmethod
    async def cleanup_expired_sessions():
        """Clean up all expired sessions and their associated device allocations"""
        from session_manager import SessionManager
        
        current_time = datetime.now().isoformat()
        expired_sessions = []
        
        # Find expired active sessions with retry logic for database locking
        max_retries = 5
        for attempt in range(max_retries):
            try:
                stmt = text("""
                    SELECT id, user_id 
                    FROM sessions 
                    WHERE expires_at < :now AND is_active = 1
                """)
                with engine.connect() as conn:
                    result = conn.execute(stmt, {"now": current_time})
                    expired_sessions = [{"id": row[0], "user_id": row[1]} for row in result.fetchall()]
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to find expired sessions after {max_retries} attempts: {e}")
                    return
                time.sleep(0.5 * (attempt + 1))
        
        if not expired_sessions:
            return
        
        unique_users = set()
        for session in expired_sessions:
            # Invalidate session with retry logic
            for attempt in range(max_retries):
                try:
                    SessionService.invalidate_by_id(session["id"])
                    unique_users.add(session["user_id"])
                    break
                except Exception as e:
                    if attempt == max_retries - 1:
                        logger.error(f"Failed to invalidate session {session['id']} after {max_retries} attempts: {e}")
                    time.sleep(0.5 * (attempt + 1))
        
        # Free devices for affected users
        session_manager = SessionManager.get_instance()
        for user_id in unique_users:
            try:
                await session_manager.free_user_devices(user_id)
                logger.info(f"Freed devices for user {user_id} due to expired session")
            except Exception as e:
                logger.error(f"Failed to free devices for user {user_id}: {e}")
        
        logger.info(f"Cleaned up {len(expired_sessions)} expired sessions for {len(unique_users)} users")

    @staticmethod
    def invalidate_by_id(session_id):
        """Invalidate a session by its ID"""
        stmt = text("""
            UPDATE sessions
            SET is_active = 0,
                expires_at = :now
            WHERE id = :session_id
        """)
        now = datetime.now().isoformat()
        
        with engine.begin() as conn:
            conn.execute(stmt, {"session_id": session_id, "now": now})