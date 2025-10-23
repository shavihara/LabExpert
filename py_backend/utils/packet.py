# utils/packet.py
# Binary packet handling utility

import struct

class PacketHandler:
    def __init__(self):
        # Define packet structures based on sensor type
        self.packet_formats = {
            "TOF": "<cffIc",          # New 14-byte format: header, timestamp, distance, sample_num, checksum
            "OSCILLATION": "<f",      # One float: cut_time
            "DISP_ANGLE": "<fff"      # Three floats: time, displacement, angle
        }
        
    def decode(self, binary_data: bytes, sensor_type: str = None):
        """Decode binary data; auto-detect by payload size if sensor_type not given"""
        if sensor_type:
            fmt = self.packet_formats.get(sensor_type)
        else:
            # Auto-detect by length
            length = len(binary_data)
            if length == 4:
                fmt = "<f"
            elif length == 8:
                fmt = "<ff"
            elif length == 12:
                fmt = "<fff"
            elif length == 14:
                # New 14-byte format for TOF sensors
                fmt = "<cffIc"
            else:
                raise ValueError(f"Unknown packet length: {length}")
        
        try:
            if fmt == "<cffIc":  # New TOF format
                # Unpack the 14-byte binary data
                header, timestamp, distance, sample_num, checksum = struct.unpack("<cffIc", binary_data)
                
                # Convert header and checksum from bytes to characters
                header_char = header.decode('ascii')
                checksum_char = checksum.decode('ascii')
                
                # Simple checksum validation (XOR of all bytes except header and checksum)
                calculated_checksum = 0
                for byte in binary_data[1:13]:  # Skip header (byte 0) and checksum (byte 13)
                    calculated_checksum ^= byte
                
                # Convert to character for comparison
                calculated_checksum_char = chr(calculated_checksum & 0xFF)
                
                if checksum_char != calculated_checksum_char:
                    print(f"WARNING: Checksum mismatch! Received: {checksum_char}, Calculated: {calculated_checksum_char}")
                
                return {
                    "header": header_char,
                    "t": timestamp,
                    "x": distance,
                    "sample_num": sample_num,
                    "checksum": checksum_char,
                    "checksum_valid": checksum_char == calculated_checksum_char
                }
            elif fmt == "<f":
                values = struct.unpack(fmt, binary_data)
                return {"cut_time": values[0]}
            elif fmt == "<ff":
                values = struct.unpack(fmt, binary_data)
                return {"t": values[0], "x": values[1]}
            elif fmt == "<fff":
                values = struct.unpack(fmt, binary_data)
                return {"t": values[0], "x": values[1], "angle": values[2]}
        except struct.error as e:
            raise ValueError(f"Error decoding binary data: {e}")
            
    def encode(self, sensor_type: str, *args) -> bytes:
        """Encode data into binary format"""
        fmt = self.packet_formats.get(sensor_type)
        if not fmt:
            raise ValueError(f"Unknown sensor type for encoding: {sensor_type}")
            
        try:
            return struct.pack(fmt, *args)
        except struct.error as e:
            raise ValueError(f"Error encoding data for {sensor_type}: {e}")