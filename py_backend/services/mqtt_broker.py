# mqtt_broker.py
# Simple MQTT broker for ESP32 device communication
import asyncio
import logging
import socket
from typing import Dict, Set, List, Tuple

logger = logging.getLogger(__name__)

class MQTTBrokerService:
    def __init__(self, host: str = "0.0.0.0", port: int = 1883):
        self.host = host
        self.port = port
        self.server = None
        self.clients: Dict[asyncio.StreamWriter, str] = {}
        self.subscriptions: Dict[asyncio.StreamWriter, List[Tuple[str, int]]] = {}
        self.running = False
    
    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """Handle incoming MQTT client connections"""
        client_addr = writer.get_extra_info('peername')
        client_id = f"client_{len(self.clients)}"
        self.clients[writer] = client_id
        
        logger.info(f"New MQTT client connected: {client_addr} (ID: {client_id})")
        
        try:
            # Send CONNACK (simple MQTT connection acknowledgment)
            connack = b'\x20\x02\x00\x00'  # CONNACK with success
            writer.write(connack)
            await writer.drain()
            
            while self.running:
                try:
                    # Read MQTT packet (simplified)
                    data = await asyncio.wait_for(reader.read(1024), timeout=1.0)
                    if not data:
                        break
                    
                    # Handle basic MQTT messages
                    if data[0] & 0xF0 == 0x30:  # PUBLISH message
                        await self.handle_publish(data, writer)
                    elif data[0] & 0xF0 == 0x80:  # SUBSCRIBE message
                        await self.handle_subscribe(data, writer)
                    
                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    logger.error(f"Error handling client {client_id}: {e}")
                    break
                    
        except Exception as e:
            logger.error(f"Error with client {client_id}: {e}")
        finally:
            # Clean up client connection and subscriptions with error handling
            try:
                if writer in self.clients:
                    del self.clients[writer]
                if writer in self.subscriptions:
                    del self.subscriptions[writer]
                
                # Gracefully close the writer with timeout
                writer.close()
                await asyncio.wait_for(writer.wait_closed(), timeout=2.0)
                logger.info(f"MQTT client disconnected: {client_id}")
                
            except (ConnectionError, OSError, asyncio.TimeoutError) as close_error:
                # Network errors during cleanup are expected when clients disconnect abruptly
                logger.debug(f"Expected cleanup error for client {client_id}: {close_error}")
            except Exception as close_error:
                logger.error(f"Unexpected error during client cleanup {client_id}: {close_error}")
    
    async def handle_publish(self, data: bytes, sender: asyncio.StreamWriter):
        """Handle MQTT publish messages"""
        logger.debug(f"Received PUBLISH message: {data.hex()}")
        
        if len(data) < 2:
            logger.error("Invalid PUBLISH packet: too short")
            return
        
        # Parse fixed header
        fixed_header = data[0]
        dup = (fixed_header & 0x08) >> 3
        qos = (fixed_header & 0x06) >> 1
        retain = fixed_header & 0x01
        
        # Remaining length (variable byte integer)
        pos = 1
        remaining_length = 0
        multiplier = 1
        try:
            while True:
                if pos >= len(data):
                    raise IndexError("Incomplete remaining length")
                byte = data[pos]
                remaining_length += (byte & 0x7F) * multiplier
                multiplier *= 128
                if multiplier > 128*128*128:
                    raise ValueError("Malformed remaining length")
                pos += 1
                if not (byte & 0x80):
                    break
            
            if pos + remaining_length > len(data):
                raise IndexError("Packet too short for declared remaining length")
            
            # Variable header: Topic
            if pos + 2 > len(data):
                raise IndexError("Missing topic length")
            topic_len = int.from_bytes(data[pos:pos+2], 'big')
            pos += 2
            
            if pos + topic_len > len(data):
                raise IndexError("Missing topic data")
            topic = data[pos:pos+topic_len].decode('utf-8')
            pos += topic_len
            
            # Packet ID if QoS > 0
            packet_id = None
            if qos > 0:
                if pos + 2 > len(data):
                    raise IndexError("Missing packet ID")
                packet_id = int.from_bytes(data[pos:pos+2], 'big')
                pos += 2
            
            # Payload
            payload = data[pos:pos + (len(data) - pos)]  # Adjust to actual length
            
            logger.info(f"Parsed PUBLISH: topic={topic}, qos={qos}, retain={retain}, dup={dup}, packet_id={packet_id}, payload_len={len(payload)}")
            
            # Send PUBACK for QoS 1 messages
            if qos == 1 and packet_id is not None:
                puback = b'\x40\x02' + packet_id.to_bytes(2, 'big')
                sender.write(puback)
                await sender.drain()
                logger.debug(f"Sent PUBACK for packet_id={packet_id}")
            
            # Deliver message to subscribers
            await self.deliver_to_subscribers(topic, payload, qos, packet_id)
        
        except (IndexError, ValueError, UnicodeDecodeError) as e:
            logger.error(f"Error parsing PUBLISH packet: {e}")
            # For QoS 1, perhaps send PUBREC or handle accordingly, but for now log and skip
        
    async def deliver_to_subscribers(self, topic: str, payload: bytes, qos: int, packet_id: int = None):
        """Deliver a published message to all matching subscribers"""
        delivered_count = 0
        for subscriber, subs in self.subscriptions.items():
            for sub_filter, sub_qos in subs:
                if self.topic_matches(sub_filter, topic):
                    try:
                        # Create PUBLISH packet for subscriber
                        delivery_qos = min(qos, sub_qos)
                        
                        # Fixed header: PUBLISH + QoS + retain=0 + dup=0
                        fixed_header = 0x30 | (delivery_qos << 1)
                        
                        # Variable header: Topic
                        topic_bytes = topic.encode('utf-8')
                        variable_header = len(topic_bytes).to_bytes(2, 'big') + topic_bytes
                        
                        # Add packet ID for QoS > 0
                        if delivery_qos > 0:
                            # Use original packet ID or generate a new one
                            sub_packet_id = packet_id if packet_id else 1  # Simple ID for demo
                            variable_header += sub_packet_id.to_bytes(2, 'big')
                        
                        # Calculate remaining length
                        remaining_length = len(variable_header) + len(payload)
                        
                        # Encode remaining length (variable byte integer)
                        remaining_bytes = bytearray()
                        rl = remaining_length
                        while True:
                            byte = rl % 128
                            rl = rl // 128
                            if rl > 0:
                                byte |= 0x80
                            remaining_bytes.append(byte)
                            if rl == 0:
                                break
                        
                        # Assemble packet
                        packet = bytes([fixed_header]) + bytes(remaining_bytes) + variable_header + payload
                        
                        # Send to subscriber
                        subscriber.write(packet)
                        await subscriber.drain()
                        
                        logger.debug(f"Delivered message to subscriber, topic={topic}, qos={delivery_qos}")
                        delivered_count += 1
                        
                    except Exception as e:
                        logger.error(f"Error delivering message to subscriber: {e}")
        
        logger.info(f"Delivered message on topic {topic} to {delivered_count} subscribers")
    
    def topic_matches(self, sub_filter: str, topic: str) -> bool:
        """Check if topic matches subscription filter with + and # wildcards"""
        filter_parts = sub_filter.split('/')
        topic_parts = topic.split('/')
        f_len = len(filter_parts)
        t_len = len(topic_parts)
        
        if f_len > t_len + 1:  # Can't match unless #
            return False
        
        for i in range(f_len):
            f = filter_parts[i]
            if i >= t_len:
                return f == '#' and i == f_len - 1
            if f == '#':
                return i == f_len - 1  # # must be last
            if f == '+':
                continue
            if f != topic_parts[i]:
                return False
        
        if filter_parts[-1] == '#':
            return True
        
        return f_len == t_len
    
    async def handle_subscribe(self, data: bytes, client: asyncio.StreamWriter):
        """Handle MQTT subscribe messages"""
        logger.debug(f"Received SUBSCRIBE message: {data.hex()}")
        
        # Parse SUBSCRIBE packet
        # Fixed header: data[0] == 0x82, data[1] = remaining length
        if len(data) < 2:
            logger.error("Invalid SUBSCRIBE packet: too short")
            return
        
        # Parse remaining length (variable byte integer)
        pos = 1
        remaining_length = 0
        multiplier = 1
        while True:
            if pos >= len(data):
                logger.error("Invalid SUBSCRIBE packet: incomplete remaining length")
                return
            byte = data[pos]
            remaining_length += (byte & 0x7F) * multiplier
            multiplier *= 128
            if multiplier > 128*128*128:
                logger.error("Invalid SUBSCRIBE packet: malformed remaining length")
                return
            pos += 1
            if not (byte & 0x80):
                break
        
        if pos + remaining_length > len(data):
            logger.error("Invalid SUBSCRIBE packet: packet too short for remaining length")
            return
        
        # Variable header: Packet ID (2 bytes)
        if pos + 2 > len(data):
            logger.error("Invalid SUBSCRIBE packet: missing packet ID")
            return
        packet_id = int.from_bytes(data[pos:pos+2], 'big')
        pos += 2
        
        # Parse payload: list of (topic length, topic, QoS)
        suback_qos = []
        try:
            while pos < len(data):
                if pos + 2 > len(data):
                    raise IndexError("Missing topic length")
                topic_len = int.from_bytes(data[pos:pos+2], 'big')
                pos += 2
                
                if pos + topic_len > len(data):
                    raise IndexError("Missing topic data")
                topic = data[pos:pos+topic_len].decode('utf-8')
                pos += topic_len
                
                if pos >= len(data):
                    raise IndexError("Missing QoS")
                qos = data[pos]
                pos += 1
                
                # Store subscription with wildcard support
                if client not in self.subscriptions:
                    self.subscriptions[client] = []
                granted_qos = min(qos, 1)
                self.subscriptions[client].append((topic, granted_qos))
                suback_qos.append(granted_qos)
                
                logger.info(f"Client subscribed to {topic} with QoS {granted_qos}")
        except (IndexError, UnicodeDecodeError) as e:
            logger.error(f"Error parsing SUBSCRIBE payload: {e}")
            # Send SUBACK with failure codes if possible
            suback_qos = [0x80] * (len(suback_qos) + 1)  # Failure for remaining
            # Proceed to send SUBACK with what we have
        
        # Send SUBACK with proper variable length encoding
        variable_header = packet_id.to_bytes(2, 'big')
        suback_payload = bytes(suback_qos)
        remaining_length = len(variable_header) + len(suback_payload)
        
        # Encode remaining length as variable byte integer
        remaining_bytes = bytearray()
        rl = remaining_length
        while True:
            byte = rl % 128
            rl = rl // 128
            if rl > 0:
                byte |= 0x80
            remaining_bytes.append(byte)
            if rl == 0:
                break
        
        suback = b'\x90' + bytes(remaining_bytes) + variable_header + suback_payload
        client.write(suback)
        await client.drain()
    
    async def start(self):
        """Start the MQTT broker server"""
        try:
            self.server = await asyncio.start_server(
                self.handle_client,
                self.host,
                self.port
            )
            self.running = True
            
            logger.info(f"MQTT broker started on {self.host}:{self.port}")
            logger.info("Broker is ready to accept ESP32 connections")
            
            # Return the server object for proper lifecycle management
            return self.server
        except Exception as e:
            logger.error(f"Failed to start MQTT broker: {e}")
            return None
    
    async def stop(self):
        """Stop the MQTT broker server"""
        self.running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("MQTT broker stopped")

# Global broker instance
mqtt_broker_service = MQTTBrokerService(host="192.168.137.1", port=1883)

async def start_mqtt_broker():
    """Start the MQTT broker (to be called from main.py)"""
    return await mqtt_broker_service.start()

async def stop_mqtt_broker():
    """Stop the MQTT broker"""
    await mqtt_broker_service.stop()

# Export the functions
__all__ = ['start_mqtt_broker', 'stop_mqtt_broker']