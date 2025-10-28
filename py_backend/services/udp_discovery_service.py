"""
UDP Broadcast Discovery Service
Replaces HTTP ping with UDP broadcast for ESP32 device discovery
"""
import asyncio
import socket
import json
import logging
from typing import Dict, Set, List
from datetime import datetime
import struct

logger = logging.getLogger(__name__)

class UDPDiscoveryService:
    """
    UDP broadcast discovery service for ESP32 devices
    
    Features:
    - Broadcasts discovery packets to local network
    - Listens for responses from ESP32 devices
    - Maintains online device registry
    - Supports device filtering by availability status
    """
    
    def __init__(self, broadcast_port: int = 8888, response_port: int = 8889):
        self.broadcast_port = broadcast_port
        self.response_port = response_port
        self.broadcast_address = "255.255.255.255"
        self.discovery_interval = 30  # seconds between discovery broadcasts
        self.response_timeout = 3  # seconds to wait for responses
        
        # Device tracking
        self.online_devices: Dict[str, Dict] = {}  # device_id -> device_info
        self.last_discovery_time = 0
        
        # Socket setup
        self.broadcast_socket = None
        self.response_socket = None
        self.is_running = False
        
    async def initialize(self):
        """Initialize UDP sockets for broadcasting and receiving"""
        try:
            # Create broadcast socket
            self.broadcast_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.broadcast_socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            self.broadcast_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.broadcast_socket.setblocking(False)
            
            # Create response socket
            self.response_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.response_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.response_socket.bind(('0.0.0.0', self.response_port))
            self.response_socket.setblocking(False)
            
            logger.info(f"UDP discovery service initialized on port {self.response_port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize UDP discovery: {e}")
            return False
    
    async def start(self):
        """Start the discovery service"""
        if not await self.initialize():
            return False
            
        self.is_running = True
        asyncio.create_task(self._discovery_loop())
        asyncio.create_task(self._response_listener())
        logger.info("UDP discovery service started")
        return True
    
    async def stop(self):
        """Stop the discovery service"""
        self.is_running = False
        if self.broadcast_socket:
            self.broadcast_socket.close()
        if self.response_socket:
            self.response_socket.close()
        logger.info("UDP discovery service stopped")
    
    async def _discovery_loop(self):
        """Main discovery loop that broadcasts discovery packets periodically"""
        while self.is_running:
            try:
                await self.broadcast_discovery()
                await asyncio.sleep(self.discovery_interval)
            except Exception as e:
                logger.error(f"Error in discovery loop: {e}")
                await asyncio.sleep(5)  # Wait before retrying
    
    async def _response_listener(self):
        """Listen for responses from ESP32 devices"""
        loop = asyncio.get_event_loop()
        
        while self.is_running:
            try:
                # Wait for data with timeout - use recvfrom for UDP to get both data and address
                data, addr = await asyncio.wait_for(
                    loop.sock_recvfrom(self.response_socket, 1024),
                    timeout=1.0
                )
                
                await self._handle_response(data, addr)
                
            except asyncio.TimeoutError:
                continue  # No data, continue listening
            except Exception as e:
                logger.error(f"Error in response listener: {e}")
                await asyncio.sleep(1)
    
    async def broadcast_discovery(self):
        """Broadcast discovery packet to all devices on all available networks"""
        try:
            discovery_packet = self._create_discovery_packet()
            
            # Get all broadcast addresses for available networks
            broadcast_addresses = self._get_broadcast_addresses()
            
            for broadcast_addr in broadcast_addresses:
                try:
                    await asyncio.get_event_loop().sock_sendto(
                        self.broadcast_socket,
                        discovery_packet,
                        (broadcast_addr, self.broadcast_port)
                    )
                    logger.debug(f"Discovery packet broadcasted to {broadcast_addr}")
                except Exception as e:
                    logger.error(f"Failed to broadcast to {broadcast_addr}: {e}")
            
            self.last_discovery_time = datetime.now().timestamp()
            
        except Exception as e:
            logger.error(f"Failed to broadcast discovery: {e}")
    
    def _get_broadcast_addresses(self) -> List[str]:
        """Get broadcast addresses for all available networks"""
        # Use common broadcast addresses for typical networks
        common_broadcasts = [
            '255.255.255.255',  # Global broadcast
            '192.168.1.255',    # Common home network
            '192.168.0.255',     # Common home network
            '192.168.137.255',   # Common hotspot network
            '192.168.43.255',    # Common mobile hotspot
            '172.16.255.255',    # Private network range
            '172.17.255.255',    # Private network range
            '172.18.255.255',    # Private network range
            '172.19.255.255',    # Private network range
            '172.20.255.255',    # Private network range
            '10.255.255.255'     # Private network range
        ]
        
        return common_broadcasts
    
    def _create_discovery_packet(self) -> bytes:
        """Create discovery packet - ESP32 expects simple string"""
        # ESP32 expects just the magic string "LABEXPERT_DISCOVERY" with null terminator
        return b"LABEXPERT_DISCOVERY\x00"
    
    async def _handle_response(self, data: bytes, addr: tuple):
        """Handle response from ESP32 device"""
        try:
            # Parse response packet
            device_info = self._parse_response_packet(data)
            if not device_info:
                return
            
            device_id = device_info.get('device_id')
            if not device_id:
                logger.warning(f"Received response without device_id from {addr}")
                return
            
            # Update device info with response data
            device_info.update({
                'last_seen': datetime.now().timestamp(),
                'ip_address': addr[0],
                'port': addr[1]
            })
            
            self.online_devices[device_id] = device_info
            logger.info(f"Device {device_id} discovered at {addr[0]}:{addr[1]}")
            
        except Exception as e:
            logger.error(f"Error handling response from {addr}: {e}")
    
    def _parse_response_packet(self, data: bytes) -> Dict:
        """Parse ESP32 response packet - ESP32 sends simple JSON"""
        try:
            # ESP32 sends JSON response directly
            response_str = data.decode('utf-8')
            device_info = json.loads(response_str)
            
            # Validate required fields and magic value
            required_fields = ['device_id', 'ip_address', 'firmware_version', 'magic']
            if all(field in device_info for field in required_fields):
                # Check magic value
                if device_info.get('magic') == 'LABEXPERT_RESPONSE':
                    return device_info
            
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.debug(f"Failed to parse response packet: {e}")
        
        return {}
    
    def get_online_devices(self) -> List[Dict]:
        """Get list of currently online devices"""
        return list(self.online_devices.values())
    
    def get_device_status(self, device_id: str) -> Dict:
        """Get status for specific device"""
        return self.online_devices.get(device_id, {})
    
    def is_device_online(self, device_id: str) -> bool:
        """Check if specific device is online"""
        return device_id in self.online_devices
    
    async def discover_devices(self, timeout: int = 3) -> List[Dict]:
        """
        Perform immediate discovery with timeout
        Returns list of discovered devices
        """
        logger.info(f"Starting manual discovery with timeout {timeout}s")
        
        # Create a temporary dictionary for this discovery session
        discovery_results = {}
        
        # Broadcast discovery
        await self.broadcast_discovery()
        
        # Listen for responses for the specified timeout
        start_time = asyncio.get_event_loop().time()
        
        while (asyncio.get_event_loop().time() - start_time) < timeout:
            try:
                # Check for responses
                loop = asyncio.get_event_loop()
                data, addr = await asyncio.wait_for(
                    loop.sock_recvfrom(self.response_socket, 1024),
                    timeout=0.1  # Short timeout to check frequently
                )
                
                # Handle the response
                device_info = self._parse_response_packet(data)
                if device_info and 'device_id' in device_info:
                    device_id = device_info['device_id']
                    device_info.update({
                        'last_seen': datetime.now().timestamp(),
                        'ip_address': addr[0],
                        'port': addr[1]
                    })
                    discovery_results[device_id] = device_info
                    logger.info(f"Manual discovery found device {device_id} at {addr[0]}")
                    
            except asyncio.TimeoutError:
                continue  # No data, continue listening
            except Exception as e:
                logger.error(f"Error during manual discovery: {e}")
                await asyncio.sleep(0.1)
        
        # Also add any devices that were already online
        for device_id, device_info in self.online_devices.items():
            if device_id not in discovery_results:
                discovery_results[device_id] = device_info
        
        logger.info(f"Manual discovery completed, found {len(discovery_results)} devices")
        return list(discovery_results.values())

# Global instance for easy access
udp_discovery_service = UDPDiscoveryService()