/**
 * Experiment Registry and Plugin System
 * Dynamic component registration and experiment management
 */

import { experimentRegistry, getExperimentConfig } from './experimentConfig';

class ExperimentPluginSystem {
  constructor() {
    this.experiments = new Map();
    this.components = new Map();
    this.dataProcessors = new Map();
    this.initialized = false;
    
    this.initializeCoreExperiments();
  }
  
  /**
   * Initialize core experiments from experimentConfig.js
   */
  initializeCoreExperiments() {
    if (this.initialized) return;
    
    Object.keys(experimentRegistry).forEach(experimentId => {
      this.registerExperiment(experimentId, experimentRegistry[experimentId]);
    });
    
    this.initialized = true;
  }
  
  /**
   * Register a new experiment type
   */
  registerExperiment(experimentId, experimentConfig) {
    // Validate experiment configuration
    if (!this.validateExperimentConfig(experimentConfig)) {
      console.error(`Invalid experiment configuration for ${experimentId}`);
      return false;
    }
    
    this.experiments.set(experimentId, {
      ...experimentConfig,
      registeredAt: new Date().toISOString(),
      isCustom: true
    });
    
    console.log(`✅ Experiment ${experimentId} registered successfully`);
    return true;
  }
  
  /**
   * Register custom components for specific experiments
   */
  registerComponent(experimentId, componentType, Component, options = {}) {
    const key = `${experimentId}:${componentType}`;
    
    this.components.set(key, {
      component: Component,
      experimentId,
      componentType,
      options,
      registeredAt: new Date().toISOString()
    });
    
    console.log(`✅ Component ${componentType} registered for experiment ${experimentId}`);
  }
  
  /**
   * Register data processor for experiment-specific data transformation
   */
  registerDataProcessor(experimentId, subExperimentId, processor) {
    const key = `${experimentId}.${subExperimentId}`;
    
    this.dataProcessors.set(key, {
      processor,
      experimentId,
      subExperimentId,
      registeredAt: new Date().toISOString()
    });
  }
  
  /**
   * Get experiment configuration
   */
  getExperiment(experimentId) {
    return this.experiments.get(experimentId) || getExperimentConfig(experimentId, experimentId)?.mainExperiment;
  }
  
  /**
   * Get custom component for experiment
   */
  getComponent(experimentId, componentType, fallbackComponent = null) {
    const key = `${experimentId}:${componentType}`;
    const customComponent = this.components.get(key);
    
    if (customComponent) {
      return customComponent.component;
    }
    
    // Return fallback or default component
    return fallbackComponent || this.getDefaultComponent(componentType);
  }
  
  /**
   * Get data processor for experiment
   */
  getDataProcessor(experimentId, subExperimentId) {
    const key = `${experimentId}.${subExperimentId}`;
    const processor = this.dataProcessors.get(key);
    
    if (processor) {
      return processor.processor;
    }
    
    // Return default processor
    return this.getDefaultDataProcessor();
  }
  
  /**
   * Get default components
   */
  getDefaultComponent(componentType) {
    const defaults = {
      'config-panel': 'DefaultConfigPanel',
      'graph-renderer': 'UniversalGraphRenderer',
      'data-table': 'DynamicDataTable',
      'sensor-panel': 'SensorConfigPanel',
      'experiment-card': 'ExperimentCard'
    };
    
    return defaults[componentType] || null;
  }
  
  /**
   * Get default data processor
   */
  getDefaultDataProcessor() {
    return (data) => {
      // Default processor - return data as-is
      return data;
    };
  }
  
  /**
   * Validate experiment configuration
   */
  validateExperimentConfig(config) {
    const required = ['id', 'name', 'subExperiments'];
    
    for (const field of required) {
      if (!config[field]) {
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }
    
    // Validate sub-experiments
    const subExpIds = Object.keys(config.subExperiments);
    if (subExpIds.length === 0) {
      console.error('No sub-experiments defined');
      return false;
    }
    
    for (const [subId, subConfig] of Object.entries(config.subExperiments)) {
      if (!this.validateSubExperimentConfig(subId, subConfig)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Validate sub-experiment configuration
   */
  validateSubExperimentConfig(subId, config) {
    const required = ['id', 'name', 'dataFields', 'graphConfig', 'tableConfig'];
    
    for (const field of required) {
      if (!config[field]) {
        console.error(`Sub-experiment ${subId} missing required field: ${field}`);
        return false;
      }
    }
    
    // Validate graph config
    const graphConfig = config.graphConfig;
    if (!graphConfig.xAxis || !graphConfig.yAxes || !Array.isArray(graphConfig.yAxes)) {
      console.error(`Sub-experiment ${subId} has invalid graph configuration`);
      return false;
    }
    
    // Validate table config
    const tableConfig = config.tableConfig;
    if (!tableConfig.columns || !Array.isArray(tableConfig.columns)) {
      console.error(`Sub-experiment ${subId} has invalid table configuration`);
      return false;
    }
    
    return true;
  }
  
  /**
   * List all registered experiments
   */
  listExperiments() {
    return Array.from(this.experiments.entries()).map(([id, config]) => ({
      id,
      name: config.name,
      category: config.category,
      subExperiments: Object.keys(config.subExperiments || {}),
      isCustom: config.isCustom || false
    }));
  }
  
  /**
   * Unregister experiment (for development/testing)
   */
  unregisterExperiment(experimentId) {
    const result = this.experiments.delete(experimentId);
    
    // Remove associated components
    const componentKeys = Array.from(this.components.keys())
      .filter(key => key.startsWith(`${experimentId}:`));
    
    componentKeys.forEach(key => this.components.delete(key));
    
    // Remove data processors
    const processorKeys = Array.from(this.dataProcessors.keys())
      .filter(key => key.startsWith(`${experimentId}.`));
    
    processorKeys.forEach(key => this.dataProcessors.delete(key));
    
    console.log(`🗑️ Experiment ${experimentId} unregistered`);
    return result;
  }
  
  /**
   * Get experiment statistics
   */
  getStats() {
    return {
      totalExperiments: this.experiments.size,
      totalComponents: this.components.size,
      totalDataProcessors: this.dataProcessors.size,
      customExperiments: Array.from(this.experiments.values()).filter(e => e.isCustom).length,
      registeredComponents: Array.from(this.components.keys()),
      registeredProcessors: Array.from(this.dataProcessors.keys())
    };
  }
}

// Create singleton instance
export const experimentManager = new ExperimentPluginSystem();

/**
 * Convenience functions for plugin system
 */
export const registerExperiment = (experimentId, config) => {
  return experimentManager.registerExperiment(experimentId, config);
};

export const registerComponent = (experimentId, componentType, Component, options) => {
  return experimentManager.registerComponent(experimentId, componentType, Component, options);
};

export const registerDataProcessor = (experimentId, subExperimentId, processor) => {
  return experimentManager.registerDataProcessor(experimentId, subExperimentId, processor);
};

export const getExperimentComponent = (experimentId, componentType, fallback = null) => {
  return experimentManager.getComponent(experimentId, componentType, fallback);
};

export const getExperimentDataProcessor = (experimentId, subExperimentId) => {
  return experimentManager.getDataProcessor(experimentId, subExperimentId);
};

export default experimentManager;