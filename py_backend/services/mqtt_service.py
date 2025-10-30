# mqtt_service.py
# MQTT service for ESP32 device communication
import json
import logging
import asyncio
import threading
import paho.mqtt.client as mqtt
from typing import Dict, Optional, Callable
from session_manager import SessionManager
from ws_client import ClientWebSocketManager

logger = logging.getLogger(__name__)

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
        
        # Setup MQTT callbacks
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
    
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
                
            payload = msg.payload.decode('utf-8')
            logger.debug(f"Payload content: {payload}")
            
            # Extract device ID from topic
            if topic.startswith("sensors/") and "/" in topic[8:]:
                device_id = topic.split("/")[1]
                
                if topic.endswith("/data"):
                    self._handle_sensor_data(device_id, payload)
                elif topic.endswith("/status"):
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
            
            # Forward to WebSocket clients for real-time streaming
            if self.client_ws_manager and self.loop:
                # Use thread-safe method to schedule async task
                asyncio.run_coroutine_threadsafe(
                    self._forward_sensor_data_to_ws(device_id, data), 
                    self.loop
                )
            
            logger.info(f"Received sensor data from {device_id}: {data}")
            
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
    
    def publish_config(self, device_id: str, config: dict):
        """Publish configuration to device"""
        try:
            # Convert field names to match ESP32 firmware expectations
            esp32_config = {
                "freq": config.get("frequency", 50),  # ESP32 expects "freq" not "frequency"
                "duration": config.get("duration", 60),
                "averagingSamples": config.get("averagingSamples", 1)
            }
            # Only include maxRange if explicitly provided to avoid forcing unsupported range
            if "maxRange" in config and config["maxRange"] is not None:
                esp32_config["maxRange"] = config["maxRange"]
            
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

    def publish_start_command(self, device_id: str):
        """Publish start experiment command to device"""
        try:
            topic = f"sensors/{device_id}/command"
            payload = json.dumps({"command": "start_experiment"})
            
            self.client.publish(topic, payload, qos=1)
            logger.info(f"Published start command to {device_id}")
            
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
        try:
            # Format the data for WebSocket clients
            ws_message = {
                "type": "sensor_data",
                "device_id": device_id,
                "data": data,
                "timestamp": int(data.get("timestamp", data.get("time", 0)))
            }
            
            # Find which user has this device allocated
            device = await self.session_manager.get_device(device_id)
            if device and device.get("allocated_to") and self.client_ws_manager:
                user_id = device["allocated_to"]
                await self.client_ws_manager.send_to_user(user_id, ws_message)
                logger.debug(f"Forwarded sensor data to user {user_id} for device {device_id}")
            
        except Exception as e:
            logger.error(f"Error forwarding sensor data to WS for {device_id}: {e}")

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
        """Update device status in session manager"""
        try:
            # Update device status in session manager
            await self.session_manager.update_device_status(device_id, status_data)
            logger.debug(f"Updated session manager status for device {device_id}")
            
        except Exception as e:
            logger.error(f"Error updating session manager status for {device_id}: {e}")