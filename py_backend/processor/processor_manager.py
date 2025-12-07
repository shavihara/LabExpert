# processor/processor_manager.py
# Manager for sensor processors - handles device-specific processing
import asyncio
import logging
from typing import Dict, Optional
from .sensor_displacement import DisplacementProcessor
from .sensor_oscillation import OscillationProcessor
from .sensor_angle import AngleProcessor
from .sensor_disp_angle import DispAngleProcessor
from .sensor_temperature import TemperatureProcessor

logger = logging.getLogger(__name__)

class SensorProcessorManager:
    """Manages sensor processors for different devices and experiment types"""
    
    _instance = None
    
    @classmethod
    def get_instance(cls):
        """Get singleton instance"""
        if cls._instance is None:
            cls._instance = SensorProcessorManager()
        return cls._instance
    
    def __init__(self):
        self.processors: Dict[str, Dict[str, object]] = {}  # device_id -> {experiment_type -> processor}
        self.device_experiments: Dict[str, str] = {}  # device_id -> current_experiment_type
        
    def get_processor(self, device_id: str, experiment_type: str) -> Optional[object]:
        """Get processor for device and experiment type, create if needed"""
        if device_id not in self.processors:
            self.processors[device_id] = {}
        
        # Map frontend experiment types to backend processor types
        mapped_experiment_type = experiment_type
        if experiment_type == "tof":
            mapped_experiment_type = "displacement"
        elif experiment_type == "inclined_plane":
            mapped_experiment_type = "displacement"
        elif experiment_type == "distance":
            mapped_experiment_type = "displacement"
        elif experiment_type == "pendulum_simple" or experiment_type == "pendulum_compound":
            mapped_experiment_type = "oscillation"
        elif experiment_type == "temperature_live":
            mapped_experiment_type = "temperature"
        
        if mapped_experiment_type not in self.processors[device_id]:
            # Create appropriate processor based on experiment type
            if mapped_experiment_type == "displacement":
                self.processors[device_id][mapped_experiment_type] = DisplacementProcessor(device_id)
            elif mapped_experiment_type == "inclined_plane":
                self.processors[device_id][mapped_experiment_type] = DisplacementProcessor(device_id)
            elif mapped_experiment_type == "oscillation":
                self.processors[device_id][mapped_experiment_type] = OscillationProcessor(device_id)
            elif mapped_experiment_type == "angle":
                self.processors[device_id][mapped_experiment_type] = AngleProcessor(device_id)
            elif mapped_experiment_type == "displacement_angle":
                self.processors[device_id][mapped_experiment_type] = DispAngleProcessor(device_id)
            elif mapped_experiment_type == "temperature":
                self.processors[device_id][mapped_experiment_type] = TemperatureProcessor(device_id)
            else:
                logger.warning(f"Unknown experiment type: {experiment_type} (mapped to: {mapped_experiment_type})")
                return None
                
            logger.info(f"Created {mapped_experiment_type} processor for device {device_id}")
        
        return self.processors[device_id][mapped_experiment_type]
    
    def set_device_experiment(self, device_id: str, experiment_type: str):
        """Set the current experiment type for a device"""
        # Map frontend experiment types to backend processor types
        mapped_experiment_type = experiment_type
        if experiment_type == "tof":
            mapped_experiment_type = "displacement"
        elif experiment_type == "distance":
            mapped_experiment_type = "displacement"
        elif experiment_type == "inclined_plane":
            mapped_experiment_type = "displacement"
        elif experiment_type == "pendulum_simple" or experiment_type == "pendulum_compound":
            mapped_experiment_type = "oscillation"
        elif experiment_type == "temperature_live":
            mapped_experiment_type = "temperature"
        
        self.device_experiments[device_id] = mapped_experiment_type
        logger.info(f"Device {device_id} set to experiment type: {mapped_experiment_type} (original: {experiment_type})")
    
    def get_device_experiment(self, device_id: str) -> Optional[str]:
        """Get current experiment type for a device"""
        return self.device_experiments.get(device_id)
    
    async def process_data(self, device_id: str, raw_data: dict) -> Optional[dict]:
        """Process data through appropriate processor for the device"""
        experiment_type = self.get_device_experiment(device_id)
        if not experiment_type:
            logger.warning(f"No experiment type set for device {device_id}")
            return None
            
        processor = self.get_processor(device_id, experiment_type)
        if not processor:
            logger.error(f"No processor available for device {device_id}, type {experiment_type}")
            return None
            
        try:
            processed_data = await processor.process_data(raw_data)
            return processed_data
        except Exception as e:
            logger.error(f"Error processing data for device {device_id}: {e}")
            return None
    
    def configure_processor(self, device_id: str, experiment_type: str, config: dict):
        """Configure processor for a device"""
        processor = self.get_processor(device_id, experiment_type)
        if processor:
            processor.configure(config)
            logger.info(f"Configured {experiment_type} processor for device {device_id}")
    
    def start_experiment(self, device_id: str, experiment_type: str):
        """Start experiment for a device"""
        processor = self.get_processor(device_id, experiment_type)
        if processor:
            processor.start_experiment()
            self.set_device_experiment(device_id, experiment_type)
            logger.info(f"Started {experiment_type} experiment for device {device_id}")
    
    def stop_experiment(self, device_id: str):
        """Stop experiment for a device"""
        experiment_type = self.get_device_experiment(device_id)
        if experiment_type:
            processor = self.get_processor(device_id, experiment_type)
            if processor:
                processor.stop_experiment()
                logger.info(f"Stopped {experiment_type} experiment for device {device_id}")
    
    def reset_device(self, device_id: str):
        """Reset all processors for a device"""
        if device_id in self.processors:
            for processor in self.processors[device_id].values():
                if hasattr(processor, 'reset_analysis'):
                    processor.reset_analysis()
            logger.info(f"Reset all processors for device {device_id}")
    
    def get_device_status(self, device_id: str) -> dict:
        """Get status of all processors for a device"""
        status = {"device_id": device_id, "processors": {}}
        
        if device_id in self.processors:
            for exp_type, processor in self.processors[device_id].items():
                if hasattr(processor, 'get_status'):
                    status["processors"][exp_type] = processor.get_status()
        
        status["current_experiment"] = self.get_device_experiment(device_id)
        return status
