import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useExperimentStore = create(
  persist(
    (set, get) => ({
      // State
      activeExperiment: null,
      experimentData: [],
      experimentStatus: 'idle', // idle, running, paused, stopped, error
      selectedExperimentId: null,
      availableDevices: [],
      connectedDevice: null,
      
      // Actions
      setActiveExperiment: (experiment) => set({ activeExperiment: experiment }),
      
      setExperimentData: (data) => set({ experimentData: data }),
      
      addExperimentData: (newData) => set((state) => ({
        experimentData: [...state.experimentData, newData]
      })),
      
      setExperimentStatus: (status) => set({ experimentStatus: status }),
      
      setSelectedExperimentId: (id) => set({ selectedExperimentId: id }),
      
      setAvailableDevices: (devices) => set({ availableDevices: devices }),
      
      setConnectedDevice: (device) => set({ connectedDevice: device }),
      
      // Experiment control actions
      startExperiment: (experimentId, deviceConfig) => set((state) => ({
        selectedExperimentId: experimentId,
        experimentStatus: 'running',
        experimentData: []
      })),
      
      pauseExperiment: () => set({ experimentStatus: 'paused' }),
      
      resumeExperiment: () => set({ experimentStatus: 'running' }),
      
      stopExperiment: () => set({ experimentStatus: 'stopped' }),
      
      resetExperiment: () => set({
        experimentStatus: 'idle',
        experimentData: [],
        activeExperiment: null,
        selectedExperimentId: null
      }),
      
      // Utility functions
      clearExperimentData: () => set({ experimentData: [] }),
      
      getExperimentStats: () => {
        const { experimentData, activeExperiment } = get();
        if (!activeExperiment || experimentData.length === 0) return {};
        
        const stats = {};
        const fields = activeExperiment.dataFields || [];
        
        fields.forEach(field => {
          const values = experimentData.map(item => item[field.key]).filter(val => val != null && !isNaN(val));
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
      },
      
      // Selectors
      isExperimentRunning: () => get().experimentStatus === 'running',
      isExperimentPaused: () => get().experimentStatus === 'paused',
      hasActiveExperiment: () => get().activeExperiment !== null,
      getCurrentExperimentId: () => get().selectedExperimentId,
      getExperimentDataCount: () => get().experimentData.length
    }),
    {
      name: 'experiment-store',
      partialize: (state) => ({
        // Only persist certain parts of the state
        selectedExperimentId: state.selectedExperimentId,
        experimentData: state.experimentData,
        experimentStatus: state.experimentStatus
      })
    }
  )
);