/**
 * Modular Experiment Configuration System
 * Central configuration for all experiments and sub-experiments
 * Add new experiments here - no UI code changes needed
 */

export const experimentRegistry = {
  // Main Experiment Categories (Level 1)
  '1': {
    id: '1',
    name: 'Distance Measurement',
    category: 'kinematics',
    icon: '📏',
    description: 'Motion analysis and displacement experiments',
    color: '#3B82F6', // Blue theme
    
    // Sub-experiments (Level 2)
    subExperiments: {
      '1.1': {
        id: '1.1',
        name: 'Free Fall Experiment',
        icon: '⚾',
        description: 'Analyze motion under gravity - measure distance, velocity, and acceleration',
        firmware: 'TOF.bin',
        firmwareType: 'displacement',
        
        // Data configuration
        dataFields: ['time', 'distance', 'velocity', 'acceleration'],
        units: { 
          time: 's', 
          distance: 'cm', 
          velocity: 'cm/s', 
          acceleration: 'cm/s²' 
        },
        
        // Graph configuration
        graphConfig: {
          xAxis: 'time',
          yAxes: ['distance', 'velocity', 'acceleration'],
          colors: ['#3B82F6', '#10B981', '#F59E0B'],
          yAxisLabels: ['Distance (cm)', 'Velocity (cm/s)', 'Acceleration (cm/s²)']
        },
        
        // Table configuration
        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'distance', label: 'Distance (cm)', format: 'float', precision: 2 },
            { key: 'velocity', label: 'Velocity (cm/s)', format: 'float', precision: 2 },
            { key: 'acceleration', label: 'Acceleration (cm/s²)', format: 'float', precision: 2 }
          ]
        },
        
        // Sensor requirements
        requiredSensors: ['tof', 'accelerometer'],
        
        // Default configuration
        defaultConfig: {
          frequency_hz: 20,
          max_distance_cm: 150,
          duration_s: 10,
          gravity: 981, // cm/s²
          mass: 0 // kg
        }
      },
      
      '1.2': {
        id: '1.2',
        name: 'Inclined Plane',
        icon: '📐',
        description: 'Study motion on an inclined surface - analyze acceleration vs angle',
        firmware: 'INC.bin',
        firmwareType: 'inclined_plane',
        
        dataFields: ['time', 'distance', 'velocity', 'acceleration', 'angle'],
        units: { 
          time: 's', 
          distance: 'cm', 
          velocity: 'cm/s', 
          acceleration: 'cm/s²', 
          angle: '°' 
        },
        
        graphConfig: {
          xAxis: 'time',
          yAxes: ['distance', 'velocity', 'acceleration'],
          colors: ['#8B5CF6', '#06B6D4', '#EC4899'],
          yAxisLabels: ['Distance (cm)', 'Velocity (cm/s)', 'Acceleration (cm/s²)']
        },
        
        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'distance', label: 'Distance (cm)', format: 'float', precision: 2 },
            { key: 'velocity', label: 'Velocity (cm/s)', format: 'float', precision: 2 },
            { key: 'acceleration', label: 'Acceleration (cm/s²)', format: 'float', precision: 2 },
            { key: 'angle', label: 'Angle (°)', format: 'float', precision: 1 }
          ]
        },
        
        requiredSensors: ['tof', 'gyroscope'],
        
        defaultConfig: {
          frequency_hz: 15,
          max_distance_cm: 100,
          duration_s: 15,
          angle_degrees: 30,
          mass: 0 // kg
        }
      }
    }
  },
  
  '2': {
    id: '2',
    name: 'Oscillation Counter',
    category: 'harmonic_motion',
    icon: '🔄',
    description: 'Periodic motion and oscillation analysis',
    color: '#10B981', // Green theme
    
    subExperiments: {
      '2.1': {
        id: '2.1',
        name: 'Simple Pendulum',
        icon: '⚖️',
        description: 'Measure oscillation period and frequency of a simple pendulum',
        firmware: 'PEND_SIMPLE.bin',
        firmwareType: 'pendulum_simple',
        
        dataFields: ['time', 'angle', 'angular_velocity', 'period'],
        units: { 
          time: 's', 
          angle: '°', 
          angular_velocity: '°/s', 
          period: 's' 
        },
        
        graphConfig: {
          xAxis: 'time',
          yAxes: ['angle', 'angular_velocity'],
          colors: ['#EF4444', '#F97316'],
          yAxisLabels: ['Angle (°)', 'Angular Velocity (°/s)']
        },
        
        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'angle', label: 'Angle (°)', format: 'float', precision: 1 },
            { key: 'angular_velocity', label: 'Angular Velocity (°/s)', format: 'float', precision: 2 },
            { key: 'period', label: 'Period (s)', format: 'float', precision: 3 }
          ]
        },
        
        requiredSensors: ['accelerometer', 'gyroscope'],
        
        defaultConfig: {
          frequency_hz: 10,
          max_angle_degrees: 30,
          duration_s: 30,
          pendulum_length_cm: 100
        }
      },
      
      '2.2': {
        id: '2.2',
        name: 'Compound Pendulum',
        icon: '🔨',
        description: 'Analyze complex pendulum motion with damping effects',
        firmware: 'PEND_COMPOUND.bin',
        firmwareType: 'pendulum_compound',
        
        dataFields: ['time', 'angle', 'angular_velocity', 'damping_coefficient'],
        units: { 
          time: 's', 
          angle: '°', 
          angular_velocity: '°/s', 
          damping_coefficient: '1/s' 
        },
        
        graphConfig: {
          xAxis: 'time',
          yAxes: ['angle', 'angular_velocity'],
          colors: ['#DC2626', '#EA580C'],
          yAxisLabels: ['Angle (°)', 'Angular Velocity (°/s)']
        },
        
        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'angle', label: 'Angle (°)', format: 'float', precision: 1 },
            { key: 'angular_velocity', label: 'Angular Velocity (°/s)', format: 'float', precision: 2 },
            { key: 'damping_coefficient', label: 'Damping (1/s)', format: 'float', precision: 4 }
          ]
        },
        
        requiredSensors: ['accelerometer', 'gyroscope'],
        
        defaultConfig: {
          frequency_hz: 15,
          max_angle_degrees: 45,
          duration_s: 45,
          damping_factor: 0.1
        }
      }
    }
  },
  
  '3': {
    id: '3',
    name: 'Temperature Analysis',
    category: 'thermodynamics',
    icon: '🌡️',
    description: 'Thermal experiments and heat transfer analysis',
    color: '#EF4444', // Red theme
    
    subExperiments: {
      '3.1': {
        id: '3.1',
        name: 'Heat Transfer',
        icon: '🔥',
        description: 'Measure temperature changes during heat transfer processes',
        firmware: 'THERMAL.bin',
        firmwareType: 'thermal',
        
        dataFields: ['time', 'temperature', 'heat_flux', 'thermal_conductivity'],
        units: { 
          time: 's', 
          temperature: '°C', 
          heat_flux: 'W/m²', 
          thermal_conductivity: 'W/m·K' 
        },
        
        graphConfig: {
          xAxis: 'time',
          yAxes: ['temperature', 'heat_flux'],
          colors: ['#EF4444', '#F97316'],
          yAxisLabels: ['Temperature (°C)', 'Heat Flux (W/m²)']
        },
        
        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'temperature', label: 'Temperature (°C)', format: 'float', precision: 1 },
            { key: 'heat_flux', label: 'Heat Flux (W/m²)', format: 'float', precision: 2 },
            { key: 'thermal_conductivity', label: 'Conductivity (W/m·K)', format: 'float', precision: 3 }
          ]
        },
        
        requiredSensors: ['temperature', 'thermal_sensor'],
        
        defaultConfig: {
          frequency_hz: 5,
          max_temperature_c: 100,
          duration_s: 300,
          ambient_temperature_c: 25
        }
      }
    }
  }
  ,
  '4': {
    id: '4',
    name: 'Light Intensity Analysis',
    category: 'optics',
    icon: '💡',
    description: 'Monitor ambient light levels and analyze intensity over time',
    color: '#F59E0B',
    
    subExperiments: {
      '4.1': {
        id: '4.1',
        name: 'Intensity Monitor',
        icon: '💡',
        description: 'Real-time monitoring of light intensity with time-based analysis',
        firmware: 'TOF.bin',
        firmwareType: 'displacement',
        dataFields: ['time', 'intensity'],
        units: {
          time: 's',
          intensity: 'lux'
        },
        graphConfig: {
          xAxis: 'time',
          yAxes: ['intensity'],
          colors: ['#F59E0B'],
          yAxisLabels: ['Intensity (lux)']
        },
        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'intensity', label: 'Intensity (lux)', format: 'float', precision: 1 }
          ]
        },
        requiredSensors: ['light'],
        defaultConfig: {
          frequency_hz: 10,
          duration_s: 60,
          max_intensity_lux: 1000
        }
      },
      '4.2': {
        id: '4.2',
        name: 'Intensity Monitor2',
        icon: '💡',
        description: 'Real-time monitoring of light intensity with time-based analysis',
        firmware: 'TOF.bin',
        firmwareType: 'displacement',
        dataFields: ['time', 'intensity'],
        units: {
          time: 's',
          intensity: 'lux'
        },
        graphConfig: {
          xAxis: 'time',
          yAxes: ['intensity'],
          colors: ['#F59E0B'],
          yAxisLabels: ['Intensity (lux)']
        },
        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'intensity', label: 'Intensity (lux)', format: 'float', precision: 1 }
          ]
        },
        requiredSensors: ['light'],
        defaultConfig: {
          frequency_hz: 10,
          duration_s: 60,
          max_intensity: 1000
        }
      }
    }
  }
};

/**
 * Helper functions for experiment configuration
 */

export const getExperimentConfig = (experimentId, subExperimentId) => {
  console.log('getExperimentConfig called with:', { experimentId, subExperimentId });
  console.log('Available experiments in registry:', Object.keys(experimentRegistry));
  
  const mainExp = experimentRegistry[experimentId];
  console.log('Main experiment lookup result:', mainExp);
  
  if (!mainExp) {
    console.error(`Main experiment ${experimentId} not found`);
    return null;
  }
  
  console.log('Available sub-experiments:', Object.keys(mainExp.subExperiments));
  const subExp = mainExp.subExperiments[subExperimentId];
  console.log('Sub-experiment lookup result:', subExp);
  
  if (!subExp) {
    console.error(`Sub-experiment ${subExperimentId} not found in ${experimentId}`);
    return null;
  }
  
  const result = {
    mainExperiment: mainExp,
    subExperiment: subExp,
    fullConfig: {
      ...mainExp,
      currentSubExperiment: subExp
    }
  };
  
  console.log('Returning config:', result);
  return result;
};

export const getAllMainExperiments = () => {
  return Object.values(experimentRegistry);
};

export const getSubExperiments = (experimentId) => {
  const mainExp = experimentRegistry[experimentId];
  return mainExp ? Object.values(mainExp.subExperiments) : [];
};

export const parseExperimentId = (fullId) => {
  const parts = fullId.split('.');
  return {
    mainId: parts[0],
    subId: fullId,
    isValid: parts.length === 2 && experimentRegistry[parts[0]]?.subExperiments[fullId]
  };
};

export const validateExperimentId = (experimentId, subExperimentId) => {
  return !!getExperimentConfig(experimentId, subExperimentId);
};

/**
 * Add new experiment to registry
 * Usage: registerExperiment('4', { name: 'New Exp', subExperiments: {...} })
 */
export const registerExperiment = (experimentId, experimentConfig) => {
  if (experimentRegistry[experimentId]) {
    console.warn(`Experiment ${experimentId} already exists, overwriting`);
  }
  experimentRegistry[experimentId] = experimentConfig;
};

/**
 * Add new sub-experiment to existing experiment
 */
export const registerSubExperiment = (experimentId, subExperimentId, subExperimentConfig) => {
  if (!experimentRegistry[experimentId]) {
    console.error(`Main experiment ${experimentId} not found`);
    return false;
  }
  
  experimentRegistry[experimentId].subExperiments[subExperimentId] = subExperimentConfig;
  return true;
};

export default experimentRegistry;
