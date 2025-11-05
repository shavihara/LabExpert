import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket, useDeviceManager, useExperimentManager } from '../hooks/useWebSocket';
import { deviceAPI } from '../utils/api';
import { 
  FiSettings, FiBarChart2, FiPlay, FiPause, FiStopCircle, FiX, FiCheckCircle, 
  FiAlertTriangle, FiLoader, FiWifi, FiWifiOff, FiZap, FiLogOut, FiRepeat,
  FiDownload, FiSave, FiMaximize, FiMinimize, FiRefreshCw, FiTable, FiEye, FiClock
} from 'react-icons/fi';

// Import PlotlyGraph component
import PlotlyGraph from '../components/PlotlyGraph';

// =================================================================================
// Configuration Modal Component
// =================================================================================
const ConfigurationModal = ({ onComplete, sharedWebSocket, sharedDeviceManager, sharedExperimentManager }) => {
  const userToken = localStorage.getItem('token');
  const [experimentType, setExperimentType] = useState('distance');
  const [flashStatus, setFlashStatus] = useState('Select a sensor to begin');
  const [isFlashing, setIsFlashing] = useState(false);
  const [pendingFirmware, setPendingFirmware] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const {
    devices,
    isScanning,
    isConnected,
    scanDevices,
    selectDevice,
  } = sharedDeviceManager;

  const {
    flashFirmware,
    firmwareStatus
  } = sharedExperimentManager;

  useEffect(() => {
    console.log('ConfigurationModal - firmwareStatus changed:', firmwareStatus);
    if (firmwareStatus && firmwareStatus.success === true) {
      console.log('SUCCESS DETECTED in useEffect! firmwareStatus:', firmwareStatus);
    }
  }, [firmwareStatus]);

  useEffect(() => {
    console.log('=== FIRMWARE STATUS USEEFFECT TRIGGERED ===');
    console.log('isFlashing:', isFlashing);
    console.log('firmwareStatus:', firmwareStatus);
    
    if (isFlashing && firmwareStatus && firmwareStatus.success !== null) {
      console.log('=== CONDITION MET - PROCESSING FIRMWARE RESULT ===');
      if (firmwareStatus.success) {
        console.log('Firmware flash successful, transitioning to experiment...');
        setFlashStatus('✓ Firmware flashed successfully');
        
        const expType = experimentType === 'distance' ? 'tof' : 'oscillation';
        console.log('Calling onComplete with:', { device: selectedDevice, experimentType: expType, token: userToken });
        
        try {
          onComplete({ device: selectedDevice, experimentType: expType, token: userToken });
        } catch (error) {
          console.error('Error calling onComplete:', error);
        }
      } else if (firmwareStatus.success === false) {
        console.log('Firmware flash failed:', firmwareStatus.message);
        setFlashStatus(`✗ Error: ${firmwareStatus.message}`);
        setIsFlashing(false);
      }
    }
  }, [firmwareStatus, isFlashing, experimentType, userToken, onComplete, selectedDevice]);

  useEffect(() => {
    console.log('ConfigurationModal useEffect - isConnected:', isConnected, 'isScanning:', isScanning, 'devices.length:', devices.length);
    if (isConnected && !isScanning && devices.length === 0) {
      console.log('Triggering device scan...');
      scanDevices();
    }
  }, [isConnected, isScanning, devices.length, scanDevices]);

  const handleExperimentTypeSelection = (type) => {
    setExperimentType(type);
    
    const firmwareMap = {
      'distance': 'displacement',
      'oscillation': 'inclined_plane'
    };
    
    const firmwareType = firmwareMap[type];
    setPendingFirmware(firmwareType);
    
    const firmwareNames = {
      'distance': 'TOF.bin',
      'oscillation': 'INC.bin'
    };
    
    setFlashStatus(`${firmwareNames[type]} prepared. Select a sensor to flash firmware.`);
  };

  const handleFlash = async (device) => {
    if (!pendingFirmware) {
      setFlashStatus('Please select an experiment type first');
      return;
    }

    console.log('=== STARTING FLASH OPERATION ===');
    setIsFlashing(true);
    setSelectedDevice(device);
    setFlashStatus('Allocating device...');

    try {
      selectDevice(device.id);
      await new Promise(resolve => setTimeout(resolve, 500));

      setFlashStatus('Flashing firmware via OTA...');
      
      console.log('Flashing firmware for device:', device.id, 'with firmware type:', pendingFirmware);
      flashFirmware(device.id, pendingFirmware);

    } catch (err) {
      console.error(err);
      setFlashStatus(`✗ Error: ${err.message}`);
      setIsFlashing(false);
    }
  };

  const tofDevices = devices.filter(device => {
    if (!experimentType) return true;
    
    if (device.supported_experiments && Array.isArray(device.supported_experiments)) {
      return device.supported_experiments.includes(experimentType);
    }
    
    if (device.type) {
      const experimentToDeviceType = {
        'tof': ['tof', 'displacement', 'distance'],
        'distance': ['tof', 'displacement', 'distance'],
        'displacement': ['tof', 'displacement', 'distance'],
        'oscillation': ['oscillation', 'angle', 'incline'],
        'angle': ['oscillation', 'angle', 'incline']
      };
      
      const compatibleTypes = experimentToDeviceType[experimentType] || [];
      return compatibleTypes.some(type => 
        device.type.toLowerCase().includes(type.toLowerCase())
      );
    }
    
    return true;
  });

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-2">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden transform transition-all animate-fade-in">
        
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-3">
          <h2 className="text-3xl font-bold text-white">Experiment Setup</h2>
          <p className="text-purple-100 mt-2">Choose your experiment and sensor to begin</p>
        </div>

        <div className="p-8 space-y-8">
          <div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">1. Select Experiment Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleExperimentTypeSelection('distance')}
                className={`p-6 rounded-xl border-2 transition-all duration-300 group ${
                  experimentType === 'distance'
                    ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                }`}
              >
                <div className="text-3xl mb-1">⚾</div>
                <div className="font-semibold text-slate-800 text-lg">Free Fall Experiment</div>
                <p className="text-sm text-slate-500 mt-1">Measure distance, velocity, and acceleration.</p>
                <p className="text-xs text-purple-600 mt-1 font-medium">→ TOF.bin firmware</p>
              </button>
              <button
                onClick={() => handleExperimentTypeSelection('oscillation')}
                className={`p-6 rounded-xl border-2 transition-all duration-300 group ${
                  experimentType === 'oscillation'
                    ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                }`}
              >
                <div className="text-3xl mb-1">📐</div>
                <div className="font-semibold text-slate-800 text-lg">Inclined Plane</div>
                <p className="text-sm text-slate-500 mt-1">Analyze motion on an inclined plane.</p>
                <p className="text-xs text-purple-600 mt-2 font-medium">→ INC.bin firmware</p>
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-slate-800 mb-1">2. Select Sensor</h3>
            
            <div className="mb-1">
              <button
                onClick={async () => {
                  console.log('Manual scan button clicked');
                  const wsSuccess = sharedWebSocket.sendMessage({ action: 'scan_devices' });
                  console.log('WebSocket scan message sent:', wsSuccess);
                  
                  if (!wsSuccess || !isConnected) {
                    console.log('WebSocket failed, trying REST API...');
                    try {
                      const result = await deviceAPI.scanDevices();
                      console.log('REST API scan result:', result);
                      
                      if (result.success && result.devices) {
                        console.log(`Found ${result.devices.length} devices via REST API:`, result.devices);
                      }
                    } catch (error) {
                      console.error('REST API scan failed:', error);
                    }
                  }
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Manual Scan (WS + REST)
              </button>
              <span className="ml-2 text-sm text-gray-600">
                Connected: {isConnected ? 'Yes' : 'No'} | Scanning: {isScanning ? 'Yes' : 'No'} | Devices: {devices.length}
              </span>
            </div>
            
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
const ConfigPanel = ({ config, onChange, onClose, selectedDevice, userToken, sharedExperimentManager }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  const {
    applyConfiguration,
    configStatus
  } = sharedExperimentManager;

  const handleApplyConfiguration = async () => {
    if (!selectedDevice) {
      setStatusMessage('❌ No device selected');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Applying configuration...');

    try {
      localStorage.setItem('experimentConfig', JSON.stringify(config));
      applyConfiguration(selectedDevice.id, config);
    } catch (err) {
      console.error(err);
      setStatusMessage(`❌ Error: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isSubmitting) return;
    if (!configStatus) return;
    if (configStatus.success === true) {
      setStatusMessage('✓ Configuration applied successfully');
      setIsSubmitting(false);
      setTimeout(() => {
        onClose();
      }, 1500);
    } else if (configStatus.success === false) {
      setStatusMessage(`❌ Error: ${configStatus.message}`);
      setIsSubmitting(false);
    }
  }, [configStatus, isSubmitting, onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-fade-in">
        
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">Configuration</h2>
            <p className="text-blue-100 text-sm mt-1">Adjust experiment parameters</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Sampling Frequency (Hz)
            </label>
            <input
              type="number"
              value={config.frequency_hz}
              onChange={(e) => onChange({ ...config, frequency_hz: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              min="1"
              max="100"
            />
            <p className="text-xs text-slate-500 mt-1">Recommended: 20-50 Hz</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Max Distance (cm)
            </label>
            <input
              type="number"
              value={config.max_distance_cm}
              onChange={(e) => onChange({ ...config, max_distance_cm: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              min="10"
              max="400"
            />
            <p className="text-xs text-slate-500 mt-1">Maximum measurable distance</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Duration (seconds)
            </label>
            <input
              type="number"
              value={config.duration_s}
              onChange={(e) => onChange({ ...config, duration_s: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              min="1"
              max="300"
            />
            <p className="text-xs text-slate-500 mt-1">Total experiment duration</p>
          </div>

          {statusMessage && (
            <div className={`p-3 rounded-lg text-sm font-medium text-center ${
              statusMessage.includes('✓') ? 'bg-green-100 text-green-700' : 
              statusMessage.includes('❌') ? 'bg-red-100 text-red-700' : 
              'bg-blue-100 text-blue-700'
            }`}>
              {statusMessage}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyConfiguration}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {isSubmitting ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =================================================================================
// Live Data Table Component
// =================================================================================
const LiveDataTable = ({ data, isFullscreen, onToggleFullscreen }) => {
  const [showAllData, setShowAllData] = useState(true);
  const tableRef = useRef(null);

  const displayData = showAllData ? data : data.slice(-20);

  const getColumnHeaders = () => {
    return ['Time (s)', 'Distance (cm)', 'Velocity (cm/s)', 'Acceleration (cm/s²)'];
  };

  const getRowData = (item) => {
    return [
      item.timeDisplay,
      item.distance?.toFixed(2) || '-',
      item.velocity?.toFixed(2) || '-',
      item.acceleration?.toFixed(2) || '-'
    ];
  };

  const exportToCSV = () => {
    const headers = getColumnHeaders();
    const csvContent = [
      headers.join(','),
      ...data.map(item => getRowData(item).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `experiment_data_${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white p-6' : 'relative'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <FiTable className="text-blue-600" />
          Live Data ({displayData.length} readings)
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAllData(!showAllData)}
            className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-all text-sm font-semibold flex items-center gap-1"
          >
            <FiEye size={14} />
            {showAllData ? 'Show Latest 20' : `Show All (${data.length})`}
          </button>
          <button
            onClick={exportToCSV}
            className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-all text-sm font-semibold flex items-center gap-1"
          >
            <FiDownload size={14} />
            Export CSV
          </button>
          <button
            onClick={onToggleFullscreen}
            className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-all text-sm font-semibold flex items-center gap-1"
          >
            {isFullscreen ? <FiMinimize size={14} /> : <FiMaximize size={14} />}
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
        </div>
      </div>

      <div 
        ref={tableRef}
        className={`overflow-auto border-2 border-slate-200 rounded-lg bg-white ${
          isFullscreen ? 'max-h-[calc(100vh-200px)]' : 'max-h-80'
        }`}
      >
        <table className="w-full">
          <thead className="bg-gradient-to-r from-slate-100 to-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider border-b-2 border-slate-300">
                #
              </th>
              {getColumnHeaders().map((header, idx) => (
                <th 
                  key={idx}
                  className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider border-b-2 border-slate-300"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {displayData.length === 0 ? (
              <tr>
                <td colSpan={getColumnHeaders().length + 1} className="px-4 py-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <FiAlertTriangle className="h-8 w-8 text-slate-400" />
                    <span>No data available yet. Start the experiment to see readings.</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayData.map((item, idx) => (
                <tr 
                  key={idx}
                  className="hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-2 text-sm font-medium text-slate-600">
                    {showAllData ? idx + 1 : data.length - 20 + idx + 1}
                  </td>
                  {getRowData(item).map((value, colIdx) => (
                    <td 
                      key={colIdx}
                      className="px-4 py-2 text-sm text-slate-800 font-mono"
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isFullscreen && (
        <div className="mt-4 text-sm text-slate-500 text-center">
          Press ESC or click Exit Fullscreen to return
        </div>
      )}
    </div>
  );
};

// =================================================================================
// Experiment Graph Component - INTEGRATED WITH PLOTLYGRAPH
// =================================================================================
const ExperimentGraph = ({ experimentType, token, sharedWebSocket, sharedExperimentManager, config = { max_distance_cm: 150 } }) => {
  // ===== DATA HANDLING STATE =====
  const [chartData, setChartData] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [saveStatus, setSaveStatus] = useState(null);
  
  const chartDataRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const sensorStartTimeRef = useRef(null);
  const dataHandlerCleanupRef = useRef(null);
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);

  // ===== SHARED WEBSOCKET AND EXPERIMENT MANAGER =====
  const { sendMessage, addMessageHandler } = sharedWebSocket;
  const { saveExperimentData, saveStatus: wsSaveStatus, clearData } = sharedExperimentManager;

  // Keep refs in sync with state
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // ===== DIRECT DATA STREAMING HANDLER =====
  const handleDataMessage = useCallback((message) => {
    try {
      // Only check pause state, not running state - allow data processing even after timer stops
      // to capture all data sent by backend until explicit stop
      if (isPausedRef.current) return;

      let d = null;
      if (message?.type === 'processed_data' && message?.data) {
        d = message.data;
        const t = Number(d.t ?? d.time ?? 0);
        const elapsedMs = Number.isFinite(t) ? (t * 1000) : (startTimeRef.current ? (Date.now() - startTimeRef.current) : 0);
        const point = {
          time: elapsedMs,
          timeDisplay: (elapsedMs / 1000).toFixed(2),
          distance: Number(d.s ?? d.displacement ?? d.distance ?? 0),
          velocity: Number(d.v ?? d.velocity ?? 0),
          acceleration: Number(d.a ?? d.acceleration ?? 0),
          sample: d.sample ?? d.packet_id ?? null,
          packet_id: d.packet_id ?? null
        };
        
        // Debug logging for sample processing
        console.log(`Processing sample ${point.sample || 'unknown'} (packet ${point.packet_id || 'unknown'}) - total samples: ${chartDataRef.current.length + 1}`);
        
        chartDataRef.current = [...chartDataRef.current, point];
        setChartData([...chartDataRef.current]);
        return;
      }

      if (message?.type === 'sensor_data') {
        d = message.data ?? {};
      } else if (message?.data) {
        d = message.data;
      }

      if (!d) return;

      const timeCandidate = Number(d.time ?? d.timestamp ?? message.timestamp);
      let elapsedMs;
      if (Number.isFinite(timeCandidate)) {
        if (sensorStartTimeRef.current === null) {
          sensorStartTimeRef.current = timeCandidate;
        }
        elapsedMs = timeCandidate - sensorStartTimeRef.current;
      } else {
        elapsedMs = startTimeRef.current ? (Date.now() - startTimeRef.current) : 0;
      }
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) elapsedMs = 0;

      const point = {
        time: elapsedMs,
        timeDisplay: (elapsedMs / 1000).toFixed(2),
        distance: Number(d.distance ?? d.displacement ?? 0),
        velocity: Number(d.velocity ?? 0),
        acceleration: Number(d.acceleration ?? 0)
      };
      chartDataRef.current = [...chartDataRef.current, point];
      setChartData([...chartDataRef.current]);
    } catch (err) {
      console.error('Error in handleDataMessage:', err);
    }
  }, []);

  // ===== TIMER COUNTDOWN EFFECT =====
  useEffect(() => {
    if (isRunning && !isPaused && totalDuration > 0) {
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const remaining = Math.max(0, totalDuration - elapsed);
        setTimeRemaining(remaining);
        
        if (remaining <= 0) {
          setIsRunning(false);
          setIsPaused(false);
          setTimeRemaining(0);
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          // Note: We DON'T remove the data handler here - let it continue processing
          // data from backend until explicit stop or device status indicates completion
        }
      }, 100);
      
      return () => clearInterval(timerRef.current);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRunning, isPaused, totalDuration]);

  // ===== DEVICE STATUS MESSAGE HANDLER =====
  useEffect(() => {
    const handleDeviceStatus = (message) => {
      if (message.type === 'device_status' && message.data) {
        const { status, device_id, timestamp } = message.data;
        console.log('Received device status:', { status, device_id, timestamp });
        
        if (status === 'experiment_completed') {
          console.log('Experiment completed by ESP32 firmware');
          setIsRunning(false);
          setIsPaused(false);
          setTimeRemaining(0);
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          
          // Remove data handler only when backend signals completion
          if (dataHandlerCleanupRef.current) {
            try { dataHandlerCleanupRef.current(); } catch {}
            dataHandlerCleanupRef.current = null;
          }
          
          alert('✓ Experiment completed successfully by the ESP32 firmware!');
        }
      }
    };

    const removeHandler = addMessageHandler(handleDeviceStatus);
    
    return () => {
      removeHandler();
    };
  }, [addMessageHandler]);

  // ===== WEBSOCKET SAVE STATUS MONITOR =====
  useEffect(() => {
    if (wsSaveStatus) {
      setSaveStatus(wsSaveStatus);
      
      if (wsSaveStatus.status === 'success') {
        alert('✓ Experiment data saved to your profile successfully!');
      } else if (wsSaveStatus.status === 'error') {
        alert('❌ Error saving data: ' + wsSaveStatus.message);
      }
    }
  }, [wsSaveStatus]);

  // ===== EXPERIMENT CONTROL HANDLERS =====
  const handleStart = async () => {
    console.log('Starting experiment with clean state...');
    clearData();
    chartDataRef.current = [];
    setChartData([]);
    sensorStartTimeRef.current = null;
    startTimeRef.current = null;
    
    setIsRunning(true);
    setIsPaused(false);
    
    try {
      const config = JSON.parse(localStorage.getItem('experimentConfig') || '{"duration_s": 10}');
      setTotalDuration(config.duration_s || 10);
      setTimeRemaining(config.duration_s || 10);
    } catch (e) {
      setTotalDuration(10);
      setTimeRemaining(10);
    }
    
    if (dataHandlerCleanupRef.current) {
      try { dataHandlerCleanupRef.current(); } catch {}
      dataHandlerCleanupRef.current = null;
    }
    dataHandlerCleanupRef.current = addMessageHandler(handleDataMessage);
    
    startTimeRef.current = Date.now();
    
    sendMessage({ action: 'start_experiment', experiment_type: experimentType });
    
    console.log('Experiment started with clean state');
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
    sendMessage({ action: isPaused ? 'resume_experiment' : 'pause_experiment' });
  };

  const handleStop = () => {
    setIsRunning(false);
    setIsPaused(false);
    setTimeRemaining(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (dataHandlerCleanupRef.current) {
      try { dataHandlerCleanupRef.current(); } catch {}
      dataHandlerCleanupRef.current = null;
    }
    
    sendMessage({ action: 'stop_experiment' });
  };

  const handleReset = () => {
    clearData();
    chartDataRef.current = [];
    setChartData([]);
    
    setIsRunning(false);
    setIsPaused(false);
    setTimeRemaining(0);
    setTotalDuration(0);
    sensorStartTimeRef.current = null;
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    console.log('All data and states have been reset');
    
    if (dataHandlerCleanupRef.current) {
      try { dataHandlerCleanupRef.current(); } catch {}
      dataHandlerCleanupRef.current = null;
    }
  };

  const handleSaveToProfile = async () => {
    try {
      saveExperimentData({
        experiment_type: experimentType,
        data: chartData,
        timestamp: new Date().toISOString()
      });
      
      setSaveStatus({ status: 'loading', message: 'Saving data...' });
      
      const checkStatus = () => {
        if (saveStatus && saveStatus.status !== 'loading') {
          clearInterval(statusInterval);
        }
      };
      
      const statusInterval = setInterval(checkStatus, 100);
      setTimeout(() => clearInterval(statusInterval), 5000);
      
    } catch (error) {
      alert('❌ Error saving data: ' + error.message);
    }
  };

  // ===== UI STATUS HELPERS =====
  const getStatusColor = () => {
    if (isRunning && !isPaused) return 'bg-green-100 text-green-700 border-green-300';
    if (isPaused) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-slate-100 text-slate-600 border-slate-300';
  };

  const getStatusText = () => {
    if (isRunning && !isPaused) return 'Running';
    if (isPaused) return 'Paused';
    return 'Stopped';
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // ===== ESC KEY HANDLER FOR FULLSCREEN =====
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (isTableFullscreen) setIsTableFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isTableFullscreen]);

  return (
    <div className="space-y-4">
      {/* ===== STATUS BAR AND CONTROLS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Status Indicator */}
        <div className={`rounded-xl border-2 p-3 ${getStatusColor()} transition-all`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold opacity-75 mb-1">Status</div>
              <div className="text-lg font-bold flex items-center gap-2">
                {isRunning && !isPaused && <span className="animate-pulse">●</span>}
                {getStatusText()}
              </div>
            </div>
            {isRunning && (
              <FiLoader className={`h-6 w-6 ${!isPaused && 'animate-spin'}`} />
            )}
          </div>
        </div>

        {/* Timer */}
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3">
          <div className="text-xs font-semibold text-blue-700 mb-1">Time Remaining</div>
          <div className="text-2xl font-bold text-blue-900 font-mono flex items-center gap-2">
            <FiClock className="h-5 w-5" />
            {formatTime(timeRemaining)}
          </div>
        </div>

        {/* Configuration Info */}
        <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-3">
          <div className="text-xs font-semibold text-purple-700 mb-1">Configuration</div>
          <div className="text-sm text-purple-900">
            <div>Duration: {totalDuration || 10}s</div>
            <div className="text-xs opacity-75">Samples: {chartData.length}</div>
            {/* Sample count debugging */}
            {chartData.length > 0 && (
              <div className="text-xs opacity-75 mt-1 border-t border-purple-200 pt-1">
                <div>First: {new Date(chartData[0].timestamp).toLocaleTimeString()}</div>
                <div>Last: {new Date(chartData[chartData.length - 1].timestamp).toLocaleTimeString()}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== CONTROL BUTTONS ===== */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleStart}
            disabled={isRunning}
            className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiPlay size={16} /> Start
          </button>
          <button
            onClick={handlePause}
            disabled={!isRunning}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm ${
              isPaused 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-yellow-500 hover:bg-yellow-600'
            }`}
          >
            {isPaused ? <><FiPlay size={16} /> Resume</> : <><FiPause size={16} /> Pause</>}
          </button>
          <button
            onClick={handleStop}
            disabled={!isRunning}
            className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiStopCircle size={16} /> Stop
          </button>
          <button
            onClick={handleReset}
            disabled={isRunning}
            className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiRefreshCw size={16} /> Reset
          </button>
        </div>
      </div>

      {/* ===== PLOTLY GRAPH INTEGRATION ===== */}
      {/* This replaces the old Chart.js/Recharts implementation */}
      <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-xl border-2 border-slate-200 p-4">
        <PlotlyGraph 
          experimentType={experimentType}
          token={token}
          sharedWebSocket={sharedWebSocket}
          sharedExperimentManager={sharedExperimentManager}
          chartData={chartData}
          isRunning={isRunning}
          isPaused={isPaused}
          onStart={handleStart}
          onPause={handlePause}
          onStop={handleStop}
          onReset={handleReset}
          config={config} // Pass configuration for fixed axis bounds
        />
      </div>

      {/* ===== LIVE DATA TABLE ===== */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
        <LiveDataTable 
          data={chartData}
          isFullscreen={isTableFullscreen}
          onToggleFullscreen={() => setIsTableFullscreen(!isTableFullscreen)}
        />
      </div>

      {/* ===== EXPORT AND SAVE BUTTONS ===== */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-md border-2 border-purple-200 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSaveToProfile}
            disabled={chartData.length === 0}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiSave size={16} /> Save to Profile
          </button>
        </div>
        {chartData.length === 0 && (
          <p className="text-center text-xs text-slate-500 mt-2">
            Start the experiment to enable save options
          </p>
        )}
      </div>
    </div>
  );
};

// =================================================================================
// MAIN INTERFACE COMPONENT
// =================================================================================
const ExperimentInterface = () => {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState({ frequency_hz: 20, max_distance_cm: 150, duration_s: 10 });
  const [experimentType, setExperimentType] = useState('tof');
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const userToken = localStorage.getItem('token');

  // ===== SHARED WEBSOCKET CONNECTIONS =====
  const sharedWebSocket = useWebSocket(userToken, true);
  const sharedDeviceManager = useDeviceManager(sharedWebSocket);
  
  const [experimentData, setExperimentData] = useState([]);
  const sharedExperimentManager = useExperimentManager(sharedWebSocket, experimentData, setExperimentData);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const handleDisconnect = () => {
    sharedWebSocket.sendMessage({ action: 'release_device' });
    sharedDeviceManager.releaseDevice();
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
    console.log('=== handleComplete called ===');
    console.log('Received parameters:', { device, experimentType: expType, token });
    
    localStorage.setItem('selectedDevice', JSON.stringify(device));
    localStorage.setItem('experimentType', expType);
    setSelectedDevice(device);
    setExperimentType(expType);
    setShowConfigPanel(false);
    setShowConfigModal(false);
    
    console.log('handleComplete completed - should hide modal and show main interface');
  };

  const getExperimentName = () => {
    if (experimentType === 'tof') return 'Displacement Analysis';
    if (experimentType === 'oscillation') return 'Inclined Plane';
    return 'Experiment';
  };

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 min-h-screen">
      
      {showConfigModal && (
        <ConfigurationModal 
          onComplete={handleComplete}
          sharedWebSocket={sharedWebSocket}
          sharedDeviceManager={sharedDeviceManager}
          sharedExperimentManager={sharedExperimentManager}
        />
      )}
      {showConfigPanel && (
        <ConfigPanel 
          config={config}
          onChange={setConfig}
          onClose={() => setShowConfigPanel(false)}
          selectedDevice={selectedDevice}
          userToken={userToken}
          sharedExperimentManager={sharedExperimentManager}
        />
      )}

      {!showConfigModal && (
        <div className="max-w-[1800px] mx-auto space-y-6">
          
          {/* ===== HEADER ===== */}
          <div className="bg-white rounded-xl md:rounded-2xl shadow-lg border border-slate-200 p-4 md:p-6">
            <div className="flex flex-col gap-3">
              <div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  {getExperimentName()}
                </h1>
                <p className="text-xs md:text-sm text-slate-600 mt-1 md:mt-2 flex items-center gap-2">
                  {selectedDevice ? (
                    <>
                      <FiWifi className="text-green-500 flex-shrink-0" />
                      <span className="truncate">Connected: <span className="font-semibold text-slate-800">{selectedDevice.id}</span></span>
                    </>
                  ) : (
                    <>
                      <FiWifiOff className="text-red-500 flex-shrink-0" />
                      No device connected
                    </>
                  )}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setShowConfigPanel(true)}
                  className="flex items-center justify-center gap-1.5 px-2 py-2 md:px-4 md:py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all shadow-md text-xs md:text-sm"
                >
                  <FiSettings size={16} /> 
                  <span className="hidden sm:inline">Config</span>
                </button>
                <button
                  onClick={() => setShowConfigModal(true)}
                  className="flex items-center justify-center gap-1.5 px-2 py-2 md:px-4 md:py-2.5 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-all shadow-md text-xs md:text-sm"
                >
                  <FiRepeat size={16} /> 
                  <span className="hidden sm:inline">Change</span>
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center justify-center gap-1.5 px-2 py-2 md:px-4 md:py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-all shadow-md text-xs md:text-sm"
                >
                  <FiLogOut size={16} /> 
                  <span className="hidden sm:inline">Disconnect</span>
                </button>
              </div>
            </div>
          </div>

          {/* ===== MAIN CONTENT ===== */}
          <div className="bg-white rounded-xl md:rounded-2xl shadow-lg border border-slate-200 p-3 md:p-6">
            <h2 className="text-lg md:text-2xl font-bold text-slate-800 mb-4 md:mb-6 flex items-center gap-2">
              <FiBarChart2 className="text-purple-600" /> 
              <span className="hidden sm:inline">Live Data Feed</span>
              <span className="sm:hidden">Live Data</span>
            </h2>
            <ExperimentGraph 
              experimentType={experimentType} 
              token={userToken} 
              sharedWebSocket={sharedWebSocket}
              sharedExperimentManager={sharedExperimentManager}
              config={config}
            />
          </div>

        </div>
      )}
      
      {/* ===== ANIMATION STYLES ===== */}
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