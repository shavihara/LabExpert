// components/experiments/OscillationGraph.jsx
// Oscillation experiment component for LDR/laser-based measurements
import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { useExperimentManager } from '../../hooks/useWebSocket';
import './ExperimentGraph.css';

const OscillationGraph = ({ token, isActive, onDataUpdate }) => {
  const [config, setConfig] = useState({
    samplingRate: 200,
    threshold: 512,
    minPeriod: 0.1,
    maxPeriod: 10.0,
    dampingAnalysis: true,
    energyCalculation: true,
    peakDetectionSensitivity: 0.8
  });
  
  const [showConfig, setShowConfig] = useState(false);
  const [analysis, setAnalysis] = useState({
    frequency: 0,
    period: 0,
    amplitude: 0,
    dampingCoefficient: 0,
    energyLoss: 0,
    oscillationCount: 0,
    phaseShift: 0
  });

  const [viewMode, setViewMode] = useState('signal'); // 'signal', 'frequency', 'damping'

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
  } = useExperimentManager(token, 'oscillation');

  // Process and format data for chart
  const chartData = useMemo(() => {
    return experimentData.map((point, index) => ({
      time: point.timestamp || index * (1000 / config.samplingRate),
      signal: point.signal_value || 0,
      filtered: point.filtered_value || 0,
      envelope: point.envelope || 0,
      frequency: point.instantaneous_frequency || 0,
      amplitude: point.amplitude || 0,
      phase: point.phase || 0
    }));
  }, [experimentData, config.samplingRate]);

  // Frequency domain data
  const frequencyData = useMemo(() => {
    if (!experimentData.length) return [];
    
    const latest = experimentData[experimentData.length - 1];
    if (latest.frequency_spectrum) {
      return latest.frequency_spectrum.map((value, index) => ({
        frequency: index * (config.samplingRate / 2) / latest.frequency_spectrum.length,
        magnitude: value
      }));
    }
    return [];
  }, [experimentData, config.samplingRate]);

  // Damping analysis data
  const dampingData = useMemo(() => {
    return experimentData
      .filter(point => point.peak_amplitude !== undefined)
      .map((point, index) => ({
        oscillation: index + 1,
        amplitude: point.peak_amplitude,
        time: point.timestamp || 0,
        energy: point.energy || 0
      }));
  }, [experimentData]);

  // Update analysis when data changes
  useEffect(() => {
    if (experimentData.length > 0) {
      const latest = experimentData[experimentData.length - 1];
      const newAnalysis = {
        frequency: latest.frequency || 0,
        period: latest.period || 0,
        amplitude: latest.amplitude || 0,
        dampingCoefficient: latest.damping_coefficient || 0,
        energyLoss: latest.energy_loss_rate || 0,
        oscillationCount: latest.oscillation_count || 0,
        phaseShift: latest.phase_shift || 0
      };
      setAnalysis(newAnalysis);
      
      // Notify parent component
      if (onDataUpdate) {
        onDataUpdate({
          type: 'oscillation',
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
      frequency: 0,
      period: 0,
      amplitude: 0,
      dampingCoefficient: 0,
      energyLoss: 0,
      oscillationCount: 0,
      phaseShift: 0
    });
    startExperiment(config);
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
      frequency: 0,
      period: 0,
      amplitude: 0,
      dampingCoefficient: 0,
      energyLoss: 0,
      oscillationCount: 0,
      phaseShift: 0
    });
  };

  // Calibrate sensor
  const handleCalibrate = () => {
    if (isConnected) {
      configureExperiment({ ...config, calibrate: true });
    }
  };

  const renderChart = () => {
    switch (viewMode) {
      case 'frequency':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={frequencyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="frequency" 
                type="number"
                domain={[0, config.samplingRate / 2]}
                tickFormatter={(value) => `${value.toFixed(1)} Hz`}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => `Frequency: ${value.toFixed(2)} Hz`}
                formatter={(value) => [`${value.toFixed(3)}`, 'Magnitude']}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="magnitude" 
                stroke="#ff7300" 
                strokeWidth={2}
                dot={false}
                name="Frequency Spectrum"
              />
            </LineChart>
          </ResponsiveContainer>
        );
      
      case 'damping':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart data={dampingData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="oscillation" 
                type="number"
                domain={['dataMin', 'dataMax']}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => `Oscillation: ${value}`}
                formatter={(value, name) => [
                  `${value.toFixed(3)} ${name === 'amplitude' ? '' : 'J'}`,
                  name.charAt(0).toUpperCase() + name.slice(1)
                ]}
              />
              <Legend />
              <Scatter 
                dataKey="amplitude" 
                fill="#8884d8" 
                name="Peak Amplitude"
              />
              <Scatter 
                dataKey="energy" 
                fill="#82ca9d" 
                name="Energy"
              />
            </ScatterChart>
          </ResponsiveContainer>
        );
      
      default: // signal
        return (
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
                  `${parseFloat(value).toFixed(2)}`,
                  name.charAt(0).toUpperCase() + name.slice(1)
                ]}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="signal" 
                stroke="#8884d8" 
                strokeWidth={1}
                dot={false}
                name="Raw Signal"
              />
              <Line 
                type="monotone" 
                dataKey="filtered" 
                stroke="#82ca9d" 
                strokeWidth={2}
                dot={false}
                name="Filtered Signal"
              />
              <Line 
                type="monotone" 
                dataKey="envelope" 
                stroke="#ffc658" 
                strokeWidth={1}
                dot={false}
                name="Envelope"
              />
            </LineChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <div className="experiment-container">
      <div className="experiment-header">
        <h3>Oscillation Analysis (LDR/Laser)</h3>
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

      <div className="view-controls">
        <button 
          onClick={() => setViewMode('signal')}
          className={viewMode === 'signal' ? 'active' : ''}
        >
          Signal
        </button>
        <button 
          onClick={() => setViewMode('frequency')}
          className={viewMode === 'frequency' ? 'active' : ''}
        >
          Frequency
        </button>
        <button 
          onClick={() => setViewMode('damping')}
          className={viewMode === 'damping' ? 'active' : ''}
        >
          Damping
        </button>
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
                min="10"
                max="1000"
              />
            </div>
            <div className="config-item">
              <label>Threshold:</label>
              <input
                type="number"
                value={config.threshold}
                onChange={(e) => handleConfigChange('threshold', parseInt(e.target.value))}
                min="0"
                max="1023"
              />
            </div>
            <div className="config-item">
              <label>Min Period (s):</label>
              <input
                type="number"
                step="0.01"
                value={config.minPeriod}
                onChange={(e) => handleConfigChange('minPeriod', parseFloat(e.target.value))}
                min="0.01"
                max="1"
              />
            </div>
            <div className="config-item">
              <label>Max Period (s):</label>
              <input
                type="number"
                step="0.1"
                value={config.maxPeriod}
                onChange={(e) => handleConfigChange('maxPeriod', parseFloat(e.target.value))}
                min="1"
                max="60"
              />
            </div>
            <div className="config-item">
              <label>Peak Sensitivity:</label>
              <input
                type="number"
                step="0.1"
                value={config.peakDetectionSensitivity}
                onChange={(e) => handleConfigChange('peakDetectionSensitivity', parseFloat(e.target.value))}
                min="0.1"
                max="2"
              />
            </div>
          </div>
        </div>
      )}

      <div className="analysis-panel">
        <h4>Real-time Analysis</h4>
        <div className="analysis-grid">
          <div className="analysis-item">
            <span>Frequency:</span>
            <span>{analysis.frequency.toFixed(3)} Hz</span>
          </div>
          <div className="analysis-item">
            <span>Period:</span>
            <span>{analysis.period.toFixed(3)} s</span>
          </div>
          <div className="analysis-item">
            <span>Amplitude:</span>
            <span>{analysis.amplitude.toFixed(2)}</span>
          </div>
          <div className="analysis-item">
            <span>Damping Coeff:</span>
            <span>{analysis.dampingCoefficient.toFixed(4)}</span>
          </div>
          <div className="analysis-item">
            <span>Energy Loss:</span>
            <span>{(analysis.energyLoss * 100).toFixed(2)}%/cycle</span>
          </div>
          <div className="analysis-item">
            <span>Oscillations:</span>
            <span>{analysis.oscillationCount}</span>
          </div>
        </div>
      </div>

      <div className="chart-container">
        {renderChart()}
      </div>

      <div className="data-summary">
        <p>
          <strong>Current Reading:</strong> 
          {chartData.length > 0 && (
            <>
              {' '}Signal: {chartData[chartData.length - 1]?.signal?.toFixed(0) || 0}, 
              Frequency: {analysis.frequency.toFixed(2)} Hz, 
              Amplitude: {analysis.amplitude.toFixed(2)}
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default OscillationGraph;