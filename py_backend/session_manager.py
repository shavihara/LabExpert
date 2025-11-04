# session_manager.py
import asyncio
import logging
import aiohttp
from typing import Dict, Optional, List
from datetime import datetime, timedelta
from sqlalchemy import text
from config.database import engine

# Import UDP discovery service
from services.udp_discovery_service import udp_discovery_service

logger = logging.getLogger(__name__)

class SessionManager:
    _instance = None
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
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
        
        # Handle disconnecting status - automatically free the device
        if status.get("status") == "disconnecting":
            logger.info(f"Device {device_id} is disconnecting - automatically freeing device")
            await self.free_device(device_id, send_cleanup_command=False)
        
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
            
    async def free_device(self, device_id: str, send_cleanup_command: bool = True):
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
        
        # Send disconnect_and_cleanup command to ESP32 device (only if requested)
        if send_cleanup_command:
            await self._send_cleanup_command_to_device(device_id)
        
        logger.info(f"Freed device {device_id} from user {user_id}. Remaining allocations: {self.user_allocations.get(user_id, [])}")
    
    async def _send_cleanup_command_to_device(self, device_id: str):
        """Send disconnect_and_cleanup command to ESP32 device via WebSocket"""
        try:
            # Device cleanup command sending removed - MQTT-only architecture
            logger.info(f"Device {device_id} allocation freed - cleanup command not sent (MQTT-only)")
        except Exception as e:
            logger.error(f"Failed to send cleanup command to device {device_id}: {e}")
        
    async def get_user_devices(self, user_id: str):
        devices = [did for did, info in self.devices.items() if info.get("allocated_to") == user_id]
        logger.debug(f"Getting devices for user {user_id}: {devices}")
        return devices
    
    async def free_user_devices(self, user_id: str):
        to_free = [did for did, info in self.devices.items() if info.get("allocated_to") == user_id]
        
        # Send disconnect commands to ESP32 devices before freeing them
        if to_free:
            from services.mqtt_service import MQTTService
            mqtt_service = MQTTService.get_instance()
            
            for device_id in to_free:
                if mqtt_service and mqtt_service.connected:
                    logger.info(f"Sending disconnect command to device {device_id} due to user logout")
                    mqtt_service.publish_disconnect_command(device_id)
        
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
        # Get devices from database with online_status = 1 (only online devices)
        stmt = text("""
            SELECT sensor_id, availability, online_status, last_firmware, last_updated 
            FROM available_sensors 
            WHERE availability = 1 AND online_status = 1
        """)
        
        result = []
        try:
            with engine.connect() as conn:
                db_result = conn.execute(stmt)
                for row in db_result.fetchall():
                    sensor_id, availability, online_status, last_firmware, last_updated = row
                    
                    # Get additional info from in-memory devices if available
                    device = self.devices.get(sensor_id, {})
                    
                    entry = {
                        "device_id": sensor_id,
                        "id": sensor_id,
                        "sensor_type": device.get("sensor_id") or device.get("status", {}).get("sensor_type", "Unknown"),
                        "firmware": device.get("status", {}).get("firmware_version", last_firmware or "Unknown"),
                        "last_seen": device.get("last_seen"),
                        "availability": availability,
                        "online_status": online_status
                    }
                    
                    # Add IP if available
                    ip = device.get("status", {}).get("ip_address")
                    if ip:
                        entry["ip_address"] = ip
                    
                    # Set status based on allocation and online status
                    if device.get("allocated_to"):
                        entry["status"] = "In Use"
                    elif online_status == 1:
                        entry["status"] = "online"
                    else:
                        entry["status"] = "offline"
                    
                    result.append(entry)
                    
        except Exception as e:
            logger.error(f"Failed to get available devices: {e}")
            # Fallback to old method if database query fails
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
        
        # Add UDP discovered devices that aren't already in the result
        try:
            udp_devices = udp_discovery_service.get_online_devices()
            existing_device_ids = {device["device_id"] for device in result}
            
            for udp_device in udp_devices:
                device_id = udp_device.get("device_id")
                if device_id and device_id not in existing_device_ids:
                    # Get additional info from in-memory devices if available
                    device = self.devices.get(device_id, {})
                    
                    entry = {
                        "device_id": device_id,
                        "id": device_id,
                        "sensor_type": udp_device.get("sensor_type", "TOF"),  # Default to TOF for UDP devices
                        "firmware": udp_device.get("firmware_version", "Unknown"),
                        "last_seen": udp_device.get("last_seen"),
                        "ip_address": udp_device.get("ip_address"),
                        "availability": 1,  # UDP discovered devices are available
                        "online_status": 1  # UDP discovered devices are online
                    }
                    
                    # Set status based on allocation
                    if device.get("allocated_to"):
                        entry["status"] = "In Use"
                    else:
                        entry["status"] = "online"
                    
                    result.append(entry)
                    logger.info(f"Added UDP discovered device {device_id} to available devices list")
                    
        except Exception as e:
            logger.error(f"Failed to add UDP discovered devices: {e}")
        
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

    async def _ping_device(self, device_ip: str, timeout: int = 3) -> bool:
        """
        Check if ESP32 device is online using UDP broadcast discovery.
        Returns True if device responds to UDP discovery, False otherwise.
        """
        try:
            logger.info(f"Attempting UDP discovery for device at {device_ip}")
            
            # Perform immediate discovery with timeout
            discovered_devices = await udp_discovery_service.discover_devices(timeout)
            
            # Check if the specific device IP is in discovered devices
            for device in discovered_devices:
                if device.get('ip_address') == device_ip:
                    logger.info(f"UDP discovery found device at {device_ip}: {device}")
                    return True
            
            logger.warning(f"UDP discovery failed for device {device_ip}: not found in discovered devices")
            return False
            
        except Exception as e:
            logger.warning(f"UDP discovery failed for device {device_ip}: {e}")
            return False

    async def _update_device_online_status(self, sensor_id: str, online_status: int):
        """
        Update the online_status column in available_sensors table.
        """
        try:
            stmt = text("""
                UPDATE available_sensors 
                SET online_status = :online_status 
                WHERE sensor_id = :sensor_id
            """)
            with engine.connect() as conn:
                conn.execute(stmt, {"online_status": online_status, "sensor_id": sensor_id})
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to update online status for {sensor_id}: {e}")

    async def check_device_online_status(self, sensor_id: str) -> bool:
        """
        Check if a specific device is online using UDP discovery and update database.
        Returns True if online, False if offline.
        """
        logger.info(f"=== Checking online status for sensor_id: {sensor_id} ===")
        
        # Use UDP discovery to find all available devices
        try:
            discovered_devices = await udp_discovery_service.discover_devices()
            
            # Check if our specific device is in the discovered devices
            device_found = False
            for device in discovered_devices:
                if device.get('device_id') == sensor_id:
                    device_found = True
                    
                    # Update device information in memory
                    device_info = self.devices.setdefault(sensor_id, {
                        "device_id": sensor_id,
                        "status": {},
                        "sensor_id": None,
                        "allocated_to": None,
                        "last_seen": asyncio.get_event_loop().time()
                    })
                    
                    # Update device status with discovered information
                    device_info["status"].update({
                        "ip_address": device.get('ip_address'),
                        "firmware_version": device.get('firmware_version', 'unknown'),
                        "sensor_type": device.get('sensor_type', 'unknown'),
                        "availability": device.get('availability', 1)
                    })
                    
                    device_info["last_seen"] = asyncio.get_event_loop().time()
                    
                    logger.info(f"Device {sensor_id} discovered at {device.get('ip_address')}")
                    break
            
            if device_found:
                # Device is online
                await self._update_device_online_status(sensor_id, 1)
                logger.info(f"Device {sensor_id} is online")
                return True
            else:
                # Device not found in discovery
                logger.warning(f"Device {sensor_id} not found in UDP discovery, marking as offline")
                await self._update_device_online_status(sensor_id, 0)
                return False
                
        except Exception as e:
            logger.error(f"UDP discovery failed for device {sensor_id}: {e}")
            await self._update_device_online_status(sensor_id, 0)
            return False

    async def check_all_available_devices_online_status(self):
        """
        Check online status for all devices with availability=1 using UDP discovery and update database.
        Also set online_status=0 for devices with availability=0.
        """
        logger.info("=== Checking online status for all available devices using UDP discovery ===")
        
        try:
            # First, set online_status=0 for all devices with availability=0
            with engine.connect() as conn:
                conn.execute(
                    text("""
                        UPDATE available_sensors 
                        SET online_status = 0 
                        WHERE availability = 0
                    """)
                )
                conn.commit()
                
                # Get all devices with availability=1
                result = conn.execute(
                    text("SELECT sensor_id FROM available_sensors WHERE availability = 1")
                )
                available_devices = result.fetchall()
                
            logger.info(f"Found {len(available_devices)} devices with availability=1 in database")
            
            # Use UDP discovery to find all online devices
            discovered_devices = await udp_discovery_service.discover_devices()
            logger.info(f"UDP discovery found {len(discovered_devices)} devices")
            
            # Create a set of discovered device IDs for fast lookup
            discovered_device_ids = {device.get('device_id') for device in discovered_devices}
            
            # Update database based on discovery results
            with engine.begin() as conn:
                for device_row in available_devices:
                    sensor_id = device_row[0]
                    
                    if sensor_id in discovered_device_ids:
                        # Device is online
                        conn.execute(
                            text("UPDATE available_sensors SET online_status = 1 WHERE sensor_id = :sensor_id"),
                            {"sensor_id": sensor_id}
                        )
                        logger.info(f"Device {sensor_id} is online (UDP discovery)")
                        
                        # Update device information in memory
                        for device in discovered_devices:
                            if device.get('device_id') == sensor_id:
                                device_info = self.devices.setdefault(sensor_id, {
                                    "device_id": sensor_id,
                                    "status": {},
                                    "sensor_id": None,
                                    "allocated_to": None,
                                    "last_seen": asyncio.get_event_loop().time()
                                })
                                
                                device_info["status"].update({
                                    "ip_address": device.get('ip_address'),
                                    "firmware_version": device.get('firmware_version', 'unknown'),
                                    "sensor_type": device.get('sensor_type', 'unknown'),
                                    "availability": device.get('availability', 1)
                                })
                                
                                device_info["last_seen"] = asyncio.get_event_loop().time()
                                break
                    else:
                        # Device is offline
                        conn.execute(
                            text("UPDATE available_sensors SET online_status = 0 WHERE sensor_id = :sensor_id"),
                            {"sensor_id": sensor_id}
                        )
                        logger.info(f"Device {sensor_id} is offline (not found in UDP discovery)")
                        
        except Exception as e:
            logger.error(f"Error checking all available devices online status: {e}")
        finally:
            # Broadcast updated device list to all frontend clients
            try:
                from ws_client import ClientWebSocketManager
                client_manager = ClientWebSocketManager.get_instance()
                if client_manager:
                    await client_manager.broadcast_device_list()
                    logger.info("Broadcasted updated device list to all clients")
            except Exception as e:
                logger.error(f"Failed to broadcast device list: {e}")

    async def scan_devices_for_experiment(self) -> List[Dict]:
        """
        Manual device discovery for experiment interfaces only.
        Performs UDP discovery and returns available devices.
        """
        logger.info("=== Manual device scan triggered for experiment interface ===")
        
        # Perform device discovery
        await self.check_all_available_devices_online_status()
        
        # Return the updated device list
        return await self.get_available_devices()