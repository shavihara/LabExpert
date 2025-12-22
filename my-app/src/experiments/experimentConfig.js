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

        // Available Sensor Options (Multi-sensor support)
        sensorOptions: [
          { type: 'TOF', label: 'TOF Sensor', firmware: 'TOFFFE.bin' },
          { type: 'ULT', label: 'ULT Sensor', firmware: 'ULTFFE.bin' }
        ],

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
        name: 'Modern Galileo Experiment',
        icon: '📐',
        description: 'Study motion on an inclined surface - analyze acceleration vs angle',
        firmware: 'ULTINC.bin',
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

        // Available Sensor Options (Multi-sensor support)
        sensorOptions: [
          { type: 'TOF', label: 'TOF Sensor', firmware: 'TOFMGE.bin' },
          { type: 'ULT', label: 'ULT Sensor', firmware: 'ULTMGE.bin' }
        ],

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
        firmware: 'OSISIM.bin',
        firmwareType: 'pendulum_simple',

        dataFields: ['time', 'period', 'frequency', 'oscillation_count'],
        units: {
          time: 's',
          period: 's',
          frequency: 'Hz',
          oscillation_count: '',
          t2_vs_l: 's²'
        },

        graphConfig: {
          xAxis: 'time',
          yAxes: ['t2_vs_l'],
          colors: ['#EF4444'],
          yAxisLabels: ['The Graph Of T²  vs  L']
        },

        tableConfig: {
          columns: [
            { key: 'time', label: 'Total Time (s)', format: 'float', precision: 3 },
            { key: 'oscillation_count', label: 'Count', format: 'int' },
            { key: 'period', label: 'Period T (s)', format: 'float', precision: 4 },
            { key: 'period_squared', label: 'T² (s²)', format: 'float', precision: 4 },
            { key: 'length_cm', label: 'Length (cm)', format: 'float', precision: 1 }
          ]
        },

        requiredSensors: ['accelerometer', 'gyroscope'],

        defaultConfig: {
          frequency_hz: 10,
          max_angle_degrees: 30,
          duration_s: 30,
          pendulum_length_cm: 100,
          max_count: 50
        }
      },

      '2.2': {
        id: '2.2',
        name: 'Compound Pendulum',
        icon: '🔨',
        description: 'Analyze complex pendulum motion with damping effects',
        firmware: 'OSICOM.bin',
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
          damping_factor: 0.1,
          max_count: 50,
          pivot_to_com_distance_cm: 50
        }
      }
    }
  },

  '3': {
    id: '3',
    name: 'Temperature Monitoring',
    category: 'thermodynamics',
    icon: '🌡️',
    description: 'Monitor live temperature with configurable resolution',
    color: '#EF4444', // Red theme

    subExperiments: {
      '3.1': {
        id: 'temperature_live',
        name: 'Live Temperature Monitor',
        icon: '🌡️',
        description: 'Monitor live temperature with configurable resolution.',
        firmware: 'THRMON.bin',
        firmwareType: 'temperature',

        dataFields: ['time', 'celsius', 'fahrenheit', 'kelvin'],
        units: {
          time: 's',
          celsius: '°C',
          fahrenheit: '°F',
          kelvin: 'K'
        },

        graphConfig: {
          xAxis: 'time',
          yAxes: ['celsius', 'fahrenheit', 'kelvin'],
          colors: ['#EF4444', '#F97316', '#3B82F6'],
          yAxisLabels: ['Temperature (°C)', 'Temperature (°F)', 'Temperature (K)']
        },

        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'celsius', label: 'Celsius (°C)', format: 'float', precision: 2 },
            { key: 'fahrenheit', label: 'Fahrenheit (°F)', format: 'float', precision: 2 },
            { key: 'kelvin', label: 'Kelvin (K)', format: 'float', precision: 2 }
          ]
        },

        requiredSensors: ['temperature'],

        defaultConfig: {
          resolution: 10,
          duration: 300
        }
      }
    }
  },
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
  },

  '5': {
    id: '5',
    name: 'Motion Analysis (AI)',
    category: 'sensors',
    icon: '🏃',
    description: 'AI-powered motion tracking and analysis',
    color: '#8B5CF6', // Purple theme

    subExperiments: {
      '5.1': {
        id: '5.1',
        name: 'Simple Pendulum',
        icon: '🔄',
        description: 'Analyze pendulum motion using AI vision',
        firmware: 'AI_VISION.bin', // Placeholder
        firmwareType: 'ai_motion',

        dataFields: ['time', 'angle', 'period', 'oscillation_count'],
        units: {
          time: 's',
          angle: '°',
          period: 's',
          oscillation_count: ''
        },

        graphConfig: {
          xAxis: 'time',
          yAxes: ['angle'],
          colors: ['#8B5CF6'],
          yAxisLabels: ['Angle (°)']
        },

        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'angle', label: 'Angle (°)', format: 'float', precision: 1 },
            { key: 'oscillation_count', label: 'Count', format: 'int' }
          ]
        },

        requiredSensors: ['camera'],

        defaultConfig: {
          camera_id: 'default'
        }
      },
      '5.2': {
        id: '5.2',
        name: 'Modern Galileo Experiment',
        icon: '📐',
        description: 'Track inclined plane motion using AI vision',
        firmware: 'AI_VISION.bin', // Placeholder
        firmwareType: 'ai_motion',

        dataFields: ['time', 'distance', 'velocity'],
        units: {
          time: 's',
          distance: 'cm',
          velocity: 'cm/s'
        },

        graphConfig: {
          xAxis: 'time',
          yAxes: ['distance', 'velocity'],
          colors: ['#3B82F6', '#10B981'],
          yAxisLabels: ['Distance (cm)', 'Velocity (cm/s)']
        },

        tableConfig: {
          columns: [
            { key: 'time', label: 'Time (s)', format: 'float', precision: 2 },
            { key: 'distance', label: 'Distance (cm)', format: 'float', precision: 2 },
            { key: 'velocity', label: 'Velocity (cm/s)', format: 'float', precision: 2 }
          ]
        },

        requiredSensors: ['camera'],

        defaultConfig: {
          camera_id: 'default'
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
