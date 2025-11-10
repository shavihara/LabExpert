# ws_client.py
# WebSocket manager for frontend clients
import asyncio
import json
import logging
from typing import Dict
from fastapi import WebSocket
from session_manager import SessionManager

logger = logging.getLogger(__name__)

class ClientWebSocketManager:
    _instance = None
    
    def __init__(self, session_manager: SessionManager):
        self.session_manager = session_manager
        self.active_clients: Dict[str, WebSocket] = {}
    
    @classmethod
    def get_instance(cls):
        return cls._instance
    
    @classmethod
    def set_instance(cls, instance):
        cls._instance = instance
        
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_clients[user_id] = websocket
        logger.info(f"Frontend client {user_id} connected")
        
    async def disconnect(self, user_id: str):
        if user_id in self.active_clients:
            del self.active_clients[user_id]
        # Do NOT free user devices on random disconnection - preserve allocation
        # Devices should only be freed on explicit user actions like logout or device release
        logger.info(f"Frontend client {user_id} disconnected (devices allocation preserved)")

    async def handle_dashboard_disconnect(self, user_id: str):
        """Handle dashboard-initiated device disconnection"""
        await self.session_manager.free_user_devices(user_id)
        await self.send_to_user(user_id, {
            "type": "dashboard_disconnect",
            "message": "Devices disconnected by dashboard navigation"
        })
        await self.broadcast_device_list()

    async def handle_dashboard_navigation(self, user_id: str):
        """Handle user navigation back to dashboard - trigger device disconnection and cleanup"""
        logger.info(f"User {user_id} navigated back to dashboard - triggering device disconnection and cleanup")
        
        # Get user's allocated devices
        user_devices = await self.session_manager.get_user_devices(user_id)
        if user_devices:
            # Send user_disconnected message to each device via MQTT
            from services.mqtt_service import MQTTService
            mqtt_service = MQTTService.get_instance()
            
            for device_id in user_devices:
                if mqtt_service and mqtt_service.connected:
                    logger.info(f"Sending user_disconnected message to device {device_id} via MQTT")
                    mqtt_service.publish_user_disconnected(device_id, user_id)
                    
                    # Also send the original disconnect_and_cleanup command
                    logger.info(f"Sending disconnect_and_cleanup command to device {device_id} via MQTT")
                    mqtt_service.publish_disconnect_command(device_id)
        
        await self.handle_dashboard_disconnect(user_id)
        
    async def send_to_user(self, user_id: str, message: dict):
        websocket = self.active_clients.get(user_id)
        if websocket:
            try:
                logger.info(f"Sending message to user {user_id}: {message}")
                await websocket.send_json(message)
                logger.info(f"Message sent successfully to user {user_id}")
                return True
            except Exception as e:
                logger.error(f"Error sending message to user {user_id}: {e}")
        else:
            logger.warning(f"No active WebSocket connection for user {user_id}")
        return False
    
    async def broadcast_device_list(self):
        """Broadcast updated device list to all clients"""
        devices = await self.session_manager.get_available_devices()
        # Enrich with IP address if stored
        enriched = []
        for d in devices:
            status = await self.session_manager.get_device_status(d["device_id"]) if isinstance(d, dict) else None
            if isinstance(d, dict):
                item = {**d}
                if status and "ip_address" in status:
                    item["ip_address"] = status["ip_address"]
                enriched.append(item)
            else:
                enriched.append(d)
        
        for user_id, websocket in self.active_clients.items():
            try:
                await websocket.send_json({
                    "type": "device_list",
                    "devices": enriched
                })
            except Exception as e:
                logger.error(f"Error broadcasting device list to {user_id}: {e}")
    
    async def handle_client_message(self, websocket: WebSocket, user_id: str, message: dict):
        action = message.get("action")
        logger.info(f"Received message from user {user_id}: {json.dumps(message, indent=2)}")
        try:
            # Actions that don't require allocation
            if action == "scan_devices":
                await self._handle_scan_devices(user_id)
            elif action == "select_device":
                device_id = message.get("device_id")
                await self._handle_select_device(user_id, device_id)
            elif action == "release_device":
                await self._handle_release_device(user_id)
            elif action == "dashboard_navigation":
                await self.handle_dashboard_navigation(user_id)
            elif action == "flash_firmware":
                # Flash firmware doesn't require device allocation - just needs device IP
                await self._handle_flash_firmware(user_id, message.get("device_id"), message.get("experiment_type"))
            else:
                # Verify allocation for device-specific actions
                user_devices = await self.session_manager.get_user_devices(user_id)
                if not user_devices:
                    await self.send_to_user(user_id, {"type": "error", "message": "No device allocated - please select a device first"})
                    return
                
                if action == "start_experiment":
                    await self._handle_start_experiment(user_id, message.get("config", {}), message.get("experiment_type"))
                elif action == "pause_experiment":
                    await self._handle_simple_device_command(user_id, {"type": "pause_experiment"}, "experiment_paused")
                elif action == "resume_experiment":
                    await self._handle_simple_device_command(user_id, {"type": "resume_experiment"}, "experiment_resumed")
                elif action == "stop_experiment":
                    await self._handle_simple_device_command(user_id, {"type": "stop_experiment"}, "experiment_stopped")
                elif action == "configure_experiment":
                    await self._handle_configure_experiment(user_id, message.get("config", {}), message.get("experiment_type"))
                elif action == "save_experiment_data":
                    await self._handle_save_experiment_data(user_id, message.get("experiment_type"), message.get("graph_type"), message.get("data"), message.get("timestamp"))
        except Exception as e:
            logger.error(f"Error handling client message for {user_id}: {e}")
            await self.send_to_user(user_id, {"type": "error", "message": str(e)})

    async def _handle_scan_devices(self, user_id: str):
        # Use manual device discovery for experiment interfaces
        logger.info(f"Manual device scan triggered for user {user_id}")
        try:
            devices = await self.session_manager.scan_devices_for_experiment()
            logger.info(f"Found {len(devices)} devices after manual scan")
            normalized = []
            for d in devices:
                item = dict(d)
                item["id"] = item.get("id") or item.get("device_id")
                normalized.append(item)
            
            logger.info(f"Sending device list with {len(normalized)} devices to user {user_id}")
            await self.send_to_user(user_id, {"type": "device_list", "devices": normalized})
            logger.info(f"Device list sent successfully to user {user_id}")
        except Exception as e:
            logger.error(f"Error during manual device scan for user {user_id}: {e}")
            await self.send_to_user(user_id, {"type": "scan_error", "error": str(e)})

    async def _handle_select_device(self, user_id: str, device_id: str):
        success = await self.session_manager.allocate_device_to_user(device_id, user_id)
        device = {
            "id": device_id,
            "device_id": device_id
        }
        status = "success" if success else "failed"
        await self.send_to_user(user_id, {"type": "device_selected", "device": device, "status": status})

    async def _handle_release_device(self, user_id: str):
        # Get user's allocated devices before freeing them
        user_devices = await self.session_manager.get_user_devices(user_id)
        
        # Send disconnect command to each allocated device via MQTT
        if user_devices:
            from services.mqtt_service import MQTTService
            mqtt_service = MQTTService.get_instance()
            
            for device_id in user_devices:
                if mqtt_service:
                    logger.info(f"Sending disconnect command to device {device_id}")
                    mqtt_service.publish_disconnect_command(device_id)
        
        # Free user devices from session manager
        await self.session_manager.free_user_devices(user_id)
        await self.send_to_user(user_id, {"type": "device_disconnected", "device_id": None})

    async def _handle_start_experiment(self, user_id: str, config: dict, experiment_type: str):
        from services.mqtt_service import MQTTService
        from processor.processor_manager import SensorProcessorManager
        
        mqtt_service = MQTTService.get_instance()
        processor_manager = SensorProcessorManager.get_instance()
        devices = await self.session_manager.get_user_devices(user_id)
        if not devices:
            await self.send_to_user(user_id, {"type": "error", "message": "No device allocated"})
            return
        device_id = devices[0]
        
        if not mqtt_service or not mqtt_service.connected:
            await self.send_to_user(user_id, {"type": "error", "message": "MQTT service not available"})
            return
        
        try:
            logger.info(f"Received start_experiment command from user {user_id} for device {device_id}, type: {experiment_type}")
            
            # Set experiment type for the device
            processor_manager.set_device_experiment(device_id, experiment_type)
            
            # Send configuration first if provided
            if config:
                logger.info(f"Publishing configuration to device {device_id}: {config}")
                mqtt_service.publish_config(device_id, config)
                
            # Send start command
            logger.info(f"Publishing start command to device {device_id}")
            mqtt_service.publish_start_command(device_id)
            await self.send_to_user(user_id, {"type": "experiment_started", "device_id": device_id})
            logger.info(f"Start command successfully sent to device {device_id}")
        except Exception as e:
            logger.error(f"Failed to send start command via MQTT: {e}")
            await self.send_to_user(user_id, {"type": "error", "message": "Failed to start experiment"})

    async def _handle_simple_device_command(self, user_id: str, command: dict, success_event: str):
        from services.mqtt_service import MQTTService
        mqtt_service = MQTTService.get_instance()
        devices = await self.session_manager.get_user_devices(user_id)
        if not devices:
            await self.send_to_user(user_id, {"type": "error", "message": "No device allocated"})
            return
        device_id = devices[0]
        
        if not mqtt_service or not mqtt_service.connected:
            await self.send_to_user(user_id, {"type": "error", "message": "MQTT service not available"})
            return
        
        try:
            command_type = command.get("type")
            logger.info(f"Received {command_type} command from user {user_id} for device {device_id}")
            
            if command_type == "pause_experiment":
                logger.info(f"Publishing pause command to device {device_id}")
                mqtt_service.publish_pause_command(device_id)
                await self.send_to_user(user_id, {"type": success_event, "device_id": device_id})
                logger.info(f"Pause command successfully sent to device {device_id}")
            elif command_type == "resume_experiment":
                logger.info(f"Publishing resume command to device {device_id}")
                mqtt_service.publish_resume_command(device_id)
                await self.send_to_user(user_id, {"type": success_event, "device_id": device_id})
                logger.info(f"Resume command successfully sent to device {device_id}")
            elif command_type == "stop_experiment":
                logger.info(f"Publishing stop command to device {device_id}")
                mqtt_service.publish_stop_command(device_id)
                await self.send_to_user(user_id, {"type": success_event, "device_id": device_id})
                logger.info(f"Stop command successfully sent to device {device_id}")
            else:
                logger.warning(f"Unknown command type received: {command_type}")
                await self.send_to_user(user_id, {"type": "error", "message": f"Unknown command type: {command_type}"})
        except Exception as e:
            logger.error(f"Failed to send {command_type} command via MQTT: {e}")
            await self.send_to_user(user_id, {"type": "error", "message": f"Failed to {success_event}"})

    async def _handle_configure_experiment(self, user_id: str, config: dict, experiment_type: str):
        from services.mqtt_service import MQTTService
        devices = await self.session_manager.get_user_devices(user_id)
        if not devices:
            await self.send_to_user(user_id, {"type": "error", "message": "No device allocated"})
            return
        device_id = devices[0]

        # Normalize incoming config keys to backend expectations
        try:
            freq = config.get("frequency")
            if freq is None:
                freq = config.get("frequency_hz") or config.get("samplingRate")
            dur = config.get("duration")
            if dur is None:
                dur = config.get("duration_s") or config.get("timeLimit")

            # Coerce to integers when provided
            if freq is not None:
                try:
                    freq = int(freq)
                except Exception:
                    pass
            if dur is not None:
                try:
                    dur = int(dur)
                except Exception:
                    pass

            normalized_config = {
                "frequency": freq if freq is not None else 50,
                "duration": dur if dur is not None else 60,
                "mode": config.get("mode") or "distance",
                "averagingSamples": config.get("averagingSamples") if config.get("averagingSamples") is not None else 1,
            }

            # Include maxRange only when explicitly provided
            if config.get("maxRange") is not None:
                try:
                    normalized_config["maxRange"] = int(config.get("maxRange"))
                except Exception:
                    normalized_config["maxRange"] = config.get("maxRange")
            elif config.get("max_distance_cm") is not None:
                try:
                    normalized_config["maxRange"] = int(round(float(config.get("max_distance_cm")) * 10))
                except Exception:
                    pass

            config = normalized_config
        except Exception as e:
            # Fall back to the original config if normalization fails
            logger.warning(f"Config normalization failed: {e}. Using raw config: {config}")

        try:
            # Use MQTT for configuration (WebSocket removed)
            mqtt_service = MQTTService.get_instance()
            if not mqtt_service or not mqtt_service.connected:
                await self.send_to_user(user_id, {"type": "error", "message": "MQTT service not available"})
                return

            logger.info(f"Publishing configuration via MQTT to device {device_id}: {config}")
            mqtt_service.publish_config(device_id, config)
            await self.send_to_user(user_id, {"type": "experiment_configured", "device_id": device_id, "config": config})
            await self.send_to_user(user_id, {"type": "configuration_result", "success": True, "message": "Configuration applied", "device_id": device_id, "config": config})
        except Exception as e:
            logger.error(f"Failed to configure experiment: {e}")
            await self.send_to_user(user_id, {"type": "error", "message": "Failed to configure experiment"})
            await self.send_to_user(user_id, {"type": "configuration_result", "success": False, "message": str(e) or "Failed to configure experiment"})

    async def _handle_flash_firmware(self, user_id: str, device_id: str, experiment_type: str):
        """Handle firmware flashing request"""
        from ota_manager import OTAManager
        ota_manager = OTAManager.get_instance()
        
        if not device_id:
            await self.send_to_user(user_id, {"type": "error", "message": "No device ID provided"})
            return
        
        try:
            logger.info(f"Flashing firmware for device {device_id}, experiment type: {experiment_type}")
            
            # Get device IP from session manager
            device_status = await self.session_manager.get_device_status(device_id)
            logger.info(f"Device status for {device_id}: {device_status}")
            
            # Extract IP from nested status structure
            device_ip = None
            if device_status:
                # Try different possible locations for IP address
                device_ip = device_status.get("ip_address")  # Direct access
                if not device_ip and "status" in device_status:
                    device_ip = device_status["status"].get("ip_address")  # Nested in status
            
            logger.info(f"Resolved device IP for {device_id}: {device_ip}")
            
            if not device_ip:
                await self.send_to_user(user_id, {
                    "type": "firmware_flash_result", 
                    "success": False, 
                    "message": f"Device IP not available for device {device_id}"
                })
                return
            
            # Map experiment type to OTA manager key
            ota_key = None
            if experiment_type == "distance" or experiment_type == "displacement":
                ota_key = "displacement"
            elif experiment_type == "oscillation":
                ota_key = "oscillation"
            elif experiment_type == "inclined_plane":
                ota_key = "inclined_plane"
            elif experiment_type == "angle":
                ota_key = "angle"
            
            if not ota_key:
                await self.send_to_user(user_id, {
                    "type": "firmware_flash_result", 
                    "success": False, 
                    "message": f"Unknown experiment type: {experiment_type}"
                })
                return
            
            # Set current context for progress updates
            ota_manager.set_current_context(user_id, device_id)
            
            # Perform OTA update
            result = await ota_manager.start_ota_update(
                device_id=device_id,
                device_ip=device_ip,
                experiment_type=ota_key
            )

            logger.info(f"OTA result for {device_id}: {result}")
            
            success = result.get("status") == "success"
            message = result.get("message", "Firmware flash completed")
            
            response_message = {
                "type": "firmware_flash_result", 
                "success": success, 
                "message": message
            }
            
            logger.info(f"Sending firmware_flash_result to user {user_id}: {response_message}")
            await self.send_to_user(user_id, response_message)
            
            # After successful firmware flash, automatically allocate the device to the user
            if success:
                logger.info(f"Automatically allocating device {device_id} to user {user_id} after successful firmware flash")
                allocation_success = await self.session_manager.allocate_device_to_user(device_id, user_id)
                if allocation_success:
                    logger.info(f"Device {device_id} successfully allocated to user {user_id}")
                    # Send device_selected message to frontend to update state
                    await self.send_to_user(user_id, {
                        "type": "device_selected", 
                        "device": {"id": device_id, "device_id": device_id}, 
                        "status": "success"
                    })
                else:
                    logger.warning(f"Failed to automatically allocate device {device_id} to user {user_id} after firmware flash")
            
        except Exception as e:
            logger.error(f"Error flashing firmware for device {device_id}: {e}")
            await self.send_to_user(user_id, {
                "type": "firmware_flash_result", 
                "success": False, 
                "message": f"Firmware flash failed: {str(e)}"
            })

    async def _handle_save_experiment_data(self, user_id: str, experiment_type: str, graph_type: str, data: dict, timestamp: str):
        """Handle experiment data saving request"""
        try:
            logger.info(f"Saving experiment data for user {user_id}, type: {experiment_type}")
            
            # In a real implementation, you would save this to a database
            # For now, we'll just log and return success
            logger.info(f"Experiment data received: {json.dumps(data, indent=2)}")
            
            await self.send_to_user(user_id, {
                "type": "save_experiment_result", 
                "success": True, 
                "message": "Experiment data saved successfully"
            })
            
        except Exception as e:
            logger.error(f"Error saving experiment data for user {user_id}: {e}")
            await self.send_to_user(user_id, {
                "type": "save_experiment_result", 
                "success": False, 
                "message": f"Failed to save experiment data: {str(e)}"
            })