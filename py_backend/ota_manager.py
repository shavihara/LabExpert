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
    def __init__(self, firmware_registry_path: str = "firmware_registry.json", bin_dir: str = "bin"):
        self.firmware_registry_path = firmware_registry_path
        self.bin_dir = bin_dir
        self.firmware_registry = self._load_firmware_registry()

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
            return {"status": "error", "message": f"Firmware not found: {firmware_path}"}
        
        firmware_name = os.path.basename(firmware_path)  # Use filename as last_firmware
        
        try:
            ok = await self._initiate_esp32_ota(device_ip)
            if not ok:
                return {"status": "error", "message": "ESP32 not reachable or OTA init failed"}
            ok = await self._upload_firmware_chunks(device_ip, firmware_path)
            if not ok:
                return {"status": "error", "message": "Firmware upload failed"}
            ok = await self._finalize_esp32_ota(device_ip)
            if not ok:
                return {"status": "error", "message": "Failed to finalize OTA"}
            
            # Update available_sensors with last_firmware
            now = datetime.now().isoformat()
            update_stmt = text("""
                UPDATE available_sensors 
                SET last_firmware = :firmware_name, last_updated = :now
                WHERE sensor_id = :device_id
            """)
            try:
                with engine.begin() as conn:
                    conn.execute(update_stmt, {
                        "device_id": device_id,
                        "firmware_name": firmware_name,
                        "now": now
                    })
                logger.info(f"Updated last_firmware for {device_id} to {firmware_name}")
            except Exception as e:
                logger.error(f"Failed to update available_sensors after OTA for {device_id}: {e}")
            
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
                        if progress_callback:
                            await progress_callback(80, "Firmware upload completed, finalizing...")
                    else:
                        logger.error(f"Firmware upload failed to {device_ip}: HTTP {response.status}, {response_text}")
                    return success
                    
        except Exception as e:
            logger.error(f"Firmware upload error to {device_ip}: {e}", exc_info=True)
            return False

    async def _finalize_esp32_ota(self, device_ip: str) -> bool:
        """Finalize OTA process and wait for ESP32 reboot"""
        import aiohttp
        
        # Wait a bit for ESP32 to process the firmware and reboot
        await asyncio.sleep(1)  # Reduced from 3s to 1s for faster detection
        
        # Try to check if ESP32 comes back online
        max_attempts = 5  # Reduced from 10 to 5
        for attempt in range(max_attempts):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(f"http://{device_ip}/", timeout=aiohttp.ClientTimeout(total=3)) as response:
                        if response.status == 200:
                            logger.info(f"ESP32 at {device_ip} is back online after OTA")
                            return True
            except Exception:
                # ESP32 might still be rebooting
                pass
            
            await asyncio.sleep(1)  # Reduced from 2s to 1s for quicker retries
        
        logger.warning(f"ESP32 at {device_ip} did not come back online within expected time")
        return True  # Still consider success as firmware was uploaded