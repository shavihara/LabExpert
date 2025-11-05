import React, { useState, useEffect, useRef, useCallback } from 'react';
import PlotlyGraph from '../components/PlotlyGraph';
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
    return { icon: <FiLoader className="text-blue-500 animate-spin" />, color: 'text-blue-600' };
  };

  const { icon: statusIcon, color: statusColor } = getFlashStatusDisplay();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
            <FiZap className="text-purple-600" />
            Sensor Configuration
          </h2>
          
          {/* Experiment Type Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-700 mb-3">Select Experiment Type</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleExperimentTypeSelection('distance')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  experimentType === 'distance' 
                    ? 'border-purple-600 bg-purple-50 text-purple-700' 
                    : 'border-slate-200 hover:border-purple-300 hover:bg-purple-25'
                }`}
              >
                <div className="text-center">
                  <div className="text-lg font-semibold mb-1">Displacement Analysis</div>
                  <div className="text-xs text-slate-600">Time-of-Flight Sensor</div>
                </div>
              </button>
              
              <button
                onClick={() => handleExperimentTypeSelection('oscillation')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  experimentType === 'oscillation' 
                    ? 'border-blue-600 bg-blue-50 text-blue-700' 
                    : 'border-slate-200 hover:border-blue-300 hover:bg-blue-25'
                }`}
              >
                <div className="text-center">
                  <div className="text-lg font-semibold mb-1">Inclined Plane</div>
                  <div className="text-xs text-slate-600">Angle/Oscillation Sensor</div>
                </div>
              </button>
            </div>
          </div>

          {/* Available Devices */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-700">Available Sensors</h3>
              <button
                onClick={scanDevices}
                disabled={isScanning}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                <FiRefreshCw className={isScanning ? 'animate-spin' : ''} />
                {isScanning ? 'Scanning...' : 'Refresh'}
              </button>
            </div>
            
            <div className="grid gap-3 max-h-60 overflow-y-auto">
              {tofDevices.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  {isScanning ? (
                    <>
                      <FiLoader className="animate-spin text-blue-500 mx-auto mb-2" size={24} />
                      <p>Scanning for sensors...</p>
                    </>
                  ) : (
                    <>
                      <FiWifiOff className="mx-auto mb-2" size={24} />
                      <p>No sensors found. Make sure your sensor is powered on and connected.</p>
                    </>
                  )}
                </div>
              ) : (
                tofDevices.map((device) => (
                  <div
                    key={device.id}
                    className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FiWifi className="text-green-500" />
                        <div>
                          <div className="font-semibold text-slate-800">{device.id}</div>
                          <div className="text-xs text-slate-500">{device.type || 'Unknown Type'}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleFlash(device)}
                        disabled={isFlashing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {isFlashing && selectedDevice?.id === device.id ? 'Flashing...' : 'Flash Firmware'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Flash Status */}
          <div className="p-4 bg-slate-50 rounded-xl mb-6">
            <div className="flex items-center gap-3">
              {statusIcon}
              <span className={`font-medium ${statusColor}`}>{flashStatus}</span>
            </div>
          </div>

          {/* Connection Status */}
          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              {isConnected ? (
                <FiWifi className="text-green-500" />
              ) : (
                <FiWifiOff className="text-red-500" />
              )}
              <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
                {isConnected ? 'Connected to server' : 'Disconnected from server'}
              </span>
            </div>
            {isConnected && (
              <div className="text-xs text-slate-500">
                WebSocket connection established. Ready to communicate with sensors.
              </div>
            )}
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
  const [localConfig, setLocalConfig] = useState(config);

  const handleSave = () => {
    onChange(localConfig);
    onClose();
  };

  const handleInputChange = (key, value) => {
    setLocalConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800">Experiment Configuration</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <FiX size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Sampling Frequency (Hz)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={localConfig.frequency_hz}
                onChange={(e) => handleInputChange('frequency_hz', parseInt(e.target.value))}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Maximum Distance (cm)
              </label>
              <input
                type="number"
                min="10"
                max="400"
                value={localConfig.max_distance_cm}
                onChange={(e) => handleInputChange('max_distance_cm', parseInt(e.target.value))}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Duration (seconds)
              </label>
              <input
                type="number"
                min="1"
                max="3600"
                value={localConfig.duration_s}
                onChange={(e) => handleInputChange('duration_s', parseInt(e.target.value))}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =================================================================================
// Plotly Graph Controls Component
// =================================================================================
const PlotlyGraphControls = ({ 
  isRunning, 
  isPaused, 
  onStart, 
  onPause, 
  onStop, 
  onReset,
  chartData,
  onSaveToProfile,
  onExportCSV
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const graphRef = useRef(null);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      graphRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleSaveToProfile = () => {
    if (chartData.length > 0) {
      onSaveToProfile();
    }
  };

  const handleExportCSV = () => {
    if (chartData.length > 0) {
      onExportCSV();
    }
  };

  return (
    <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-lg">
      <div className="flex items-center gap-2">
        <button
          onClick={onStart}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition-all"
        >
          <FiPlay size={16} /> Start
        </button>
        
        <button
          onClick={onPause}
          disabled={!isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 disabled:opacity-50 transition-all"
        >
          <FiPause size={16} /> {isPaused ? 'Resume' : 'Pause'}
        </button>
        
        <button
          onClick={onStop}
          disabled={!isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 transition-all"
        >
          <FiStopCircle size={16} /> Stop
        </button>
        
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all"
        >
          <FiRefreshCw size={16} /> Reset
        </button>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={handleExportCSV}
          disabled={chartData.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 disabled:opacity-50 transition-all"
        >
          <FiDownload size={16} /> Export CSV
        </button>
        
        <button
          onClick={handleSaveToProfile}
          disabled={chartData.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 transition-all"
        >
          <FiSave size={16} /> Save to Profile
        </button>
        
        <button
          onClick={handleFullscreen}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-all"
        >
          {isFullscreen ? <FiMinimize size={16} /> : <FiMaximize size={16} />}
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>

      {chartData.length === 0 && (
        <p className="text-center text-xs text-slate-500 mt-2">
          Start the experiment to enable export and save options
        </p>
      )}
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
  
  // Manage experiment data at the top level to ensure proper sharing
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
      
      {/* Configuration Modal and Panel */}
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
            <PlotlyGraph 
              experimentType={experimentType} 
              token={userToken} 
              sharedWebSocket={sharedWebSocket}
              sharedExperimentManager={sharedExperimentManager}
              chartData={experimentData}
              graphType="s-t"
              isRunning={sharedExperimentManager.isRunning}
              isPaused={sharedExperimentManager.isPaused}
              onStart={() => sharedExperimentManager.startExperiment({}, experimentType)}
              onPause={() => {
                if (sharedExperimentManager.isRunning && !sharedExperimentManager.isPaused) {
                  sharedWebSocket.sendMessage({ action: 'pause_experiment' });
                } else if (sharedExperimentManager.isRunning && sharedExperimentManager.isPaused) {
                  sharedWebSocket.sendMessage({ action: 'resume_experiment' });
                }
              }}
              onStop={sharedExperimentManager.stopExperiment}
              onReset={sharedExperimentManager.clearData}
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
