import aiohttp
import asyncio
import json
from datetime import datetime
import logging
from collections import deque
import numpy as np
from ws_device import DeviceWebSocketManager

logger = logging.getLogger(__name__)

ESP32_IP = "192.168.137.15"
ESP32_BASE_URL = f"http://{ESP32_IP}"

def set_esp32_ip(ip_address: str):
    """Dynamically set the ESP32 IP address for device communication"""
    global ESP32_IP, ESP32_BASE_URL
    ESP32_IP = ip_address
    ESP32_BASE_URL = f"http://{ip_address}"
    logger.info(f"ESP32 IP dynamically set to: {ip_address}")
REQUEST_TIMEOUT = 10
MAX_ESP32_SAMPLES = 1000


class ESP32ConnectionError(Exception):
    pass


class PhysicsDataProcessor:
    def __init__(self, window_size=3):
        self.smoothing_window = window_size
        self.raw_displacement_buffer = deque(maxlen=window_size)
        self.velocity_buffer = deque(maxlen=window_size)
        self.acceleration_buffer = deque(maxlen=window_size)
        self.last_smoothed_displacement = None
        self.last_velocity = None
        self.last_timestamp = None
        self.error_count = 0
        self.total_count = 0

    def reset(self):
        self.raw_displacement_buffer.clear()
        self.velocity_buffer.clear()
        self.acceleration_buffer.clear()
        self.last_smoothed_displacement = None
        self.last_velocity = None
        self.last_timestamp = None
        self.error_count = 0
        self.total_count = 0

    def _smooth_value(self, buffer):
        if not buffer:
            return 0.0
        return sum(buffer) / len(buffer)

    def process_reading(self, distance_mm, timestamp_ms):
        self.total_count += 1
        
        if distance_mm == 65535:
            self.error_count += 1
            logger.warning(f"Invalid reading rejected (error {self.error_count}/{self.total_count})")
            return None

        timestamp_s = timestamp_ms / 1000.0
        displacement_m = distance_mm / 1000.0

        self.raw_displacement_buffer.append(displacement_m)
        smoothed_displacement = self._smooth_value(self.raw_displacement_buffer)

        velocity_ms = 0.0
        acceleration_ms2 = 0.0
        smoothed_velocity = 0.0
        smoothed_acceleration = 0.0

        if self.last_timestamp is not None and self.last_smoothed_displacement is not None:
            delta_t = timestamp_s - self.last_timestamp
            if delta_t > 0:
                velocity_ms = (smoothed_displacement - self.last_smoothed_displacement) / delta_t
                self.velocity_buffer.append(velocity_ms)
                smoothed_velocity = self._smooth_value(self.velocity_buffer)

                if self.last_velocity is not None:
                    acceleration_ms2 = (smoothed_velocity - self.last_velocity) / delta_t
                    self.acceleration_buffer.append(acceleration_ms2)
                    smoothed_acceleration = self._smooth_value(self.acceleration_buffer)

        self.last_smoothed_displacement = smoothed_displacement
        self.last_velocity = smoothed_velocity
        self.last_timestamp = timestamp_s

        return {
            "time": round(timestamp_s, 3),
            "displacement": round(smoothed_displacement, 4),
            "velocity": round(smoothed_velocity, 3),
            "acceleration": round(smoothed_acceleration, 3),
            "raw_distance_mm": distance_mm,
            "sample_quality": "live_smoothed"
        }
    
    def get_error_rate(self):
        if self.total_count == 0:
            return 0.0
        return (self.error_count / self.total_count) * 100.0


def analyze_data_with_best_fit(all_data_points: list):
    if not all_data_points or len(all_data_points) < 5:
        logger.warning("Insufficient data for polynomial fit")
        return []

    time_history = np.array([p['time'] for p in all_data_points])
    displacement_history = np.array([p['displacement'] for p in all_data_points])
    
    if len(np.unique(displacement_history)) < 3:
        logger.warning("Displacement data lacks variation - may be mostly errors")
        return all_data_points
    
    try:
        coeffs = np.polyfit(time_history, displacement_history, 2)
        c2, c1, c0 = coeffs
        
        predicted = np.polyval(coeffs, time_history)
        residuals = displacement_history - predicted
        ss_res = np.sum(residuals**2)
        ss_tot = np.sum((displacement_history - np.mean(displacement_history))**2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        
        logger.info(f"Polynomial fit: a={2*c2:.4f} m/s², u={c1:.4f} m/s, s₀={c0:.4f} m, R²={r_squared:.4f}")
        
        if r_squared < 0.85:
            logger.warning(f"Poor fit quality (R²={r_squared:.4f}). Data may have issues.")
        
    except np.linalg.LinAlgError:
        logger.error("Polynomial fit failed - returning original data")
        return all_data_points

    initial_displacement_fit = c0
    initial_velocity_fit = c1
    acceleration_fit = 2 * c2

    analyzed_data = []
    for time_t in time_history:
        best_fit_displacement = (0.5 * acceleration_fit * (time_t ** 2)) + \
                               (initial_velocity_fit * time_t) + \
                               initial_displacement_fit
        best_fit_velocity = initial_velocity_fit + acceleration_fit * time_t
        
        analyzed_data.append({
            "time": time_t,
            "displacement": round(best_fit_displacement, 4),
            "velocity": round(best_fit_velocity, 3),
            "acceleration": round(acceleration_fit, 3),
            "fit_quality": round(r_squared, 4)
        })
        
    return analyzed_data


physics_processor = PhysicsDataProcessor(window_size=3)


async def check_esp32_connection():
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{ESP32_BASE_URL}/status", timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status == 200:
                    data = await response.json()
                    return {
                        "connected": True, 
                        "device_info": data, 
                        "ready": data.get("ready", True), 
                        "max_samples": data.get("max_samples", MAX_ESP32_SAMPLES)
                    }
                return {"connected": False, "ready": False}
    except Exception as e:
        logger.error(f"ESP32 connection check failed: {e}")
        return {"connected": False, "ready": False, "error": str(e)}


async def get_device_id():
    try:
        logger.info(f"Attempting to get device ID from {ESP32_BASE_URL}/id")
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{ESP32_BASE_URL}/id", timeout=aiohttp.ClientTimeout(total=5)) as response:
                logger.info(f"Response status: {response.status}")
                if response.status == 200:
                    data = await response.json()
                    device_id = data.get("id")
                    logger.info(f"Device ID received: {device_id}")
                    return device_id
                else:
                    logger.error(f"Bad status code: {response.status}")
                    return None
    except Exception as e:
        logger.error(f"Failed to get device ID: {e}", exc_info=True)
        return None


async def configure_experiment(frequency: int, duration: int, device_id: str, mode: str = 'distance'):
    try:
        # Use WebSocket approach if device is connected
        device_manager = DeviceWebSocketManager.get_instance()
        
        # Check if device is connected via WebSocket
        if device_manager.is_device_connected(device_id):
            # Validate configuration
            required_samples = frequency * duration
            if required_samples > MAX_ESP32_SAMPLES:
                error_msg = (
                    f"Configuration exceeds ESP32 buffer capacity. "
                    f"Max samples: {MAX_ESP32_SAMPLES}, Required: {required_samples}. "
                    f"Reduce frequency or duration."
                )
                logger.error(error_msg)
                return {"success": False, "error": error_msg}
            
            if frequency > 50:
                logger.warning(f"Frequency {frequency}Hz exceeds recommended max: 50Hz")
            
            # Create configuration
            config = {
                "frequency": frequency,
                "duration": duration,
                "mode": mode,
                "averagingSamples": 1
            }
            
            logger.info(f"Sending configuration to ESP32 via WebSocket: {config}")
            physics_processor.reset()
            
            # Send configuration via WebSocket
            success = await device_manager.send_command_to_device(device_id, {
                "type": "configure_experiment",
                "experiment_type": "tof",
                "config": config
            })
            
            if success:
                return {"success": True, "config": config, "required_samples": required_samples, "max_samples": MAX_ESP32_SAMPLES}
            else:
                return {"success": False, "error": "Failed to send configuration to device via WebSocket"}
        
        # Fallback to HTTP for devices not connected via WebSocket
        logger.info(f"Device {device_id} not connected via WebSocket, falling back to HTTP configuration")
        
        # Get device IP from session manager for HTTP fallback
        from session_manager import SessionManager
        session_manager = SessionManager.get_instance()
        device_status = await session_manager.get_device_status(device_id)
        device_ip = device_status.get("ip_address") if device_status else None
        
        if not device_ip:
            return {"success": False, "error": f"Device {device_id} IP address not available for HTTP fallback"}
        
        # Create configuration for HTTP
        config = {
            "frequency": frequency,
            "duration": duration,
            "mode": mode,
            "averagingSamples": 1
        }
        
        logger.info(f"Sending configuration to ESP32 via HTTP: {config}")
        physics_processor.reset()
        
        # Send configuration via HTTP
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"http://{device_ip}/configure",
                json=config,
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return {"success": True, "config": config, "required_samples": frequency * duration, "max_samples": MAX_ESP32_SAMPLES}
                else:
                    error_text = await response.text()
                    logger.error(f"HTTP configuration failed with status {response.status}: {error_text}")
                    return {"success": False, "error": f"HTTP configuration failed: Status {response.status}"}
        
    except Exception as e:
        logger.error(f"Failed to configure experiment: {e}", exc_info=True)
        return {"success": False, "error": str(e)}

async def start_experiment(device_id: str = None):
    try:
        physics_processor.reset()
        
        # Use WebSocket approach if device_id is provided
        if device_id:
            device_manager = DeviceWebSocketManager.get_instance()
            
            if not device_manager.is_device_connected(device_id):
                return {"success": False, "error": f"Device {device_id} is not connected via WebSocket"}
            
            success = await device_manager.send_command_to_device(device_id, {
                "type": "start_experiment",
                "experiment_type": "tof"
            })
            
            if success:
                logger.info("Experiment started successfully via WebSocket")
                return {"success": True}
            else:
                return {"success": False, "error": "Failed to start experiment via WebSocket"}
        
        # Fallback to HTTP for backward compatibility
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{ESP32_BASE_URL}/start", 
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as response:
                if response.status == 200:
                    logger.info("Experiment started successfully via HTTP")
                    return {"success": True}
                else:
                    error_text = await response.text()
                    logger.error(f"Start failed with status {response.status}: {error_text}")
                    return {"success": False, "error": f"Status {response.status}: {error_text}"}
    except Exception as e:
        logger.error(f"Failed to start experiment: {e}")
        return {"success": False, "error": str(e)}


async def stop_experiment(device_id: str = None):
    try:
        # Use WebSocket approach if device_id is provided
        if device_id:
            device_manager = DeviceWebSocketManager.get_instance()
            
            if not device_manager.is_device_connected(device_id):
                return {"success": False, "error": f"Device {device_id} is not connected via WebSocket"}
            
            success = await device_manager.send_command_to_device(device_id, {
                "type": "stop_experiment",
                "experiment_type": "tof"
            })
            
            if success:
                logger.info("Experiment stopped successfully via WebSocket")
                return {"success": True}
            else:
                return {"success": False, "error": "Failed to stop experiment via WebSocket"}
        
        # Fallback to HTTP for backward compatibility
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{ESP32_BASE_URL}/stop", 
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as response:
                if response.status == 200:
                    logger.info("Experiment stopped successfully via HTTP")
                    return {"success": True}
                else:
                    error_text = await response.text()
                    logger.error(f"Stop failed with status {response.status}: {error_text}")
                    return {"success": False, "error": f"Status {response.status}: {error_text}"}
    except Exception as e:
        logger.error(f"Failed to stop experiment: {e}")
        return {"success": False, "error": str(e)}


async def live_distance_generator():
    try:
        logger.info("Starting WebSocket-compatible sensor data stream")
        
        while True:
            await asyncio.sleep(0.02)
            
            yield {
                "event": "info",
                "data": {"message": "WebSocket stream ready - connect to ESP32 directly"}
            }
            
    except asyncio.CancelledError:
        logger.info("WebSocket stream cancelled")
    except Exception as e:
        logger.error(f"WebSocket stream error: {e}")
        yield {"event": "error", "data": {"error": str(e)}}


async def collect_displacement():
    try:
        start_result = await start_experiment()
        if not start_result["success"]:
            return {"success": False, "error": "Failed to start collection"}
        
        max_polls = 120
        poll_count = 0
        
        async with aiohttp.ClientSession() as session:
            while poll_count < max_polls:
                async with session.get(
                    f"{ESP32_BASE_URL}/status", 
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    if response.status == 200:
                        status = await response.json()
                        if status.get("ready"):
                            break
                await asyncio.sleep(0.5)
                poll_count += 1
            
            async with session.get(
                f"{ESP32_BASE_URL}/data", 
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return {"success": True, "data": data}
                return {"success": False, "error": f"Status {response.status}"}
    except Exception as e:
        logger.error(f"Failed to collect displacement: {e}")
        return {"success": False, "error": str(e)}


async def collect_oscillations(n: int = 3):
    results = []
    try:
        async with aiohttp.ClientSession() as session:
            for i in range(n):
                async with session.get(
                    f"{ESP32_BASE_URL}/start_oscillation", 
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    if response.status != 200:
                        results.append({"error": f"Failed to start oscillation {i + 1}"})
                        continue
                
                await asyncio.sleep(3)
                
                async with session.get(
                    f"{ESP32_BASE_URL}/oscillation_data", 
                    timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        results.append({"set": i + 1, "data": data})
                    else:
                        results.append({"error": f"Failed to get oscillation {i + 1} data"})
        
        return {"success": True, "results": results}
    except Exception as e:
        logger.error(f"Failed to collect oscillations: {e}")
        return {"success": False, "error": str(e)}


async def upload_firmware(bin_path):
    try:
        if not bin_path.exists():
            logger.error(f"Firmware file not found: {bin_path}")
            return False
        
        file_size = bin_path.stat().st_size
        logger.info(f"Uploading firmware: {bin_path.name} ({file_size:,} bytes)")
        
        if file_size > 1500000:
            logger.warning(f"Firmware size is large: {file_size:,} bytes - may not fit in partition")
        
        async with aiohttp.ClientSession() as session:
            with open(bin_path, 'rb') as f:
                data = aiohttp.FormData()
                data.add_field(
                    'update', 
                    f, 
                    filename=bin_path.name, 
                    content_type='application/octet-stream'
                )
                
                logger.info(f"Sending POST to {ESP32_BASE_URL}/update")
                async with session.post(
                    f"{ESP32_BASE_URL}/update", 
                    data=data, 
                    timeout=aiohttp.ClientTimeout(total=90)
                ) as response:
                    logger.info(f"Upload HTTP status: {response.status}")
                    
                    if response.status == 200:
                        text = await response.text()
                        logger.info(f"ESP32 response: '{text}'")
                        
                        if text.strip() == "OK":
                            logger.info("Upload successful! Waiting for ESP32 to reboot...")
                            await asyncio.sleep(15)
                            return True
                        else:
                            logger.error(f"Upload reported failure: {text}")
                            return False
                    else:
                        logger.error(f"Bad HTTP status: {response.status}")
                        return False
                        
    except asyncio.TimeoutError:
        logger.error("Upload timed out - ESP32 may have crashed during write")
        return False
    except Exception as e:
        logger.error(f"Firmware upload exception: {e}", exc_info=True)
        return False