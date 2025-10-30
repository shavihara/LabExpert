#!/usr/bin/env python3
"""Debug script to check database contents"""

from config.database import engine
from sqlalchemy import text

def check_available_sensors():
    """Check what's in the available_sensors table"""
    print("=== Available Sensors Table ===")
    stmt = text("SELECT sensor_id, availability, online_status FROM available_sensors")
    with engine.connect() as conn:
        result = conn.execute(stmt)
        rows = result.fetchall()
        if rows:
            for row in rows:
                print(f"sensor_id: {row[0]}, availability: {row[1]}, online_status: {row[2]}")
        else:
            print("No records found in available_sensors table")

if __name__ == "__main__":
    check_available_sensors()