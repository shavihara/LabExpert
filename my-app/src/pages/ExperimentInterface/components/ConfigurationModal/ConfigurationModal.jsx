import React, { useState, useEffect } from 'react';
import { useTheme } from '../../../../context/ThemeContext';
import { 
  FiSettings, FiCheckCircle, FiAlertTriangle, FiLoader, 
  FiWifiOff, FiZap, FiX, FiArrowLeft
} from 'react-icons/fi';

const ConfigurationModal = ({ experimentId = 1, onComplete, sharedWebSocket, sharedDeviceManager, sharedExperimentManager }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const userToken = localStorage.getItem('token');
  const [experimentType, setExperimentType] = useState('');
  const [flashStatus, setFlashStatus] = useState('Select a sensor to begin');
  const [isFlashing, setIsFlashing] = useState(false);
  const [pendingFirmware, setPendingFirmware] = useState(null);
  const [pendingFirmwareFile, setPendingFirmwareFile] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Experiment configuration mapping based on experimentId
  const experimentConfigs = {
    1: {
      name: 'Distance Measure',
      subExperiments: [
        {
          id: 'distance',
          name: 'Free Fall Experiment',
          description: 'Measure distance, velocity, and acceleration.',
          icon: '⚾',
          firmware: 'TOF.bin',
          firmwareType: 'displacement'
        },
        {
          id: 'inclined_plane', 
          name: 'Modern Galileo Experiment',
          description: 'Analyze motion on an inclined plane.',
          icon: '📐',
          firmware: 'ULTINC.bin',
          firmwareType: 'inclined_plane'
        }
      ]
    },
    2: {
      name: 'Oscillation Counter',
      subExperiments: [
        {
          id: 'pendulum_simple',
          name: 'Simple Pendulum',
          description: 'Measure oscillation period and frequency.',
          icon: '🔄',
          firmware: 'OSISIM.bin',
          firmwareType: 'pendulum_simple'
        },
        {
          id: 'pendulum_compound',
          name: 'Compound Pendulum',
          description: 'Analyze complex pendulum motion with damping.',
          icon: '⚖️',
          firmware: 'OSICOM.bin',
          firmwareType: 'pendulum_compound'
        }
      ]
    },
    5: {
      name: 'Motion Detection',
      subExperiments: [
        {
          id: '5.1',
          name: 'Experiment A',
          description: 'Motion detection experiment type A',
          icon: '📹',
          firmware: 'A.bin',
          firmwareType: 'motion'
        },
        {
          id: '5.2',
          name: 'Experiment B',
          description: 'Motion detection experiment type B',
          icon: '📹',
          firmware: 'B.bin',
          firmwareType: 'motion'
        }
      ]
    }
  };

  const currentConfig = experimentConfigs[experimentId] || experimentConfigs[1];

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
    
    // Handle real-time progress updates from backend
    if (firmwareStatus && firmwareStatus.progress !== null && firmwareStatus.progress !== undefined) {
      console.log('Progress update received:', firmwareStatus.progress + '%');
      
      // Update flash status based on progress
      if (firmwareStatus.progress > 0 && firmwareStatus.progress < 100) {
        setFlashStatus(`Flashing firmware... ${firmwareStatus.progress}%`);
      }
    }
    
    if (isFlashing && firmwareStatus && firmwareStatus.success !== null) {
      console.log('=== CONDITION MET - PROCESSING FIRMWARE RESULT ===');
      if (firmwareStatus.success) {
        console.log('Firmware flash successful, transitioning to experiment...');
        setFlashStatus('✓ Firmware flashed successfully');
        
        const expType = (() => {
          if (experimentType === 'distance') return 'tof';
          if (experimentType === 'pendulum_simple' || experimentType === 'pendulum_compound') return 'oscillation';
          return experimentType;
        })();
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
    try { localStorage.setItem('experimentType', type); } catch {}
    try { window.dispatchEvent(new CustomEvent('labex:experiment-type:changed', { detail: type })); } catch {}
    
    // Find the selected sub-experiment configuration
    const selectedSubExp = currentConfig.subExperiments.find(sub => sub.id === type);
    if (selectedSubExp) {
      setPendingFirmware(selectedSubExp.firmwareType);
      setPendingFirmwareFile(selectedSubExp.firmware);
      setFlashStatus(`${selectedSubExp.firmware} prepared. Select a sensor to flash firmware.`);
    }
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
      
      const normalizedType = (pendingFirmware === 'pendulum_simple' || pendingFirmware === 'pendulum_compound') ? 'oscillation' : pendingFirmware;
      console.log('Flashing firmware for device:', device.id, 'with type:', normalizedType, 'file:', pendingFirmwareFile);
      flashFirmware(device.id, normalizedType, pendingFirmwareFile);

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
      return { icon: <FiCheckCircle className={isDark ? "text-green-400" : "text-green-500"} />, color: isDark ? 'text-green-400' : 'text-green-600' };
    }
    if (flashStatus.includes('✗')) {
      return { icon: <FiAlertTriangle className={isDark ? "text-red-400" : "text-red-500"} />, color: isDark ? 'text-red-400' : 'text-red-600' };
    }
    if (isFlashing) {
      return { icon: <FiLoader className={`animate-spin ${isDark ? "text-blue-200" : "text-purple-600"}`} />, color: isDark ? 'text-blue-100' : 'text-purple-600' };
    }
    return { icon: <FiSettings className={isDark ? "text-slate-400" : "text-gray-500"} />, color: isDark ? 'text-slate-400' : 'text-gray-600' };
  };
  const flashStatusDisplay = getFlashStatusDisplay();

  // Calculate progress percentage based on backend progress or flash status
  const getProgressPercentage = () => {
    // Use backend-provided progress if available
    if (firmwareStatus && firmwareStatus.progress !== null && firmwareStatus.progress !== undefined) {
      return firmwareStatus.progress;
    }
    
    // Fallback to frontend status-based progress
    if (flashStatus.includes('Allocating')) return 5;
    if (flashStatus.includes('Flashing')) return 10;
    if (flashStatus.includes('✓')) return 100; // Show 100% for successful flash
    if (flashStatus.includes('✗')) return 0;
    return 0;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all animate-fade-in">
        
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-4 sm:p-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Experiment Setup</h2>
          <p className="text-purple-100 mt-1 sm:mt-2 text-sm sm:text-base">{currentConfig.name} - Choose your configuration</p>
        </div>

        <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
          <div>
            <h3 className="text-lg sm:text-xl font-semibold text-slate-800 mb-3 sm:mb-4">1. Select Configuration Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {currentConfig.subExperiments.map((subExp) => (
                <button
                  key={subExp.id}
                  onClick={() => handleExperimentTypeSelection(subExp.id)}
                  className={`p-4 sm:p-6 rounded-xl border-2 transition-all duration-300 group ${
                    experimentType === subExp.id
                      ? (isDark ? 'border-purple-500 bg-slate-800 shadow-lg scale-105' : 'border-purple-600 bg-purple-50 shadow-lg scale-105')
                      : (isDark ? 'border-slate-700 hover:border-slate-500' : 'border-slate-200 hover:border-purple-300 hover:shadow-md')
                  }`}
                >
                  <div className="text-2xl sm:text-3xl mb-1">{subExp.icon}</div>
                  <div className={`font-semibold text-base sm:text-lg ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{subExp.name}</div>
                  <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{subExp.description}</p>
                  <p className={`text-xs mt-1 font-medium ${isDark ? 'text-indigo-300' : 'text-purple-600'}`}>→ {subExp.firmware}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2 sm:mb-3">2. Select Sensor</h3>
            
            <div className="mb-2 sm:mb-3 flex flex-col sm:flex-row sm:items-center gap-2">
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
              className="px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
            >
                Scan Devices
            </button>
              <span className="text-xs sm:text-sm text-gray-600">
                Connected: {isConnected ? 'Yes' : 'No'} | Scanning: {isScanning ? 'Yes' : 'No'} | Devices: {devices.length}
              </span>
            </div>
            
            <div className="max-h-48 sm:max-h-60 overflow-y-auto bg-slate-50 p-3 sm:p-4 rounded-lg border border-slate-200">
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
                  {tofDevices
                    .slice()
                    .sort((a, b) => {
                        const getRank = (d) => {
                            // Rank 0: Online (online_status == 1)
                            if (d.online_status === 1) return 0;
                            // Rank 1: In Use (online_status == 0 && availability == 0)
                            if (d.online_status === 0 && d.availability === 0) return 1;
                            // Rank 2: Offline (online_status == 0 && availability == 1)
                            return 2;
                        };
                        return getRank(a) - getRank(b);
                    })
                    .map(device => {
                    const getStatus = (d) => {
                      const online = d.online_status === 1;
                      const available = d.availability === 1;
                      
                      if (online) return { label: 'Online', color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200', dot: 'bg-green-500' };
                      if (!online && !available) return { label: 'In Use', color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-200', dot: 'bg-yellow-500' };
                      return { label: 'Offline', color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200', dot: 'bg-red-500' };
                    };
                    const status = getStatus(device);
                    const isDisabled = status.label === 'Offline' || status.label === 'In Use';

                    return (
                    <button
                      key={device.id}
                      onClick={() => !isDisabled && handleFlash(device)}
                      disabled={isFlashing || isDisabled}
                      className={`p-0 rounded-lg border-2 border-slate-200 bg-white text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden ${(!isFlashing && !isDisabled) ? 'hover:border-purple-600 hover:shadow-lg' : ''}`}
                    >
                      {device.sensor_type && (
                        <div className={`w-full px-3 py-1 rounded-t-lg text-xs font-semibold border-b ${isDark ? 'bg-indigo-900/50 text-indigo-200 border-indigo-700' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                          Sensor: {device.sensor_type}
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800 group-hover:text-purple-600">{device.id}</span>
                            <div className={`flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${status.bg} ${status.color} ${status.border}`}>
                               <div className={`w-1.5 h-1.5 rounded-full mr-1 ${status.dot}`}></div>
                               {status.label}
                            </div>
                          </div>
                          <FiZap className="h-4 w-4 text-slate-400 group-hover:text-purple-600" />
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{device.ip_address || 'Unknown IP'}</div>
                      </div>
                    </button>
                  )})}
                </div>
              )}
            </div>
          </div>

          {/* Detailed Status Display with Progress Background */}
          <div className={`relative rounded-lg border overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
            <div 
              className={`absolute inset-0 transition-all duration-500 ease-out ${isDark ? 'bg-gradient-to-r from-blue-400 to-blue-500 border-r border-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-gradient-to-r from-green-300 to-green-400'}`}
              style={{ width: `${getProgressPercentage()}%` }}
            />
            <div className="relative z-10 p-1 sm:p-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="mr-1 sm:mr-2">{flashStatusDisplay.icon}</span>
                <span className={`text-xs sm:text-sm font-medium ${flashStatusDisplay.color}`}>
                  {flashStatus}
                </span>
              </div>
              <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                {getProgressPercentage()}%
              </span>
            </div>
            
            {/* Additional Status Details */}
            <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {flashStatus === 'idle' && 'Ready to flash firmware to selected device'}
              {flashStatus === 'flashing' && 'Firmware is being uploaded to the device'}
              {flashStatus.includes('Allocating') && 'Connecting to device and preparing for firmware update'}
              {flashStatus.includes('✓') && 'Firmware successfully flashed! Device is ready for experiment'}
              {flashStatus.includes('✗') && 'An error occurred during the flashing process'}
              {flashStatus === 'no_device' && 'Please select a device to flash firmware'}
            </div>
            </div>
          </div>

          {/* Back to Dashboard Button */}
          <div className="flex justify-center pt-4 border-t border-slate-200">
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center"
            >
              <FiArrowLeft className="mr-2" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationModal;
