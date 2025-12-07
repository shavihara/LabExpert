# ota_manager.py
import asyncio
import json
import logging
import os
from typing import Dict, Optional
from sqlalchemy import text
from config.database import engine
from datetime import datetime

logger = logging.getLogger(__name__)

class OTAManager:
    _instance = None
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    @classmethod
    def set_instance(cls, instance):
        cls._instance = instance
    
    def __init__(self, firmware_registry_path: str = "firmware/firmware_registry.json", bin_dir: str = "bin"):
        self.firmware_registry_path = firmware_registry_path
        self.bin_dir = bin_dir
        self.firmware_registry = self._load_firmware_registry()
        self.current_user_id = None
        self.current_device_id = None
    
    def set_current_context(self, user_id: str, device_id: str):
        """Set the current user and device context for progress updates"""
        self.current_user_id = user_id
        self.current_device_id = device_id
    
    async def _send_progress_update(self, progress: int, message: str):
        """Send firmware flash progress update via WebSocket"""
        try:
            from ws_client import ClientWebSocketManager
            client_manager = ClientWebSocketManager.get_instance()
            if client_manager and self.current_user_id:
                await client_manager.send_to_user(self.current_user_id, {
                    "type": "firmware_flash_progress",
                    "progress": progress,
                    "message": message,
                    "device_id": self.current_device_id
                })
                logger.info(f"Sent firmware progress update: {progress}% - {message}")
        except Exception as e:
            logger.error(f"Failed to send progress update: {e}")

    def _load_firmware_registry(self) -> Dict:
        # Try local path
        if os.path.exists(self.firmware_registry_path):
            try:
                with open(self.firmware_registry_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load firmware registry: {e}")
        # Try in 'firmware' subfolder
        alt_path = os.path.join("firmware", "firmware_registry.json")
        if os.path.exists(alt_path):
            try:
                with open(alt_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load firmware registry (alt): {e}")
        # Default mapping (filenames)
        return {
            "displacement": "TOF.bin",
            "oscillation": "OSI.bin",
            "angle": "ANGLE.bin"
        }

    def _get_filename_for_key(self, key: str) -> Optional[str]:
        entry = self.firmware_registry.get(key)
        if isinstance(entry, dict):
            return entry.get("filename")
        if isinstance(entry, str):
            return entry
        return None

    def get_firmware_for_sensor(self, sensor_id: Optional[str]) -> Optional[str]:
        sid = (sensor_id or "").upper()
        if sid.startswith("TOF"):
            filename = self._get_filename_for_key("displacement")
        elif sid.startswith("OSI"):
            filename = self._get_filename_for_key("oscillation")
        elif sid.startswith("DISP_ANGLE") or sid.startswith("ANGLE") or sid.startswith("MPU"):
            filename = self._get_filename_for_key("angle")
        else:
            filename = None
        if not filename:
            return None
        path = os.path.join(self.bin_dir, filename)
        return path if os.path.exists(path) else None

    async def start_ota_update(self, device_id: str, device_ip: str, experiment_type: Optional[str] = None, firmware_path: Optional[str] = None) -> Dict:
        if not device_ip:
            return {"status": "error", "message": "Device IP not provided"}
        
        # Update global ESP32 IP for other services
        from sensor_service import set_esp32_ip
        from services.oscillation_service import set_esp32_ip as set_osi_esp32_ip
        
        set_esp32_ip(device_ip)
        set_osi_esp32_ip(device_ip)
        
        # Resolve firmware path: explicit path wins, else by experiment type
        if firmware_path is None:
            if not experiment_type:
                return {"status": "error", "message": "No firmware specified"}
            firmware_file = self._get_filename_for_key(experiment_type)
            if not firmware_file:
                return {"status": "error", "message": f"No firmware configured for {experiment_type}"}
            firmware_path = os.path.join(self.bin_dir, firmware_file)
        if not os.path.isfile(firmware_path):
            if experiment_type == "inclined_plane":
                alt_path = os.path.join(self.bin_dir, "INC.bin")
                if os.path.isfile(alt_path):
                    firmware_path = alt_path
                else:
                    return {"status": "error", "message": f"Firmware not found: {firmware_path}"}
            else:
                return {"status": "error", "message": f"Firmware file not found: {firmware_path}"}
        
        firmware_name = os.path.basename(firmware_path)  # Use filename as last_firmware
        
        try:
            # Send initial progress update
            await self._send_progress_update(10, "Starting firmware update process")
            
            ok = await self._initiate_esp32_ota(device_ip)
            if not ok:
                await self._send_progress_update(0, "ESP32 not reachable or OTA init failed")
                return {"status": "error", "message": "ESP32 not reachable or OTA init failed"}
            
            await self._send_progress_update(25, "ESP32 ready, preparing firmware upload")
            
            ok = await self._upload_firmware_chunks(device_ip, firmware_path)
            if not ok:
                await self._send_progress_update(0, "Firmware upload failed")
                return {"status": "error", "message": "Firmware upload failed"}
            
            await self._send_progress_update(80, "Firmware uploaded, finalizing update")
            
            ok = await self._finalize_esp32_ota(device_ip)
            if not ok:
                await self._send_progress_update(0, "Failed to finalize OTA")
                return {"status": "error", "message": "Failed to finalize OTA"}
            
            # Add delay for ESP32 MQTT client establishment time
            await self._send_progress_update(85, "Waiting for ESP32 MQTT client to establish connection...")
            await asyncio.sleep(5)  # 5-second delay for MQTT client establishment
            
            # Update available_sensors with last_firmware and set availability=1 (available) after successful OTA
            now = datetime.now().isoformat()
            update_stmt = text("""
                UPDATE available_sensors 
                SET last_firmware = :firmware_name, last_updated = :now, availability = 1
                WHERE sensor_id = :device_id
            """)
            try:
                with engine.begin() as conn:
                    conn.execute(update_stmt, {
                        "device_id": device_id,
                        "firmware_name": firmware_name,
                        "now": now
                    })
                logger.info(f"Updated last_firmware for {device_id} to {firmware_name} and set availability=0")
            except Exception as e:
                logger.error(f"Failed to update available_sensors after OTA for {device_id}: {e}")
            
            # Return success immediately after firmware upload - perform DB update asynchronously
            asyncio.create_task(self._update_device_firmware_async(device_id, firmware_name))
            
            return {"status": "success", "message": "OTA update completed", "device_id": device_id, "ip": device_ip}
        except Exception as e:
            logger.error(f"OTA error for {device_id}@{device_ip}: {e}", exc_info=True)
            return {"status": "error", "message": str(e)}

    async def _initiate_esp32_ota(self, device_ip: str) -> bool:
        """Check if ESP32 is reachable and ready for OTA"""
        import aiohttp
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"http://{device_ip}/", timeout=aiohttp.ClientTimeout(total=3)) as response:
                    return response.status == 200
        except Exception as e:
            logger.warning(f"ESP32 at {device_ip} not reachable: {e}")
            return False

    async def _upload_firmware_chunks(self, device_ip: str, firmware_path: str, progress_callback=None) -> bool:
        """Upload firmware to ESP32 via HTTP OTA with progress tracking"""
        import aiohttp
        from aiohttp import FormData
        
        try:
            # Read firmware file
            with open(firmware_path, 'rb') as f:
                firmware_data = f.read()
            
            # Create form data for multipart upload
            data = FormData()
            data.add_field('update', firmware_data, filename=os.path.basename(firmware_path), content_type='application/octet-stream')
            
            # Increase timeout to 30 seconds for large firmware files (1MB+)
            async with aiohttp.ClientSession() as session:
                async with session.post(f"http://{device_ip}/update", data=data, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    response_text = await response.text()
                    success = response.status == 200 and "OK" in response_text
                    if success:
                        logger.info(f"Firmware upload successful to {device_ip}")
                        # Send progress update to frontend
                        await self._send_progress_update(99, "Firmware upload successful")
                        if progress_callback:
                            await progress_callback(80, "Firmware upload completed, finalizing...")
                    else:
                        logger.error(f"Firmware upload failed to {device_ip}: HTTP {response.status}, {response_text}")
                    return success
                    
        except Exception as e:
            logger.error(f"Firmware upload error to {device_ip}: {e}", exc_info=True)
            return False

    async def _finalize_esp32_ota(self, device_ip: str) -> bool:
        """Finalize OTA process - minimal waiting since firmware upload is already successful"""
        # Just a brief pause to allow ESP32 to start processing the firmware
        await asyncio.sleep(0.5)  # Reduced from 1s to 0.5s - just enough for ESP32 to start
        
        # Don't wait for ESP32 to come back online - the firmware upload is already successful
        # The ESP32 will reboot and reconnect automatically
        logger.info(f"Firmware upload to {device_ip} completed - ESP32 will reboot automatically")
        return True  # Always return success since firmware upload was successful
    
    async def _update_device_firmware_async(self, device_id: str, firmware_name: str):
        """Asynchronously update device firmware information in database"""
        try:
            # Update available_sensors with last_firmware and set availability=1 (available) after successful OTA
            now = datetime.now().isoformat()
            update_stmt = text("""
                UPDATE available_sensors 
                SET last_firmware = :firmware_name, last_updated = :now, availability = 1
                WHERE sensor_id = :device_id
            """)
            
            with engine.begin() as conn:
                conn.execute(update_stmt, {
                    "device_id": device_id,
                    "firmware_name": firmware_name,
                    "now": now
                })
            logger.info(f"Updated last_firmware for {device_id} to {firmware_name} and set availability=1")
            
        except Exception as e:
            logger.error(f"Failed to update available_sensors after OTA for {device_id}: {e}")
