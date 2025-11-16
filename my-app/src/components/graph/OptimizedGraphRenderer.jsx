import React, { memo, useCallback, useMemo } from 'react';
import UniversalGraphRenderer from '../graph/UniversalGraphRenderer';
import { usePerformanceMonitor, useDebouncedCallback, useThrottledCallback } from '../../hooks/usePerformance';
import { useExperimentStore } from '../../stores/experimentStore';
import { LoadingSpinner } from '../ui-system/ResponsiveUI';
import ErrorBoundary from '../common/ErrorBoundary';

const OptimizedGraphRenderer = memo(({ experimentId, rawData, onDataUpdate, onExport, sharedWebSocket, experimentType }) => {
  // Performance monitoring
  const { renderCount } = usePerformanceMonitor('OptimizedGraphRenderer');
  
  // Zustand store integration
  const {
    experimentData,
    experimentStatus,
    setExperimentData,
    addExperimentData
  } = useExperimentStore();

  // Memoized data processing to prevent unnecessary re-renders
  const processedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    
    // Process data only when rawData changes significantly
    return rawData.map((item, index) => ({
      ...item,
      id: item.id || `${experimentId}-${index}-${Date.now()}`,
      timestamp: item.timestamp || Date.now()
    }));
  }, [rawData, experimentId]);

  // Debounced data update callback to prevent excessive re-renders
  const debouncedDataUpdate = useDebouncedCallback((update) => {
    if (onDataUpdate) {
      onDataUpdate(update);
    }
    
    // Update store
    if (update.action === 'add' && update.data) {
      addExperimentData(update.data);
    }
  }, 100);

  // Throttled export callback for performance
  const throttledExport = useThrottledCallback((exportData) => {
    if (onExport) {
      onExport(exportData);
    }
  }, 500);

  // Memoized event handlers to prevent unnecessary re-renders
  const handleDataUpdate = useCallback((update) => {
    debouncedDataUpdate(update);
  }, [debouncedDataUpdate]);

  const handleExport = useCallback((exportData) => {
    throttledExport(exportData);
  }, [throttledExport]);

  // Performance optimization: only render if essential props change
  const shouldRender = useMemo(() => {
    return experimentId && processedData;
  }, [experimentId, processedData]);

  if (!shouldRender) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-2 text-gray-500">Preparing graph renderer...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="relative">
        {/* Performance indicator (can be hidden in production) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute top-2 right-2 z-10 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-50">
            Renders: {renderCount}
          </div>
        )}
        
        <UniversalGraphRenderer
          experimentId={experimentId}
          rawData={processedData}
          onDataUpdate={handleDataUpdate}
          onExport={handleExport}
          sharedWebSocket={sharedWebSocket}
          experimentType={experimentType}
        />
      </div>
    </ErrorBoundary>
  );
});

// Display name for debugging
OptimizedGraphRenderer.displayName = 'OptimizedGraphRenderer';

// Custom comparison function for additional optimization
OptimizedGraphRenderer.areEqual = (prevProps, nextProps) => {
  // Only re-render if essential props change
  return (
    prevProps.experimentId === nextProps.experimentId &&
    prevProps.rawData === nextProps.rawData &&
    prevProps.onDataUpdate === nextProps.onDataUpdate &&
    prevProps.onExport === nextProps.onExport
  );
};

export default OptimizedGraphRenderer;