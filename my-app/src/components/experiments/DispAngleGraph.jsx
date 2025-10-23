// components/experiments/DispAngleGraph.jsx
// Displacement + Angle experiment component for MPU6050/gyroscope measurements
import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { useExperimentManager } from '../../hooks/useWebSocket';
import './ExperimentGraph.css';

const DispAngleGraph = ({ token, isActive, onDataUpdate }) => {
  const [config, setConfig] = useState({
    samplingRate: 100,
    accelerometerRange: 2, // ±2g
    gyroscopeRange: 250, // ±250°/s
    complementaryFilterAlpha: 0.98,
    calibrationSamples: 100,
    motionThreshold: 0.1,
    angleOffset: { x: 0, y: 0, z: 0 }
  });
  
  const [showConfig, setShowConfig] = useState(false);
  const [analysis, setAnalysis] = useState({
    currentAngles: { x: 0, y: 0, z: 0 },
    angularVelocities: { x: 0, y: 0, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    motionType: 'stationary',
    oscillationFrequency: 0,
    maxAngularDisplacement: 0
  });

  const [viewMode, setViewMode] = useState('angles'); // 'angles', 'gyro', 'accel', 'motion', 'radar'

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
  } = useExperimentManager(token, 'displacement_angle');

  // Process and format data for chart
  const chartData = useMemo(() => {
    return experimentData.map((point, index) => ({
      time: point.timestamp || index * (1000 / config.samplingRate),
      angleX: point.angle_x || 0,
      angleY: point.angle_y || 0,
      angleZ: point.angle_z || 0,
      gyroX: point.gyro_x || 0,
      gyroY: point.gyro_y || 0,
      gyroZ: point.gyro_z || 0,
      accelX: point.accel_x || 0,
      accelY: point.accel_y || 0,
      accelZ: point.accel_z || 0,
      totalAccel: point.total_acceleration || 0,
      totalAngularVel: point.total_angular_velocity || 0
    }));
  }, [experimentData, config.samplingRate]);

  // Motion analysis data
  const motionData = useMemo(() => {
    return experimentData
      .filter(point => point.motion_event)
      .map((point, index) => ({
        time: point.timestamp || 0,
        motionType: point.motion_type || 'unknown',
        intensity: point.motion_intensity || 0,
        duration: point.motion_duration || 0
      }));
  }, [experimentData]);

  // Radar chart data for current orientation
  const radarData = useMemo(() => {
    if (chartData.length === 0) return [];
    
    const latest = chartData[chartData.length - 1];
    return [
      { axis: 'Angle X', value: Math.abs(latest.angleX) },
      { axis: 'Angle Y', value: Math.abs(latest.angleY) },
      { axis: 'Angle Z', value: Math.abs(latest.angleZ) },
      { axis: 'Gyro X', value: Math.abs(latest.gyroX) / 10 }, // Scale for visibility
      { axis: 'Gyro Y', value: Math.abs(latest.gyroY) / 10 },
      { axis: 'Gyro Z', value: Math.abs(latest.gyroZ) / 10 }
    ];
  }, [chartData]);

  // Update analysis when data changes
  useEffect(() => {
    if (experimentData.length > 0) {
      const latest = experimentData[experimentData.length - 1];
      const newAnalysis = {
        currentAngles: {
          x: latest.angle_x || 0,
          y: latest.angle_y || 0,
          z: latest.angle_z || 0
        },
        angularVelocities: {
          x: latest.gyro_x || 0,
          y: latest.gyro_y || 0,
          z: latest.gyro_z || 0
        },
        acceleration: {
          x: latest.accel_x || 0,
          y: latest.accel_y || 0,
          z: latest.accel_z || 0
        },
        motionType: latest.motion_type || 'stationary',
        oscillationFrequency: latest.oscillation_frequency || 0,
        maxAngularDisplacement: latest.max_angular_displacement || 0
      };
      setAnalysis(newAnalysis);
      
      // Notify parent component
      if (onDataUpdate) {
        onDataUpdate({
          type: 'displacement_angle',
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
      currentAngles: { x: 0, y: 0, z: 0 },
      angularVelocities: { x: 0, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
      motionType: 'stationary',
      oscillationFrequency: 0,
      maxAngularDisplacement: 0
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
      currentAngles: { x: 0, y: 0, z: 0 },
      angularVelocities: { x: 0, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
      motionType: 'stationary',
      oscillationFrequency: 0,
      maxAngularDisplacement: 0
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
      case 'gyro':
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
                formatter={(value, name) => [`${parseFloat(value).toFixed(2)}°/s`, name]}
              />
              <Legend />
              <Line type="monotone" dataKey="gyroX" stroke="#ff0000" strokeWidth={2} dot={false} name="Gyro X" />
              <Line type="monotone" dataKey="gyroY" stroke="#00ff00" strokeWidth={2} dot={false} name="Gyro Y" />
              <Line type="monotone" dataKey="gyroZ" stroke="#0000ff" strokeWidth={2} dot={false} name="Gyro Z" />
            </LineChart>
          </ResponsiveContainer>
        );
      
      case 'accel':
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
                formatter={(value, name) => [`${parseFloat(value).toFixed(2)}g`, name]}
              />
              <Legend />
              <Line type="monotone" dataKey="accelX" stroke="#ff0000" strokeWidth={2} dot={false} name="Accel X" />
              <Line type="monotone" dataKey="accelY" stroke="#00ff00" strokeWidth={2} dot={false} name="Accel Y" />
              <Line type="monotone" dataKey="accelZ" stroke="#0000ff" strokeWidth={2} dot={false} name="Accel Z" />
            </LineChart>
          </ResponsiveContainer>
        );
      
      case 'motion':
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
                  `${parseFloat(value).toFixed(2)}${name.includes('Accel') ? 'g' : '°/s'}`,
                  name
                ]}
              />
              <Legend />
              <Line type="monotone" dataKey="totalAccel" stroke="#ff7300" strokeWidth={2} dot={false} name="Total Acceleration" />
              <Line type="monotone" dataKey="totalAngularVel" stroke="#8884d8" strokeWidth={2} dot={false} name="Total Angular Velocity" />
            </LineChart>
          </ResponsiveContainer>
        );
      
      case 'radar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="axis" />
              <PolarRadiusAxis angle={90} domain={[0, 180]} />
              <Radar name="Current State" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        );
      
      default: // angles
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
                formatter={(value, name) => [`${parseFloat(value).toFixed(2)}°`, name]}
              />
              <Legend />
              <Line type="monotone" dataKey="angleX" stroke="#ff0000" strokeWidth={2} dot={false} name="Angle X" />
              <Line type="monotone" dataKey="angleY" stroke="#00ff00" strokeWidth={2} dot={false} name="Angle Y" />
              <Line type="monotone" dataKey="angleZ" stroke="#0000ff" strokeWidth={2} dot={false} name="Angle Z" />
            </LineChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <div className="experiment-container">
      <div className="experiment-header">
        <h3>Displacement + Angle Analysis (MPU6050)</h3>
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
          onClick={() => setViewMode('angles')}
          className={viewMode === 'angles' ? 'active' : ''}
        >
          Angles
        </button>
        <button 
          onClick={() => setViewMode('gyro')}
          className={viewMode === 'gyro' ? 'active' : ''}
        >
          Gyroscope
        </button>
        <button 
          onClick={() => setViewMode('accel')}
          className={viewMode === 'accel' ? 'active' : ''}
        >
          Accelerometer
        </button>
        <button 
          onClick={() => setViewMode('motion')}
          className={viewMode === 'motion' ? 'active' : ''}
        >
          Motion
        </button>
        <button 
          onClick={() => setViewMode('radar')}
          className={viewMode === 'radar' ? 'active' : ''}
        >
          Radar
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
              <label>Accel Range (±g):</label>
              <select
                value={config.accelerometerRange}
                onChange={(e) => handleConfigChange('accelerometerRange', parseInt(e.target.value))}
              >
                <option value={2}>±2g</option>
                <option value={4}>±4g</option>
                <option value={8}>±8g</option>
                <option value={16}>±16g</option>
              </select>
            </div>
            <div className="config-item">
              <label>Gyro Range (±°/s):</label>
              <select
                value={config.gyroscopeRange}
                onChange={(e) => handleConfigChange('gyroscopeRange', parseInt(e.target.value))}
              >
                <option value={250}>±250°/s</option>
                <option value={500}>±500°/s</option>
                <option value={1000}>±1000°/s</option>
                <option value={2000}>±2000°/s</option>
              </select>
            </div>
            <div className="config-item">
              <label>Filter Alpha:</label>
              <input
                type="number"
                step="0.01"
                value={config.complementaryFilterAlpha}
                onChange={(e) => handleConfigChange('complementaryFilterAlpha', parseFloat(e.target.value))}
                min="0"
                max="1"
              />
            </div>
            <div className="config-item">
              <label>Motion Threshold:</label>
              <input
                type="number"
                step="0.01"
                value={config.motionThreshold}
                onChange={(e) => handleConfigChange('motionThreshold', parseFloat(e.target.value))}
                min="0"
                max="5"
              />
            </div>
          </div>
        </div>
      )}

      <div className="analysis-panel">
        <h4>Real-time Analysis</h4>
        <div className="analysis-grid">
          <div className="analysis-item">
            <span>Motion Type:</span>
            <span className={`motion-type ${analysis.motionType}`}>
              {analysis.motionType}
            </span>
          </div>
          <div className="analysis-item">
            <span>Angles (X,Y,Z):</span>
            <span>
              {analysis.currentAngles.x.toFixed(1)}°, 
              {analysis.currentAngles.y.toFixed(1)}°, 
              {analysis.currentAngles.z.toFixed(1)}°
            </span>
          </div>
          <div className="analysis-item">
            <span>Angular Vel (X,Y,Z):</span>
            <span>
              {analysis.angularVelocities.x.toFixed(1)}, 
              {analysis.angularVelocities.y.toFixed(1)}, 
              {analysis.angularVelocities.z.toFixed(1)} °/s
            </span>
          </div>
          <div className="analysis-item">
            <span>Acceleration (X,Y,Z):</span>
            <span>
              {analysis.acceleration.x.toFixed(2)}, 
              {analysis.acceleration.y.toFixed(2)}, 
              {analysis.acceleration.z.toFixed(2)} g
            </span>
          </div>
          <div className="analysis-item">
            <span>Oscillation Freq:</span>
            <span>{analysis.oscillationFrequency.toFixed(2)} Hz</span>
          </div>
          <div className="analysis-item">
            <span>Max Angular Disp:</span>
            <span>{analysis.maxAngularDisplacement.toFixed(1)}°</span>
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
              {' '}Angle X: {analysis.currentAngles.x.toFixed(1)}°, 
              Y: {analysis.currentAngles.y.toFixed(1)}°, 
              Z: {analysis.currentAngles.z.toFixed(1)}°
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default DispAngleGraph;