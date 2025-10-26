from sqlalchemy import text
from config.database import engine

with engine.connect() as conn:
    # Add online_status column to available_sensors table
    try:
        conn.execute(text("ALTER TABLE available_sensors ADD COLUMN online_status INTEGER DEFAULT 0"))
        conn.commit()
        print("Successfully added online_status column to available_sensors table")
    except Exception as e:
        if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
            print("online_status column already exists, skipping...")
        else:
            print(f"Error adding online_status column: {e}")
            raise

print("Migration completed")