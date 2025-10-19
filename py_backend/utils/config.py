# utils/config.py
# Centralized configuration and constants

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
BIN_DIR = BASE_DIR / "bin"

# Default WebSocket ports
WS_CLIENT_PORT = int(os.getenv("WS_CLIENT_PORT", 8001))
WS_DEVICE_PORT = int(os.getenv("WS_DEVICE_PORT", 8002))

# OTA settings
OTA_CHUNK_SIZE = int(os.getenv("OTA_CHUNK_SIZE", 4096))

# Map known sensor IDs to firmware files (example)
FIRMWARE_MAP = {
    "TOF_SENSOR": BIN_DIR / "TOF.bin",
    "OSCILLATION_SENSOR": BIN_DIR / "OSI.bin",
    "DISP_ANGLE_SENSOR": BIN_DIR / "UpdateTOF.bin"
}

# Convenience utility
def get_firmware_for_sensor(sensor_id: str):
    return FIRMWARE_MAP.get(sensor_id)