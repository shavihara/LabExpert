import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, ReferenceLine } from 'recharts';
import { useWebSocket, useDeviceManager, useExperimentManager } from '../hooks/useWebSocket';
import { deviceAPI } from '../utils/api';
import { 
  FiSettings, FiBarChart2, FiPlay, FiPause, FiStopCircle, FiX, FiCheckCircle, 
  FiAlertTriangle, FiLoader, FiWifi, FiWifiOff, FiZap, FiLogOut, FiRepeat,
  FiDownload, FiSave, FiMaximize, FiMinimize, FiTrendingUp, FiFilter,
  FiRefreshCw, FiTable, FiEye, FiZoomIn, FiZoomOut, FiClock
} from 'react-icons/fi';

// =================================================================================
// Configuration Modal Component
// =================================================================================
const ConfigurationModal = ({ onComplete, sharedWebSocket, sharedDeviceManager, sharedExperimentManager }) => {
  const userToken = localStorage.getItem('token');
  const [experimentType, setExperimentType] = useState('distance');
  const [flashStatus, setFlashStatus] = useState('Select a sensor to begin');
  const [isFlashing, setIsFlashing] = useState(false);
  const [pendingFirmware, setPendingFirmware] = useState(null); // Track which firmware to flash
  const [selectedDevice, setSelectedDevice] = useState(null); // Track which device was selected for flashing

  // Use shared connections instead of creating new ones
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

  // Debug logging for firmwareStatus changes
  useEffect(() => {
    console.log('ConfigurationModal - firmwareStatus changed:', firmwareStatus);
    if (firmwareStatus && firmwareStatus.success === true) {
      console.log('SUCCESS DETECTED in useEffect! firmwareStatus:', firmwareStatus);
    }
  }, [firmwareStatus]);

  // Handle firmware flash completion
  useEffect(() => {
    console.log('=== FIRMWARE STATUS USEEFFECT TRIGGERED ===');
    console.log('isFlashing:', isFlashing);
    console.log('firmwareStatus:', firmwareStatus);
    console.log('firmwareStatus?.success:', firmwareStatus?.success);
    console.log('firmwareStatus?.success !== null:', firmwareStatus?.success !== null);
    console.log('Condition check:', isFlashing && firmwareStatus && firmwareStatus.success !== null);
    
    if (isFlashing && firmwareStatus && firmwareStatus.success !== null) {
      console.log('=== CONDITION MET - PROCESSING FIRMWARE RESULT ===');
      if (firmwareStatus.success) {
        console.log('Firmware flash successful, transitioning to experiment...');
        setFlashStatus('✓ Firmware flashed successfully');
        
        // Call onComplete immediately instead of using setTimeout
        const expType = experimentType === 'distance' ? 'tof' : 'oscillation';
        console.log('Calling onComplete with:', { device: selectedDevice, experimentType: expType, token: userToken });
        console.log('selectedDevice details:', selectedDevice);
        
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
    } else {
      console.log('=== CONDITION NOT MET ===');
      console.log('Reasons:');
      console.log('- isFlashing:', isFlashing);
      console.log('- firmwareStatus exists:', !!firmwareStatus);
      console.log('- firmwareStatus.success !== null:', firmwareStatus?.success !== null);
    }
  }, [firmwareStatus, isFlashing, experimentType, userToken, onComplete, selectedDevice]);

  useEffect(() => {
    console.log('ConfigurationModal useEffect - isConnected:', isConnected, 'isScanning:', isScanning, 'devices.length:', devices.length);
    if (isConnected && !isScanning && devices.length === 0) {
      console.log('Triggering device scan...');
      scanDevices();
    } else {
      console.log('Not scanning because:', {
        isConnected,
        isScanning,
        devicesLength: devices.length,
        condition: isConnected && !isScanning && devices.length === 0
      });
    }
  }, [isConnected, isScanning, devices.length, scanDevices]);

  // Handle experiment type selection - prepare firmware but don't flash yet
  const handleExperimentTypeSelection = (type) => {
    setExperimentType(type);
    
    // Map experiment types to firmware files
    const firmwareMap = {
      'distance': 'displacement', // Maps to TOF.bin in firmware registry
      'oscillation': 'inclined_plane' // Maps to INC.bin in firmware registry
    };
    
    const firmwareType = firmwareMap[type];
    setPendingFirmware(firmwareType);
    
    // Update status to indicate firmware is prepared
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
    console.log('Setting isFlashing to true');
    setIsFlashing(true);
    setSelectedDevice(device); // Store the selected device for use in useEffect
    setFlashStatus('Allocating device...');

    try {
      selectDevice(device.id);
      await new Promise(resolve => setTimeout(resolve, 500));

      setFlashStatus('Flashing firmware via OTA...');
      
      // Use the prepared firmware type instead of experimentType
      console.log('Flashing firmware for device:', device.id, 'with firmware type:', pendingFirmware);
      console.log('Current firmwareStatus before flash:', firmwareStatus);
      
      // Clear any previous firmware status before starting new flash
      // Note: The flashFirmware function will set it to { success: null, message: 'Flashing firmware...' }
      flashFirmware(device.id, pendingFirmware);
      
      // The firmware status will be handled by the useEffect below

    } catch (err) {
      console.error(err);
      setFlashStatus(`✗ Error: ${err.message}`);
      setIsFlashing(false);
    }
  };

  // Debug logging to see what devices we're receiving
  console.log('All devices received:', devices);
  console.log('Devices length:', devices.length);
  console.log('Current experiment type:', experimentType);
  
  // Filter devices based on experiment type compatibility (backend already filters by online_status = 1)
  const tofDevices = devices.filter(device => {
    // If no experiment type is selected, show all online devices (already filtered by backend)
    if (!experimentType) return true;
    
    // Check if device supports the selected experiment type
    if (device.supported_experiments && Array.isArray(device.supported_experiments)) {
      return device.supported_experiments.includes(experimentType);
    }
    
    // If device doesn't have supported_experiments info, check by device type
    if (device.type) {
      // Map experiment types to device types
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
    
    // If no type information available, show the device (assume compatible)
    return true;
  });
  
  console.log(`Showing ${tofDevices.length} compatible devices for experiment type: ${experimentType || 'any'} (backend filters online_status = 1)`);
  console.log('Devices received from backend:', tofDevices.map(d => `${d.device_id} (status: ${d.status})`));

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
        
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-6">
          <h2 className="text-3xl font-bold text-white">Experiment Setup</h2>
          <p className="text-purple-100 mt-2">Choose your experiment and sensor to begin</p>
        </div>

        <div className="p-8 space-y-8">
          <div>
            <h3 className="text-xl font-semibold text-slate-800 mb-4">1. Select Experiment Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleExperimentTypeSelection('distance')}
                className={`p-6 rounded-xl border-2 transition-all duration-300 group ${
                  experimentType === 'distance'
                    ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                }`}
              >
                <div className="text-4xl mb-3">📏</div>
                <div className="font-semibold text-slate-800 text-lg">Displacement Analysis</div>
                <p className="text-sm text-slate-500 mt-1">Measure distance, velocity, and acceleration.</p>
                <p className="text-xs text-purple-600 mt-2 font-medium">→ TOF.bin firmware</p>
              </button>
              <button
                onClick={() => handleExperimentTypeSelection('oscillation')}
                className={`p-6 rounded-xl border-2 transition-all duration-300 group ${
                  experimentType === 'oscillation'
                    ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                }`}
              >
                <div className="text-4xl mb-3">📐</div>
                <div className="font-semibold text-slate-800 text-lg">Inclined Plane</div>
                <p className="text-sm text-slate-500 mt-1">Analyze motion on an inclined plane.</p>
                <p className="text-xs text-purple-600 mt-2 font-medium">→ INC.bin firmware</p>
              </button>
            </div>
          </div>

            <div>
            <h3 className="text-xl font-semibold text-slate-800 mb-4">2. Select Sensor</h3>
            
            {/* Manual scan button for debugging */}
            <div className="mb-4">
              <button
                onClick={async () => {
                  console.log('Manual scan button clicked');
                  console.log('WebSocket state:', sharedWebSocket);
                  console.log('Device manager state:', sharedDeviceManager);
                  
                  // Try WebSocket first
                  const wsSuccess = sharedWebSocket.sendMessage({ action: 'scan_devices' });
                  console.log('WebSocket scan message sent:', wsSuccess);
                  
                  // If WebSocket fails or is not connected, try REST API
                  if (!wsSuccess || !isConnected) {
                    console.log('WebSocket failed, trying REST API...');
                    try {
                      const result = await deviceAPI.scanDevices();
                      console.log('REST API scan result:', result);
                      
                      // Manually update the device manager with the results
                      if (result.success && result.devices) {
                        // This is a workaround - ideally we'd have a way to inject devices into the device manager
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
  
  // Use shared experiment manager instead of creating new one
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
      // Save config to localStorage for timer access
      localStorage.setItem('experimentConfig', JSON.stringify(config));
      
      // Use WebSocket instead of HTTP
      applyConfiguration(selectedDevice.id, config);

    } catch (err) {
      console.error(err);
      setStatusMessage(`❌ Error: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  // React to configuration status updates from backend to clear spinner
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
// Data Statistics Component
// =================================================================================
const DataStatistics = ({ data, dataType }) => {
  const calculateStats = () => {
    if (data.length === 0) return null;

    const values = data.map(d => {
      if (dataType === 's-t') return d.distance;
      if (dataType === 'v-t') return d.velocity;
      if (dataType === 'a-t') return d.acceleration;
      return 0;
    });

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length);

    return { mean, max, min, std, count: values.length };
  };

  const stats = calculateStats();

  if (!stats) return null;

  const getUnit = () => {
    if (dataType === 's-t') return 'cm';
    if (dataType === 'v-t') return 'cm/s';
    if (dataType === 'a-t') return 'cm/s²';
    return '';
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-3">
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-2 md:p-3 rounded-lg border border-blue-200">
        <div className="text-[10px] md:text-xs text-blue-600 font-semibold mb-0.5 md:mb-1">Mean</div>
        <div className="text-sm md:text-lg font-bold text-blue-900 truncate">{stats.mean.toFixed(3)} {getUnit()}</div>
      </div>
      <div className="bg-gradient-to-br from-green-50 to-green-100 p-2 md:p-3 rounded-lg border border-green-200">
        <div className="text-[10px] md:text-xs text-green-600 font-semibold mb-0.5 md:mb-1">Max</div>
        <div className="text-sm md:text-lg font-bold text-green-900 truncate">{stats.max.toFixed(3)} {getUnit()}</div>
      </div>
      <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-2 md:p-3 rounded-lg border border-orange-200">
        <div className="text-[10px] md:text-xs text-orange-600 font-semibold mb-0.5 md:mb-1">Min</div>
        <div className="text-sm md:text-lg font-bold text-orange-900 truncate">{stats.min.toFixed(3)} {getUnit()}</div>
      </div>
      <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-2 md:p-3 rounded-lg border border-purple-200">
        <div className="text-[10px] md:text-xs text-purple-600 font-semibold mb-0.5 md:mb-1">Std Dev</div>
        <div className="text-sm md:text-lg font-bold text-purple-900 truncate">{stats.std.toFixed(3)} {getUnit()}</div>
      </div>
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-2 md:p-3 rounded-lg border border-slate-200 col-span-2 sm:col-span-1">
        <div className="text-[10px] md:text-xs text-slate-600 font-semibold mb-0.5 md:mb-1">Samples</div>
        <div className="text-sm md:text-lg font-bold text-slate-900">{stats.count}</div>
      </div>
    </div>
  );
};

// =================================================================================
// Live Data Table Component
// =================================================================================
const LiveDataTable = ({ data, graphType, isFullscreen, onToggleFullscreen }) => {
  const [showAllData, setShowAllData] = useState(true);
  const tableRef = useRef(null);

  const displayData = showAllData ? data : data.slice(-20);

  const getColumnHeaders = () => {
    if (graphType === 's-t') {
      return ['Time (s)', 'Distance (cm)'];
    } else if (graphType === 'v-t') {
      return ['Time (s)', 'Velocity (cm/s)'];
    } else if (graphType === 'a-t') {
      return ['Time (s)', 'Acceleration (cm/s²)'];
    }
    return ['Time (s)', 'Value'];
  };

  const getRowData = (item) => {
    if (graphType === 's-t') {
      return [
        item.timeDisplay,
        item.distance?.toFixed(3) || '-'
      ];
    } else if (graphType === 'v-t') {
      return [
        item.timeDisplay,
        item.velocity?.toFixed(3) || '-'
      ];
    } else if (graphType === 'a-t') {
      return [
        item.timeDisplay,
        item.acceleration?.toFixed(3) || '-'
      ];
    }
    return [item.timeDisplay, '-'];
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
    link.download = `experiment_data_${graphType}_${new Date().toISOString()}.csv`;
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
// Experiment Graph Component (with enhanced features)
// =================================================================================
const ExperimentGraph = ({ experimentType, token, sharedWebSocket, sharedExperimentManager }) => {
  const [chartData, setChartData] = useState([]);
  const [graphType, setGraphType] = useState('s-t');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [zoomDomain, setZoomDomain] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [saveStatus, setSaveStatus] = useState(null);
  const chartDataRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const sensorStartTimeRef = useRef(null);

  // Use shared connections instead of creating new ones
  const { sendMessage, lastMessage, addMessageHandler, getQueuedMessages } = sharedWebSocket;
  const { saveExperimentData, saveStatus: wsSaveStatus } = sharedExperimentManager;

  // Timer countdown effect
  useEffect(() => {
    if (isRunning && !isPaused && totalDuration > 0) {
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const remaining = Math.max(0, totalDuration - elapsed);
        setTimeRemaining(remaining);
        
        // ESP32 firmware now handles automatic experiment stop when duration is reached
        // We only update the UI timer, the firmware will send experiment_completed status
        if (remaining <= 0) {
          // Clear the timer but don't send stop command - ESP32 handles this
          setIsRunning(false);
          setIsPaused(false);
          setTimeRemaining(0);
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
        }
      }, 100);
      
      return () => clearInterval(timerRef.current);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRunning, isPaused, totalDuration]);

  useEffect(() => {
    // Process all queued real-time data messages to prevent data loss
    const processQueuedMessages = () => {
      const queuedMessages = getQueuedMessages();
      console.log('Processing queued messages, count:', queuedMessages.length);
      
      queuedMessages.forEach((message, index) => {
        console.log(`Processing message ${index + 1}:`, message);
        const messageData = message?.data || message;
        if (messageData?.distance !== undefined) {
          // Use firmware-provided timestamp if available; fallback to Date.now()
          const timeCandidate = (messageData?.time ?? messageData?.timestamp ?? message?.timestamp);
          const rawMs = Number(timeCandidate);
          let elapsedMs;
          
          if (Number.isFinite(rawMs)) {
            // Initialize sensor baseline on first valid timestamp
            if (sensorStartTimeRef.current === null) {
              sensorStartTimeRef.current = rawMs;
            }
            elapsedMs = rawMs - sensorStartTimeRef.current;
          } else {
            // Fallback to UI-side elapsed time
            elapsedMs = startTimeRef.current ? (Date.now() - startTimeRef.current) : 0;
          }
          
          if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
            elapsedMs = 0;
          }
          
          const newData = {
            time: elapsedMs,
            timeDisplay: Number.isFinite(elapsedMs / 1000) ? (elapsedMs / 1000).toFixed(2) : '0.00',
            distance: messageData.distance,
            velocity: messageData.velocity || 0,
            acceleration: messageData.acceleration || 0
          };
          
          chartDataRef.current = [...chartDataRef.current, newData];
          console.log('Added data point:', newData, 'Total points:', chartDataRef.current.length);
        } else {
          console.log('Message has no distance data:', messageData);
        }
      });
      
      if (queuedMessages.length > 0) {
        console.log('Updating chart data, total points:', chartDataRef.current.length);
        setChartData([...chartDataRef.current]);
      }
    };

    // Process queued messages every 50ms to batch updates
    const interval = setInterval(processQueuedMessages, 50);
    
    return () => clearInterval(interval);
  }, [getQueuedMessages]);

  // Handle device status messages (experiment_completed, etc.)
  useEffect(() => {
    const handleDeviceStatus = (message) => {
      if (message.type === 'device_status' && message.data) {
        const { status, device_id, timestamp } = message.data;
        console.log('Received device status:', { status, device_id, timestamp });
        
        if (status === 'experiment_completed') {
          // ESP32 firmware has completed the experiment automatically
          console.log('Experiment completed by ESP32 firmware');
          setIsRunning(false);
          setIsPaused(false);
          setTimeRemaining(0);
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          
          // Show completion message to user
          alert('✓ Experiment completed successfully by the ESP32 firmware!');
        }
      }
    };

    // Add message handler for device status
    const removeHandler = addMessageHandler(handleDeviceStatus);
    
    // Cleanup on component unmount
    return () => {
      removeHandler();
    };
  }, [addMessageHandler]);

  // Monitor WebSocket save status
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

  const handleStart = async () => {
    chartDataRef.current = [];
    setChartData([]);
    setIsRunning(true);
    setIsPaused(false);
    sensorStartTimeRef.current = null;
    
    // Get duration from configuration
    try {
      const config = JSON.parse(localStorage.getItem('experimentConfig') || '{"duration_s": 10}');
      setTotalDuration(config.duration_s || 10);
      setTimeRemaining(config.duration_s || 10);
      startTimeRef.current = Date.now();
    } catch (e) {
      setTotalDuration(10);
      setTimeRemaining(10);
      startTimeRef.current = Date.now();
    }
    
    sendMessage({ action: 'start_experiment' });
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
    sendMessage({ action: 'stop_experiment' });
  };

  const handleSaveToProfile = async () => {
    try {
      // Use WebSocket for saving experiment data
      saveExperimentData({
        experiment_type: experimentType,
        graph_type: graphType,
        data: chartData,
        timestamp: new Date().toISOString()
      });
      
      // Set initial status and start polling
      setSaveStatus({ status: 'loading', message: 'Saving data...' });
      
      // Poll for status updates
      const checkStatus = () => {
        if (saveStatus && saveStatus.status !== 'loading') {
          clearInterval(statusInterval);
        }
      };
      
      const statusInterval = setInterval(checkStatus, 100);
      setTimeout(() => clearInterval(statusInterval), 5000); // Timeout after 5 seconds
      
    } catch (error) {
      alert('❌ Error saving data: ' + error.message);
    }
  };

  const exportToCSV = () => {
    const headers = graphType === 's-t' 
      ? ['Time (s)', 'Distance (cm)']
      : graphType === 'v-t'
      ? ['Time (s)', 'Velocity (cm/s)']
      : ['Time (s)', 'Acceleration (cm/s²)'];
    
    const csvContent = [
      headers.join(','),
      ...chartData.map(item => {
        if (graphType === 's-t') {
          return `${item.timeDisplay},${item.distance?.toFixed(3)}`;
        } else if (graphType === 'v-t') {
          return `${item.timeDisplay},${item.velocity?.toFixed(3)}`;
        } else {
          return `${item.timeDisplay},${item.acceleration?.toFixed(3)}`;
        }
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `experiment_${graphType}_${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getYAxisData = () => {
    if (graphType === 's-t') return 'distance';
    if (graphType === 'v-t') return 'velocity';
    if (graphType === 'a-t') return 'acceleration';
    return 'distance';
  };

  const getYAxisLabel = () => {
    if (graphType === 's-t') return 'Distance (cm)';
    if (graphType === 'v-t') return 'Velocity (cm/s)';
    if (graphType === 'a-t') return 'Acceleration (cm/s²)';
    return 'Value';
  };

  const getLineColor = () => {
    if (graphType === 's-t') return '#3b82f6';
    if (graphType === 'v-t') return '#10b981';
    if (graphType === 'a-t') return '#f59e0b';
    return '#3b82f6';
  };

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

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (isGraphFullscreen) setIsGraphFullscreen(false);
        if (isTableFullscreen) setIsTableFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isGraphFullscreen, isTableFullscreen]);

  const GraphComponent = () => (
    <div className={`bg-white rounded-xl shadow-lg border border-slate-200 p-4 ${
      isGraphFullscreen ? 'fixed inset-4 z-50' : ''
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
          <FiBarChart2 className="text-purple-600" />
          <span className="hidden sm:inline">Real-time Plot</span>
          <span className="sm:hidden">Plot</span>
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setZoomDomain(null)}
            className="px-2 py-1.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-all text-xs flex items-center gap-1"
            title="Reset Zoom"
          >
            <FiRefreshCw size={14} />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <button
            onClick={() => setIsGraphFullscreen(!isGraphFullscreen)}
            className="px-2 py-1.5 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-all text-xs flex items-center gap-1"
          >
            {isGraphFullscreen ? <FiMinimize size={14} /> : <FiMaximize size={14} />}
            <span className="hidden sm:inline">{isGraphFullscreen ? 'Exit' : 'Full'}</span>
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={isGraphFullscreen ? window.innerHeight - 150 : 350}>
        <LineChart 
          data={chartData} 
          margin={{ top: 5, right: 10, left: -5, bottom: 5 }}
          onMouseDown={(e) => {
            if (e && e.activeLabel) {
              setZoomDomain({ start: e.activeLabel });
            }
          }}
          onMouseMove={(e) => {
            if (zoomDomain?.start && e && e.activeLabel) {
              setZoomDomain({ ...zoomDomain, end: e.activeLabel });
            }
          }}
          onMouseUp={() => {
            if (zoomDomain?.start && zoomDomain?.end) {
              // Zoom applied
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="timeDisplay" 
            label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
            tick={{ fontSize: 11 }}
            domain={zoomDomain ? [zoomDomain.start, zoomDomain.end] : ['auto', 'auto']}
          />
          <YAxis 
            dataKey={getYAxisData()} 
            label={{ value: getYAxisLabel(), angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 11 }}
            width={50}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: 'white', 
              borderRadius: '8px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              border: '2px solid #e2e8f0',
              fontSize: '12px'
            }}
            labelStyle={{ color: '#334155', fontWeight: 'bold' }}
          />
          <Brush 
            dataKey="timeDisplay" 
            height={25} 
            stroke="#8b5cf6"
            fill="#f5f3ff"
            onChange={(domain) => {
              if (domain) {
                setZoomDomain({ start: domain.startIndex, end: domain.endIndex });
              }
            }}
          />
          <Line 
            type="monotone" 
            dataKey={getYAxisData()} 
            stroke={getLineColor()} 
            strokeWidth={2.5} 
            dot={false} 
            activeDot={{ r: 5, strokeWidth: 2, fill: 'white' }}
          />
        </LineChart>
      </ResponsiveContainer>
      {isGraphFullscreen && (
        <div className="text-center text-xs text-slate-500 mt-2">
          Use mouse to drag and select area to zoom. Scroll to zoom in/out. Press ESC to exit.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Status Bar and Controls */}
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
          </div>
        </div>
      </div>

      {/* Control Buttons */}
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
        </div>
      </div>

      {/* Graph Type Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
        {[
          { key: 's-t', label: 'Distance', shortLabel: 'S-T' },
          { key: 'v-t', label: 'Velocity', shortLabel: 'V-T' },
          { key: 'a-t', label: 'Acceleration', shortLabel: 'A-T' }
        ].map(type => (
          <button
            key={type.key}
            onClick={() => setGraphType(type.key)}
            className={`flex-1 px-3 py-2 font-semibold transition-all rounded-md whitespace-nowrap text-xs sm:text-sm ${
              graphType === type.key
                ? 'bg-white text-purple-700 shadow-md'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <span className="hidden sm:inline">{type.label}</span>
            <span className="sm:hidden">{type.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Statistics */}
      <DataStatistics data={chartData} dataType={graphType} />

      {/* Split View: Graph (2/3) + Table (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Graph - 2/3 width */}
        <div className="lg:col-span-2">
          <GraphComponent />
        </div>

        {/* Table - 1/3 width */}
        <div className="lg:col-span-1">
          <LiveDataTable 
            data={chartData}
            graphType={graphType}
            isFullscreen={isTableFullscreen}
            onToggleFullscreen={() => setIsTableFullscreen(!isTableFullscreen)}
          />
        </div>
      </div>

      {/* Export and Save Buttons */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-md border-2 border-purple-200 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportToCSV}
            disabled={chartData.length === 0}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiDownload size={16} /> Export CSV
          </button>
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
            Start the experiment to enable export and save options
          </p>
        )}
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
  console.log('ExperimentInterface - userToken:', userToken ? userToken.substring(0, 10) + '...' : 'null');

  // Create shared WebSocket connections at the top level
  const sharedWebSocket = useWebSocket(userToken, true);
  console.log('ExperimentInterface - sharedWebSocket state:', {
    isConnected: sharedWebSocket.isConnected,
    isConnecting: sharedWebSocket.isConnecting,
    error: sharedWebSocket.error
  });
  const sharedDeviceManager = useDeviceManager(sharedWebSocket);
  const sharedExperimentManager = useExperimentManager(sharedWebSocket);
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

  useEffect(() => {
    console.log('=== showConfigModal state changed ===');
    console.log('showConfigModal:', showConfigModal);
    console.log('selectedDevice:', selectedDevice);
    console.log('experimentType:', experimentType);
  }, [showConfigModal, selectedDevice, experimentType]);

  const handleComplete = ({ device, experimentType: expType, token }) => {
    console.log('=== handleComplete called ===');
    console.log('Received parameters:', { device, experimentType: expType, token });
    console.log('Current showConfigModal state:', showConfigModal);
    
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
          
          {/* Header */}
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

          {/* Main Content */}
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
            />
          </div>

        </div>
      )}
      
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
