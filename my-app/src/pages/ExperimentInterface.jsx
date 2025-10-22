import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useWebSocket, useDeviceManager } from '../hooks/useWebSocket';

// Configuration Modal Component
const ConfigurationModal = ({ onComplete }) => {
  const userToken = localStorage.getItem('token');

  const [experimentType, setExperimentType] = useState('distance');
  const [flashStatus, setFlashStatus] = useState('Select a sensor to begin');
  const [isFlashing, setIsFlashing] = useState(false);

  // Use device manager for scanning and selection
  const {
    devices,
    isScanning,
    isConnected,
    scanDevices,
    selectDevice,
  } = useDeviceManager(userToken);

  // Initial scan when connected
  useEffect(() => {
    if (isConnected && !isScanning && devices.length === 0) {
      scanDevices();
    }
  }, [isConnected, isScanning, devices.length, scanDevices]);

  const handleFlash = async (device) => {
    setIsFlashing(true);
    setFlashStatus('Allocating device...');

    try {
      // Select device via device manager
      selectDevice(device.id);
      await new Promise(resolve => setTimeout(resolve, 500));

      setFlashStatus('Flashing firmware via OTA...');
      
      const response = await fetch(`http://${window.location.hostname}:5000/api/sensor/select_experiment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ 
          experiment_type: experimentType,
          device_id: device.id
        })
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.message || data.error || 'Firmware flash failed');
      }

      setFlashStatus('✓ Firmware flashed successfully');
      
      setTimeout(() => {
        const expType = experimentType === 'distance' ? 'tof' : 'oscillation';
        onComplete({ device, experimentType: expType, token: userToken });
      }, 1000);

    } catch (err) {
      console.error(err);
      setFlashStatus(`✗ Error: ${err.message}`);
      setIsFlashing(false);
    }
  };

  const tofDevices = devices.filter(d => 
    (d.sensor_type || '').toUpperCase().includes('TOF')
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-6">
          <h2 className="text-3xl font-bold text-white">Experiment Setup</h2>
          <p className="text-purple-100 mt-2">Choose experiment type and sensor device</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Experiment Type Selection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Experiment Type</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setExperimentType('distance')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  experimentType === 'distance'
                    ? 'border-purple-600 bg-purple-50 shadow-lg'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="text-2xl mb-2">📏</div>
                <div className="font-semibold text-gray-800">Displacement Analysis</div>
              </button>
              <button
                onClick={() => setExperimentType('oscillation')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  experimentType === 'oscillation'
                    ? 'border-purple-600 bg-purple-50 shadow-lg'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="text-2xl mb-2">📐</div>
                <div className="font-semibold text-gray-800">Inclined Plane Experiment</div>
              </button>
            </div>
          </div>

          {/* Device Selection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Available TOF Sensors</h3>
            <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
              {tofDevices.map(device => (
                <button
                  key={device.id}
                  onClick={() => handleFlash(device)}
                  disabled={isFlashing}
                  className="p-4 rounded-lg border-2 border-gray-200 hover:border-purple-600 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-sm font-bold text-gray-800">{device.id}</div>
                  <div className="text-xs text-gray-500 mt-1">{device.ip_address || 'Unknown IP'}</div>
                </button>
              ))}
              {tofDevices.length === 0 && (
                <div className="col-span-3 text-center py-8 text-gray-500">
                  {isScanning ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                      <span className="ml-3">Scanning for devices...</span>
                    </div>
                  ) : (
                    'No TOF devices found'
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className={`text-sm font-medium ${isFlashing ? 'text-purple-600 animate-pulse' : 'text-gray-600'}`}>
              {flashStatus}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Configuration Panel Component
const ConfigPanel = ({ config, onChange, onClose, selectedDevice, userToken }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleApplyConfiguration = async () => {
    if (!selectedDevice) {
      setStatusMessage('Error: No device selected');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Sending configuration to sensor...');

    try {
      // Convert frontend config format to backend format
      const backendConfig = {
        frequency: config.frequency_hz,
        duration: config.duration_s,
        mode: "long", // Default mode for TOF sensor
        averagingSamples: 1
      };

      const response = await fetch(`http://${window.location.hostname}:5000/api/sensor/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify(backendConfig)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatusMessage('✓ Configuration applied successfully!');
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setStatusMessage(`✗ Error: ${data.error || 'Configuration failed'}`);
      }
    } catch (error) {
      console.error('Configuration error:', error);
      setStatusMessage('✗ Error: Failed to connect to backend');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-4 rounded-t-xl">
          <h3 className="text-xl font-bold text-white">Experiment Configuration</h3>
          {selectedDevice && (
            <p className="text-purple-100 text-sm mt-1">Device: {selectedDevice.id}</p>
          )}
        </div>
        
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Frequency: {config.frequency_hz} Hz
            </label>
            <input
              type="range"
              min="10"
              max="50"
              value={config.frequency_hz}
              onChange={(e) => onChange({ ...config, frequency_hz: parseInt(e.target.value) })}
              className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>10 Hz</span>
              <span>50 Hz</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Max Distance: {config.max_distance_cm} cm
            </label>
            <input
              type="range"
              min="100"
              max="200"
              value={config.max_distance_cm}
              onChange={(e) => onChange({ ...config, max_distance_cm: parseInt(e.target.value) })}
              className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>100 cm</span>
              <span>200 cm</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Duration: {config.duration_s} s
            </label>
            <input
              type="range"
              min="1"
              max="60"
              value={config.duration_s}
              onChange={(e) => onChange({ ...config, duration_s: parseInt(e.target.value) })}
              className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 s</span>
              <span>60 s</span>
            </div>
          </div>

          {statusMessage && (
            <div className={`text-sm font-medium text-center ${
              statusMessage.includes('✓') ? 'text-green-600' : 
              statusMessage.includes('✗') ? 'text-red-600' : 'text-blue-600'
            }`}>
              {statusMessage}
            </div>
          )}

          <button
            onClick={handleApplyConfiguration}
            disabled={isSubmitting || !selectedDevice}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-800 text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Applying...' : 'Apply Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Graph Component
const ExperimentGraph = ({ experimentType, token }) => {
  const [experimentData, setExperimentData] = useState([]);
  const [activeView, setActiveView] = useState('S');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [status, setStatus] = useState('idle');

  const { sendMessage, addMessageHandler } = useWebSocket(token, true);

  useEffect(() => {
    const handler = (data) => {
      if (data.type === 'experiment_data' && data.experiment_type === experimentType) {
        setExperimentData(prev => [...prev, {
          time: data.data.timestamp || Date.now(),
          displacement: data.data.displacement || 0,
          velocity: data.data.velocity || 0,
          acceleration: data.data.acceleration || 0
        }]);
      } else if (data.type === 'experiment_started') {
        setIsRunning(true);
        setIsPaused(false);
        setStatus('running');
      } else if (data.type === 'experiment_stopped') {
        setIsRunning(false);
        setIsPaused(false);
        setStatus('stopped');
      } else if (data.type === 'experiment_paused') {
        setIsPaused(true);
        setStatus('paused');
      } else if (data.type === 'experiment_resumed') {
        setIsPaused(false);
        setStatus('running');
      }
    };
    return addMessageHandler(handler);
  }, [addMessageHandler, experimentType]);

  const handleStart = () => {
    setExperimentData([]);
    sendMessage({ action: 'start_experiment', experiment_type: experimentType });
  };

  const handlePause = () => {
    if (isPaused) {
      sendMessage({ action: 'resume_experiment' });
    } else {
      sendMessage({ action: 'pause_experiment' });
    }
  };

  const handleStop = () => {
    sendMessage({ action: 'stop_experiment' });
  };

  const chartData = experimentData.slice(-100).map((point, idx) => ({
    ...point,
    timeDisplay: (point.time / 1000).toFixed(2)
  }));

  const getYAxisData = () => {
    switch (activeView) {
      case 'V': return 'velocity';
      case 'a': return 'acceleration';
      default: return 'displacement';
    }
  };

  const getYAxisLabel = () => {
    switch (activeView) {
      case 'V': return 'Velocity (cm/s)';
      case 'a': return 'Acceleration (cm/s²)';
      default: return 'Displacement (cm)';
    }
  };

  const getLineColor = () => {
    switch (activeView) {
      case 'V': return '#10b981';
      case 'a': return '#f59e0b';
      default: return '#667eea';
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={handleStart}
          disabled={isRunning}
          className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Start
        </button>
        <button
          onClick={handlePause}
          disabled={!isRunning}
          className="px-6 py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={handleStop}
          disabled={!isRunning}
          className="px-6 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Stop
        </button>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2">
        {['S', 'V', 'a'].map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              activeView === view
                ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {view === 'S' ? 'S - t' : view === 'V' ? 'V - t' : 'a - t'}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-md p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timeDisplay" />
            <YAxis dataKey={getYAxisData()} label={{ value: getYAxisLabel(), angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line type="monotone" dataKey={getYAxisData()} stroke={getLineColor()} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const ExperimentInterface = () => {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState({ frequency_hz: 20, max_distance_cm: 150, duration_s: 10 });
  const [experimentType, setExperimentType] = useState('tof');
const [showConfigPanel, setShowConfigPanel] = useState(false);
const userToken = localStorage.getItem('token');
const [selectedDevice, setSelectedDevice] = useState(null);

  // Initialize from localStorage: if we have a saved device and experiment, skip config modal
  useEffect(() => {
    const savedDeviceStr = localStorage.getItem('selectedDevice');
    const savedExpType = localStorage.getItem('experimentType');
    if (savedDeviceStr && savedExpType) {
      try {
        const savedDevice = JSON.parse(savedDeviceStr);
        setSelectedDevice(savedDevice);
        setExperimentType(savedExpType);
        setShowConfigModal(false);
      } catch (e) {
        setShowConfigModal(true);
      }
    } else {
      setShowConfigModal(true);
    }
  }, []);

  const handleComplete = ({ device, experimentType: expType, token }) => {
    // Persist selection so subsequent visits skip the configuration modal
    localStorage.setItem('selectedDevice', JSON.stringify(device));
    localStorage.setItem('experimentType', expType);

    setSelectedDevice(device);
  setExperimentType(expType);
  setShowConfigPanel(false);
  setShowConfigModal(false);
};

  return (
    <div className="p-6 space-y-6">
      {showConfigModal && <ConfigurationModal onComplete={handleComplete} />}

      {!showConfigModal && (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Experiment Controls</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfigPanel(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
              Configuration
            </button>
            <button
              onClick={() => setShowConfigModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700"
            >
              Change Device / Experiment
            </button>
          </div>
        </div>

        {showConfigPanel && (
          <ConfigPanel 
            config={config}
            onChange={setConfig}
            onClose={() => setShowConfigPanel(false)}
            selectedDevice={selectedDevice}
            userToken={userToken}
          />
        )}
        <ExperimentGraph experimentType={experimentType} token={userToken} />
      </div>
    )}
  </div>
);
};

export default ExperimentInterface;