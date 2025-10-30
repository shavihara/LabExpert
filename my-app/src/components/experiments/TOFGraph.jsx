// components/experiments/TOFGraph.jsx
// Time-of-Flight displacement experiment component
import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useExperimentManager } from '../../hooks/useWebSocket';
import './ExperimentGraph.css';

const TOFGraph = ({ token, isActive, onDataUpdate, externalConfig }) => {
  const [config, setConfig] = useState({
    samplingRate: 100,
    maxDistance: 400,
    calibrationDistance: 0,
    smoothingFactor: 0.1,
    velocityThreshold: 1.0,
    accelerationThreshold: 0.5
  });
  const [activeView, setActiveView] = useState('S'); // 'S' | 'V' | 'a'
  const [showConfig, setShowConfig] = useState(false);
  const [analysis, setAnalysis] = useState({
    maxVelocity: 0,
    maxAcceleration: 0,
    totalDistance: 0,
    motionType: 'stationary'
  });

  const {
    isRunning,
    isPaused,
    experimentData,
    experimentStatus,
    experimentError,
    startExperiment,
    pauseExperiment,
    resumeExperiment,
    stopExperiment,
    configureExperiment,
    resetExperiment,
    isConnected
  } = useExperimentManager(token, 'tof');

  // Sync external config from parent (frequency, max distance, duration)
  useEffect(() => {
    if (!externalConfig) return;
    const mapped = {
      samplingRate: externalConfig.frequency_hz ?? config.samplingRate,
      maxDistance: externalConfig.max_distance_cm ?? config.maxDistance,
    };
    setConfig(prev => ({ ...prev, ...mapped }));
    if (isConnected) {
      configureExperiment({ ...config, ...mapped, duration_s: externalConfig.duration_s });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalConfig]);

  // Process and format data for chart
  const chartData = useMemo(() => {
    return experimentData.map((point, index) => ({
      time: point.timestamp || index * (1000 / config.samplingRate),
      displacement: point.displacement || 0,
      velocity: point.velocity || 0,
      acceleration: point.acceleration || 0,
      rawDistance: point.raw_distance || 0
    }));
  }, [experimentData, config.samplingRate]);

  // Update analysis when data changes
  useEffect(() => {
    if (experimentData.length > 0) {
      const latest = experimentData[experimentData.length - 1];
      const newAnalysis = {
        maxVelocity: Math.max(analysis.maxVelocity, Math.abs(latest.velocity || 0)),
        maxAcceleration: Math.max(analysis.maxAcceleration, Math.abs(latest.acceleration || 0)),
        totalDistance: latest.total_distance || 0,
        motionType: latest.motion_type || 'stationary'
      };
      setAnalysis(newAnalysis);
      
      // Notify parent component
      if (onDataUpdate) {
        onDataUpdate({
          type: 'tof',
          data: latest,
          analysis: newAnalysis,
          totalPoints: experimentData.length
        });
      }
    }
  }, [experimentData, onDataUpdate]);

  // Handle configuration changes
  const handleConfigChange = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    
    if (isConnected) {
      configureExperiment(newConfig);
    }
  };

  // Handle experiment controls
  const handleStart = () => {
    resetExperiment();
    setAnalysis({
      maxVelocity: 0,
      maxAcceleration: 0,
      totalDistance: 0,
      motionType: 'stationary'
    });
    startExperiment(config, 'tof');
  };

  const handlePause = () => {
    if (isPaused) {
      resumeExperiment();
    } else {
      pauseExperiment();
    }
  };

  const handleStop = () => {
    stopExperiment();
  };

  const handleReset = () => {
    resetExperiment();
    setAnalysis({
      maxVelocity: 0,
      maxAcceleration: 0,
      totalDistance: 0,
      motionType: 'stationary'
    });
  };

  // Calibrate sensor
  const handleCalibrate = () => {
    if (isConnected) {
      configureExperiment({ ...config, calibrate: true });
    }
  };

  // Build table columns based on active view
  const tableColumns = useMemo(() => {
    if (activeView === 'S') return ['time', 'displacement'];
    if (activeView === 'V') return ['time', 'velocity'];
    return ['time', 'acceleration'];
  }, [activeView]);

  return (
    <div className="experiment-container">
      <div className="experiment-header">
        <h3>Time-of-Flight Displacement Measurement</h3>
        <div className="experiment-status">
          <span className={`status-indicator ${experimentStatus}`}>
            {experimentStatus.toUpperCase()}
          </span>
          <span className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {experimentError && (
        <div className="error-message">
          Error: {experimentError}
        </div>
      )}

      <div className="experiment-controls">
        <button 
          onClick={handleStart} 
          disabled={!isConnected || isRunning}
          className="btn-start"
        >
          Start
        </button>
        <button 
          onClick={handlePause} 
          disabled={!isConnected || !isRunning}
          className="btn-pause"
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button 
          onClick={handleStop} 
          disabled={!isConnected || !isRunning}
          className="btn-stop"
        >
          Stop
        </button>
        <button 
          onClick={handleReset} 
          disabled={!isConnected || isRunning}
          className="btn-reset"
        >
          Reset
        </button>
        <button 
          onClick={handleCalibrate} 
          disabled={!isConnected || isRunning}
          className="btn-calibrate"
        >
          Calibrate
        </button>
        <button 
          onClick={() => setShowConfig(!showConfig)}
          className="btn-config"
        >
          Config
        </button>
      </div>

      {/* View tabs for S/V/a */}
      <div className="view-tabs">
        <button className={`tab ${activeView === 'S' ? 'active' : ''}`} onClick={() => setActiveView('S')}>S - t</button>
        <button className={`tab ${activeView === 'V' ? 'active' : ''}`} onClick={() => setActiveView('V')}>V - t</button>
        <button className={`tab ${activeView === 'a' ? 'active' : ''}`} onClick={() => setActiveView('a')}>a - t</button>
      </div>

      {showConfig && (
        <div className="config-panel">
          <h4>Configuration</h4>
          <div className="config-grid">
            <div className="config-item">
              <label>Sampling Rate (Hz):</label>
              <input
                type="number"
                value={config.samplingRate}
                onChange={(e) => handleConfigChange('samplingRate', parseInt(e.target.value))}
                min="1"
                max="1000"
              />
            </div>
            <div className="config-item">
              <label>Max Distance (cm):</label>
              <input
                type="number"
                value={config.maxDistance}
                onChange={(e) => handleConfigChange('maxDistance', parseInt(e.target.value))}
                min="10"
                max="1000"
              />
            </div>
            <div className="config-item">
              <label>Smoothing Factor:</label>
              <input
                type="number"
                step="0.01"
                value={config.smoothingFactor}
                onChange={(e) => handleConfigChange('smoothingFactor', parseFloat(e.target.value))}
                min="0"
                max="1"
              />
            </div>
            <div className="config-item">
              <label>Velocity Threshold (cm/s):</label>
              <input
                type="number"
                step="0.1"
                value={config.velocityThreshold}
                onChange={(e) => handleConfigChange('velocityThreshold', parseFloat(e.target.value))}
                min="0"
                max="100"
              />
            </div>
          </div>
        </div>
      )}

      <div className="chart-and-table">
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value) => `${(value / 1000).toFixed(1)}s`}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => `Time: ${(value / 1000).toFixed(2)}s`}
                formatter={(value, name) => [
                  `${parseFloat(value).toFixed(2)} ${name === 'displacement' ? 'cm' : name === 'velocity' ? 'cm/s' : 'cm/s²'}`,
                  name.charAt(0).toUpperCase() + name.slice(1)
                ]}
              />
              <Legend />
              {(activeView === 'S') && (
                <Line 
                  type="monotone" 
                  dataKey="displacement" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  dot={false}
                  name="Displacement"
                />
              )}
              {(activeView === 'V') && (
                <Line 
                  type="monotone" 
                  dataKey="velocity" 
                  stroke="#82ca9d" 
                  strokeWidth={2}
                  dot={false}
                  name="Velocity"
                />
              )}
              {(activeView === 'a') && (
                <Line 
                  type="monotone" 
                  dataKey="acceleration" 
                  stroke="#ffc658" 
                  strokeWidth={2}
                  dot={false}
                  name="Acceleration"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="data-table">
          <div className="table-header">
            <span>Time (s)</span>
            {activeView === 'S' && <span>Displacement (cm)</span>}
            {activeView === 'V' && <span>Velocity (cm/s)</span>}
            {activeView === 'a' && <span>Acceleration (cm/s²)</span>}
          </div>
          <div className="table-body">
            {chartData.slice(-50).map((row, idx) => (
              <div className="table-row" key={idx}>
                <span>{(row.time / 1000).toFixed(2)}</span>
                {activeView === 'S' && <span>{row.displacement.toFixed(2)}</span>}
                {activeView === 'V' && <span>{row.velocity.toFixed(2)}</span>}
                {activeView === 'a' && <span>{row.acceleration.toFixed(2)}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="data-summary">
        <p>
          <strong>Current Reading:</strong> 
          {chartData.length > 0 && (
            <>
              {' '}Displacement: {chartData[chartData.length - 1]?.displacement?.toFixed(2) || 0} cm, 
              Velocity: {chartData[chartData.length - 1]?.velocity?.toFixed(2) || 0} cm/s
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default TOFGraph;