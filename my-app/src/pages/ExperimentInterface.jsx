import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useWebSocket, useDeviceManager } from '../hooks/useWebSocket';
import { 
  FiSettings, FiBarChart2, FiPlay, FiPause, FiStopCircle, FiX, FiCheckCircle, 
  FiAlertTriangle, FiLoader, FiWifi, FiWifiOff, FiZap, FiLogOut, FiRepeat 
} from 'react-icons/fi'; // Added icons

// =================================================================================
// Configuration Modal Component
// =================================================================================
const ConfigurationModal = ({ onComplete }) => {
  const userToken = localStorage.getItem('token');
  const [experimentType, setExperimentType] = useState('distance');
  const [flashStatus, setFlashStatus] = useState('Select a sensor to begin');
  const [isFlashing, setIsFlashing] = useState(false);

  const {
    devices,
    isScanning,
    isConnected,
    scanDevices,
    selectDevice,
  } = useDeviceManager(userToken);

  useEffect(() => {
    if (isConnected && !isScanning && devices.length === 0) {
      scanDevices();
    }
  }, [isConnected, isScanning, devices.length, scanDevices]);

  const handleFlash = async (device) => {
    setIsFlashing(true);
    setFlashStatus('Allocating device...');

    try {
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

  // Status icon and color
  const getFlashStatusDisplay = () => {
    if (flashStatus.includes('✓')) {
      return { icon: <FiCheckCircle className="text-green-500" />, color: 'text-green-600' };
    }
    if (flashStatus.includes('✗')) {
      return { icon: <FiAlertTriangle className="text-red-500" />, color: 'text-red-600' };
    }
    if (isFlashing) {
      return { icon: <FiLoader className="animate-spin text-purple-600" />, color: 'text-purple-600' };
    }
    return { icon: <FiSettings className="text-gray-500" />, color: 'text-gray-600' };
  };
  const flashStatusDisplay = getFlashStatusDisplay();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden transform transition-all animate-fade-in">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-6">
          <h2 className="text-3xl font-bold text-white">Experiment Setup</h2>
          <p className="text-purple-100 mt-2">Choose your experiment and sensor to begin</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Experiment Type Selection */}
          <div>
            <h3 className="text-xl font-semibold text-slate-800 mb-4">1. Select Experiment Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setExperimentType('distance')}
                className={`p-6 rounded-xl border-2 transition-all duration-300 group ${
                  experimentType === 'distance'
                    ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                }`}
              >
                <div className="text-4xl mb-3">📏</div>
                <div className="font-semibold text-slate-800 text-lg">Displacement Analysis</div>
                <p className="text-sm text-slate-500 mt-1">Measure distance, velocity, and acceleration.</p>
              </button>
              <button
                onClick={() => setExperimentType('oscillation')}
                className={`p-6 rounded-xl border-2 transition-all duration-300 group ${
                  experimentType === 'oscillation'
                    ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                }`}
              >
                <div className="text-4xl mb-3">📐</div>
                <div className="font-semibold text-slate-800 text-lg">Inclined Plane</div>
                <p className="text-sm text-slate-500 mt-1">Analyze motion on an inclined plane.</p>
              </button>
            </div>
          </div>

          {/* Device Selection */}
          <div>
            <h3 className="text-xl font-semibold text-slate-800 mb-4">2. Select Sensor</h3>
            <div className="max-h-60 overflow-y-auto bg-slate-50 p-4 rounded-lg border border-slate-200">
              {isScanning ? (
                <div className="flex items-center justify-center py-10 text-slate-500">
                  <FiLoader className="animate-spin h-8 w-8 text-purple-600" />
                  <span className="ml-3 text-lg">Scanning for devices...</span>
                </div>
              ) : tofDevices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                  <FiWifiOff className="h-10 w-10 mb-2" />
                  <span className="text-lg font-medium">No TOF devices found</span>
                  <span className="text-sm">Ensure devices are online and on the same network.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {tofDevices.map(device => (
                    <button
                      key={device.id}
                      onClick={() => handleFlash(device)}
                      disabled={isFlashing}
                      className="p-4 rounded-lg border-2 border-slate-200 bg-white text-left hover:border-purple-600 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800 group-hover:text-purple-600">{device.id}</span>
                        <FiZap className="h-4 w-4 text-slate-400 group-hover:text-purple-600" />
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{device.ip_address || 'Unknown IP'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="bg-slate-100 rounded-lg p-4 text-center">
            <div className={`flex items-center justify-center text-md font-medium ${flashStatusDisplay.color} ${isFlashing ? 'animate-pulse' : ''}`}>
              <span className="mr-2">{flashStatusDisplay.icon}</span>
              {flashStatus}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =================================================================================
// Configuration Panel Component
// =================================================================================
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
      const backendConfig = {
        frequency: config.frequency_hz,
        duration: config.duration_s,
        mode: "long",
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-100 p-5 rounded-t-2xl border-b border-slate-200">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Experiment Configuration</h3>
            {selectedDevice && (
              <p className="text-slate-500 text-sm mt-1">Device: {selectedDevice.id}</p>
            )}
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-red-500 transition-colors"
            aria-label="Close"
          >
            <FiX size={24} />
          </button>
        </div>
        
        <div className="p-8 space-y-8">
          {/* Frequency Slider */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Frequency: <span className="font-bold text-purple-600">{config.frequency_hz} Hz</span>
            </label>
            <input
              type="range"
              min="10" max="50"
              value={config.frequency_hz}
              onChange={(e) => onChange({ ...config, frequency_hz: parseInt(e.target.value) })}
              className="w-full h-2 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>10 Hz</span>
              <span>50 Hz</span>
            </div>
          </div>

          {/* Max Distance Slider */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Max Distance: <span className="font-bold text-purple-600">{config.max_distance_cm} cm</span>
            </label>
            <input
              type="range"
              min="100" max="200"
              value={config.max_distance_cm}
              onChange={(e) => onChange({ ...config, max_distance_cm: parseInt(e.target.value) })}
              className="w-full h-2 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>100 cm</span>
              <span>200 cm</span>
            </div>
          </div>

          {/* Duration Slider */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Duration: <span className="font-bold text-purple-600">{config.duration_s} s</span>
            </label>
            <input
              type="range"
              min="1" max="60"
              value={config.duration_s}
              onChange={(e) => onChange({ ...config, duration_s: parseInt(e.target.value) })}
              className="w-full h-2 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>1 s</span>
              <span>60 s</span>
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div className={`text-sm font-medium text-center flex items-center justify-center ${
              statusMessage.includes('✓') ? 'text-green-600' : 
              statusMessage.includes('✗') ? 'text-red-600' : 'text-blue-600'
            }`}>
              {statusMessage.includes('✓') ? <FiCheckCircle className="mr-2" /> : 
               statusMessage.includes('✗') ? <FiAlertTriangle className="mr-2" /> :
               <FiLoader className="mr-2 animate-spin" />}
              {statusMessage}
            </div>
          )}

          {/* Apply Button */}
          <button
            onClick={handleApplyConfiguration}
            disabled={isSubmitting || !selectedDevice}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-800 text-white py-3 rounded-lg font-semibold hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSubmitting ? 'Applying...' : 'Apply Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};

// =================================================================================
// Graph Component
// =================================================================================
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
        setIsRunning(true); setIsPaused(false); setStatus('running');
      } else if (data.type === 'experiment_stopped') {
        setIsRunning(false); setIsPaused(false); setStatus('stopped');
      } else if (data.type === 'experiment_paused') {
        setIsPaused(true); setStatus('paused');
      } else if (data.type === 'experiment_resumed') {
        setIsPaused(false); setStatus('running');
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
      case 'V': return '#10b981'; // green-500
      case 'a': return '#f59e0b'; // amber-500
      default: return '#8b5cf6'; // purple-500
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls & View Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* View Tabs */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
          {['S', 'V', 'a'].map(view => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-5 py-2 rounded-lg font-semibold transition-all duration-300 w-24 text-center ${
                activeView === view
                  ? 'bg-white text-purple-600 shadow-md'
                  : 'bg-transparent text-slate-500 hover:bg-slate-200'
              }`}
            >
              {view === 'S' ? 'S - t' : view === 'V' ? 'V - t' : 'a - t'}
            </button>
          ))}
        </div>
        {/* Controls */}
        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={handleStart}
            disabled={isRunning}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
          >
            <FiPlay /> Start
          </button>
          <button
            onClick={handlePause}
            disabled={!isRunning}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg ${
              isPaused 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-yellow-500 hover:bg-yellow-600'
            }`}
          >
            {isPaused ? <><FiPlay /> Resume</> : <><FiPause /> Pause</>}
          </button>
          <button
            onClick={handleStop}
            disabled={!isRunning}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
          >
            <FiStopCircle /> Stop
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-4 pt-8">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="timeDisplay" label={{ value: 'Time (s)', position: 'insideBottom', dy: 10 }} />
            <YAxis dataKey={getYAxisData()} label={{ value: getYAxisLabel(), angle: -90, position: 'insideLeft', dx: -5 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              labelStyle={{ color: '#333', fontWeight: 'bold' }}
            />
            <Line 
              type="monotone" 
              dataKey={getYAxisData()} 
              stroke={getLineColor()} 
              strokeWidth={3} 
              dot={false} 
              activeDot={{ r: 6, strokeWidth: 2, fill: 'white' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// =================================================================================
// Main Interface Component
// =================================================================================
const ExperimentInterface = () => {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState({ frequency_hz: 20, max_distance_cm: 150, duration_s: 10 });
  const [experimentType, setExperimentType] = useState('tof');
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const userToken = localStorage.getItem('token');
  const [selectedDevice, setSelectedDevice] = useState(null);

  const { sendMessage } = useWebSocket(userToken, true);
  const { releaseDevice } = useDeviceManager(userToken);

  const handleDisconnect = () => {
    sendMessage({ action: 'release_device' });
    releaseDevice();
    localStorage.removeItem('selectedDevice');
    localStorage.removeItem('experimentType');
    setSelectedDevice(null);
    setShowConfigModal(true);
  };

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
        console.error('Failed to parse saved device:', e);
        localStorage.removeItem('selectedDevice');
        localStorage.removeItem('experimentType');
        setShowConfigModal(true);
      }
    } else {
      setShowConfigModal(true);
    }
  }, []);

  const handleComplete = ({ device, experimentType: expType, token }) => {
    localStorage.setItem('selectedDevice', JSON.stringify(device));
    localStorage.setItem('experimentType', expType);
    setSelectedDevice(device);
    setExperimentType(expType);
    setShowConfigPanel(false);
    setShowConfigModal(false);
  };

  const getExperimentName = () => {
    if (experimentType === 'tof') return 'Displacement Analysis';
    if (experimentType === 'oscillation') return 'Inclined Plane';
    return 'Experiment';
  }

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      
      {/* Render Modals */}
      {showConfigModal && <ConfigurationModal onComplete={handleComplete} />}
      {showConfigPanel && (
        <ConfigPanel 
          config={config}
          onChange={setConfig}
          onClose={() => setShowConfigPanel(false)}
          selectedDevice={selectedDevice}
          userToken={userToken}
        />
      )}

      {/* Main Experiment UI (shown only when not in initial config) */}
      {!showConfigModal && (
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header & Main Controls */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-800">
                  {getExperimentName()}
                </h1>
                <p className="text-slate-500 mt-2">
                  {selectedDevice ? 
                    `Connected to device: ${selectedDevice.id}` : 
                    'No device connected'
                  }
                </p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <button
                  onClick={() => setShowConfigPanel(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all shadow-md"
                >
                  <FiSettings /> Configuration
                </button>
                <button
                  onClick={() => setShowConfigModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-all shadow-md"
                >
                  <FiRepeat /> Change
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-all shadow-md"
                >
                  <FiLogOut /> Disconnect
                </button>
              </div>
            </div>
          </div>

          {/* Graph & Controls Panel */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <FiBarChart2 /> Live Data Feed
            </h2>
            <ExperimentGraph experimentType={experimentType} token={userToken} />
          </div>

        </div>
      )}
      
      {/* This style is for the fade-in animation */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default ExperimentInterface;