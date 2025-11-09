# processor/sensor_disp_angle.py
# Combined displacement + angle processor for DISP_ANGLE packets
import logging
from typing import List
import numpy as np
from .sensor_base import SensorProcessor

logger = logging.getLogger(__name__)

class DispAngleProcessor(SensorProcessor):
    """Processor for combined displacement + angle experiments.
    Expects packet decoded as {"t": float, "x": float, "angle": float}.
    Produces fields aligned with DispAngleGraph.jsx expectations.
    """

    def __init__(self, device_id: str):
        super().__init__(device_id)
        self.experiment_type = "displacement_angle"
        self.calibration_offset = 0.0
        self.time_history: List[float] = []
        self.displacement_history: List[float] = []
        self.angle_history: List[float] = []  # Single-axis angle (z)
        self.velocity_history: List[float] = []
        self.accel_history: List[float] = []
        self.angular_velocity_history: List[float] = []
        self.angular_accel_history: List[float] = []

    def get_experiment_type(self) -> str:
        return self.experiment_type

    async def process_data(self, raw_data: dict) -> dict:
        try:
            t = float(raw_data.get("t", 0.0))
            x_raw = float(raw_data.get("x", 0.0))
            angle_z = float(raw_data.get("angle", 0.0))

            x = x_raw - self.calibration_offset

            # Append time and displacement
            self.time_history.append(t)
            self.displacement_history.append(x)
            self.angle_history.append(angle_z)

            # Calculate velocity
            velocity = 0.0
            if len(self.time_history) >= 2:
                dt = self.time_history[-1] - self.time_history[-2]
                dx = self.displacement_history[-1] - self.displacement_history[-2]
                if dt > 0:
                    velocity = dx / dt
            self.velocity_history.append(velocity)

            # Calculate linear acceleration
            acceleration = 0.0
            if len(self.velocity_history) >= 2 and len(self.time_history) >= 2:
                dt = self.time_history[-1] - self.time_history[-2]
                dv = self.velocity_history[-1] - self.velocity_history[-2]
                if dt > 0:
                    acceleration = dv / dt
            self.accel_history.append(acceleration)

            # Calculate angular velocity (single axis z)
            gyro_z = 0.0
            if len(self.angle_history) >= 2 and len(self.time_history) >= 2:
                dt = self.time_history[-1] - self.time_history[-2]
                dtheta = self.angle_history[-1] - self.angle_history[-2]
                if dt > 0:
                    gyro_z = dtheta / dt
            self.angular_velocity_history.append(gyro_z)

            # Calculate angular acceleration
            accel_z = 0.0
            if len(self.angular_velocity_history) >= 2 and len(self.time_history) >= 2:
                dt = self.time_history[-1] - self.time_history[-2]
                domega = self.angular_velocity_history[-1] - self.angular_velocity_history[-2]
                if dt > 0:
                    accel_z = domega / dt
            self.angular_accel_history.append(accel_z)

            # Limit history size
            max_history = 1000
            if len(self.time_history) > max_history:
                self.time_history = self.time_history[-max_history:]
                self.displacement_history = self.displacement_history[-max_history:]
                self.angle_history = self.angle_history[-max_history:]
                self.velocity_history = self.velocity_history[-max_history:]
                self.accel_history = self.accel_history[-max_history:]
                self.angular_velocity_history = self.angular_velocity_history[-max_history:]
                self.angular_accel_history = self.angular_accel_history[-max_history:]

            processed = {
                # Expected core fields for graphs (shortened names)
                "t": t,
                "s": x,
                "v": velocity,
                "a": acceleration,

                # Angle/gyro/accel fields expected by DispAngleGraph.jsx
                "angle_x": 0.0,
                "angle_y": 0.0,
                "angle_z": angle_z,
                "gyro_x": 0.0,
                "gyro_y": 0.0,
                "gyro_z": gyro_z,
                "accel_x": 0.0,
                "accel_y": 0.0,
                "accel_z": accel_z,
                "total_acceleration": abs(accel_z),
                "total_angular_velocity": abs(gyro_z),
            }

            # Add analysis metrics when enough data exists
            if len(self.angle_history) >= 5:
                processed.update(self._calculate_analysis())

            if self.is_active:
                self.add_to_buffer(processed)

            return processed
        except Exception as e:
            logger.error(f"Error processing DISP_ANGLE data for {self.device_id}: {e}")
            return {"error": str(e)}

    def _calculate_analysis(self) -> dict:
        try:
            recent_n = min(50, len(self.angle_history))
            recent_angles = self.angle_history[-recent_n:]
            recent_vel = self.angular_velocity_history[-recent_n:] if self.angular_velocity_history else []

            # Oscillation frequency via peak intervals on angle_z
            peaks = self.detect_peaks(recent_angles, threshold=0.01)
            freq = 0.0
            if len(peaks) >= 2:
                peak_times = [self.time_history[-recent_n + i] for i in peaks]
                periods = [peak_times[i+1] - peak_times[i] for i in range(len(peak_times)-1)]
                if periods:
                    freq = float(np.mean([1.0/p for p in periods if p > 0]))

            max_ang_disp = max([abs(a) for a in recent_angles]) if recent_angles else 0.0

            # Motion classification (simple)
            vel_std = float(np.std(self.velocity_history[-recent_n:])) if self.velocity_history else 0.0
            ang_vel_std = float(np.std(recent_vel)) if recent_vel else 0.0
            if vel_std < 0.01 and ang_vel_std < 0.01:
                motion_type = "stable"
            elif ang_vel_std > 0.5:
                motion_type = "rotational"
            elif vel_std > 0.1:
                motion_type = "translational"
            else:
                motion_type = "mixed"

            return {
                "motion_type": motion_type,
                "motion_intensity": float(np.mean([abs(v) for v in self.velocity_history[-recent_n:]])) if self.velocity_history else 0.0,
                "motion_duration": self.get_elapsed_time(),
                "oscillation_frequency": freq,
                "max_angular_displacement": max_ang_disp,
            }
        except Exception as e:
            logger.error(f"Error in DISP_ANGLE analysis for {self.device_id}: {e}")
            return {"analysis_error": str(e)}

    def calibrate(self, calibration_data: dict):
        if "offset" in calibration_data:
            self.calibration_offset = float(calibration_data["offset"])
            logger.info(f"DispAngle sensor {self.device_id} calibrated with offset {self.calibration_offset}")

    def reset(self):
        self.time_history.clear()
        self.displacement_history.clear()
        self.angle_history.clear()
        self.velocity_history.clear()
        self.accel_history.clear()
        self.angular_velocity_history.clear()
        self.angular_accel_history.clear()
        self.data_buffer.clear()
        logger.info(f"DispAngle processor reset for device {self.device_id}")