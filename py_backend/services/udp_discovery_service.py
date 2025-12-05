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
    
    def __init__(self, broadcast_port: int = 8888, response_port: int = 8889,
                 mqtt_broker_host: str = "localhost", mqtt_broker_port: int = 1883):
        self.broadcast_port = broadcast_port
        self.response_port = response_port
        self.broadcast_address = "255.255.255.255"
        self.discovery_interval = 30  # seconds between discovery broadcasts
        self.response_timeout = 3  # seconds to wait for responses
        
        # Device tracking with timeout mechanism
        self.online_devices: Dict[str, Dict] = {}  # device_id -> device_info
        self.last_discovery_time = 0

        self.device_timeout = 60  # seconds after which device is considered offline if no response

        # MQTT broker configuration for discovery packet
        self.mqtt_broker_host = mqtt_broker_host
        self.mqtt_broker_port = mqtt_broker_port

        
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
        if self.is_running:
            logger.warning("UDP discovery service is already running")
            return True
            
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
        
        # Close sockets - this will cause any pending socket operations to abort
        if self.broadcast_socket:
            try:
                self.broadcast_socket.close()
            except:
                pass
        if self.response_socket:
            try:
                self.response_socket.close()
            except:
                pass
        
        logger.info("UDP discovery service stopped")
    
    async def _discovery_loop(self):
        """Main discovery loop that broadcasts discovery packets periodically"""
        while self.is_running:
            try:
                await self.broadcast_discovery()

                await self._cleanup_stale_devices()

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
            except OSError as e:
                # Handle socket operation aborted errors (Windows error 995)
                if e.winerror == 995 or "operation has been aborted" in str(e).lower():
                    # Socket was closed, this is expected when service is stopping
                    if not self.is_running:
                        break  # Exit the loop if service is stopping
                    else:
                        logger.debug(f"Socket operation aborted: {e}")
                        continue
                else:
                    logger.error(f"Socket error in response listener: {e}")
                    await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Unexpected error in response listener: {e}")
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

    def _get_local_ip(self) -> str:
        """Get local IP address of this machine, preferring 192.168.x.x"""
        try:
            # Get all IP addresses associated with the hostname
            hostname = socket.gethostname()
            _, _, ip_list = socket.gethostbyname_ex(hostname)
            
            # First pass: Look for 192.168.x.x (common home network)
            for ip in ip_list:
                if ip.startswith("192.168."):
                    return ip
            
            # Second pass: Look for any private IP that is NOT 127.0.0.1
            for ip in ip_list:
                if not ip.startswith("127.") and ":" not in ip:
                    return ip
            
            # Fallback to the connect method if gethostbyname_ex fails to find a good one
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            return local_ip
        except:
            return "127.0.0.1"
    
    def _create_discovery_packet(self) -> bytes:
        """Create enhanced discovery packet with backend MAC (IP is implicit via UDP source)"""
        # Get backend MAC address using robust utility
        from utils.network_utils import get_host_mac
        mac = get_host_mac()
        
        # Fallback (should be handled by utility, but just in case)
        if not mac:
            import uuid
            mac = ':'.join(['{:02x}'.format((uuid.getnode() >> i) & 0xff) 
                            for i in range(0, 48, 8)])
        
        # We NO LONGER send mqtt_broker or mqtt_port. 
        # The ESP32 will use the UDP packet's source IP.
        
        discovery_data = {
            "magic": "LABEXPERT_DISCOVERY",
            "backend_mac": mac
        }
        
        return json.dumps(discovery_data).encode('utf-8')
    
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
            # --- NEW SECURITY VERIFICATION START ---
            # Bidirectional Security Verification: Check if device is bonded to THIS backend
            device_backend_mac = device_info.get('backend_mac')
            
            # 1. Get our own MAC
            from utils.network_utils import get_host_mac
            my_mac = get_host_mac()
            
            # 2. Check if device sent a MAC at all
            if not device_backend_mac:
                logger.warning(f"Ignoring device {device_id} from {addr}: Missing backend_mac in response!")
                return
                
            # 3. Check for mismatch
            if my_mac and device_backend_mac.lower() != my_mac.lower():
                logger.warning(f"Ignoring device {device_id} from {addr}: Backend MAC mismatch!")
                logger.warning(f"  Expected: {my_mac}")
                logger.warning(f"  Received: {device_backend_mac}")
                return
            # --- NEW SECURITY VERIFICATION END ---
            
            # Network segmentation check
            if not self._is_same_network_segment(addr[0]):
                logger.debug(f"Ignoring device {device_id} from different network segment: {addr[0]}")
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
            # Use replace errors to handle garbage characters from corrupted EEPROMs
            response_str = data.decode('utf-8', errors='replace')
            device_info = json.loads(response_str)
            
            # Validate required fields and magic value
            required_fields = ['device_id', 'ip_address', 'firmware_version', 'magic']
            if all(field in device_info for field in required_fields):
                # Check magic value - handle both quoted and unquoted strings
                magic_value = device_info.get('magic')
                if magic_value == 'LABEXPERT_RESPONSE' or magic_value == "LABEXPERT_RESPONSE":
                    return device_info
            
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.debug(f"Failed to parse response packet: {e}")
        
        return {}
    
    async def _cleanup_stale_devices(self):
        """Remove devices that haven't responded within the timeout period"""
        try:
            current_time = datetime.now().timestamp()
            stale_devices = []
            
            for device_id, device_info in self.online_devices.items():
                last_seen = device_info.get('last_seen', 0)
                if current_time - last_seen > self.device_timeout:
                    stale_devices.append(device_id)
            
            for device_id in stale_devices:
                del self.online_devices[device_id]
                logger.info(f"Device {device_id} marked as offline (no response for {self.device_timeout}s)")
            
            if stale_devices:
                logger.info(f"Cleaned up {len(stale_devices)} stale devices")
                
        except Exception as e:
            logger.error(f"Error cleaning up stale devices: {e}")
    
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
        Perform discovery.
        If service is running, piggyback on the background listener.
        If service is not running, perform standalone discovery.
        """
        logger.info(f"Starting discovery with timeout {timeout}s")
        
        if self.is_running:
            # Service is running, so the background listener is already active.
            # We just need to trigger a broadcast and wait, then check the online_devices list.
            
            # Clear recent flags or just rely on timestamps?
            # Let's rely on timestamps. We want devices seen *after* we start this scan.
            start_time = datetime.now().timestamp()
            
            # Broadcast discovery
            await self.broadcast_discovery()
            
            # Wait for responses to come in via the background listener
            await asyncio.sleep(timeout)
            
            # Collect devices that have been updated since we started
            current_devices = []
            for device_id, device_info in self.online_devices.items():
                last_seen = device_info.get('last_seen', 0)
                if last_seen >= start_time:
                    current_devices.append(device_info)
            
            logger.info(f"Discovery (via background service) completed, found {len(current_devices)} devices")
            return current_devices
            
        else:
            # Service is NOT running, perform standalone manual discovery
            # Create a temporary dictionary for this discovery session
            discovery_results = {}
            
            # Ensure sockets are initialized
            if not self.broadcast_socket or not self.response_socket:
                if not await self.initialize():
                    return []
            
            # Broadcast discovery
            await self.broadcast_discovery()
            
            # Listen for responses for the specified timeout
            start_loop_time = asyncio.get_event_loop().time()
            
            while (asyncio.get_event_loop().time() - start_loop_time) < timeout:
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
            
            logger.info(f"Manual discovery (standalone) completed, found {len(discovery_results)} devices")
            return list(discovery_results.values())
    
    def _is_same_network_segment(self, remote_ip: str) -> bool:
        """Check if remote IP is in the same network segment as this host"""
        try:
            # Get all local IP addresses
            local_ips = [addr[4][0] for addr in socket.getaddrinfo(socket.gethostname(), None) 
                        if addr[0] == socket.AF_INET]
            
            if not local_ips:
                return True  # Fallback: accept all if we can't determine local IP
            
            # Try to find a local IP that matches the remote IP's network segment
            remote_ip_parts = remote_ip.split('.')
            if len(remote_ip_parts) < 3:
                return True  # Fallback: accept if remote IP is malformed
            
            # Check if remote IP matches any of our local network segments
            for local_ip in local_ips:
                local_ip_parts = local_ip.split('.')
                if len(local_ip_parts) >= 3:
                    # Compare first three octets (network segment)
                    if (local_ip_parts[0] == remote_ip_parts[0] and 
                        local_ip_parts[1] == remote_ip_parts[1] and 
                        local_ip_parts[2] == remote_ip_parts[2]):
                        return True
            
            # If no matching network segment found, check if it's a common private network
            # Allow devices from common private network ranges even if not on our exact segment
            common_private_ranges = [
                ('192', '168'),    # 192.168.x.x
                ('172', '16'),     # 172.16.x.x - 172.31.x.x
                ('10',)            # 10.x.x.x
            ]
            
            for network_range in common_private_ranges:
                if len(network_range) == 2:
                    if (remote_ip_parts[0] == network_range[0] and 
                        remote_ip_parts[1] == network_range[1]):
                        return True
                elif len(network_range) == 1:
                    if remote_ip_parts[0] == network_range[0]:
                        return True
            
            # If we reach here, the device is on a completely different network
            logger.debug(f"Device {remote_ip} is on different network segment, filtering out")
            return False
            
        except Exception as e:
            logger.warning(f"Error checking network segment for {remote_ip}: {e}")
            return True  # Fallback: accept on error

# Global instance for easy access
udp_discovery_service = UDPDiscoveryService()