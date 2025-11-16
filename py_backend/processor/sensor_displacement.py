# processor/sensor_displacement.py
# TOF/Displacement sensor processor
import asyncio
import logging
from typing import Dict, Any, List
import numpy as np
from scipy.signal import savgol_filter
from .sensor_base import SensorProcessor

logger = logging.getLogger(__name__)

class KalmanFilter3D:
    """3D Kalman Filter for position, velocity, acceleration tracking"""
    
    def __init__(self, process_noise=0.1, measurement_noise=0.01):
        # Initial state - start with more realistic values for motion experiments
        self.x = np.array([0.0, 0.0, 0.0])  # Will be initialized with first measurement
        self.P = np.diag([10.0, 100.0, 1000.0])  # Higher initial uncertainty
        self.Q = np.diag([process_noise, 0.5, 0.1])  # Process noise
        self.R = np.array([[measurement_noise]])  # Measurement noise
        
        # Track if this is the first measurement
        self.is_initialized = False
        
        # Storage for analysis
        self.innovations = []
        
    def initialize(self, initial_position, initial_velocity_estimate=0.0, initial_acceleration_estimate=0.0):
        """Initialize filter with first measurement and motion estimates"""
        self.x = np.array([
            initial_position,
            initial_velocity_estimate,
            initial_acceleration_estimate
        ])
        self.is_initialized = True
        
    def predict(self, dt):
        """Prediction step with variable time delta"""
        if not self.is_initialized:
            return self.x.copy()
            
        # State transition matrix (constant acceleration model)
        F = np.array([
            [1, dt, 0.5*dt*dt],
            [0, 1, dt],
            [0, 0, 1]
        ])
        
        # Predict state
        self.x = F @ self.x
        
        # Predict covariance
        self.P = F @ self.P @ F.T + self.Q
        
        return self.x.copy()
    
    def update(self, measurement):
        """Update step with measurement"""
        if not self.is_initialized:
            self.initialize(measurement)
            return self.x.copy()
            
        # Measurement matrix (we only measure position)
        H = np.array([[1, 0, 0]])
        
        # Innovation (residual)
        innovation = measurement - H @ self.x
        self.innovations.append(innovation[0])
        
        # Innovation covariance
        S = H @ self.P @ H.T + self.R
        
        # Kalman gain
        K = self.P @ H.T @ np.linalg.inv(S)
        
        # Update state
        self.x = self.x + K @ innovation
        
        # Update covariance
        I = np.eye(3)
        self.P = (I - K @ H) @ self.P
        
        return self.x.copy()

class DisplacementProcessor(SensorProcessor):
    """Processor for TOF displacement sensors"""
    
    def __init__(self, device_id: str):
        super().__init__(device_id)
        self.experiment_type = "displacement"
        self.calibration_offset = 0.0
        self.position_history = []  # Kalman filtered position data
        self.velocity_history = []
        self.acceleration_history = []
        self.time_history = []
        self.raw_position_history = []  # Raw position data
        
        # Kalman Filter - Using optimized parameters from analysis
        # Based on your analysis: Q=1.0, R=0.1 but adjusted for better performance
        self.kalman_filter = KalmanFilter3D(
            process_noise=0.1,    # Adjusted from 1.0 for better noise reduction
            measurement_noise=0.01 # Adjusted from 0.1 for better responsiveness
        )
        
        # New time handling state
        self._t0 = None  # first observed sensor time
        self._last_t_rel = None  # last emitted relative time
        self._dt_history: List[float] = []  # recent positive dt values
        self._min_dt_default = 0.02  # fallback step (s) when sensor time is non-monotonic
        self._last_sample = None  # track sample counter to detect run restarts
        self._last_timestamp = None  # For calculating dt
        
    def get_experiment_type(self) -> str:
        return self.experiment_type
        
    async def process_data(self, raw_data: dict) -> dict:
        """Process TOF sensor data using Kalman filter for displacement, velocity, and acceleration"""
        try:
            # Detect new run by sample counter restart (MQTT binary packets)
            sample_num = raw_data.get("sample")
            if sample_num is not None:
                if self._last_sample is not None and int(sample_num) <= int(self._last_sample):
                    # New run detected: reset analysis and time state
                    self.reset_analysis()
                self._last_sample = int(sample_num)
            
            # Extract time and position from raw data
            if "timestamp" in raw_data and "distance" in raw_data:
                # MQTT binary format: {"timestamp": ms, "distance": cm, "sample": num, ...}
                original_time = raw_data.get("timestamp", 0.0) / 1000.0  # Convert ms to seconds
                raw_position = raw_data.get("distance", 0.0) - self.calibration_offset  # Distance in cm
            else:
                # Legacy format: {"t": float, "x": float}
                original_time = raw_data.get("t", 0.0)
                raw_position = raw_data.get("x", 0.0) - self.calibration_offset
            
            # Rebuild time handling: compute robust relative time starting at 0.00
            if self._t0 is None:
                self._t0 = float(original_time)
                time_val = 0.0
            else:
                # Relative time against first observed time
                rel = float(original_time) - self._t0
                rel = max(0.0, rel)
                # Enforce monotonicity; if incoming rel <= last, advance by estimated dt
                if self._last_t_rel is not None and rel <= self._last_t_rel:
                    if len(self._dt_history) >= 3:
                        dt_est = float(np.median(self._dt_history))
                    elif self._dt_history:
                        dt_est = float(self._dt_history[-1])
                    else:
                        dt_est = self._min_dt_default
                    rel = self._last_t_rel + max(dt_est, self._min_dt_default)
                time_val = rel
            
            # Calculate time difference for Kalman filter
            dt = 0.05  # Use a more realistic default for your 20Hz data
            if self._last_timestamp is not None:
                dt = time_val - self._last_timestamp
                # Ensure reasonable dt values
                dt = max(0.001, min(dt, 1.0))
        
            # Apply Kalman filter
            self.kalman_filter.predict(dt)
            filtered_state = self.kalman_filter.update(raw_position)
        
            # Extract filtered values
            smoothed_position = filtered_state[0]
            velocity = filtered_state[1]
            acceleration = filtered_state[2]
            
            # Update histories
            self.time_history.append(time_val)
            self.raw_position_history.append(raw_position)
            self.position_history.append(smoothed_position)
            self.velocity_history.append(velocity)
            self.acceleration_history.append(acceleration)
            
            # Maintain last relative time and dt history
            if self._last_t_rel is not None:
                dt_raw = time_val - self._last_t_rel
                if dt_raw > 0:
                    self._dt_history.append(dt_raw)
                    # Limit dt history length
                    if len(self._dt_history) > 50:
                        self._dt_history = self._dt_history[-50:]
            self._last_t_rel = time_val
            self._last_timestamp = time_val
            
            # Keep history manageable
            max_history = 1000
            if len(self.time_history) > max_history:
                self.time_history = self.time_history[-max_history:]
                self.position_history = self.position_history[-max_history:]
                self.velocity_history = self.velocity_history[-max_history:]
                self.acceleration_history = self.acceleration_history[-max_history:]
                self.raw_position_history = self.raw_position_history[-max_history:]
            
            # Create processed data with values rounded to 2 decimal places
            t_display = round(time_val, 2)
            processed_data = {
                "t": t_display,
                "s": round(smoothed_position, 2),  # Kalman filtered position
                "v": round(velocity, 2),           # Kalman filtered velocity
                "a": round(acceleration, 2),       # Kalman filtered acceleration
                "raw_position": round(raw_position, 2),  # Raw position before filtering
                "original_raw_position": round(raw_data.get("x", 0.0) if "x" in raw_data else raw_data.get("distance", 0.0), 2)
            }
            
            # Include original sample information for tracking
            if "sample" in raw_data:
                processed_data["sample"] = raw_data["sample"]
            if "packet_id" in raw_data:
                processed_data["packet_id"] = raw_data["packet_id"]
            
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
    
    # KEEP ALL EXISTING METHODS BELOW EXACTLY AS THEY ARE
    # _calculate_motion_analysis, _classify_motion, calibrate, reset_analysis, 
    # start_experiment, get_motion_summary, etc. remain unchanged
    
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
            
            # Energy calculations (use SI units; always include keys)
            mass = self.config.get("mass", 0.0)  # kg
            try:
                mass = float(mass)
            except Exception:
                mass = 0.0

            # Convert velocity from cm/s to m/s and position from cm to m
            current_velocity_cm_s = recent_velocities[-1] if recent_velocities else 0.0
            current_velocity_m_s = (current_velocity_cm_s or 0.0) / 100.0

            min_position_cm = min(recent_positions) if recent_positions else 0.0
            current_position_cm = recent_positions[-1] if recent_positions else 0.0
            delta_height_m = (current_position_cm - min_position_cm) / 100.0

            g = 9.81  # m/s^2

            if mass > 0.0:
                kinetic_energy = 0.5 * mass * (current_velocity_m_s ** 2)
                potential_energy = mass * g * max(0.0, delta_height_m)
            else:
                kinetic_energy = 0.0
                potential_energy = 0.0

            analysis["ke"] = round(float(kinetic_energy), 3)
            analysis["pe"] = round(float(potential_energy), 3)
            analysis["te"] = round(float(kinetic_energy + potential_energy), 3)
            
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
        """Reset all analysis data and Kalman filter"""
        self.position_history.clear()
        self.velocity_history.clear()
        self.acceleration_history.clear()
        self.time_history.clear()
        self.raw_position_history.clear()
        self.data_buffer.clear()
        
        # Reset Kalman filter
        self.kalman_filter = KalmanFilter3D(
            process_noise=0.1,
            measurement_noise=0.01
        )
        
        # Reset time state
        self._t0 = None
        self._last_t_rel = None
        self._dt_history.clear()
        self._last_timestamp = None
        logger.info(f"Analysis data and Kalman filter reset for device {self.device_id}")

    def start_experiment(self):
        """Start data collection and reset relative-time state"""
        super().start_experiment()
        # Ensure each run starts at 0.00s
        self._t0 = None
        self._last_t_rel = None
        self._dt_history.clear()
        self._last_timestamp = None
        
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