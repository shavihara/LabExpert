import { experimentRegistry } from '../experiments/experimentRegistry';
import { transformExperimentData, formatExperimentData } from '../utils/experimentUtils';

class ExperimentService {
  constructor() {
    this.activeExperiments = new Map();
    this.experimentData = new Map();
  }

  // Get all available experiments
  getAvailableExperiments() {
    return experimentRegistry.getAllExperiments();
  }

  // Get experiment by ID
  getExperiment(experimentId) {
    return experimentRegistry.getExperiment(experimentId);
  }

  // Start an experiment
  startExperiment(experimentId, deviceConfig) {
    try {
      const experiment = this.getExperiment(experimentId);
      if (!experiment) {
        throw new Error(`Experiment ${experimentId} not found`);
      }

      const experimentInstance = {
        id: experimentId,
        startTime: new Date(),
        status: 'running',
        config: experiment,
        deviceConfig: deviceConfig,
        data: []
      };

      this.activeExperiments.set(experimentId, experimentInstance);
      this.experimentData.set(experimentId, []);

      return experimentInstance;
    } catch (error) {
      console.error('Error starting experiment:', error);
      throw error;
    }
  }

  // Stop an experiment
  stopExperiment(experimentId) {
    const experiment = this.activeExperiments.get(experimentId);
    if (experiment) {
      experiment.status = 'stopped';
      experiment.endTime = new Date();
      return experiment;
    }
    return null;
  }

  // Pause an experiment
  pauseExperiment(experimentId) {
    const experiment = this.activeExperiments.get(experimentId);
    if (experiment) {
      experiment.status = 'paused';
      return experiment;
    }
    return null;
  }

  // Resume an experiment
  resumeExperiment(experimentId) {
    const experiment = this.activeExperiments.get(experimentId);
    if (experiment) {
      experiment.status = 'running';
      return experiment;
    }
    return null;
  }

  // Add data to experiment
  addExperimentData(experimentId, rawData) {
    try {
      const experiment = this.activeExperiments.get(experimentId);
      if (!experiment) {
        throw new Error(`Experiment ${experimentId} not found`);
      }

      const transformedData = transformExperimentData(rawData, experiment.config);
      const formattedData = formatExperimentData(transformedData, experiment.config);

      const existingData = this.experimentData.get(experimentId) || [];
      const newData = [...existingData, formattedData];
      
      this.experimentData.set(experimentId, newData);
      experiment.data = newData;

      return formattedData;
    } catch (error) {
      console.error('Error adding experiment data:', error);
      throw error;
    }
  }

  // Get experiment data
  getExperimentData(experimentId) {
    return this.experimentData.get(experimentId) || [];
  }

  // Get active experiments
  getActiveExperiments() {
    return Array.from(this.activeExperiments.values());
  }

  // Get experiment statistics
  getExperimentStats(experimentId) {
    const data = this.getExperimentData(experimentId);
    const experiment = this.getExperiment(experimentId);
    
    if (!experiment || data.length === 0) {
      return {};
    }

    const stats = {};
    const fields = experiment.dataFields || [];

    fields.forEach(field => {
      const values = data.map(item => item[field.key]).filter(val => val != null && !isNaN(val));
      if (values.length > 0) {
        stats[field.key] = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length,
          sum: values.reduce((a, b) => a + b, 0)
        };
      }
    });

    return stats;
  }

  // Export experiment data
  exportExperimentData(experimentId, format = 'json') {
    const experiment = this.activeExperiments.get(experimentId);
    const data = this.getExperimentData(experimentId);
    const stats = this.getExperimentStats(experimentId);

    const exportData = {
      experiment: experiment,
      data: data,
      statistics: stats,
      exportedAt: new Date().toISOString()
    };

    switch (format) {
      case 'csv':
        return this.convertToCSV(data, experiment.config);
      case 'json':
      default:
        return JSON.stringify(exportData, null, 2);
    }
  }

  // Convert data to CSV format
  convertToCSV(data, config) {
    if (!data || data.length === 0) return '';

    const headers = config.dataFields.map(field => field.label);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        config.dataFields.map(field => row[field.key] || '').join(',')
      )
    ].join('\n');

    return csvContent;
  }

  // Clear experiment data
  clearExperimentData(experimentId) {
    this.experimentData.set(experimentId, []);
    const experiment = this.activeExperiments.get(experimentId);
    if (experiment) {
      experiment.data = [];
    }
  }

  // Remove experiment
  removeExperiment(experimentId) {
    this.activeExperiments.delete(experimentId);
    this.experimentData.delete(experimentId);
  }
}

export default new ExperimentService();