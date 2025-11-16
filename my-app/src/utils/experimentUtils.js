/**
 * Experiment ID Parser and Data Transformer Utilities
 * Handles experiment ID parsing and data transformation based on experiment configuration
 */

import { getExperimentConfig, parseExperimentId } from '../experiments/experimentConfig';
import { getExperimentDataProcessor } from '../experiments/experimentRegistry';

/**
 * Validate experiment ID components
 */
export const validateExperimentComponents = (mainId, subId) => {
  const config = getExperimentConfig(mainId, subId);
  
  return {
    isValid: !!config,
    config,
    error: config ? null : `Invalid experiment: ${mainId}.${subId}`
  };
};

/**
 * Transform raw sensor data based on experiment configuration
 */
export const transformExperimentData = (rawData, experimentId, subExperimentId) => {
  const config = getExperimentConfig(experimentId, subExperimentId);
  
  if (!config) {
    console.error(`No configuration found for experiment ${experimentId}.${subExperimentId}`);
    return rawData;
  }
  
  const { subExperiment } = config;
  const dataFields = subExperiment.dataFields;
  const units = subExperiment.units;
  
  // Get custom data processor if available
  const dataProcessor = getExperimentDataProcessor(experimentId, subExperimentId);
  
  // Process each data point
  const processedData = rawData.map((point, index) => {
    const processed = {
      id: index,
      timestamp: point.timestamp || point.t || Date.now(),
      original: { ...point }
    };
    
    // Map data fields based on configuration
    dataFields.forEach(field => {
      // Try multiple possible field names
      const possibleKeys = [
        field,
        field.charAt(0), // First letter (e.g., 'time' → 't')
        field.toLowerCase(),
        field.toUpperCase(),
        `sensor_${field}`,
        `value_${field}`
      ];
      if (field === 'intensity') {
        possibleKeys.push('distance', 'x');
      }
      
      let value = null;
      for (const key of possibleKeys) {
        if (point[key] !== undefined) {
          value = parseFloat(point[key]);
          break;
        }
      }
      
      // Use default value if not found
      if (value === null || isNaN(value)) {
        value = getDefaultValueForField(field);
      }
      
      processed[field] = value;
    });
    
    // Apply custom processor if available
    if (dataProcessor && typeof dataProcessor === 'function') {
      return dataProcessor(processed, subExperiment);
    }
    
    return processed;
  });
  
  return processedData;
};

/**
 * Get default value for a data field
 */
const getDefaultValueForField = (field) => {
  const defaults = {
    'time': 0,
    'timestamp': Date.now(),
    'distance': 0,
    'velocity': 0,
    'acceleration': 0,
    'angle': 0,
    'temperature': 20,
    'period': 1,
    'frequency': 1,
    'amplitude': 1
  };
  
  return defaults[field] || 0;
};

/**
 * Format data for display based on field type and units
 */
export const formatExperimentData = (value, field, units, precision = null) => {
  if (value === null || value === undefined) return 'N/A';
  
  const unit = units[field] || '';
  const fieldPrecision = precision || getDefaultPrecision(field);
  
  // Special formatting for specific fields
  if (field.includes('time') || field.includes('timestamp')) {
    if (field === 'timestamp') {
      return new Date(value).toLocaleTimeString();
    }
    return `${value.toFixed(fieldPrecision)} ${unit}`;
  }
  
  if (field.includes('angle')) {
    return `${value.toFixed(fieldPrecision)}${unit}`;
  }
  
  if (field.includes('temperature')) {
    return `${value.toFixed(fieldPrecision)}${unit}`;
  }
  
  // Default formatting
  return `${value.toFixed(fieldPrecision)} ${unit}`.trim();
};

/**
 * Get default precision for data fields
 */
const getDefaultPrecision = (field) => {
  const precisions = {
    'time': 2,
    'timestamp': 0,
    'distance': 2,
    'velocity': 2,
    'acceleration': 2,
    'angle': 1,
    'temperature': 1,
    'period': 3,
    'frequency': 2,
    'amplitude': 2,
    'damping_coefficient': 4
  };
  
  return precisions[field] || 2;
};

/**
 * Generate graph data structure for plotting
 */
export const generateGraphData = (experimentData, graphConfig) => {
  if (!experimentData || !graphConfig) return [];
  
  const { xAxis, yAxes } = graphConfig;
  
  return experimentData.map((point, index) => {
    const graphPoint = {
      id: index,
      [xAxis]: point[xAxis] || index,
      timeDisplay: formatTimeDisplay(point[xAxis] || index)
    };
    
    // Add Y-axis values
    yAxes.forEach(yAxis => {
      graphPoint[yAxis] = point[yAxis] || 0;
    });
    
    return graphPoint;
  });
};

/**
 * Format time display for graphs
 */
const formatTimeDisplay = (timeValue) => {
  if (typeof timeValue === 'number') {
    if (timeValue > 1000000000) {
      // Likely a timestamp
      return new Date(timeValue).toLocaleTimeString();
    } else {
      // Likely a time in seconds
      return `${timeValue.toFixed(2)}s`;
    }
  }
  return String(timeValue);
};

/**
 * Validate experiment data against configuration
 */
export const validateExperimentData = (data, experimentId, subExperimentId) => {
  const config = getExperimentConfig(experimentId, subExperimentId);
  
  if (!config) {
    return {
      isValid: false,
      errors: ['Invalid experiment configuration']
    };
  }
  
  const { subExperiment } = config;
  const requiredFields = subExperiment.dataFields;
  const errors = [];
  
  if (!Array.isArray(data)) {
    errors.push('Data must be an array');
    return { isValid: false, errors };
  }
  
  if (data.length === 0) {
    errors.push('Data array is empty');
    return { isValid: false, errors };
  }
  
  // Check first data point for required fields
  const firstPoint = data[0];
  const missingFields = requiredFields.filter(field => !(field in firstPoint));
  
  if (missingFields.length > 0) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  // Check data types
  data.forEach((point, index) => {
    requiredFields.forEach(field => {
      if (point[field] !== undefined && isNaN(parseFloat(point[field]))) {
        errors.push(`Invalid data type for field '${field}' at index ${index}`);
      }
    });
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    dataPointCount: data.length,
    fields: requiredFields
  };
};

/**
 * Generate statistics for experiment data
 */
export const generateDataStatistics = (data, experimentId, subExperimentId) => {
  const config = getExperimentConfig(experimentId, subExperimentId);
  
  if (!config || !Array.isArray(data) || data.length === 0) {
    return null;
  }
  
  const { subExperiment } = config;
  const fields = subExperiment.dataFields;
  const stats = {};
  
  fields.forEach(field => {
    const values = data.map(point => parseFloat(point[field]) || 0).filter(v => !isNaN(v));
    
    if (values.length > 0) {
      stats[field] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length
      };
    }
  });
  
  return {
    totalDataPoints: data.length,
    fields: stats,
    timeRange: data.length > 1 ? {
      start: data[0].time || 0,
      end: data[data.length - 1].time || 0,
      duration: (data[data.length - 1].time || 0) - (data[0].time || 0)
    } : null
  };
};

/**
 * Utility functions for experiment management
 */
export const experimentUtils = {
  parseExperimentId,
  validateExperimentComponents,
  transformExperimentData,
  formatExperimentData,
  generateGraphData,
  validateExperimentData,
  generateDataStatistics
};

export default experimentUtils;