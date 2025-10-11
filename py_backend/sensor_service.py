import aiohttp
import asyncio
import json
from datetime import datetime
import logging
from collections import deque
import numpy as np # Note: This was in the original file, so keeping it.

logger = logging.getLogger(__name__)

ESP32_IP = "192.168.137.15"
ESP32_BASE_URL = f"http://{ESP32_IP}"
REQUEST_TIMEOUT = 10

# ESP32 buffer capacity
MAX_ESP32_SAMPLES = 2000


class ESP32ConnectionError(Exception):
    pass


class PhysicsDataProcessor:
    """
    Processes sensor data using a hybrid approach:
    - Multi-stage smoothing for clean, real-time Displacement (s-t) and Velocity (v-t) graphs.
    - Linear regression (best-fit) on v-t data for a highly accurate and stable Acceleration (a-t) value.
    """

    def __init__(self, window_size=21):
        # --- For Real-Time Smoothing ---
        self.smoothing_window = window_size
        self.raw_displacement_buffer = deque(maxlen=window_size)
        self.velocity_buffer = deque(maxlen=window_size)

        # --- For Best-Fit Acceleration Calculation ---
        self.time_history = []
        self.velocity_history = []

        # --- State Variables ---
        self.last_smoothed_displacement = None
        self.last_timestamp = None

    def reset(self):
        """Reset all data buffers and state variables for a new experiment."""
        self.raw_displacement_buffer.clear()
        self.velocity_buffer.clear()
        self.time_history = []
        self.velocity_history = []
        self.last_smoothed_displacement = None
        self.last_timestamp = None

    def _smooth_value(self, buffer):
        """Helper function to calculate the average of a buffer."""
        if not buffer:
            return 0.0
        return sum(buffer) / len(buffer)

    def _calculate_best_fit_acceleration(self):
        """
        Calculates acceleration by finding the slope of the best-fit line
        for all (time, velocity) data points collected so far.
        """
        n = len(self.time_history)
        if n < 5:  # Start calculating after a few points for stability
            return 0.0

        # Formula for the slope (m) of a simple linear regression line:
        # m = (NΣ(xy) - ΣxΣy) / (NΣ(x²) - (Σx)²)
        x = self.time_history
        y = self.velocity_history

        sum_x = sum(x)
        sum_y = sum(y)
        sum_xy = sum([xi * yi for xi, yi in zip(x, y)])
        sum_x_sq = sum([xi**2 for xi in x])

        numerator = n * sum_xy - sum_x * sum_y
        denominator = n * sum_x_sq - sum_x**2

        if denominator == 0:
            return 0.0 # Avoid division by zero

        return numerator / denominator

    def process_reading(self, distance_mm, timestamp_ms):
        """
        Process raw sensor reading with the hybrid approach.
        """
        # Filter out obvious sensor error readings
        if distance_mm == 65535:
            if self.last_smoothed_displacement is not None:
                distance_mm = self.last_smoothed_displacement * 1000
            else:
                return None

        # --- Convert to SI units ---
        timestamp_s = timestamp_ms / 1000.0
        displacement_m = distance_mm / 1000.0

        # --- Stage 1: Calculate and Smooth Displacement (for the s-t graph) ---
        self.raw_displacement_buffer.append(displacement_m)
        smoothed_displacement = self._smooth_value(self.raw_displacement_buffer)

        # --- Initialize smoothed_velocity for this reading ---
        smoothed_velocity = 0.0
        
        if self.last_timestamp is not None and self.last_smoothed_displacement is not None:
            delta_t = timestamp_s - self.last_timestamp
            if delta_t > 0:
                # --- Stage 2: Calculate and Smooth Velocity (for the v-t graph) ---
                instant_velocity = (smoothed_displacement - self.last_smoothed_displacement) / delta_t
                self.velocity_buffer.append(instant_velocity)
                smoothed_velocity = self._smooth_value(self.velocity_buffer)

        # --- Update history for the best-fit calculation ---
        # We add the SMOOTHED velocity to the history to ensure the best-fit line is also clean.
        if self.last_timestamp is not None:
             self.time_history.append(timestamp_s)
             self.velocity_history.append(smoothed_velocity)

        # --- Stage 3: Calculate Best-Fit Acceleration (for the a-t graph) ---
        best_fit_acceleration = self._calculate_best_fit_acceleration()

        # Update state for the next iteration's calculations
        self.last_smoothed_displacement = smoothed_displacement
        self.last_timestamp = timestamp_s

        # Return the final values for plotting
        return {
            "time": round(timestamp_s, 3),
            "displacement": round(smoothed_displacement, 4), # From smoothing
            "velocity": round(smoothed_velocity, 3),         # From smoothing
            "acceleration": round(best_fit_acceleration, 3), # From best-fit line
            "raw_distance_mm": distance_mm,
            "sample_quality": "good_hybrid_processing"
        }

# Instantiate the final, improved processor
physics_processor = PhysicsDataProcessor(window_size=21)

# --- The rest of the file remains the same ---
# (I am including it all below for a complete copy-paste solution.)
async def check_esp32_connection():
    """Check if ESP32 is reachable and get device info"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{ESP32_BASE_URL}/status",
                                   timeout=aiohttp.ClientTimeout(total=5))as response:
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
    """Get device ID from ESP32"""
    try:
        logger.info(f"Attempting to get device ID from {ESP32_BASE_URL}/id")
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{ESP32_BASE_URL}/id",
                                   timeout=aiohttp.ClientTimeout(total=5)) as response:
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


async def configure_experiment(frequency: int, duration: int, mode: str = "distance"):
    """Send experiment configuration to ESP32 with validation"""
    try:
        # Validate configuration before sending
        required_samples = frequency * duration
        if required_samples > MAX_ESP32_SAMPLES:
            error_msg = (f"Configuration exceeds ESP32 buffer capacity. "
                         f"Max samples: {MAX_ESP32_SAMPLES}, "
                         f"Required: {required_samples}. "
                         f"Reduce frequency or duration.")
            logger.error(error_msg)
            return {"success": False, "error": error_msg}

        config = {
            "frequency": frequency,
            "duration": duration,
            "mode": mode
        }

        physics_processor.reset()

        async with aiohttp.ClientSession() as session:
            async with session.post(
                    f"{ESP32_BASE_URL}/configure",
                    json=config,
                    timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as response:
                if response.status == 200:
                    logger.info(f"Experiment configured: {config} (requires {required_samples} samples)")
                    return {
                        "success": True,
                        "config": config,
                        "required_samples": required_samples,
                        "max_samples": MAX_ESP32_SAMPLES
                    }
                elif response.status == 400:
                    error_data = await response.json()
                    logger.error(f"Configuration rejected by ESP32: {error_data}")
                    return {"success": False, "error": error_data.get("error", "Configuration rejected")}
                return {"success": False, "error": f"Status {response.status}"}
    except Exception as e:
        logger.error(f"Failed to configure experiment: {e}")
        return {"success": False, "error": str(e)}


async def start_experiment():
    """Start data collection on ESP32"""
    try:
        physics_processor.reset()

        async with aiohttp.ClientSession() as session:
            async with session.get(
                    f"{ESP32_BASE_URL}/start",
                    timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as response:
                if response.status == 200:
                    logger.info("Experiment started successfully")
                    return {"success": True}
                return {"success": False, "error": f"Status {response.status}"}
    except Exception as e:
        logger.error(f"Failed to start experiment: {e}")
        return {"success": False, "error": str(e)}


async def stop_experiment():
    """Stop data collection on ESP32"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                    f"{ESP32_BASE_URL}/stop",
                    timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as response:
                if response.status == 200:
                    logger.info("Experiment stopped successfully")
                    return {"success": True}
                return {"success": False, "error": f"Status {response.status}"}
    except Exception as e:
        logger.error(f"Failed to stop experiment: {e}")
        return {"success": False, "error": str(e)}


async def live_distance_generator():
    """SSE generator for live sensor data with physics processing"""
    try:
        connector = aiohttp.TCPConnector(force_close=False, limit=1)
        async with aiohttp.ClientSession(connector=connector) as session:
            logger.info(f"Connecting to ESP32 SSE stream at {ESP32_BASE_URL}/stream")

            async with session.get(
                    f"{ESP32_BASE_URL}/stream",
                    timeout=aiohttp.ClientTimeout(total=0, sock_read=300)
            ) as response:
                if response.status != 200:
                    logger.error(f"ESP32 stream returned status {response.status}")
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": f"ESP32 returned status {response.status}"})
                    }
                    return

                logger.info("Connected to ESP32 SSE stream - Hybrid processor active")

                buffer = ""

                async for chunk in response.content.iter_any():
                    try:
                        text = chunk.decode('utf-8')
                        buffer += text

                        while '\n\n' in buffer:
                            message, buffer = buffer.split('\n\n', 1)

                            for line in message.split('\n'):
                                line = line.strip()

                                if not line or line.startswith(':'):
                                    continue

                                if line.startswith('data: '):
                                    data_str = line[6:]

                                    try:
                                        raw_data = json.loads(data_str)

                                        if "distance" not in raw_data:
                                            continue

                                        processed_data = physics_processor.process_reading(
                                            distance_mm=raw_data["distance"],
                                            timestamp_ms=raw_data["timestamp"]
                                        )

                                        if processed_data is None:
                                            continue

                                        processed_data["sample"] = raw_data.get("sample", 0)

                                        logger.info(
                                            f"Sample {processed_data['sample']}: "
                                            f"t={processed_data['time']}s, "
                                            f"s={processed_data['displacement']}m, "
                                            f"v={processed_data['velocity']}m/s, "
                                            f"a={processed_data['acceleration']}m/s² "
                                            f"[{processed_data['sample_quality']}]"
                                        )

                                        yield {
                                            "event": "message",
                                            "data": json.dumps(processed_data)
                                        }

                                    except json.JSONDecodeError as e:
                                        logger.error(f"Invalid JSON from ESP32: {data_str} - {e}")

                        if len(buffer) > 10000:
                            logger.warning("Buffer overflow, clearing")
                            buffer = ""

                    except UnicodeDecodeError as e:
                        logger.error(f"Unicode decode error: {e}")
                        continue
                    except Exception as e:
                        logger.error(f"Error processing chunk: {e}", exc_info=True)
                        continue

    except asyncio.CancelledError:
        logger.info("SSE stream cancelled by client")
    except asyncio.TimeoutError:
        logger.error("ESP32 stream timeout")
        yield {
            "event": "error",
            "data": json.dumps({"error": "Stream timeout"})
        }
    except Exception as e:
        logger.error(f"Stream error: {e}", exc_info=True)
        yield {
            "event": "error",
            "data": json.dumps({"error": str(e)})
        }


async def collect_displacement():
    """Collect displacement data from ESP32"""
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
    """Collect oscillation timing data"""
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
    """Upload firmware to ESP32 via OTA"""
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
                data.add_field('update', f,
                               filename=bin_path.name,
                               content_type='application/octet-stream')

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