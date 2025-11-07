#!/usr/bin/env python3
"""
Simple UDP test to verify the backend can receive UDP packets on port 8889
"""
import socket
import time

def test_udp_reception():
    """Test if we can receive UDP packets on port 8889"""
    try:
        # Create a UDP socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        # Bind to all interfaces on port 8889
        sock.bind(('0.0.0.0', 8889))
        sock.settimeout(5.0)  # 5 second timeout
        
        print("Listening for UDP packets on port 8889...")
        print("Send a test packet from another device or use: echo 'test' | nc -u 192.168.137.1 8889")
        
        try:
            data, addr = sock.recvfrom(1024)
            print(f"Received packet from {addr}: {data.decode()}")
            return True
        except socket.timeout:
            print("No packets received within 5 seconds")
            return False
        
    except Exception as e:
        print(f"Error setting up UDP socket: {e}")
        return False
    finally:
        sock.close()

if __name__ == "__main__":
    test_udp_reception()