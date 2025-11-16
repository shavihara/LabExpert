// Experiments Module - Centralized experiment system exports
export { experimentManager, registerExperiment, registerComponent, registerDataProcessor, getExperimentComponent, getExperimentDataProcessor } from './experimentRegistry';
export { experimentRegistry, getExperimentConfig, parseExperimentId } from './experimentConfig';
export { default as experimentConfig } from './experimentConfig';

// Re-export experiment utilities
export * from '../utils/experimentUtils';
