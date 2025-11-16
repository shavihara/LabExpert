import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, BarChart, Bar, AreaChart, Area } from 'recharts';
import { Play, Pause, Square, RotateCcw, Download, Settings, Info } from 'lucide-react';
import { experimentManager, getExperimentComponent } from '../../experiments/experimentRegistry';
import { getExperimentConfig } from '../../experiments/experimentConfig';
import { transformExperimentData, formatExperimentData } from '../../utils/experimentUtils';
import { ResponsiveCard, ResponsiveButton, StatusIndicator } from '../ui-system/ResponsiveUI';

const UniversalGraphRenderer = ({ experimentId, rawData, onDataUpdate, onExport, sharedWebSocket, experimentType }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [processedData, setProcessedData] = useState([]);
  const [selectedYAxis, setSelectedYAxis] = useState('');
  const [graphConfig, setGraphConfig] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({});

  // Load experiment configuration
  const experimentConfig = useMemo(() => {
    try {
      const cfg = getExperimentConfig(experimentId, `${experimentId}.1`);
      return cfg?.subExperiment ? cfg.subExperiment : null;
    } catch (error) {
      console.error('Error loading experiment config:', error);
      setError(`Failed to load experiment configuration: ${error.message}`);
      return null;
    }
  }, [experimentId]);

  // Initialize graph configuration
  useEffect(() => {
    if (experimentConfig?.graphConfig) {
      const gc = experimentConfig.graphConfig;
      const yAxes = Array.isArray(gc.yAxes)
        ? gc.yAxes.map((y, i) => (typeof y === 'string' ? { key: y, label: (gc.yAxisLabels && gc.yAxisLabels[i]) || y } : y))
        : [];
      const normalized = {
        type: gc.type || 'line',
        xAxis: gc.xAxis,
        yAxis: yAxes,
        colors: gc.colors || [],
        showGrid: gc.showGrid !== false,
        showLegend: gc.showLegend !== false
      };
      setGraphConfig(normalized);
      if (yAxes.length > 0) {
        setSelectedYAxis(yAxes[0].key);
      }
    }
  }, [experimentConfig]);

  // Process raw data when it changes
  useEffect(() => {
    if (rawData && experimentConfig) {
      try {
        const transformed = transformExperimentData(rawData, experimentId, `${experimentId}.1`);
        setProcessedData(transformed);
        
        // Calculate statistics
        const newStats = calculateStats(transformed, experimentConfig);
        setStats(newStats);
        
        setError(null);
      } catch (error) {
        console.error('Error processing data:', error);
        setError(`Data processing error: ${error.message}`);
      }
    }
  }, [rawData, experimentConfig, experimentId]);

  // Calculate statistics
  const calculateStats = (data, config) => {
    if (!data || data.length === 0) return {};

    const stats = {};
    const fields = config.dataFields || [];

    fields.forEach(field => {
      const key = typeof field === 'string' ? field : field.key;
      const values = data.map(item => item[key]).filter(val => val != null && !isNaN(val));
      if (values.length > 0) {
        stats[key] = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length
        };
      }
    });

    return stats;
  };

  // Control functions
  const handleStart = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    setStatus('running');
    if (onDataUpdate) {
      onDataUpdate({ action: 'start' });
    }
    if (sharedWebSocket?.sendMessage && experimentType) {
      sharedWebSocket.sendMessage({ action: 'start_experiment', experiment_type: experimentType });
    }
  }, [onDataUpdate]);

  const handlePause = useCallback(() => {
    setIsPaused(!isPaused);
    setStatus(isPaused ? 'running' : 'paused');
    if (onDataUpdate) {
      onDataUpdate({ action: isPaused ? 'resume' : 'pause' });
    }
    if (sharedWebSocket?.sendMessage) {
      sharedWebSocket.sendMessage({ action: isPaused ? 'resume_experiment' : 'pause_experiment' });
    }
  }, [isPaused, onDataUpdate]);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setStatus('stopped');
    if (onDataUpdate) {
      onDataUpdate({ action: 'stop' });
    }
    if (sharedWebSocket?.sendMessage) {
      sharedWebSocket.sendMessage({ action: 'stop_experiment' });
    }
  }, [onDataUpdate]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setProcessedData([]);
    setStatus('idle');
    setStats({});
    if (onDataUpdate) {
      onDataUpdate({ action: 'reset' });
    }
  }, [onDataUpdate]);

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport({
        data: processedData,
        config: experimentConfig,
        stats: stats
      });
    }
  }, [processedData, experimentConfig, stats, onExport]);

  // Render different chart types based on configuration
  const renderChart = () => {
    if (!graphConfig || processedData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <Info className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No data available</p>
          </div>
        </div>
      );
    }

    const { type, xAxis, yAxis, colors, showGrid, showLegend } = graphConfig;

    const chartProps = {
      data: processedData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    const renderChartContent = () => {
      switch (type) {
        case 'scatter':
          return (
            <ScatterChart {...chartProps}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xAxis} label={{ value: xAxis, position: 'insideBottom', offset: -10 }} />
              <YAxis label={{ value: selectedYAxis, angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              {showLegend && <Legend />}
              {yAxis.map((series, index) => (
                <Scatter
                  key={series.key}
                  name={series.label}
                  dataKey={series.key}
                  fill={colors?.[index] || `hsl(${index * 60}, 70%, 50%)`}
                />
              ))}
            </ScatterChart>
          );

        case 'bar':
          return (
            <BarChart {...chartProps}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xAxis} />
              <YAxis />
              <Tooltip />
              {showLegend && <Legend />}
              {yAxis.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  fill={colors?.[index] || `hsl(${index * 60}, 70%, 50%)`}
                  name={series.label}
                />
              ))}
            </BarChart>
          );

        case 'area':
          return (
            <AreaChart {...chartProps}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xAxis} />
              <YAxis />
              <Tooltip />
              {showLegend && <Legend />}
              {yAxis.map((series, index) => (
                <Area
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  stroke={colors?.[index] || `hsl(${index * 60}, 70%, 50%)`}
                  fill={colors?.[index] || `hsl(${index * 60}, 70%, 50%)`}
                  fillOpacity={0.6}
                  name={series.label}
                />
              ))}
            </AreaChart>
          );

        default: // line chart
          return (
            <LineChart {...chartProps}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xAxis} />
              <YAxis />
              <Tooltip />
              {showLegend && <Legend />}
              {yAxis.map((series, index) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  stroke={colors?.[index] || `hsl(${index * 60}, 70%, 50%)`}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={series.label}
                />
              ))}
            </LineChart>
          );
      }
    };

    return (
      <ResponsiveContainer width="100%" height={400}>
        {renderChartContent()}
      </ResponsiveContainer>
    );
  };

  // Y-axis selector for charts with multiple series
  const renderYAxisSelector = () => {
    if (!graphConfig?.yAxis || graphConfig.yAxis.length <= 1) return null;

    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Y-Axis Data:
        </label>
        <select
          value={selectedYAxis}
          onChange={(e) => setSelectedYAxis(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {graphConfig.yAxis.map(series => (
            <option key={series.key} value={series.key}>
              {series.label}
            </option>
          ))}
        </select>
      </div>
    );
  };

  // Statistics display
  const renderStats = () => {
    if (Object.keys(stats).length === 0) return null;

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Statistics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(stats).map(([field, fieldStats]) => (
            <div key={field} className="text-center">
              <div className="text-xs text-gray-500 capitalize">{field}</div>
              <div className="text-sm font-medium">{fieldStats.count}</div>
              <div className="text-xs text-gray-400">
                Min: {fieldStats.min?.toFixed(2)}<br/>
                Max: {fieldStats.max?.toFixed(2)}<br/>
                Avg: {fieldStats.avg?.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <ResponsiveCard className="w-full">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {experimentConfig?.name || 'Experiment Graph'}
            </h3>
            <p className="text-sm text-gray-600">
              {experimentConfig?.description || 'Real-time experiment data visualization'}
            </p>
          </div>
          <StatusIndicator status={status} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center">
              <div className="text-red-800">
                <strong>Error:</strong> {error}
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-2 mb-6">
          <ResponsiveButton
            onClick={handleStart}
            disabled={isRunning && !isPaused}
            variant={isRunning && !isPaused ? 'secondary' : 'primary'}
            size="sm"
          >
            <Play className="w-4 h-4 mr-1" />
            Start
          </ResponsiveButton>

          <ResponsiveButton
            onClick={handlePause}
            disabled={!isRunning}
            variant={isPaused ? 'primary' : 'secondary'}
            size="sm"
          >
            <Pause className="w-4 h-4 mr-1" />
            {isPaused ? 'Resume' : 'Pause'}
          </ResponsiveButton>

          <ResponsiveButton
            onClick={handleStop}
            disabled={!isRunning}
            variant="secondary"
            size="sm"
          >
            <Square className="w-4 h-4 mr-1" />
            Stop
          </ResponsiveButton>

          <ResponsiveButton
            onClick={handleReset}
            variant="secondary"
            size="sm"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </ResponsiveButton>

          <ResponsiveButton
            onClick={handleExport}
            disabled={processedData.length === 0}
            variant="secondary"
            size="sm"
          >
            <Download className="w-4 h-4 mr-1" />
            Export
          </ResponsiveButton>
        </div>

        {/* Y-Axis Selector */}
        {renderYAxisSelector()}

        {/* Chart */}
        <div className="mb-4">
          {renderChart()}
        </div>

        {/* Statistics */}
        {renderStats()}

        {/* Data Summary */}
        {processedData.length > 0 && (
          <div className="mt-4 text-xs text-gray-500 text-center">
            Showing {processedData.length} data points
            {isRunning && ' • Live data updating...'}
          </div>
        )}
      </div>
    </ResponsiveCard>
  );
};

export default UniversalGraphRenderer;
