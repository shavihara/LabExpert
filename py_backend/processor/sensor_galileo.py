import logging
import math
from .sensor_displacement import DisplacementProcessor

logger = logging.getLogger(__name__)

class GalileoProcessor(DisplacementProcessor):
    def __init__(self, device_id: str):
        super().__init__(device_id)
        self.experiment_type = "inclined_plane"

    def get_experiment_type(self) -> str:
        return self.experiment_type

    async def process_data(self, raw_data: dict) -> dict:
        try:
            processed = await super().process_data(raw_data)
            if processed is None:
                return None

            # Read configuration values
            mass = 0.0
            try:
                m_cfg = self.config.get("mass", 0.0)
                mass = float(m_cfg)
            except Exception:
                mass = 0.0

            g = self.config.get("gravity", 9.81)
            try:
                g = float(g)
            except Exception:
                g = 9.81
            if g > 50:
                g = g / 100.0

            # Circumference (cm) may come as 'surconference_cm' or 'circumference_cm'
            circ = self.config.get("circumference_cm")
            if circ is None:
                circ = self.config.get("surconference_cm")
            try:
                circ = float(circ) if circ is not None else 0.0
            except Exception:
                circ = 0.0

            angle_deg = self.config.get("angle_deg", 0.0)
            try:
                angle_deg = float(angle_deg)
            except Exception:
                angle_deg = 0.0
            angle_rad = math.radians(angle_deg)

            r_cm = (circ or 0.0) / (2.0 * math.pi)

            # Use smoothed position from Kalman filter if available, otherwise raw
            sensor_cm = float(processed.get("s", processed.get("raw_position", 0.0)) or 0.0)

            # Stop condition logic (using raw/smoothed position)
            # The experiment stops if the object gets too close to the sensor (bottom)
            if (sensor_cm + r_cm) <= 10.0 and self.is_active:
                try:
                    self.stop_experiment()
                    processed["stopped"] = True
                except Exception:
                    pass

            # Calculate vertical height (h)
            # Assumption: Sensor is at the bottom of the incline.
            # d = distance from sensor + radius offset - buffer zone (10cm)
            # h = d * sin(theta)
            d_cm = (sensor_cm + r_cm) - 10.0
            h_cm = d_cm * math.sin(angle_rad)
            if h_cm < 0:
                h_cm = 0.0
            h_m = h_cm / 100.0

            v_cm_s = float(processed.get("v", 0.0) or 0.0)
            v_m_s = v_cm_s / 100.0

            ke = 0.0
            pe = 0.0
            
            # Calculate Energies (SI Units: Joules)
            if mass > 0.0:
                # Translational Kinetic Energy: 1/2 * m * v^2
                ke = 0.5 * mass * (v_m_s ** 2)
                # Potential Energy: m * g * h
                pe = mass * g * h_m

            # Update processed data with high precision
            processed["ke"] = round(float(ke), 4)
            processed["pe"] = round(float(pe), 4)
            processed["te"] = round(float(ke + pe), 4) # Mechanical Energy (ignoring Rotational KE)
            processed["angle"] = round(angle_deg, 2)
            processed["h_m"] = round(h_m, 4) # Debug: height in meters
            processed["mass_kg"] = round(mass, 4) # Debug: mass in kg

            return processed
        except Exception as e:
            logger.error(f"Error in Galileo processing for {self.device_id}: {e}")
            return {"error": str(e)}

