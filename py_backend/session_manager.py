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
        
    async def register_device(self, device_id: str):
        self.devices.setdefault(device_id, {
            "device_id": device_id,
            "status": {},
            "sensor_id": None,
            "allocated_to": None,
            "last_seen": asyncio.get_event_loop().time()
        })
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
        if not device or device.get("allocated_to"):
            logger.warning(f"Allocation failed for {device_id} to {user_id}: device not found or already allocated")
            return False
        device["allocated_to"] = user_id
        self.user_allocations.setdefault(user_id, []).append(device_id)
        logger.info(f"Allocated device {device_id} to user {user_id}. Current user allocations: {self.user_allocations.get(user_id)}")
        return True
            
    async def free_device(self, device_id: str):
        device = self.devices.get(device_id)
        if device and device.get("allocated_to"):
            user_id = device["allocated_to"]
            device["allocated_to"] = None
            if user_id in self.user_allocations:
                self.user_allocations[user_id] = [d for d in self.user_allocations[user_id] if d != device_id]
                logger.info(f"Freed device {device_id} from user {user_id}. Remaining allocations: {self.user_allocations.get(user_id)}")
        
    async def get_user_devices(self, user_id: str):
        devices = [did for did, info in self.devices.items() if info.get("allocated_to") == user_id]
        logger.debug(f"Getting devices for user {user_id}: {devices}")
        return devices
    
    async def free_user_devices(self, user_id: str):
        to_free = [did for did, info in self.devices.items() if info.get("allocated_to") == user_id]
        for did in to_free:
            self.devices[did]["allocated_to"] = None
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