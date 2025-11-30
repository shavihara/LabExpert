import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { 
  FiSettings, 
  FiCheckCircle, 
  FiAlertTriangle, 
  FiLoader, 
  FiWifiOff, 
  FiZap, 
  FiX, 
  FiArrowLeft,
  FiCpu,
  FiThermometer,
  FiActivity,
  FiRadio
} from 'react-icons/fi';
import { 
  getExperimentConfig, 
  getAllMainExperiments,
  getSubExperiments 
} from '../../experiments/experimentConfig';
import { 
  ResponsiveCard, 
  ResponsiveButton, 
  LoadingSpinner, 
  StatusIndicator
} from '../ui-system/ResponsiveUI';

/**
 * Dynamic Experiment Selector Component
 * Replaces hard-coded ConfigurationModal with modular experiment selection
 */
const DynamicExperimentSelector = ({ 
  experimentId = '1', 
  onComplete, 
  sharedWebSocket, 
  sharedDeviceManager, 
  sharedExperimentManager 
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const userToken = localStorage.getItem('token');
  const [selectedSubExperiment, setSelectedSubExperiment] = useState(null);
  const [flashStatus, setFlashStatus] = useState('Select a sensor to begin');
  const [isFlashing, setIsFlashing] = useState(false);
  const [pendingFirmware, setPendingFirmware] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [experimentConfig, setExperimentConfig] = useState(null);
  const [subExperiments, setSubExperiments] = useState([]);

  useEffect(() => {
    console.log('DynamicExperimentSelector mounted for experiment:', experimentId);
    const config = getExperimentConfig(experimentId, `${experimentId}.1`);
    if (config) {
      setExperimentConfig(config.mainExperiment);
      setSubExperiments(getSubExperiments(experimentId));
      console.log('DynamicExperimentSelector config set:', config.mainExperiment);
    } else {
      console.error(`Experiment configuration not found for ID: ${experimentId}`);
    }
  }, [experimentId]);

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

  // Handle firmware status updates
  useEffect(() => {
    if (firmwareStatus && firmwareStatus.success === true) {
      console.log('Firmware flash successful, transitioning to experiment...');
      const expType = selectedSubExperiment.firmwareType;
      onComplete({ 
        device: selectedDevice, 
        experimentType: expType, 
        token: userToken 
      });
    }
  }, [firmwareStatus, selectedSubExperiment, selectedDevice, userToken, onComplete]);

  // Handle experiment selection
  const handleSubExperimentSelect = (subExperiment) => {
    setSelectedSubExperiment(subExperiment);
    setPendingFirmware(subExperiment.firmwareType);
    setFlashStatus(`${subExperiment.firmware} prepared. Select a sensor to flash firmware.`);
  };

  // Handle device flashing
  const handleFlash = async (device) => {
    if (!pendingFirmware || !selectedSubExperiment) {
      setFlashStatus('Please select an experiment type first');
      return;
    }

    console.log('=== STARTING FLASH OPERATION ===');
    setIsFlashing(true);
    setSelectedDevice(device);
    setFlashStatus('Allocating device...');
    
    // Reset firmware status
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

  // Filter devices based on selected experiment
  const getCompatibleDevices = () => {
    if (!selectedSubExperiment) return devices;
    
    return devices.filter(device => {
      if (device.supported_experiments && Array.isArray(device.supported_experiments)) {
        return device.supported_experiments.includes(selectedSubExperiment.id);
      }
      
      if (device.type) {
        const experimentToDeviceType = {
          'displacement': ['tof', 'displacement', 'distance'],
          'inclined_plane': ['inclined_plane', 'angle', 'incline'],
          'pendulum_simple': ['pendulum', 'accelerometer', 'gyroscope'],
          'pendulum_compound': ['pendulum', 'accelerometer', 'gyroscope'],
          'thermal': ['temperature', 'thermal', 'thermometer'],
          'light_intensity': ['light', 'ldr', 'photo', 'intensity', 'lux']
        };
        
        const compatibleTypes = experimentToDeviceType[selectedSubExperiment.firmwareType] || [];
        return compatibleTypes.some(type => 
          device.type.toLowerCase().includes(type.toLowerCase())
        );
      }
      
      return true;
    });
  };

  // Get flash status display (theme-aware)
  const getFlashStatusDisplay = () => {
    if (flashStatus.includes('✓')) {
      return { icon: <FiCheckCircle className={`${isDark ? 'text-green-300' : 'text-green-500'}`} />, color: isDark ? 'text-green-300' : 'text-green-600' };
    }
    if (flashStatus.includes('✗')) {
      return { icon: <FiAlertTriangle className={`${isDark ? 'text-red-300' : 'text-red-500'}`} />, color: isDark ? 'text-red-300' : 'text-red-600' };
    }
    if (isFlashing) {
      return { icon: <FiLoader className={`animate-spin ${isDark ? 'text-purple-300' : 'text-purple-600'}`} />, color: isDark ? 'text-purple-300' : 'text-purple-600' };
    }
    return { icon: <FiSettings className={`${isDark ? 'text-slate-400' : 'text-gray-500'}`} />, color: isDark ? 'text-slate-400' : 'text-gray-600' };
  };

  // Calculate progress percentage
  const getProgressPercentage = () => {
    if (firmwareStatus?.progress !== null && firmwareStatus?.progress !== undefined) {
      return firmwareStatus.progress;
    }
    
    if (flashStatus.includes('Allocating')) return 5;
    if (flashStatus.includes('Flashing')) return 10;
    if (flashStatus.includes('✓')) return 100;
    if (flashStatus.includes('✗')) return 0;
    return 0;
  };

  // Get icon for experiment type
  const getExperimentIcon = (firmwareType) => {
    const iconMap = {
      'displacement': <FiActivity className="w-8 h-8" />,
      'inclined_plane': <FiCpu className="w-8 h-8" />,
      'pendulum_simple': <FiRadio className="w-8 h-8" />,
      'pendulum_compound': <FiRadio className="w-8 h-8" />,
      'thermal': <FiThermometer className="w-8 h-8" />,
      'light_intensity': <FiActivity className="w-8 h-8" />
    };
    
    return iconMap[firmwareType] || <FiZap className="w-8 h-8" />;
  };

  const flashStatusDisplay = getFlashStatusDisplay();
  const compatibleDevices = getCompatibleDevices();
  const progressPercentage = getProgressPercentage();

  if (!experimentConfig) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
        {/* Experiment Description */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <span className="text-4xl mr-3">{experimentConfig.icon}</span>
            <div>
              <h3 className="text-xl font-bold text-gray-800">{experimentConfig.name}</h3>
              <p className="text-gray-600">{experimentConfig.description}</p>
            </div>
          </div>
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium" 
               style={{ backgroundColor: `${experimentConfig.color}20`, color: experimentConfig.color }}>
            {experimentConfig.category}
          </div>
        </div>

        {/* Sub-Experiment Selection */}
        <div>
          <h4 className={`text-lg font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>Select Experiment Type</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subExperiments.map((subExp) => (
              <ResponsiveCard
                key={subExp.id}
                onClick={() => handleSubExperimentSelect(subExp)}
                hover={true}
                className={`cursor-pointer transition-all duration-300 ${
                  selectedSubExperiment?.id === subExp.id
                    ? (isDark ? 'ring-2 ring-purple-500 bg-slate-800' : 'ring-2 ring-blue-500 bg-blue-50')
                    : (isDark ? 'hover:ring-2 hover:ring-slate-600' : 'hover:ring-2 hover:ring-gray-300')
                }`}
              >
                <div className="text-center">
                  <div className="flex items-center justify-center mb-3">
                    {getExperimentIcon(subExp.firmwareType)}
                  </div>
                  <h5 className={`font-semibold mb-2 ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{subExp.name}</h5>
                  <p className={`text-sm mb-3 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{subExp.description}</p>
                  <div className={`text-xs font-medium ${isDark ? 'text-indigo-300' : 'text-blue-600'}`}>
                    Firmware: {subExp.firmware}
                  </div>
                  {selectedSubExperiment?.id === subExp.id && (
                    <div className="mt-3">
                      <FiCheckCircle className={`w-6 h-6 mx-auto ${isDark ? 'text-green-300' : 'text-green-500'}`} />
                    </div>
                  )}
                </div>
              </ResponsiveCard>
            ))}
          </div>
        </div>

        {/* Sensor Selection */}
        <div>
          <h4 className="text-lg font-semibold text-gray-800 mb-4">Select Sensor</h4>
          
          <div className="mb-4 flex items-center gap-4">
            <ResponsiveButton
              variant="primary"
              onClick={async () => {
                const wsSuccess = sharedWebSocket.sendMessage({ action: 'scan_devices' });
                if (!wsSuccess || !isConnected) {
                  console.log('WebSocket scan failed or not connected, no REST API fallback available');
                }
              }}
              icon={<FiRadio />}
            >
              Scan Devices
            </ResponsiveButton>
            
            <div className="text-sm text-gray-600">
              Connected: {isConnected ? 'Yes' : 'No'} | 
              Scanning: {isScanning ? 'Yes' : 'No'} | 
              Devices: {devices.length}
            </div>
          </div>
          
          <div className={`max-h-60 overflow-y-auto rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
            {isScanning ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
                <span className="ml-3 text-gray-600">Scanning for devices...</span>
              </div>
            ) : compatibleDevices.length === 0 ? (
              <div className="text-center py-8">
                <FiWifiOff className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h5 className="text-lg font-medium text-gray-800 mb-2">No Compatible Devices Found</h5>
                <p className="text-gray-600 mb-4">
                  {selectedSubExperiment 
                    ? `No devices found for ${selectedSubExperiment.name}. Ensure devices are online.`
                    : "Select an experiment type first to see compatible devices."
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {compatibleDevices.map(device => (
                  <ResponsiveCard
                    key={device.id}
                    onClick={() => handleFlash(device)}
                    disabled={isFlashing || !selectedSubExperiment}
                    hover={true}
                    className="cursor-pointer hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-800">{device.id}</div>
                        <div className="text-sm text-gray-500">{device.ip_address || 'Unknown IP'}</div>
                      </div>
                      <FiZap className="w-5 h-5 text-gray-400" />
                    </div>
                  </ResponsiveCard>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status Display */}
        <div className={`relative rounded-lg overflow-hidden border ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
          {/* Progress Bar (theme-aware gradient) */}
          <div 
            className={`absolute inset-0 transition-all duration-500 ease-out ${isDark ? 'bg-gradient-to-r from-purple-500 to-indigo-500' : 'bg-gradient-to-r from-green-300 to-green-400'}`}
            style={{ width: `${progressPercentage}%` }}
          />
          <div className="relative z-10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="mr-2">{flashStatusDisplay.icon}</span>
                <span className={`text-sm font-medium ${flashStatusDisplay.color}`}>
                  {flashStatus}
                </span>
              </div>
              <span className="text-xs text-gray-500">
                {progressPercentage}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-gray-200">
          <ResponsiveButton
            variant="secondary"
            onClick={() => window.location.href = '/dashboard'}
            icon={<FiArrowLeft />}
          >
            Back to Dashboard
          </ResponsiveButton>
          
          {selectedSubExperiment && (
            <div className="text-sm text-gray-600 flex items-center">
              Selected: <span className="font-medium ml-1">{selectedSubExperiment.name}</span>
            </div>
          )}
        </div>
      </div>
  );
};

export default DynamicExperimentSelector;
