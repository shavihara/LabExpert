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
        
    async def send_to_user(self, user_id: str, message: dict):
        websocket = self.active_clients.get(user_id)
        if websocket:
            try:
                await websocket.send_json(message)
                return True
            except Exception as e:
                logger.error(f"Error sending message to user {user_id}: {e}")
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
        try:
            # Actions that don't require allocation
            if action == "scan_devices":
                await self._handle_scan_devices(user_id)
            elif action == "select_device":
                device_id = message.get("device_id")
                await self._handle_select_device(user_id, device_id)
            elif action == "release_device":
                await self._handle_release_device(user_id)
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
        except Exception as e:
            logger.error(f"Error handling client message for {user_id}: {e}")
            await self.send_to_user(user_id, {"type": "error", "message": str(e)})

    async def _handle_scan_devices(self, user_id: str):
        devices = await self.session_manager.get_available_devices()
        normalized = []
        for d in devices:
            item = dict(d)
            item["id"] = item.get("id") or item.get("device_id")
            normalized.append(item)
        await self.send_to_user(user_id, {"type": "device_list", "devices": normalized})

    async def _handle_select_device(self, user_id: str, device_id: str):
        success = await self.session_manager.allocate_device_to_user(device_id, user_id)
        device = {
            "id": device_id,
            "device_id": device_id
        }
        status = "success" if success else "failed"
        await self.send_to_user(user_id, {"type": "device_selected", "device": device, "status": status})

    async def _handle_release_device(self, user_id: str):
        await self.session_manager.free_user_devices(user_id)
        await self.send_to_user(user_id, {"type": "device_disconnected", "device_id": None})

    async def _handle_start_experiment(self, user_id: str, config: dict, experiment_type: str):
        from ws_device import DeviceWebSocketManager
        device_manager = DeviceWebSocketManager.get_instance()
        devices = await self.session_manager.get_user_devices(user_id)
        if not devices:
            await self.send_to_user(user_id, {"type": "error", "message": "No device allocated"})
            return
        device_id = devices[0]
        success = await device_manager.send_command_to_device(device_id, {
            "type": "start_experiment",
            "experiment_type": experiment_type,
            "config": config
        })
        if success:
            await self.send_to_user(user_id, {"type": "experiment_started", "device_id": device_id})
        else:
            await self.send_to_user(user_id, {"type": "error", "message": "Failed to start experiment"})

    async def _handle_simple_device_command(self, user_id: str, command: dict, success_event: str):
        from ws_device import DeviceWebSocketManager
        device_manager = DeviceWebSocketManager.get_instance()
        devices = await self.session_manager.get_user_devices(user_id)
        if not devices:
            await self.send_to_user(user_id, {"type": "error", "message": "No device allocated"})
            return
        device_id = devices[0]
        success = await device_manager.send_command_to_device(device_id, command)
        if success:
            await self.send_to_user(user_id, {"type": success_event, "device_id": device_id})
        else:
            await self.send_to_user(user_id, {"type": "error", "message": f"Failed to {success_event}"})

    async def _handle_configure_experiment(self, user_id: str, config: dict, experiment_type: str):
        from ws_device import DeviceWebSocketManager
        device_manager = DeviceWebSocketManager.get_instance()
        devices = await self.session_manager.get_user_devices(user_id)
        if not devices:
            await self.send_to_user(user_id, {"type": "error", "message": "No device allocated"})
            return
        device_id = devices[0]
        success = await device_manager.send_command_to_device(device_id, {
            "type": "configure_experiment",
            "experiment_type": experiment_type,
            "config": config
        })
        if success:
            await self.send_to_user(user_id, {"type": "experiment_configured", "device_id": device_id, "config": config})
        else:
            await self.send_to_user(user_id, {"type": "error", "message": "Failed to configure experiment"})