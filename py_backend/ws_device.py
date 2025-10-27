# ws_device.py
# WebSocket server for ESP32 device communication
import asyncio
import json
import logging
from typing import Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect
from session_manager import SessionManager
from ota_manager import OTAManager
from processor.sensor_base import SensorProcessor
from processor.sensor_oscillation import OscillationProcessor
from processor.sensor_disp_angle import DispAngleProcessor
from processor.sensor_displacement import DisplacementProcessor
from utils.packet import PacketHandler
from sqlalchemy import text
from config.database import engine
from datetime import datetime

logger = logging.getLogger(__name__)

class DeviceWebSocketManager:
    _instance = None
    
    def __init__(self, session_manager: SessionManager, ota_manager: OTAManager):
        self.session_manager = session_manager
        self.ota_manager = ota_manager
        self.active_connections: Dict[str, WebSocket] = {}
        self.device_processors: Dict[str, SensorProcessor] = {}
        self.packet_handler = PacketHandler()
    
    @classmethod
    def get_instance(cls):
        return cls._instance
    
    @classmethod
    def set_instance(cls, instance):
        cls._instance = instance
        
    async def connect(self, websocket: WebSocket, device_id: str):
        """Handle ESP32 device connection"""
        await websocket.accept()
        self.active_connections[device_id] = websocket
        logger.info(f"ESP32 device {device_id} connected from IP {websocket.client.host}")
        
        # Register device in session manager
        await self.session_manager.register_device(device_id)
        
        # Capture and store client IP
        device_ip = websocket.client.host
        await self.session_manager.update_device_status(device_id, {"ip_address": device_ip})
        
        # Broadcast updated device list to all frontend clients
        from ws_client import ClientWebSocketManager
        client_manager = ClientWebSocketManager.get_instance()
        if client_manager:
            await client_manager.broadcast_device_list()
    
    async def disconnect(self, device_id: str):
        """Handle ESP32 device disconnection"""
        if device_id in self.active_connections:
            del self.active_connections[device_id]
        
        if device_id in self.device_processors:
            del self.device_processors[device_id]
            
        # Do NOT free device on disconnect - allocation persists for user's exclusive path
        # Freeing happens on logout or session expiry
        logger.info(f"ESP32 device {device_id} disconnected, but allocation preserved for exclusive user access")
        
        # Broadcast updated device list to all frontend clients
        from ws_client import ClientWebSocketManager
        client_manager = ClientWebSocketManager.get_instance()
        if client_manager:
            await client_manager.broadcast_device_list()
    
    async def handle_device_message(self, websocket: WebSocket, device_id: str, message: dict):
        """Process messages from ESP32 devices"""
        try:
            message_type = message.get("type")
            
            if message_type == "sensor_id" or message_type == "sensor_identify":
                # ESP32 sends sensor ID, backend selects firmware
                sensor_id = message.get("sensor_id")
                device_ip = message.get("ip")
                await self._handle_sensor_identification(device_id, sensor_id, device_ip)
                
            elif message_type == "sensor_data":
                # ESP32 sends binary sensor data
                await self._handle_sensor_data(device_id, message.get("data"))
                
            elif message_type == "status":
                # ESP32 status updates
                await self._handle_status_update(device_id, message.get("status"))
                
            elif message_type == "sensor_disconnected":
                logger.info(f"Ignoring sensor disconnection for {device_id} to maintain stable allocation")
                
        except Exception as e:
            logger.error(f"Error handling device message from {device_id}: {e}")
    
    async def _handle_sensor_identification(self, device_id: str, sensor_id: str, device_ip: Optional[str] = None):
        """Handle sensor ID and initiate OTA if needed"""
        try:
            # Persist sensor type and IP for UI and OTA
            status_info = {"sensor_type": sensor_id}
            if device_ip:
                status_info["ip_address"] = device_ip
            await self.session_manager.update_device_status(device_id, status_info)
            
            # Broadcast updated device list to all frontend clients
            from ws_client import ClientWebSocketManager
            client_manager = ClientWebSocketManager.get_instance()
            if client_manager:
                await client_manager.broadcast_device_list()

            # Determine experiment type from sensor_id
            experiment_type = None
            sid = (sensor_id or "").upper()
            if sid.startswith("TOF"):
                experiment_type = "displacement"
            elif sid.startswith("OSI"):
                experiment_type = "oscillation"
            elif sid.startswith("DISP_ANGLE") or sid.startswith("ANGLE") or sid.startswith("MPU"):
                experiment_type = "angle"

            # Get appropriate firmware for sensor (exists check)
            firmware_path = self.ota_manager.get_firmware_for_sensor(sensor_id)
            
            if firmware_path:
                # Send OTA command to ESP32 (for visibility/logging on device)
                websocket = self.active_connections.get(device_id)
                if websocket:
                    await websocket.send_json({
                        "type": "ota_update",
                        "firmware_url": f"/api/firmware/{sensor_id}",
                        "sensor_type": sensor_id
                    })
                
                # DISABLED: Automatic OTA updates - now handled manually through frontend UI
                # Users will manually trigger OTA through the frontend device list interface
                logger.info(f"Firmware available for {device_id} ({sensor_id}), but automatic OTA is disabled. User must manually trigger OTA through frontend UI.")
                
                # Initialize appropriate processor
                self._initialize_processor(device_id, sensor_id)
            else:
                logger.warning(f"No firmware found for sensor {sensor_id}; OTA not initiated")
                
            # Special handling for UNKNOWN sensor_id (bootloader/available state) - preserved allocation
            if sensor_id.upper() == "UNKNOWN":
                logger.info(f"Ignoring UNKNOWN sensor_id for {device_id} to maintain stable allocation")
                return  # Skip OTA and processor init for UNKNOWN
                
        except Exception as e:
            logger.error(f"Error handling sensor identification for {device_id}: {e}")
    
    def _initialize_processor(self, device_id: str, sensor_id: str):
        """Initialize sensor processor based on sensor type"""
        try:
            sid = (sensor_id or "").upper()
            processor: Optional[SensorProcessor] = None
            if sid.startswith("TOF"):
                processor = DisplacementProcessor(device_id)
            elif sid.startswith("OSI"):
                processor = OscillationProcessor(device_id)
            elif sid.startswith("DISP_ANGLE") or sid.startswith("ANGLE") or sid.startswith("MPU"):
                processor = DispAngleProcessor(device_id)
            
            if processor:
                self.device_processors[device_id] = processor
        except Exception as e:
            logger.error(f"Error initializing processor for {device_id}: {e}")
    
    async def _handle_sensor_data(self, device_id: str, data: bytes):
        """Handle incoming sensor data from ESP32"""
        try:
            # Print raw binary data to console for debugging
            print(f"\n=== RAW BINARY DATA FROM DEVICE {device_id} ===")
            print(f"Data length: {len(data)} bytes")
            print(f"Hex dump: {data.hex()}")
            
            # Decode binary data using packet handler
            try:
                decoded_data = self.packet_handler.decode(data)
                print(f"Decoded data: {decoded_data}")
                
                # Print formatted data for easy reading
                if "t" in decoded_data and "x" in decoded_data:
                    print(f"Time: {decoded_data['t']:.6f}s, Distance: {decoded_data['x']:.3f}mm")
                    if "sample_num" in decoded_data:
                        print(f"Sample #: {decoded_data['sample_num']}")
                    if "checksum_valid" in decoded_data:
                        status = "VALID" if decoded_data['checksum_valid'] else "INVALID"
                        print(f"Checksum: {status}")
                
                print("=" * 50)
                
            except ValueError as e:
                print(f"Error decoding binary data: {e}")
                print(f"Raw data: {data.hex()}")
                return
            
            # Process the data through appropriate processor
            processor = self.device_processors.get(device_id)
            if processor:
                # Convert to format expected by processors (t and x fields)
                processor_data = {
                    "t": decoded_data.get("t", 0.0),
                    "x": decoded_data.get("x", 0.0)
                }
                await processor.process_data(processor_data)
                
            # Broadcast real-time data to frontend for plotting
            await self._broadcast_real_time_data(device_id, decoded_data)
                
        except Exception as e:
            logger.error(f"Error processing sensor data from {device_id}: {e}")
            print(f"Error processing sensor data: {e}")
    
    async def _broadcast_real_time_data(self, device_id: str, sensor_data: dict):
        """Broadcast real-time sensor data to the frontend user who owns this device"""
        try:
            # Find which user owns this device
            device_info = await self.session_manager.get_device(device_id)
            if not device_info or not device_info.get("allocated_to"):
                return  # No user allocated to this device
            
            user_id = device_info["allocated_to"]
            
            # Prepare real-time data for frontend plotting
            real_time_data = {
                "type": "real_time_data",
                "device_id": device_id,
                "timestamp": sensor_data.get("t", 0.0),
                "distance": sensor_data.get("x", 0.0),
                "sample_number": sensor_data.get("sample_num", 0),
                "checksum_valid": sensor_data.get("checksum_valid", False)
            }
            
            # Send to the specific user
            from ws_client import ClientWebSocketManager
            client_manager = ClientWebSocketManager.get_instance()
            if client_manager:
                await client_manager.send_to_user(user_id, real_time_data)
                
        except Exception as e:
            logger.error(f"Error broadcasting real-time data for device {device_id}: {e}")
            print(f"Error broadcasting real-time data: {e}")
    
    async def _handle_status_update(self, device_id: str, status: dict):
        """Handle ESP32 status updates"""
        logger.info(f"Device {device_id} status: {status}")
        
        # Update device status in session manager
        await self.session_manager.update_device_status(device_id, status)
    
    async def send_command_to_device(self, device_id: str, command: dict):
        """Send command to ESP32 device"""
        websocket = self.active_connections.get(device_id)
        if websocket:
            try:
                await websocket.send_json(command)
                return True
            except Exception as e:
                logger.error(f"Error sending command to device {device_id}: {e}")
                return False
        return False
    
    def get_connected_devices(self) -> list:
        """Get list of connected ESP32 devices"""
        return list(self.active_connections.keys())
        
    def is_device_connected(self, device_id: str) -> bool:
        """Check if device is connected"""
        return device_id in self.active_connections