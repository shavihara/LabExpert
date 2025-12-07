# mqtt_service.py
# MQTT service for ESP32 device communication
import json
import logging
import asyncio
import threading
import struct
import paho.mqtt.client as mqtt
from typing import Dict, Optional, Callable, List
from datetime import datetime
from session_manager import SessionManager
from ws_client import ClientWebSocketManager
from processor.processor_manager import SensorProcessorManager

logger = logging.getLogger(__name__)

# Binary protocol constants (must match firmware)
BINARY_PROTOCOL_VERSION = 1
BINARY_HEADER_SIZE = 12  # Fixed: version(1) + sensor_type(1) + packet_id(2) + sample_count(2) + total_samples(2) + start_timestamp(4)
BINARY_SAMPLE_SIZE = 8
BINARY_MAX_SAMPLES_PER_PACKET = 10

# Binary packet header structure
# struct BinaryPacketHeader {
#   uint8_t version;      // Protocol version (1)
#   uint8_t sensorType;   // 1=TOF, 2=Displacement, 3=Oscillation, 4=Angle
#   uint16_t packetId;    // Sequential packet counter
#   uint16_t sampleCount; // Number of samples in this packet
#   uint16_t totalSamples;// Total samples in experiment
#   uint32_t startTime;   // Experiment start timestamp (ms)
# };

# Binary sample structure  
# struct BinarySample {
#   uint32_t timestamp;  // Sample timestamp (ms since start)
#   uint16_t distance;    // Distance measurement (mm)
#   uint16_t sampleNum;   // Sequential sample number
# };

class MQTTService:
    _instance = None
    
    def __init__(self, session_manager: SessionManager = None, client_ws_manager: ClientWebSocketManager = None, broker_host: str = "localhost", broker_port: int = 1883):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.client = mqtt.Client()
        self.session_manager = session_manager or SessionManager.get_instance()
        self.client_ws_manager = client_ws_manager
        self.message_handlers: Dict[str, Callable] = {}
        self.connected = False
        self.loop = None  # Will store the main event loop
        self.processor_manager = SensorProcessorManager.get_instance()
        
        # Setup MQTT callbacks
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        
        # Binary data processing state
        self.binary_packet_counter = 0
    
    @classmethod
    def get_instance(cls):
        return cls._instance
    
    @classmethod
    def set_instance(cls, instance):
        cls._instance = instance
    
    async def start(self):
        """Start MQTT service (async wrapper for connect)"""
        self.loop = asyncio.get_event_loop()  # Store the main event loop
        self.connect()
        
    def connect(self):
        """Connect to MQTT broker"""
        try:
            self.client.connect(self.broker_host, self.broker_port, 60)
            self.client.loop_start()
            logger.info(f"Connected to MQTT broker at {self.broker_host}:{self.broker_port}")
        except Exception as e:
            logger.error(f"Failed to connect to MQTT broker: {e}")
    
    def _on_connect(self, client, userdata, flags, rc):
        """MQTT connection callback"""
        if rc == 0:
            self.connected = True
            logger.info("MQTT connection established")
            
            # Subscribe to all sensor data topics
            self.client.subscribe("sensors/+/data", qos=1)
            self.client.subscribe("sensors/+/binary_data", qos=1)
            self.client.subscribe("sensors/+/status", qos=1)
            logger.info("Subscribed to sensor topics")
        else:
            logger.error(f"MQTT connection failed with code {rc}")
    
    def _on_message(self, client, userdata, msg):
        """Handle incoming MQTT messages"""
        try:
            topic = msg.topic
            
            # Debug: log raw message details
            logger.debug(f"MQTT message received on topic: {topic}")
            logger.debug(f"Message QoS: {msg.qos}, Retained: {msg.retain}")
            
            # Check if payload is empty
            if not msg.payload:
                # Only log empty payloads for status topics as debug, not warning
                if topic.endswith("/status"):
                    logger.debug(f"Empty status payload received on topic: {topic} (device may be offline)")
                else:
                    logger.warning(f"Empty payload received on topic: {topic}")
                return
            
            # Extract device ID from topic
            if topic.startswith("sensors/") and "/" in topic[8:]:
                device_id = topic.split("/")[1]
                
                if topic.endswith("/data"):
                    # JSON data - decode as UTF-8
                    payload = msg.payload.decode('utf-8')
                    logger.debug(f"JSON payload content: {payload}")
                    self._handle_sensor_data(device_id, payload)
                elif topic.endswith("/binary_data"):
                    # Binary data - pass raw bytes
                    logger.debug(f"Binary payload received: {len(msg.payload)} bytes")
                    self._handle_binary_sensor_data(device_id, msg.payload)
                elif topic.endswith("/status"):
                    # JSON status - decode as UTF-8
                    payload = msg.payload.decode('utf-8')
                    logger.debug(f"Status payload content: {payload}")
                    self._handle_status_update(device_id, payload)
                    
        except Exception as e:
            logger.error(f"Error processing MQTT message on topic {msg.topic}: {e}")
            if hasattr(msg, 'payload') and msg.payload:
                logger.error(f"Problematic payload: {msg.payload[:100]}")  # First 100 chars
    
    def _on_disconnect(self, client, userdata, rc):
        """MQTT disconnection callback"""
        self.connected = False
        if rc != 0:
            logger.warning("MQTT connection lost, attempting to reconnect...")
            self.connect()
    
    def _handle_sensor_data(self, device_id: str, payload: str):
        """Handle sensor data from MQTT"""
        try:
            data = json.loads(payload)
            # Convert distance from millimeters to centimeters if present
            if isinstance(data, dict) and "distance" in data:
                try:
                    data["distance"] = round(float(data["distance"]) / 10.0, 1)
                except Exception:
                    # Keep original value if conversion fails
                    pass
            
            # Process data through device-specific processor
            processed_data = asyncio.run_coroutine_threadsafe(
                self.processor_manager.process_data(device_id, data),
                self.loop
            ).result()
            
            if processed_data:
                # Forward processed data to WebSocket clients
                if self.client_ws_manager and self.loop:
                    asyncio.run_coroutine_threadsafe(
                        self._forward_processed_data_to_ws(device_id, processed_data), 
                        self.loop
                    )
                
                logger.info(f"Processed sensor data from {device_id}: {processed_data}")
            else:
                # Processing failed - log error but don't forward raw data
                logger.error(f"Failed to process sensor data from {device_id}: {data}")
            
        except Exception as e:
            logger.error(f"Error handling sensor data from {device_id}: {e}")
    
    def _handle_status_update(self, device_id: str, payload: str):
        """Handle status updates from MQTT"""
        try:
            status_data = json.loads(payload)
            
            # Update session manager with device status
            if self.session_manager and self.loop:
                asyncio.run_coroutine_threadsafe(
                    self._update_device_status_in_session(device_id, status_data),
                    self.loop
                )
            
            # Forward to WebSocket clients for real-time status updates
            if self.client_ws_manager and self.loop:
                asyncio.run_coroutine_threadsafe(
                    self._forward_status_update_to_ws(device_id, status_data),
                    self.loop
                )
            
            logger.info(f"Received status update from {device_id}: {status_data}")
            
        except Exception as e:
            logger.error(f"Error handling status update from {device_id}: {e}")
    
    def _parse_binary_sensor_data(self, payload: bytes) -> List[dict]:
        """Parse binary sensor data packet"""
        try:
            if len(payload) < BINARY_HEADER_SIZE:
                logger.error(f"Binary packet too small: {len(payload)} bytes")
                return []
            
            # Parse header (12 bytes)
            header = struct.unpack('<BBHHHL', payload[:BINARY_HEADER_SIZE])
            version, sensor_type, packet_id, sample_count, total_samples, start_time = header
            
            if version != BINARY_PROTOCOL_VERSION:
                logger.error(f"Unsupported binary protocol version: {version}")
                return []
            
            # Validate packet size
            expected_size = BINARY_HEADER_SIZE + sample_count * BINARY_SAMPLE_SIZE
            if len(payload) != expected_size:
                logger.error(f"Invalid binary packet size: got {len(payload)}, expected {expected_size}")
                return []
            
            # Parse samples
            samples = []
            for i in range(sample_count):
                offset = BINARY_HEADER_SIZE + i * BINARY_SAMPLE_SIZE
                sample_data = struct.unpack('<LHH', payload[offset:offset + BINARY_SAMPLE_SIZE])
                timestamp_ms, distance_mm, sample_num = sample_data
                
                # Convert millimeters to centimeters with one decimal precision
                distance_cm = round(distance_mm / 10.0, 1)
                
                # Convert to JSON-compatible format
                sample = {
                    "timestamp": timestamp_ms,  # Relative timestamp (milliseconds since experiment start)
                    "distance": distance_cm,   # Send distance in centimeters
                    "sample": sample_num,
                    "sensor_type": sensor_type,
                    "packet_id": packet_id
                }
                samples.append(sample)
            
            logger.debug(f"Parsed binary packet {packet_id} with {sample_count} samples")
            return samples
            
        except Exception as e:
            logger.error(f"Error parsing binary sensor data: {e}")
            return []
    
    def _handle_binary_sensor_data(self, device_id: str, payload: bytes):
        """Handle binary sensor data from MQTT"""
        try:
            samples = self._parse_binary_sensor_data(payload)
            if not samples:
                return
            
            # Process each sample through appropriate processor
            for sample in samples:
                # Process data through device-specific processor
                processed_data = asyncio.run_coroutine_threadsafe(
                    self.processor_manager.process_data(device_id, sample),
                    self.loop
                ).result()
                
                if processed_data:
                    # Forward processed data to WebSocket clients
                    if self.client_ws_manager and self.loop:
                        asyncio.run_coroutine_threadsafe(
                            self._forward_processed_data_to_ws(device_id, processed_data), 
                            self.loop
                        )
                    
                    logger.debug(f"Processed sensor data from {device_id}: {processed_data}")
                else:
                    # Processing failed - log error but don't forward raw data
                    logger.error(f"Failed to process sensor data from {device_id}: {sample}")
                
        except Exception as e:
            logger.error(f"Error handling binary sensor data from {device_id}: {e}")
    
    def publish_config(self, device_id: str, config: dict):
        """Publish configuration to device"""
        try:
            # Check if config contains oscillation-specific keys
            is_oscillation = any(k in config for k in ["max_count", "maxCount", "pendulum_length_cm", "pendulumLengthCm", "pivot_to_com_distance_cm"])
            
            if is_oscillation:
                # Pass oscillation config directly without transformation
                esp32_config = config.copy()
            else:
                # Default behavior: Convert field names to match ESP32 firmware expectations
                esp32_config = {
                        "freq": config.get("frequency", 50),  # ESP32 expects "freq" not "frequency"
                        "duration": config.get("duration", 60),
                        "averagingSamples": config.get("averagingSamples", 1)
                    }
                    # Only include maxRange if explicitly provided to avoid forcing unsupported range
                    if "maxRange" in config and config["maxRange"] is not None:
                        esp32_config["maxRange"] = config["maxRange"]
                    
                    # Include resolution for temperature experiments
                    if "resolution" in config and config["resolution"] is not None:
                        esp32_config["resolution"] = config["resolution"]
            
            topic = f"sensors/{device_id}/config"
            payload = json.dumps(esp32_config)
            
            result = self.client.publish(topic, payload, qos=1)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.error(f"Failed to publish config to {device_id}: RC {result.rc}")
                raise ValueError(f"MQTT publish failed with RC {result.rc}")
            
            logger.info(f"Successfully published config to {device_id}: {esp32_config}")
            
        except Exception as e:
            logger.error(f"Error publishing config to {device_id}: {e}")
            raise

    def publish_start_command(self, device_id: str, start_payload: dict | None = None):
        """Publish start experiment command to device"""
        try:
            topic = f"sensors/{device_id}/command"
            payload_dict = {"command": "start_experiment"}
            if isinstance(start_payload, dict) and start_payload:
                payload_dict.update(start_payload)
            payload = json.dumps(payload_dict)
            
            self.client.publish(topic, payload, qos=1)
            logger.info(f"Published start command to {device_id}: {payload_dict}")
            
        except Exception as e:
            logger.error(f"Error publishing start command to {device_id}: {e}")

    def publish_stop_command(self, device_id: str):
        """Publish stop experiment command to device"""
        try:
            topic = f"sensors/{device_id}/command"
            payload = json.dumps({"command": "stop_experiment"})
            
            self.client.publish(topic, payload, qos=1)
            logger.info(f"Published stop command to {device_id}")
            
        except Exception as e:
            logger.error(f"Error publishing stop command to {device_id}: {e}")

    def publish_pause_command(self, device_id: str):
        """Publish pause experiment command to device"""
        try:
            topic = f"sensors/{device_id}/command"
            payload = json.dumps({"command": "pause_experiment"})
            
            self.client.publish(topic, payload, qos=1)
            logger.info(f"Published pause command to {device_id}")
            
        except Exception as e:
            logger.error(f"Error publishing pause command to {device_id}: {e}")

    def publish_resume_command(self, device_id: str):
        """Publish resume experiment command to device"""
        try:
            topic = f"sensors/{device_id}/command"
            payload = json.dumps({"command": "resume_experiment"})
        
            self.client.publish(topic, payload, qos=1)
            logger.info(f"Published resume command to {device_id}")
        
        except Exception as e:
            logger.error(f"Error publishing resume command to {device_id}: {e}")

    def publish_disconnect_command(self, device_id: str):
        """Publish disconnect command to device - tells ESP32 to clean firmware and boot to OTA"""
        try:
            topic = f"sensors/{device_id}/command"
            payload = json.dumps({"command": "disconnect_device"})
            
            self.client.publish(topic, payload, qos=1)
            logger.info(f"Published disconnect command to {device_id}")
            
        except Exception as e:
            logger.error(f"Error publishing disconnect command to {device_id}: {e}")

    def disconnect(self):
        """Disconnect from MQTT broker"""
        self.client.loop_stop()
        self.client.disconnect()
        self.connected = False
        logger.info("Disconnected from MQTT broker")

    async def _forward_sensor_data_to_ws(self, device_id: str, data: dict):
        """Forward sensor data to WebSocket clients"""
        if not self.client_ws_manager:
            return
        
        # Get user ID allocated to this device
        user_id = self.session_manager.get_user_id_for_device(device_id)
        if not user_id:
            return
        
        # Create message with device ID and data
        message = {
            "type": "sensor_data",
            "device_id": device_id,
            "data": data
        }
        
        # Send to specific user
        await self.client_ws_manager.send_to_user(user_id, message)
    
    async def _forward_processed_data_to_ws(self, device_id: str, processed_data: dict):
        """Forward processed sensor data to WebSocket clients"""
        if not self.client_ws_manager:
            return
        
        # Get user ID allocated to this device
        user_id = self.session_manager.get_user_id_for_device(device_id)
        if not user_id:
            return
        
        # Create message with device ID and processed data
        message = {
            "type": "processed_data",
            "device_id": device_id,
            "data": processed_data
        }
        
        # Send to specific user
        await self.client_ws_manager.send_to_user(user_id, message)
    
    def _find_last_user_for_device(self, device_id: str) -> Optional[str]:
        """
        Try to find the last user who had this device allocated.
        This is a fallback for when device allocation is cleared but we still need to forward data.
        """
        try:
            # Check user allocations for any user that recently had this device
            for user_id, devices in self.session_manager.user_allocations.items():
                if device_id in devices:
                    return user_id
            
            # If not found in current allocations, check the device's allocation history
            device = self.session_manager.devices.get(device_id)
            if device and device.get("allocated_to"):
                return device["allocated_to"]
                
        except Exception as e:
            logger.error(f"Error finding last user for device {device_id}: {e}")
        
        return None

    async def _forward_status_update_to_ws(self, device_id: str, status_data: dict):
        """Forward status updates to WebSocket clients"""
        try:
            # Format the status for WebSocket clients
            ws_message = {
                "type": "device_status",
                "device_id": device_id,
                "status": status_data
            }
            
            # Find which user has this device allocated
            device = await self.session_manager.get_device(device_id)
            if device and device.get("allocated_to") and self.client_ws_manager:
                user_id = device["allocated_to"]
                await self.client_ws_manager.send_to_user(user_id, ws_message)
                logger.debug(f"Forwarded status update to user {user_id} for device {device_id}")
            
        except Exception as e:
            logger.error(f"Error forwarding status update to WS for {device_id}: {e}")

    async def _update_device_status_in_session(self, device_id: str, status_data: dict):
        """Update device status in session manager and available_sensors table"""
        try:
            # Update device status in session manager
            await self.session_manager.update_device_status(device_id, status_data)
            logger.debug(f"Updated session manager status for device {device_id}")
            
            # Update available_sensors table based on connection status
            await self._update_availability_status(device_id, status_data)
            
        except Exception as e:
            logger.error(f"Error updating session manager status for {device_id}: {e}")

    async def _update_availability_status(self, device_id: str, status_data: dict):
        """Update available_sensors table based on device allocation status"""
        try:
            from sqlalchemy import text
            from config.database import engine
            from datetime import datetime
            
            # Check if device has an active allocation in device_allocations table
            now = datetime.now().isoformat()
            allocation_check_stmt = text("""
                SELECT COUNT(*) FROM device_allocations 
                WHERE device_id = :device_id AND expires_at > :now
            """)
            
            with engine.connect() as conn:
                result = conn.execute(allocation_check_stmt, {
                    "device_id": device_id,
                    "now": now
                })
                has_active_allocation = result.scalar() > 0
            
            # Set availability to 0 if device has active allocation, 1 if not
            availability = 0 if has_active_allocation else 1
            
            # Update the available_sensors table
            update_stmt = text("""
                UPDATE available_sensors 
                SET availability = :availability, last_updated = :now
                WHERE sensor_id = :device_id
            """)
            
            with engine.begin() as conn:
                result = conn.execute(update_stmt, {
                    "availability": availability,
                    "now": now,
                    "device_id": device_id
                })
                
                if result.rowcount == 0:
                    # Device doesn't exist in available_sensors, insert it
                    insert_stmt = text("""
                        INSERT INTO available_sensors (sensor_id, availability, last_firmware, last_updated)
                        VALUES (:device_id, :availability, 'unknown', :now)
                    """)
                    conn.execute(insert_stmt, {
                        "device_id": device_id,
                        "availability": availability,
                        "now": now
                    })
                    logger.info(f"Inserted new device {device_id} into available_sensors with availability {availability}")
                else:
                    logger.debug(f"Updated availability for device {device_id} to {availability} (has_active_allocation: {has_active_allocation})")
                    
        except Exception as e:
            logger.error(f"Error updating availability status for {device_id}: {e}")
