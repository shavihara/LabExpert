# processor/sensor_displacement.py
# TOF/Displacement sensor processor
import asyncio
import logging
from typing import Dict, Any, List
import numpy as np
from .sensor_base import SensorProcessor

logger = logging.getLogger(__name__)

class DisplacementProcessor(SensorProcessor):
    """Processor for TOF displacement sensors"""
    
    def __init__(self, device_id: str):
        super().__init__(device_id)
        self.experiment_type = "displacement"
        self.calibration_offset = 0.0
        self.position_history = []
        self.velocity_history = []
        self.acceleration_history = []
        self.time_history = []
        
    def get_experiment_type(self) -> str:
        return self.experiment_type
        
    async def process_data(self, raw_data: dict) -> dict:
        """Process TOF sensor data to calculate displacement, velocity, and acceleration"""
        try:
            # Extract time and position from raw data
            # Expected format: {"t": float, "x": float}
            time_val = raw_data.get("t", 0.0)
            position = raw_data.get("x", 0.0) - self.calibration_offset
            
            # Add to history
            self.time_history.append(time_val)
            self.position_history.append(position)
            
            # Calculate velocity (dx/dt)
            velocity = 0.0
            if len(self.time_history) >= 2:
                dt = self.time_history[-1] - self.time_history[-2]
                dx = self.position_history[-1] - self.position_history[-2]
                if dt > 0:
                    velocity = dx / dt
                    
            self.velocity_history.append(velocity)
            
            # Calculate acceleration (dv/dt)
            acceleration = 0.0
            if len(self.velocity_history) >= 2 and len(self.time_history) >= 2:
                dt = self.time_history[-1] - self.time_history[-2]
                dv = self.velocity_history[-1] - self.velocity_history[-2]
                if dt > 0:
                    acceleration = dv / dt
                    
            self.acceleration_history.append(acceleration)
            
            # Keep history manageable
            max_history = 1000
            if len(self.time_history) > max_history:
                self.time_history = self.time_history[-max_history:]
                self.position_history = self.position_history[-max_history:]
                self.velocity_history = self.velocity_history[-max_history:]
                self.acceleration_history = self.acceleration_history[-max_history:]
            
            # Create processed data
            processed_data = {
                "time": time_val,
                "displacement": position,
                "velocity": velocity,
                "acceleration": acceleration,
                "raw_position": raw_data.get("x", 0.0)
            }
            
            # Add to buffer
            if self.is_active:
                self.add_to_buffer(processed_data)
            
            # Add analysis if enough data points
            if len(self.position_history) >= 10:
                processed_data.update(self._calculate_motion_analysis())
                
            return processed_data
            
        except Exception as e:
            logger.error(f"Error processing displacement data for {self.device_id}: {e}")
            return {"error": str(e)}
            
    def _calculate_motion_analysis(self) -> dict:
        """Calculate motion analysis metrics"""
        try:
            analysis = {}
            
            # Recent data for analysis (last 50 points)
            recent_count = min(50, len(self.position_history))
            recent_positions = self.position_history[-recent_count:]
            recent_velocities = self.velocity_history[-recent_count:]
            recent_accelerations = self.acceleration_history[-recent_count:]
            recent_times = self.time_history[-recent_count:]
            
            # Position statistics
            analysis["position_stats"] = self.calculate_statistics(recent_positions)
            
            # Velocity statistics
            analysis["velocity_stats"] = self.calculate_statistics(recent_velocities)
            
            # Acceleration statistics
            analysis["acceleration_stats"] = self.calculate_statistics(recent_accelerations)
            
            # Motion characteristics
            analysis["motion_type"] = self._classify_motion(recent_velocities, recent_accelerations)
            
            # Peak detection for oscillatory motion
            if len(recent_positions) >= 10:
                position_peaks = self.detect_peaks(recent_positions)
                velocity_peaks = self.detect_peaks([abs(v) for v in recent_velocities])
                
                analysis["position_peaks"] = len(position_peaks)
                analysis["velocity_peaks"] = len(velocity_peaks)
                
                # Estimate period for oscillatory motion
                if len(position_peaks) >= 2:
                    peak_times = [recent_times[i] for i in position_peaks]
                    periods = [peak_times[i+1] - peak_times[i] for i in range(len(peak_times)-1)]
                    if periods:
                        analysis["estimated_period"] = np.mean(periods)
                        analysis["period_std"] = np.std(periods)
            
            # Energy calculations (if mass is provided in config)
            mass = self.config.get("mass", 1.0)  # kg
            if mass > 0:
                # Kinetic energy: KE = 0.5 * m * v^2
                current_velocity = recent_velocities[-1] if recent_velocities else 0
                kinetic_energy = 0.5 * mass * (current_velocity ** 2)
                
                # Potential energy (assuming gravitational, relative to lowest point)
                min_position = min(recent_positions) if recent_positions else 0
                current_position = recent_positions[-1] if recent_positions else 0
                g = 9.81  # m/s^2
                potential_energy = mass * g * (current_position - min_position)
                
                analysis["kinetic_energy"] = kinetic_energy
                analysis["potential_energy"] = potential_energy
                analysis["total_energy"] = kinetic_energy + potential_energy
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error in motion analysis for {self.device_id}: {e}")
            return {"analysis_error": str(e)}
            
    def _classify_motion(self, velocities: List[float], accelerations: List[float]) -> str:
        """Classify the type of motion based on velocity and acceleration patterns"""
        if not velocities or not accelerations:
            return "unknown"
            
        # Calculate statistics
        vel_std = np.std(velocities)
        acc_std = np.std(accelerations)
        vel_mean = np.mean([abs(v) for v in velocities])
        
        # Classification logic
        if vel_std < 0.01 and vel_mean < 0.01:
            return "stationary"
        elif vel_std < 0.1 and acc_std < 0.1:
            return "uniform"
        elif acc_std > 0.5:
            return "oscillatory"
        elif np.mean(accelerations) > 0.1:
            return "accelerating"
        elif np.mean(accelerations) < -0.1:
            return "decelerating"
        else:
            return "variable"
            
    def calibrate(self, calibration_data: dict):
        """Calibrate the sensor with reference measurements"""
        if "offset" in calibration_data:
            self.calibration_offset = calibration_data["offset"]
            logger.info(f"Displacement sensor {self.device_id} calibrated with offset: {self.calibration_offset}")
            
    def reset_analysis(self):
        """Reset all analysis data"""
        self.position_history.clear()
        self.velocity_history.clear()
        self.acceleration_history.clear()
        self.time_history.clear()
        self.data_buffer.clear()
        logger.info(f"Analysis data reset for device {self.device_id}")
        
    def get_motion_summary(self) -> dict:
        """Get summary of motion analysis"""
        if not self.position_history:
            return {"status": "no_data"}
            
        return {
            "total_data_points": len(self.position_history),
            "time_range": {
                "start": self.time_history[0] if self.time_history else 0,
                "end": self.time_history[-1] if self.time_history else 0,
                "duration": self.time_history[-1] - self.time_history[0] if len(self.time_history) >= 2 else 0
            },
            "displacement_range": {
                "min": min(self.position_history),
                "max": max(self.position_history),
                "range": max(self.position_history) - min(self.position_history)
            },
            "max_velocity": max([abs(v) for v in self.velocity_history]) if self.velocity_history else 0,
            "max_acceleration": max([abs(a) for a in self.acceleration_history]) if self.acceleration_history else 0
        }