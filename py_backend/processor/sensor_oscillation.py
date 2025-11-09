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
        self.oscillation_count = 0
        self.measurement_setup = {}
        
    def get_experiment_type(self) -> str:
        return self.experiment_type
        
    async def process_data(self, raw_data: dict) -> dict:
        """Process oscillation sensor data to calculate periods and frequencies"""
        try:
            # Expected format: {"cut_time": float} or {"t": float, "beam_broken": bool}
            current_time = raw_data.get("cut_time") or raw_data.get("t", 0.0)
            beam_broken = raw_data.get("beam_broken", True)
            
            processed_data = {
                "t": current_time,
                "oscillation_count": self.oscillation_count,
                "total_cuts": len(self.cut_times)
            }
            
            if beam_broken or "cut_time" in raw_data:
                # Record beam cut event
                self.cut_times.append(current_time)
                self.oscillation_count += 1
                
                # Calculate period if we have previous cut
                if self.last_cut_time is not None:
                    period = current_time - self.last_cut_time
                    self.periods.append(period)
                    
                    # Update processed data with period info
                    processed_data.update({
                        "latest_period": period,
                        "frequency": 1.0 / period if period > 0 else 0,
                        "beam_cut": True
                    })
                    
                    # Calculate running statistics
                    if len(self.periods) >= 2:
                        processed_data.update(self._calculate_oscillation_analysis())
                        
                self.last_cut_time = current_time
                
            else:
                processed_data["beam_cut"] = False
                if self.periods:
                    processed_data["latest_period"] = self.periods[-1]
                    processed_data["frequency"] = 1.0 / self.periods[-1] if self.periods[-1] > 0 else 0
            
            # Add to buffer
            if self.is_active:
                self.add_to_buffer(processed_data)
                
            return processed_data
            
        except Exception as e:
            logger.error(f"Error processing oscillation data for {self.device_id}: {e}")
            return {"error": str(e)}
            
    def _calculate_oscillation_analysis(self) -> dict:
        """Calculate oscillation analysis metrics"""
        try:
            analysis = {}
            
            if not self.periods:
                return analysis
                
            # Recent periods for analysis (last 20)
            recent_periods = self.periods[-20:] if len(self.periods) > 20 else self.periods
            
            # Period statistics
            analysis["period_stats"] = self.calculate_statistics(recent_periods)
            
            # Frequency statistics
            frequencies = [1.0/p if p > 0 else 0 for p in recent_periods]
            analysis["frequency_stats"] = self.calculate_statistics(frequencies)
            
            # Average period and frequency
            analysis["average_period"] = np.mean(recent_periods)
            analysis["average_frequency"] = np.mean(frequencies)
            
            # Period stability (coefficient of variation)
            if analysis["period_stats"]["mean"] > 0:
                analysis["period_stability"] = analysis["period_stats"]["std"] / analysis["period_stats"]["mean"]
            else:
                analysis["period_stability"] = float('inf')
                
            # Damping analysis (if enough data)
            if len(recent_periods) >= 10:
                analysis["damping_analysis"] = self._analyze_damping(recent_periods)
                
            # Energy loss estimation (if setup parameters provided)
            if self.measurement_setup:
                analysis["energy_analysis"] = self._calculate_energy_loss()
                
            return analysis
            
        except Exception as e:
            logger.error(f"Error in oscillation analysis for {self.device_id}: {e}")
            return {"analysis_error": str(e)}
            
    def _analyze_damping(self, periods: List[float]) -> dict:
        """Analyze damping characteristics from period data"""
        try:
            # Simple damping analysis - look for trend in periods
            if len(periods) < 5:
                return {"status": "insufficient_data"}
                
            # Linear fit to detect period drift
            x = np.arange(len(periods))
            coeffs = np.polyfit(x, periods, 1)
            slope = coeffs[0]
            
            # Classify damping
            damping_type = "undamped"
            if slope > 0.001:
                damping_type = "increasing_period"  # Possible underdamped with energy loss
            elif slope < -0.001:
                damping_type = "decreasing_period"  # Unusual, might indicate measurement error
            else:
                damping_type = "stable"
                
            # Calculate R-squared for fit quality
            y_pred = np.polyval(coeffs, x)
            ss_res = np.sum((periods - y_pred) ** 2)
            ss_tot = np.sum((periods - np.mean(periods)) ** 2)
            r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
            
            return {
                "damping_type": damping_type,
                "period_slope": slope,
                "fit_quality": r_squared,
                "trend_significance": abs(slope) / np.std(periods) if np.std(periods) > 0 else 0
            }
            
        except Exception as e:
            logger.error(f"Error in damping analysis: {e}")
            return {"error": str(e)}
            
    def _calculate_energy_loss(self) -> dict:
        """Calculate energy loss based on measurement setup"""
        try:
            # Get setup parameters
            length = self.measurement_setup.get("pendulum_length", 1.0)  # meters
            mass = self.measurement_setup.get("mass", 0.1)  # kg
            initial_angle = self.measurement_setup.get("initial_angle", 0.1)  # radians
            
            if not self.periods or len(self.periods) < 2:
                return {"status": "insufficient_data"}
                
            # Theoretical period for simple pendulum
            g = 9.81  # m/s^2
            theoretical_period = 2 * np.pi * np.sqrt(length / g)
            
            # Current average period
            current_period = np.mean(self.periods[-5:]) if len(self.periods) >= 5 else self.periods[-1]
            
            # Energy calculations (simplified)
            # Initial potential energy (assuming small angle approximation)
            initial_energy = mass * g * length * (initial_angle ** 2) / 2
            
            # Current energy estimate (very rough approximation)
            # This would need more sophisticated analysis in practice
            period_ratio = current_period / theoretical_period
            energy_ratio = 1.0 / (period_ratio ** 2) if period_ratio > 0 else 0
            current_energy = initial_energy * energy_ratio
            
            energy_loss = initial_energy - current_energy
            energy_loss_percent = (energy_loss / initial_energy * 100) if initial_energy > 0 else 0
            
            return {
                "theoretical_period": theoretical_period,
                "current_period": current_period,
                "period_deviation": abs(current_period - theoretical_period),
                "initial_energy": initial_energy,
                "current_energy": current_energy,
                "energy_loss": energy_loss,
                "energy_loss_percent": energy_loss_percent
            }
            
        except Exception as e:
            logger.error(f"Error in energy loss calculation: {e}")
            return {"error": str(e)}
            
    def configure_measurement(self, setup: dict):
        """Configure measurement setup parameters"""
        self.measurement_setup.update(setup)
        logger.info(f"Oscillation measurement configured for {self.device_id}: {setup}")
        
    def reset_count(self):
        """Reset oscillation count and data"""
        self.cut_times.clear()
        self.periods.clear()
        self.last_cut_time = None
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