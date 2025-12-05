import uuid
import bcrypt
from datetime import datetime, timedelta
from sqlalchemy import text
from config.database import engine
import time
from sqlalchemy.exc import OperationalError
import sqlite3

class UserService:
    @staticmethod
    def ensure_profile_columns():
        """
        Ensures that the users table has all the necessary profile columns.
        """
        new_columns = {
            "institution_type": "TEXT",
            "user_type": "TEXT",
            "student_no": "TEXT",
            "academic_level": "TEXT",
            "grade": "TEXT",
            "profile_picture": "TEXT"
        }
        
        with engine.connect() as conn:
            # Get existing columns
            result = conn.execute(text("PRAGMA table_info(users)"))
            existing_columns = {row[1] for row in result.fetchall()}
            
            for col, dtype in new_columns.items():
                if col not in existing_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {dtype}"))
                    except OperationalError:
                        pass  # Column might have been added concurrently

    @staticmethod
    def update_profile(user_id, profile_data):
        UserService.ensure_profile_columns()
        
        # Filter allowed fields
        allowed_fields = [
            'name', 'institution_type', 'user_type', 
            'student_no', 'academic_level', 'grade'
        ]
        
        update_fields = {}
        for field in allowed_fields:
            if field in profile_data:
                update_fields[field] = profile_data[field]
        
        if not update_fields:
            return None

        # Construct dynamic update query
        set_clause = ", ".join([f"{key} = :{key}" for key in update_fields.keys()])
        stmt = text(f"UPDATE users SET {set_clause} WHERE id = :id")
        
        update_fields['id'] = user_id
        
        with engine.begin() as conn:
            conn.execute(stmt, update_fields)
            
        return UserService.find_by_id(user_id)

    @staticmethod
    def find_by_id(user_id):
        UserService.ensure_profile_columns()
        stmt = text("SELECT * FROM users WHERE id = :id AND is_active = 1")
        with engine.connect() as conn:
            # Use row mapping for safer access
            result = conn.execute(stmt, {"id": user_id})
            row = result.mappings().fetchone()
            
            if row:
                return dict(row)
            return None

    @staticmethod
    def find_by_email(email):
        UserService.ensure_profile_columns()
        stmt = text("SELECT * FROM users WHERE email = :email AND is_active = 1")
        with engine.connect() as conn:
            result = conn.execute(stmt, {"email": email})
            row = result.mappings().fetchone()
            if row:
                return dict(row)
            return None

    @staticmethod
    def validate_password(plain_password, hashed_password):
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

    @staticmethod
    def update_last_login(user_id):
        stmt = text("UPDATE users SET last_login = :now WHERE id = :id")
        max_retries = 5
        for attempt in range(max_retries):
            try:
                with engine.begin() as conn:
                    conn.execute(stmt, {"id": user_id, "now": datetime.now().isoformat()})
                return
            except OperationalError as e:
                # Check if the underlying error is a SQLite database locked error
                if (hasattr(e.orig, 'args') and len(e.orig.args) > 0 and 
                    "database is locked" in str(e.orig.args[0]).lower() and 
                    attempt < max_retries - 1):
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise

    @staticmethod
    def create(user_data):
        user_id = str(uuid.uuid4())
        hashed_pw = bcrypt.hashpw(user_data['password'].encode(), bcrypt.gensalt()).decode()

        stmt = text("""
            INSERT INTO users (id, name, email, password, role, is_email_verified, is_active)
            VALUES (:id, :name, :email, :hashed_pw, :role, 0, 1)
        """)

        with engine.begin() as conn:
            conn.execute(stmt, {
                "id": user_id,
                "name": user_data['name'],
                "email": user_data['email'],
                "hashed_pw": hashed_pw,
                "role": "user"
            })

        return UserService.find_by_id(user_id)

    @staticmethod
    def count_all():
        stmt = text("SELECT COUNT(*) FROM users WHERE is_active = 1")
        with engine.connect() as conn:
            result = conn.execute(stmt)
            return result.scalar() or 0

    @staticmethod
    def count_verified():
        stmt = text("SELECT COUNT(*) FROM users WHERE is_email_verified = 1 AND is_active = 1")
        with engine.connect() as conn:
            result = conn.execute(stmt)
            return result.scalar() or 0

    @staticmethod
    def count_recent():
        thirty_days_ago = (datetime.now() - timedelta(days=30)).isoformat()
        stmt = text("SELECT COUNT(*) FROM users WHERE created_at >= :thirty_days_ago AND is_active = 1")
        with engine.connect() as conn:
            result = conn.execute(stmt, {"thirty_days_ago": thirty_days_ago})
            return result.scalar() or 0

    @staticmethod
    def get_recent(limit=5):
        stmt = text("""
            SELECT id, name, email, created_at 
            FROM users 
            WHERE is_active = 1 
            ORDER BY created_at DESC 
            LIMIT :limit
        """)
        with engine.connect() as conn:
            result = conn.execute(stmt, {"limit": limit})
            return [
                {
                    "id": row[0],
                    "name": row[1],
                    "email": row[2],
                    "created_at": row[3]
                } for row in result.fetchall()
            ]

    @staticmethod
    def get_all():
        stmt = text("""
            SELECT id, name, email, role, is_email_verified, is_active, last_login, created_at 
            FROM users 
            WHERE is_active = 1 
            ORDER BY created_at DESC
        """)
        with engine.connect() as conn:
            result = conn.execute(stmt)
            return [
                {
                    "id": row[0],
                    "name": row[1],
                    "email": row[2],
                    "role": row[3],
                    "is_email_verified": row[4],
                    "is_active": row[5],
                    "last_login": row[6],
                    "created_at": row[7]
                } for row in result.fetchall()
            ]