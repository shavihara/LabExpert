#!/usr/bin/env python3
"""Test script to manually set device online status for testing"""

from config.database import engine
from sqlalchemy import text

def set_device_online(sensor_id: str):
    """Set a specific device as online for testing"""
    print(f"Setting device {sensor_id} as online...")
    
    stmt = text("""
        UPDATE available_sensors 
        SET online_status = 1 
        WHERE sensor_id = :sensor_id
    """)
    
    try:
        with engine.begin() as conn:
            result = conn.execute(stmt, {"sensor_id": sensor_id})
            if result.rowcount > 0:
                print(f"Successfully set {sensor_id} as online")
            else:
                print(f"No device found with sensor_id {sensor_id}")
    except Exception as e:
        print(f"Error updating device status: {e}")

def check_available_sensors():
    """Check what's in the available_sensors table"""
    print("\n=== Available Sensors Table ===")
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
    # Set 834E8 as online for testing
    set_device_online("834E8")
    
    # Check the results
    check_available_sensors()