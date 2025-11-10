import React, { useState, useEffect } from 'react';
import { 
  FiSettings, FiCheckCircle, FiAlertTriangle, FiLoader, 
  FiWifiOff, FiZap, FiX
} from 'react-icons/fi';

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
        
        const expType = experimentType === 'distance' ? 'tof' : experimentType;
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
      'inclined_plane': 'inclined_plane'
    };
    
    const firmwareType = firmwareMap[type];
    setPendingFirmware(firmwareType);
    
    const firmwareNames = {
      'distance': 'TOF.bin',
      'inclined_plane': 'INC.bin'
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
    
    // Reset firmware status to ensure UI shows flashing progress for subsequent flashes
    sharedExperimentManager.clearData();

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
        'inclined_plane': ['inclined_plane', 'angle', 'incline'],
        'angle': ['inclined_plane', 'angle', 'incline']
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
                onClick={() => handleExperimentTypeSelection('inclined_plane')}
                className={`p-6 rounded-xl border-2 transition-all duration-300 group ${
                  experimentType === 'inclined_plane'
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

export default ConfigurationModal;