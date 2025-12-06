# processor/sensor_oscillation.py
# Oscillation sensor processor (LDR/laser based)
import asyncio
import logging
from typing import Dict, Any, List
import numpy as np
from .sensor_base import SensorProcessor

logger = logging.getLogger(__name__)

class OscillationProcessor(SensorProcessor):
    """Processor for oscillation counting sensors (LDR/laser)"""
    
    def __init__(self, device_id: str):
        super().__init__(device_id)
        self.experiment_type = "oscillation"
        self.cut_times = []  # Times when beam is cut
        self.periods = []    # Calculated periods
        self.last_cut_time = None
        self.last_osc_time_ms = None
        self.oscillation_count = 0
        self.measurement_setup = {}
        
    def get_experiment_type(self) -> str:
        return self.experiment_type
        
    def configure(self, config: dict):
        """Configure processor with experiment parameters"""
        super().configure(config)
        # Update measurement setup with new config
        # This ensures parameters like max_count and pendulum_length_cm are available
        self.measurement_setup.update(config)
        logger.info(f"Oscillation processor configured: {config}")

    def start_experiment(self):
        """Start oscillation experiment and reset counters"""
        super().start_experiment()
        self.reset_count()
        logger.info(f"Oscillation experiment started and reset for device {self.device_id}")

    async def process_data(self, raw_data: dict) -> dict:
        """Process oscillation sensor data to calculate periods and frequencies"""
        try:
            # Check for OSI Firmware completion/result packet
            # Expected format: {"status": "experiment_completed", "total_time": float, "count": int}
            if raw_data.get("status") == "experiment_completed" and "total_time" in raw_data:
                total_time = float(raw_data["total_time"])
                count = int(raw_data.get("count", self.measurement_setup.get("max_count", 1)))
                length_cm = float(self.measurement_setup.get("pendulum_length_cm", 0))
                
                # Calculate Period (T) and T^2
                period = total_time / count if count > 0 else 0
                period_sq = period ** 2
                
                processed_data = {
                    "type": "experiment_result",
                    "status": "experiment_completed",
                    "total_time": total_time,
                    "time": total_time,  # Add time field for table
                    "count": count,
                    "oscillation_count": count, # Add oscillation_count for table
                    "length_cm": length_cm,
                    "period": period,
                    "period_squared": period_sq,
                    "g_calculated": (4 * (np.pi**2) * (length_cm/100)) / period_sq if period_sq > 0 else 0
                }
                
                # Log the result
                logger.info(f"Experiment Result Calculated: {processed_data}")
                return processed_data

            # Standard beam-break or oscillation event processing
            # Supported formats:
            # 1) {"cut_time": float} or {"t": float, "beam_broken": bool}
            # 2) {"count": int, "oscillation_time_ms": int}
            current_time = raw_data.get("cut_time") or raw_data.get("t", 0.0)
            # Default to False so we only treat explicit cut events as beam breaks
            beam_broken = raw_data.get("beam_broken", False)
            
            processed_data = {
                "t": current_time,
                "oscillation_count": self.oscillation_count,
                "total_cuts": len(self.cut_times)
            }
            
            # Handle firmware-side oscillation event packets
            if raw_data.get("count") is not None:
                try:
                    event_count = int(raw_data.get("count"))
                except Exception:
                    event_count = self.oscillation_count
                t_ms = raw_data.get("oscillation_time_ms")
                if t_ms is not None:
                    try:
                        t_ms = float(t_ms)
                    except Exception:
                        t_ms = None
                # Map firmware time to processed 't' (seconds) when available
                if t_ms is not None:
                    processed_data["t"] = t_ms / 1000.0
                    processed_data["timestamp_ms"] = t_ms
                # Update oscillation_count directly from firmware
                self.oscillation_count = event_count
                processed_data["oscillation_count"] = self.oscillation_count
                
                if t_ms is not None:
                    # Calculate period using previous time (or 0 if this is first event)
                    prev_time = self.last_osc_time_ms if self.last_osc_time_ms is not None else 0
                    
                    # Only calculate period if time has advanced
                    if t_ms > prev_time:
                        period_s = (t_ms - prev_time) / 1000.0
                        self.periods.append(period_s)
                        processed_data.update({
                            "latest_period": period_s,
                            "period": period_s,
                            "frequency": 1.0 / period_s
                        })
                        if len(self.periods) >= 2:
                            processed_data.update(self._calculate_oscillation_analysis())
                    
                    self.last_osc_time_ms = t_ms
                
                # Add to buffer and return
                if self.is_active:
                    self.add_to_buffer(processed_data)
                    
                # Check for completion
                max_count = int(self.measurement_setup.get("max_count", 0))
                
                # Log status for debugging
                # logger.info(f"Check completion: count={self.oscillation_count}, max={max_count}")
                
                if max_count > 0 and self.oscillation_count >= max_count:
                    completion_data = self._create_completion_data()
                    logger.info(f"Auto-completing experiment: {completion_data}")
                    return completion_data
                    
                return processed_data

            if beam_broken or "cut_time" in raw_data:
                # Record beam cut event
                self.cut_times.append(current_time)
                processed_data["beam_cut"] = True

                # Compute full oscillation only when we have 3 or more cuts and the latest cut index is odd
                # Example (matching firmware logs):
                #  cut 1 -> start timer, cut 3 -> oscillation 1 completed, cut 5 -> oscillation 2, ...
                if len(self.cut_times) >= 3 and (len(self.cut_times) % 2 == 1):
                    period = self.cut_times[-1] - self.cut_times[-3]
                    self.periods.append(period)
                    self.oscillation_count += 1
                    processed_data["oscillation_count"] = self.oscillation_count

                    processed_data.update({
                        "latest_period": period,
                        "period": period,
                        "frequency": 1.0 / period if period > 0 else 0
                    })

                    # Calculate running statistics
                    if len(self.periods) >= 2:
                        processed_data.update(self._calculate_oscillation_analysis())

                # Track the last cut time (for potential auxiliary calculations)
                self.last_cut_time = current_time
                
            else:
                processed_data["beam_cut"] = False
                if self.periods:
                    processed_data["latest_period"] = self.periods[-1]
                    processed_data["period"] = self.periods[-1]
                    processed_data["frequency"] = 1.0 / self.periods[-1] if self.periods[-1] > 0 else 0
            
            # Add to buffer
            if self.is_active:
                self.add_to_buffer(processed_data)
                
            # Check for completion
            max_count = int(self.measurement_setup.get("max_count", 0))
            if max_count > 0 and self.oscillation_count >= max_count:
                completion_data = self._create_completion_data()
                logger.info(f"Auto-completing experiment: {completion_data}")
                return completion_data
                
            return processed_data
            
        except Exception as e:
            logger.error(f"Error processing oscillation data for {self.device_id}: {e}")
            return {"error": str(e)}
            
    def _create_completion_data(self) -> dict:
        """Create experiment completion data packet"""
        total_time = 0
        if self.last_osc_time_ms is not None:
             # Use last known oscillation time as total duration (assuming start at 0)
             total_time = self.last_osc_time_ms / 1000.0
        elif self.cut_times and len(self.cut_times) >= 2:
             total_time = self.cut_times[-1] - self.cut_times[0]
        elif self.periods:
             total_time = sum(self.periods)
        
        count = self.oscillation_count
        length_cm = float(self.measurement_setup.get("pendulum_length_cm", 0))
        
        # Calculate Period (T) and T^2 based on average
        # Use simple average: Total Time / Total Count
        period = total_time / count if count > 0 else 0
        period_sq = period ** 2
        
        return {
            "type": "experiment_result",
            "status": "experiment_completed",
            "total_time": total_time,
            "time": total_time, # For table compatibility
            "count": count,
            "oscillation_count": count, # For table compatibility
            "length_cm": length_cm,
            "period": period,
            "period_squared": period_sq,
            "g_calculated": (4 * (np.pi**2) * (length_cm/100)) / period_sq if period_sq > 0 else 0
        }

    def _calculate_oscillation_analysis(self) -> dict:
        """Calculate oscillation analysis metrics"""
        try:
            analysis = {}
            
            if not self.periods:
                return analysis
                
            # Recent periods for analysis (last 20)
            # recent_periods = self.periods[-20:] if len(self.periods) > 20 else self.periods
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error in oscillation analysis for {self.device_id}: {e}")
            return {"analysis_error": str(e)}
            

    def configure_measurement(self, setup: dict):
        """Configure measurement setup parameters"""
        self.measurement_setup.update(setup)
        logger.info(f"Oscillation measurement configured for {self.device_id}: {setup}")
        
    def reset_count(self):
        """Reset oscillation count and data"""
        self.cut_times.clear()
        self.periods.clear()
        self.last_cut_time = None
        self.last_osc_time_ms = None
        self.oscillation_count = 0
        self.data_buffer.clear()
        logger.info(f"Oscillation count reset for device {self.device_id}")
        
    def get_oscillation_summary(self) -> dict:
        """Get summary of oscillation measurements"""
        if not self.cut_times:
            return {"status": "no_data"}
            
        total_time = self.cut_times[-1] - self.cut_times[0] if len(self.cut_times) >= 2 else 0
        
        return {
            "total_oscillations": self.oscillation_count,
            "total_periods": len(self.periods),
            "measurement_duration": total_time,
            "average_frequency": len(self.periods) / total_time if total_time > 0 else 0,
            "cut_times": self.cut_times[-10:],  # Last 10 cut times
            "recent_periods": self.periods[-10:] if len(self.periods) >= 10 else self.periods,
            "setup": self.measurement_setup
        }
        
    def export_data(self) -> dict:
        """Export all oscillation data for analysis"""
        return {
            "device_id": self.device_id,
            "experiment_type": self.experiment_type,
            "cut_times": self.cut_times,
            "periods": self.periods,
            "oscillation_count": self.oscillation_count,
            "measurement_setup": self.measurement_setup,
            "buffer_data": self.get_buffer_data()
        }
