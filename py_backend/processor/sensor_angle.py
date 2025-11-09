# processor/sensor_angle.py
# Angle sensor processor (MPU6050/gyroscope based)
import asyncio
import logging
from typing import Dict, Any, List, Tuple
import numpy as np
from .sensor_base import SensorProcessor

logger = logging.getLogger(__name__)

class AngleProcessor(SensorProcessor):
    """Processor for angle/orientation sensors (MPU6050, gyroscope)"""
    
    def __init__(self, device_id: str):
        super().__init__(device_id)
        self.experiment_type = "angle"
        self.calibration_offset = {"x": 0, "y": 0, "z": 0}
        self.angle_history = {"x": [], "y": [], "z": []}
        self.angular_velocity = {"x": [], "y": [], "z": []}
        self.measurement_mode = "angle"  # "angle", "tilt", "rotation"
        self.reference_orientation = None
        
    def get_experiment_type(self) -> str:
        return self.experiment_type
        
    async def process_data(self, raw_data: dict) -> dict:
        """Process angle sensor data (accelerometer + gyroscope)"""
        try:
            # Expected format: {"ax": float, "ay": float, "az": float, "gx": float, "gy": float, "gz": float, "t": float}
            current_time = raw_data.get("t", 0.0)
            
            # Extract accelerometer data (for angle calculation)
            ax = raw_data.get("ax", 0.0)
            ay = raw_data.get("ay", 0.0) 
            az = raw_data.get("az", 0.0)
            
            # Extract gyroscope data (for angular velocity)
            gx = raw_data.get("gx", 0.0)
            gy = raw_data.get("gy", 0.0)
            gz = raw_data.get("gz", 0.0)
            
            # Calculate angles from accelerometer (tilt angles)
            angles = self._calculate_angles_from_accel(ax, ay, az)
            
            # Apply calibration offset
            calibrated_angles = {
                "x": angles["x"] - self.calibration_offset["x"],
                "y": angles["y"] - self.calibration_offset["y"], 
                "z": angles["z"] - self.calibration_offset["z"]
            }
            
            # Store angular velocities (from gyroscope)
            angular_vel = {"x": gx, "y": gy, "z": gz}
            
            # Calculate derived measurements
            processed_data = {
                "t": current_time,
                "raw_accel": {"x": ax, "y": ay, "z": az},
                "raw_gyro": {"x": gx, "y": gy, "z": gz},
                "angles": calibrated_angles,
                "angular_velocity": angular_vel,
                "magnitude": self._calculate_magnitude(calibrated_angles),
                "tilt_angle": self._calculate_tilt_angle(calibrated_angles)
            }
            
            # Add to history for analysis
            if self.is_active:
                for axis in ["x", "y", "z"]:
                    self.angle_history[axis].append(calibrated_angles[axis])
                    self.angular_velocity[axis].append(angular_vel[axis])
                    
                    # Keep history manageable (last 1000 points)
                    if len(self.angle_history[axis]) > 1000:
                        self.angle_history[axis] = self.angle_history[axis][-1000:]
                        self.angular_velocity[axis] = self.angular_velocity[axis][-1000:]
                
                # Add analysis if enough data
                if len(self.angle_history["x"]) >= 10:
                    processed_data["analysis"] = self._calculate_angle_analysis()
                    
                self.add_to_buffer(processed_data)
                
            return processed_data
            
        except Exception as e:
            logger.error(f"Error processing angle data for {self.device_id}: {e}")
            return {"error": str(e)}
            
    def _calculate_angles_from_accel(self, ax: float, ay: float, az: float) -> dict:
        """Calculate tilt angles from accelerometer data"""
        try:
            # Convert to angles (in degrees)
            # Roll (rotation around X-axis)
            roll = np.arctan2(ay, az) * 180.0 / np.pi
            
            # Pitch (rotation around Y-axis) 
            pitch = np.arctan2(-ax, np.sqrt(ay*ay + az*az)) * 180.0 / np.pi
            
            # Yaw cannot be determined from accelerometer alone
            # For now, we'll use gyroscope integration or set to 0
            yaw = 0.0
            
            return {"x": roll, "y": pitch, "z": yaw}
            
        except Exception as e:
            logger.error(f"Error calculating angles: {e}")
            return {"x": 0.0, "y": 0.0, "z": 0.0}
            
    def _calculate_magnitude(self, angles: dict) -> float:
        """Calculate magnitude of angle vector"""
        return np.sqrt(angles["x"]**2 + angles["y"]**2 + angles["z"]**2)
        
    def _calculate_tilt_angle(self, angles: dict) -> float:
        """Calculate overall tilt angle from vertical"""
        # Tilt from vertical (combining roll and pitch)
        return np.sqrt(angles["x"]**2 + angles["y"]**2)
        
    def _calculate_angle_analysis(self) -> dict:
        """Calculate angle analysis metrics"""
        try:
            analysis = {}
            
            # Recent data for analysis (last 50 points)
            recent_size = min(50, len(self.angle_history["x"]))
            
            for axis in ["x", "y", "z"]:
                if len(self.angle_history[axis]) >= recent_size:
                    recent_angles = self.angle_history[axis][-recent_size:]
                    recent_vel = self.angular_velocity[axis][-recent_size:]
                    
                    # Angle statistics
                    analysis[f"{axis}_angle_stats"] = self.calculate_statistics(recent_angles)
                    
                    # Angular velocity statistics
                    analysis[f"{axis}_velocity_stats"] = self.calculate_statistics(recent_vel)
                    
                    # Range of motion
                    analysis[f"{axis}_range"] = max(recent_angles) - min(recent_angles)
                    
                    # Stability (standard deviation)
                    analysis[f"{axis}_stability"] = np.std(recent_angles)
                    
            # Overall tilt analysis
            recent_tilts = [self._calculate_tilt_angle({
                "x": self.angle_history["x"][i],
                "y": self.angle_history["y"][i], 
                "z": self.angle_history["z"][i]
            }) for i in range(-recent_size, 0)]
            
            analysis["tilt_stats"] = self.calculate_statistics(recent_tilts)
            analysis["max_tilt"] = max(recent_tilts)
            analysis["tilt_range"] = max(recent_tilts) - min(recent_tilts)
            
            # Motion classification
            analysis["motion_type"] = self._classify_motion()
            
            # Oscillation detection
            if len(self.angle_history["x"]) >= 20:
                analysis["oscillation_analysis"] = self._detect_oscillations()
                
            return analysis
            
        except Exception as e:
            logger.error(f"Error in angle analysis for {self.device_id}: {e}")
            return {"analysis_error": str(e)}
            
    def _classify_motion(self) -> str:
        """Classify the type of motion based on angle patterns"""
        try:
            if len(self.angle_history["x"]) < 20:
                return "insufficient_data"
                
            # Recent data
            recent_x = self.angle_history["x"][-20:]
            recent_y = self.angle_history["y"][-20:]
            
            # Calculate variability
            x_std = np.std(recent_x)
            y_std = np.std(recent_y)
            
            # Classify based on variability patterns
            if x_std < 1.0 and y_std < 1.0:
                return "stable"
            elif x_std > 5.0 or y_std > 5.0:
                return "high_motion"
            elif x_std > y_std * 2:
                return "x_dominant_motion"
            elif y_std > x_std * 2:
                return "y_dominant_motion"
            else:
                return "mixed_motion"
                
        except Exception as e:
            logger.error(f"Error classifying motion: {e}")
            return "unknown"
            
    def _detect_oscillations(self) -> dict:
        """Detect oscillatory patterns in angle data"""
        try:
            oscillation_info = {}
            
            for axis in ["x", "y"]:  # Focus on roll and pitch
                if len(self.angle_history[axis]) < 20:
                    continue
                    
                recent_data = np.array(self.angle_history[axis][-50:])
                
                # Simple peak detection
                peaks = self.detect_peaks(recent_data.tolist())
                
                if len(peaks) >= 4:  # Need at least 2 complete cycles
                    # Calculate periods between peaks
                    peak_intervals = np.diff(peaks)
                    avg_period = np.mean(peak_intervals)
                    
                    # Estimate frequency (assuming data points are roughly time-spaced)
                    estimated_freq = 1.0 / avg_period if avg_period > 0 else 0
                    
                    oscillation_info[f"{axis}_oscillation"] = {
                        "detected": True,
                        "peak_count": len(peaks),
                        "average_period": avg_period,
                        "estimated_frequency": estimated_freq,
                        "amplitude": (np.max(recent_data) - np.min(recent_data)) / 2
                    }
                else:
                    oscillation_info[f"{axis}_oscillation"] = {"detected": False}
                    
            return oscillation_info
            
        except Exception as e:
            logger.error(f"Error detecting oscillations: {e}")
            return {"error": str(e)}
            
    def calibrate(self, samples: int = 100):
        """Calibrate the sensor by taking average of current readings"""
        logger.info(f"Starting calibration for {self.device_id} with {samples} samples")
        # This would typically collect samples and calculate offset
        # For now, we'll reset the calibration
        self.calibration_offset = {"x": 0, "y": 0, "z": 0}
        
    def set_reference_orientation(self):
        """Set current orientation as reference (zero point)"""
        if self.angle_history["x"]:
            self.reference_orientation = {
                "x": self.angle_history["x"][-1],
                "y": self.angle_history["y"][-1],
                "z": self.angle_history["z"][-1]
            }
            logger.info(f"Reference orientation set for {self.device_id}: {self.reference_orientation}")
            
    def reset_measurements(self):
        """Reset all angle measurements and history"""
        self.angle_history = {"x": [], "y": [], "z": []}
        self.angular_velocity = {"x": [], "y": [], "z": []}
        self.reference_orientation = None
        self.data_buffer.clear()
        logger.info(f"Angle measurements reset for device {self.device_id}")
        
    def configure_measurement(self, config: dict):
        """Configure measurement parameters"""
        if "mode" in config:
            self.measurement_mode = config["mode"]
        if "calibration_offset" in config:
            self.calibration_offset.update(config["calibration_offset"])
        logger.info(f"Angle measurement configured for {self.device_id}: {config}")
        
    def get_angle_summary(self) -> dict:
        """Get summary of angle measurements"""
        if not any(self.angle_history.values()):
            return {"status": "no_data"}
            
        summary = {
            "measurement_mode": self.measurement_mode,
            "data_points": len(self.angle_history["x"]),
            "calibration_offset": self.calibration_offset,
            "reference_orientation": self.reference_orientation
        }
        
        # Current angles
        if self.angle_history["x"]:
            summary["current_angles"] = {
                "x": self.angle_history["x"][-1],
                "y": self.angle_history["y"][-1],
                "z": self.angle_history["z"][-1]
            }
            summary["current_tilt"] = self._calculate_tilt_angle(summary["current_angles"])
            
        # Range of motion
        for axis in ["x", "y", "z"]:
            if self.angle_history[axis]:
                summary[f"{axis}_range"] = {
                    "min": min(self.angle_history[axis]),
                    "max": max(self.angle_history[axis]),
                    "range": max(self.angle_history[axis]) - min(self.angle_history[axis])
                }
                
        return summary
        
    def export_data(self) -> dict:
        """Export all angle data for analysis"""
        return {
            "device_id": self.device_id,
            "experiment_type": self.experiment_type,
            "angle_history": self.angle_history,
            "angular_velocity": self.angular_velocity,
            "calibration_offset": self.calibration_offset,
            "reference_orientation": self.reference_orientation,
            "measurement_mode": self.measurement_mode,
            "buffer_data": self.get_buffer_data()
        }