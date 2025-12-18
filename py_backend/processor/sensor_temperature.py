# processor/sensor_temperature.py
# Temperature sensor processor
import logging
from typing import Dict, Any, List
from .sensor_base import SensorProcessor

logger = logging.getLogger(__name__)

class TemperatureProcessor(SensorProcessor):
    """Processor for Temperature sensors"""
    
    def __init__(self, device_id: str):
        super().__init__(device_id)
        self.experiment_type = "temperature"
        
    def get_experiment_type(self) -> str:
        return self.experiment_type
        
    async def process_data(self, raw_data: dict) -> dict:
        """Process temperature sensor data"""
        try:
            # Map short keys to full names
            processed_data = {}
            
            # Handle time
            if "ts" in raw_data:
                # Convert ms to seconds
                timestamp_sec = raw_data["ts"] / 1000.0
                processed_data["time"] = self.apply_time_offset(timestamp_sec)
            elif "time" in raw_data:
                processed_data["time"] = self.apply_time_offset(raw_data["time"])
            else:
                # Fallback to elapsed time if no timestamp from sensor
                processed_data["time"] = self.get_elapsed_time()
                
            # Handle temperature values
            if "c" in raw_data:
                processed_data["celsius"] = float(raw_data["c"])
            if "f" in raw_data:
                processed_data["fahrenheit"] = float(raw_data["f"])
            if "k" in raw_data:
                processed_data["kelvin"] = float(raw_data["k"])
                
            # Handle sample count
            if "cnt" in raw_data:
                processed_data["sample_count"] = int(raw_data["cnt"])
            
            # Round values
            for key, value in processed_data.items():
                if isinstance(value, float):
                    processed_data[key] = round(value, 2)
            
            # Add to buffer
            if self.is_active:
                self.add_to_buffer(processed_data)
                
            return processed_data
            
        except Exception as e:
            logger.error(f"Error processing temperature data for {self.device_id}: {e}")
            return {"error": str(e)}
