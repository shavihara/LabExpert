# session_manager.py
import asyncio
import logging
from typing import Dict, Optional, List
from datetime import datetime
from sqlalchemy import text  # Add this import
from config.database import engine  # Add this import assuming engine is defined there

logger = logging.getLogger(__name__)

class SessionManager:
    def __init__(self):
        self.devices: Dict[str, Dict] = {}
        self.user_allocations: Dict[str, List[str]] = {}
        
        # Load persistent allocations from DB
        now = datetime.now().isoformat()
        stmt = text("""
            SELECT device_id, user_id 
            FROM device_allocations 
            WHERE expires_at > :now
        """)
        with engine.connect() as conn:
            result = conn.execute(stmt, {"now": now})
            for row in result:
                device_id, user_id = row
                self.devices.setdefault(device_id, {
                    "device_id": device_id,
                    "status": {},
                    "sensor_id": None,
                    "allocated_to": user_id,
                    "last_seen": asyncio.get_event_loop().time()
                })
                self.user_allocations.setdefault(user_id, []).append(device_id)
            logger.info(f"Loaded {len(self.devices)} persistent device allocations from DB")
        
    async def register_device(self, device_id: str):
        self.devices.setdefault(device_id, {
            "device_id": device_id,
            "status": {},
            "sensor_id": None,
            "allocated_to": None,
            "last_seen": asyncio.get_event_loop().time()
        })
        
        # Check if in available_sensors, insert if not
        stmt = text("SELECT id FROM available_sensors WHERE sensor_id = :device_id")
        with engine.connect() as conn:
            exists = conn.execute(stmt, {"device_id": device_id}).fetchone()
        
        if not exists:
            now = datetime.now().isoformat()
            insert_stmt = text("""
                INSERT INTO available_sensors (sensor_id, availability, last_firmware, last_updated)
                VALUES (:device_id, 1, 'unknown', :now)
            """)
            with engine.begin() as conn:
                conn.execute(insert_stmt, {"device_id": device_id, "now": now})
        
        logger.info(f"Registered device {device_id}")
        
    async def update_device_status(self, device_id: str, status: Dict):
        device = self.devices.setdefault(device_id, {"device_id": device_id})
        prev_status = device.get("status", {})
        device["status"] = {**prev_status, **status}
        if "sensor_type" in status:
            device["sensor_id"] = status["sensor_type"]
        device["last_seen"] = asyncio.get_event_loop().time()
        logger.debug(f"Updated status for {device_id}: {device['status']}")
        
    async def allocate_device_to_user(self, device_id: str, user_id: str) -> bool:
        device = self.devices.get(device_id)
        if not device:
            logger.warning(f"Allocation failed for {device_id} to {user_id}: device not found")
            return False
        
        # Check availability from available_sensors
        avail_stmt = text("SELECT availability FROM available_sensors WHERE sensor_id = :device_id")
        with engine.connect() as conn:
            result = conn.execute(avail_stmt, {"device_id": device_id}).fetchone()
            availability = result[0] if result else None
        
        if availability is None:
            logger.warning(f"Device {device_id} not found in available_sensors")
            return False
        
        if availability == 1:
            # If available, forget previous sessions: delete existing allocation
            delete_stmt = text("DELETE FROM device_allocations WHERE device_id = :device_id")
            with engine.begin() as conn:
                conn.execute(delete_stmt, {"device_id": device_id})
            
            # Update in-memory
            if device.get("allocated_to"):
                old_user = device["allocated_to"]
                device["allocated_to"] = None
                if old_user in self.user_allocations:
                    self.user_allocations[old_user] = [d for d in self.user_allocations[old_user] if d != device_id]
                    if not self.user_allocations[old_user]:
                        del self.user_allocations[old_user]
            logger.info(f"Cleared previous allocation for available device {device_id}")
        elif device.get("allocated_to"):
            logger.warning(f"Allocation failed for {device_id} to {user_id}: already allocated")
            return False
        
        # Get user's session expiry (max expires_at from active sessions)
        now = datetime.now().isoformat()
        stmt = text("""
            SELECT MAX(expires_at) 
            FROM sessions 
            WHERE user_id = :user_id AND is_active = 1 AND expires_at > :now
        """)
        with engine.connect() as conn:
            result = conn.execute(stmt, {"user_id": user_id, "now": now})
            max_expires = result.scalar()
        
        if not max_expires:
            logger.warning(f"No active session found for user {user_id}, cannot allocate")
            return False
            
        expires_at = max_expires
        
        # Insert to DB
        insert_stmt = text("""
            INSERT INTO device_allocations (device_id, user_id, expires_at)
            VALUES (:device_id, :user_id, :expires_at)
        """)
        try:
            with engine.begin() as conn:
                conn.execute(insert_stmt, {
                    "device_id": device_id,
                    "user_id": user_id,
                    "expires_at": expires_at
                })
        except Exception as e:
            logger.error(f"Failed to insert allocation to DB: {e}")
            return False
        
        # Update in-memory
        device["allocated_to"] = user_id
        self.user_allocations.setdefault(user_id, []).append(device_id)
        
        # Update available_sensors
        now = datetime.now().isoformat()
        update_stmt = text("""
            UPDATE available_sensors 
            SET availability = 0, last_updated = :now
            WHERE sensor_id = :device_id
        """)
        try:
            with engine.begin() as conn:
                conn.execute(update_stmt, {"device_id": device_id, "now": now})
        except Exception as e:
            logger.error(f"Failed to update available_sensors for {device_id}: {e}")
        
        logger.info(f"Allocated device {device_id} to user {user_id} until {expires_at}. Current allocations: {self.user_allocations.get(user_id)}")
        return True
            
    async def free_device(self, device_id: str):
        device = self.devices.get(device_id)
        if not device or not device.get("allocated_to"):
            return
            
        user_id = device["allocated_to"]
        
        # Delete from DB
        delete_stmt = text("""
            DELETE FROM device_allocations 
            WHERE device_id = :device_id
        """)
        try:
            with engine.begin() as conn:
                conn.execute(delete_stmt, {"device_id": device_id})
        except Exception as e:
            logger.error(f"Failed to delete allocation from DB for {device_id}: {e}")
            return
        
        # Update in-memory
        device["allocated_to"] = None
        if user_id in self.user_allocations:
            self.user_allocations[user_id] = [d for d in self.user_allocations[user_id] if d != device_id]
            if not self.user_allocations[user_id]:
                del self.user_allocations[user_id]
        
        # Update available_sensors
        now = datetime.now().isoformat()
        update_stmt = text("""
            UPDATE available_sensors 
            SET availability = 1, last_updated = :now
            WHERE sensor_id = :device_id
        """)
        try:
            with engine.begin() as conn:
                conn.execute(update_stmt, {"device_id": device_id, "now": now})
        except Exception as e:
            logger.error(f"Failed to update available_sensors for {device_id}: {e}")
        
        # Send disconnect_and_cleanup command to ESP32 device
        await self._send_cleanup_command_to_device(device_id)
        
        logger.info(f"Freed device {device_id} from user {user_id}. Remaining allocations: {self.user_allocations.get(user_id, [])}")
    
    async def _send_cleanup_command_to_device(self, device_id: str):
        """Send disconnect_and_cleanup command to ESP32 device via WebSocket"""
        try:
            # Import here to avoid circular imports
            from ws_device import DeviceWebSocketManager
            
            device_manager = DeviceWebSocketManager.get_instance()
            if device_manager:
                # Check if device is currently connected
                if device_id in device_manager.active_connections:
                    websocket = device_manager.active_connections[device_id]
                    cleanup_command = {
                        "type": "disconnect_and_cleanup",
                        "device_id": device_id,
                        "message": "Device allocation freed - cleaning up firmware"
                    }
                    await websocket.send_json(cleanup_command)
                    logger.info(f"Sent disconnect_and_cleanup command to device {device_id}")
                else:
                    logger.warning(f"Device {device_id} not connected - cannot send cleanup command")
            else:
                logger.warning("DeviceWebSocketManager instance not available")
        except Exception as e:
            logger.error(f"Failed to send cleanup command to device {device_id}: {e}")
        
    async def get_user_devices(self, user_id: str):
        devices = [did for did, info in self.devices.items() if info.get("allocated_to") == user_id]
        logger.debug(f"Getting devices for user {user_id}: {devices}")
        return devices
    
    async def free_user_devices(self, user_id: str):
        to_free = [did for did, info in self.devices.items() if info.get("allocated_to") == user_id]
        
        # Delete from DB
        delete_stmt = text("""
            DELETE FROM device_allocations 
            WHERE user_id = :user_id
        """)
        try:
            with engine.begin() as conn:
                conn.execute(delete_stmt, {"user_id": user_id})
        except Exception as e:
            logger.error(f"Failed to delete allocations from DB for user {user_id}: {e}")
            return
        
        # Update in-memory
        for did in to_free:
            self.devices[did]["allocated_to"] = None
        
        # Update available_sensors for each
        now = datetime.now().isoformat()
        update_stmt = text("""
            UPDATE available_sensors 
            SET availability = 1, last_updated = :now
            WHERE sensor_id = :device_id
        """)
        for did in to_free:
            try:
                with engine.begin() as conn:
                    conn.execute(update_stmt, {"device_id": did, "now": now})
            except Exception as e:
                logger.error(f"Failed to update available_sensors for {did}: {e}")
        
        self.user_allocations[user_id] = []
        logger.info(f"Freed all devices for user {user_id}: {to_free}")

    async def get_device(self, device_id: str):
        # Return full device record, including status dictionary
        return self.devices.get(device_id)

    async def get_device_status(self, device_id: str) -> Optional[Dict]:
        return self.devices.get(device_id)

    async def get_available_devices(self) -> List[Dict]:
        # Return simplified list for UI, including IP if known
        result = []
        for device_id, device in self.devices.items():
            entry = {
                "device_id": device_id,
                "id": device_id,
                "sensor_type": device.get("sensor_id") or device.get("status", {}).get("sensor_type", "Unknown"),
                "firmware": device.get("status", {}).get("firmware_version", "Unknown"),
                "last_seen": device.get("last_seen"),
            }
            ip = device.get("status", {}).get("ip_address")
            if ip:
                entry["ip_address"] = ip
            entry["status"] = "In Use" if device.get("allocated_to") else "online"
            result.append(entry)
        return result

    async def cleanup_expired_allocations(self):
        from services.session_service import SessionService
        current_time = datetime.now().isoformat()
        expired_sessions = []
        
        # Find expired active sessions
        stmt = text("""
            SELECT id, user_id 
            FROM sessions 
            WHERE expires_at < :now AND is_active = 1
        """)
        with engine.connect() as conn:
            result = conn.execute(stmt, {"now": current_time})
            expired_sessions = [{"id": row[0], "user_id": row[1]} for row in result.fetchall()]
        
        unique_users = set()
        for session in expired_sessions:
            SessionService.invalidate(session["id"])
            unique_users.add(session["user_id"])
        
        # Free devices for affected users
        for user_id in unique_users:
            await self.free_user_devices(user_id)