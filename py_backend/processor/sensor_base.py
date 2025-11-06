# processor/sensor_base.py
# Base class for all sensor processors
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List
from collections import deque
import numpy as np
from datetime import datetime

logger = logging.getLogger(__name__)

class SensorProcessor(ABC):
    """Base class for all sensor processors"""
    
    def __init__(self, device_id: str, buffer_size: int = 1000):
        self.device_id = device_id
        self.buffer_size = buffer_size
        self.data_buffer = deque(maxlen=buffer_size)
        self.is_active = False
        self.start_time = None
        self.first_timestamp = None  # Track first timestamp for offset calculation
        self.time_offset = 0.0       # Time offset to make first data point 0.00s
        self.config = {}
        
    @abstractmethod
    async def process_data(self, raw_data: dict) -> dict:
        """Process raw sensor data and return processed results"""
        pass
        
    @abstractmethod
    def get_experiment_type(self) -> str:
        """Return the experiment type identifier"""
        pass
        
    def configure(self, config: dict):
        """Configure processor with experiment parameters"""
        self.config.update(config)
        logger.info(f"Processor {self.device_id} configured: {config}")
        
    def start_experiment(self):
        """Start data collection"""
        self.is_active = True
        self.start_time = datetime.now()
        self.first_timestamp = None  # Reset first timestamp tracking
        self.time_offset = 0.0      # Reset time offset
        self.data_buffer.clear()
        logger.info(f"Experiment started for device {self.device_id}")
        
    def stop_experiment(self):
        """Stop data collection"""
        self.is_active = False
        logger.info(f"Experiment stopped for device {self.device_id}")
        
    def get_elapsed_time(self) -> float:
        """Get elapsed time since experiment start"""
        if self.start_time:
            return (datetime.now() - self.start_time).total_seconds()
        return 0.0
        
    def apply_time_offset(self, timestamp: float) -> float:
        """Apply time offset to make first data point 0.00 seconds"""
        if self.first_timestamp is None:
            # First data point - set as reference
            self.first_timestamp = timestamp
            self.time_offset = timestamp
            return 0.0
        else:
            # Apply offset to subsequent data points
            adjusted_time = timestamp - self.time_offset
            # Ensure we never return negative time values
            return max(0.0, adjusted_time)
        
    def add_to_buffer(self, processed_data: dict):
        """Add processed data to buffer"""
        processed_data['timestamp'] = datetime.now().isoformat()
        processed_data['elapsed_time'] = self.get_elapsed_time()
        self.data_buffer.append(processed_data)
        
    def get_buffer_data(self) -> List[dict]:
        """Get all buffered data"""
        return list(self.data_buffer)
        
    def get_latest_data(self, count: int = 10) -> List[dict]:
        """Get latest N data points"""
        return list(self.data_buffer)[-count:] if len(self.data_buffer) >= count else list(self.data_buffer)
        
    def calculate_statistics(self, values: List[float]) -> dict:
        """Calculate basic statistics for a list of values, rounded to 2 decimal places"""
        if not values:
            return {"mean": 0, "std": 0, "min": 0, "max": 0, "count": 0}
            
        np_values = np.array(values)
        return {
            "mean": round(float(np.mean(np_values)), 2),
            "std": round(float(np.std(np_values)), 2),
            "min": round(float(np.min(np_values)), 2),
            "max": round(float(np.max(np_values)), 2),
            "count": len(values)
        }
        
    def calculate_derivative(self, x_values: List[float], y_values: List[float]) -> List[float]:
        """Calculate numerical derivative dy/dx"""
        if len(x_values) < 2 or len(y_values) < 2:
            return []
            
        derivatives = []
        for i in range(1, len(x_values)):
            dx = x_values[i] - x_values[i-1]
            dy = y_values[i] - y_values[i-1]
            if dx != 0:
                derivatives.append(dy / dx)
            else:
                derivatives.append(0.0)
                
        return derivatives
        
    def smooth_data(self, values: List[float], window_size: int = 5) -> List[float]:
        """Apply moving average smoothing"""
        if len(values) < window_size:
            return values
            
        smoothed = []
        for i in range(len(values)):
            start_idx = max(0, i - window_size // 2)
            end_idx = min(len(values), i + window_size // 2 + 1)
            window_values = values[start_idx:end_idx]
            smoothed.append(sum(window_values) / len(window_values))
            
        return smoothed
        
    def detect_peaks(self, values: List[float], threshold: float = 0.1) -> List[int]:
        """Detect peaks in data"""
        if len(values) < 3:
            return []
            
        peaks = []
        for i in range(1, len(values) - 1):
            if (values[i] > values[i-1] and values[i] > values[i+1] and 
                values[i] > threshold):
                peaks.append(i)
                
        return peaks
        
    def get_status(self) -> dict:
        """Get processor status"""
        return {
            "device_id": self.device_id,
            "experiment_type": self.get_experiment_type(),
            "is_active": self.is_active,
            "elapsed_time": self.get_elapsed_time(),
            "data_points": len(self.data_buffer),
            "config": self.config
        }