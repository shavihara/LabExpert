import sqlite3
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DB_PATH = './data/lab_expert.db'
engine = create_engine(f'sqlite:///{DB_PATH}', connect_args={'timeout': 5, 'check_same_thread': False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Function for raw queries (like your prepare)
def prepare(sql):
    def execute(params=None):
        # Use transactional context to ensure commits on DML
        with engine.begin() as conn:
            return conn.execute(text(sql), params or {})
    return execute

# Run migrations (create tables if not exist)
def init_db():
    with engine.connect() as conn:
        # Users table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users(
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_email_verified INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            profile_picture TEXT,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
        );
        """))

        # Sessions table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL,
            ip_address TEXT,
            expires_at DATETIME NOT NULL,
            is_active INTEGER DEFAULT 1,
            last_activity DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """))

        # OTPs table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            otp_code TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            is_used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """))

        # Files table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            file_type TEXT NOT NULL,
            original_name TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            mimetype TEXT,
            size INTEGER,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """))

        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS experiment_runs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            experiment_type TEXT NOT NULL,
            sub_experiment TEXT NOT NULL,
            run_id TEXT NOT NULL,
            performed_at DATETIME NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            size INTEGER,
            file_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """))

        # Device Allocations table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS device_allocations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """))

        # Available Sensors table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS available_sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT NOT NULL UNIQUE,
            availability INTEGER DEFAULT 1,
            online_status INTEGER DEFAULT 0,
            last_firmware TEXT,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """))

        # Admin users table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'superadmin',
            is_active INTEGER DEFAULT 1,
            must_change_password INTEGER DEFAULT 1,
            token_version INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME,
            last_login DATETIME
        );
        """))

        # Admin sessions table (for inactivity tracking)
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS admin_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_user_id INTEGER NOT NULL,
            session_id TEXT NOT NULL UNIQUE,
            is_active INTEGER DEFAULT 1,
            last_activity_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
        );
        """))

        # Admin password history table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS admin_password_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_user_id INTEGER NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
        );
        """))

        # Admin login attempts log
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS admin_login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT,
            ip TEXT,
            user_agent TEXT,
            success INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """))

        # Admin password reset tokens (optional)
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
        );
        """))

        # Seed the default admin if not exists
        conn.execute(text("""
        INSERT OR IGNORE INTO admin_users (email, password_hash, role, is_active, must_change_password, token_version)
        VALUES ('labexpert.us@gmail.com', :pwd_hash, 'superadmin', 1, 1, 0);
        """), {"pwd_hash": _default_admin_hash()})

        # Configure SQLite pragmas outside of transaction
    _configure_sqlite_pragmas()

def _default_admin_hash():
    # Lazy import to avoid heavy deps at module import
    import bcrypt  # type: ignore
    return bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()

def _configure_sqlite_pragmas():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.close()
    except Exception:
        pass

init_db()