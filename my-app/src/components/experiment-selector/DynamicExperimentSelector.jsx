import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FiRadio,
  FiSearch,
  FiRefreshCw
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
  const navigate = useNavigate();
  const isDark = theme === 'dark';
  const userToken = localStorage.getItem('token');
  const [selectedSubExperiment, setSelectedSubExperiment] = useState(null);
  const [selectedSensorOption, setSelectedSensorOption] = useState(null);
  const [step, setStep] = useState(1);
  const [flashStatus, setFlashStatus] = useState('Select a sensor to begin');
  const [isFlashing, setIsFlashing] = useState(false);
  const [pendingFirmware, setPendingFirmware] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [experimentConfig, setExperimentConfig] = useState(null);
  const [subExperiments, setSubExperiments] = useState([]);
  
  // Custom search animation state
  const [isSearchingAnim, setIsSearchingAnim] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);

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
    if (firmwareStatus) {
      if (firmwareStatus.success === true) {
        console.log('Firmware flash successful, transitioning to experiment...');
        const expType = selectedSubExperiment.firmwareType;
        onComplete({ 
          device: selectedDevice, 
          experimentType: expType, 
          token: userToken 
        });
      } else if (firmwareStatus.success === false) {
        console.error('Firmware flash failed:', firmwareStatus.message);
        setFlashStatus(`✗ Error: ${firmwareStatus.message}`);
        setIsFlashing(false);
      } else if (firmwareStatus.progress !== undefined) {
        // Update progress status if currently flashing
        if (isFlashing && firmwareStatus.message) {
           setFlashStatus(firmwareStatus.message);
        }
      }
    }
  }, [firmwareStatus, selectedSubExperiment, selectedDevice, userToken, onComplete, isFlashing]);

  // Handle search animation
  const handleSearch = () => {
    setIsSearchingAnim(true);
    setSearchProgress(0);
    
    // Start actual scan
    const wsSuccess = sharedWebSocket.sendMessage({ action: 'scan_devices' });
    if (!wsSuccess || !isConnected) {
        console.log('WebSocket scan failed');
    }

    // Simulate progress animation
    const interval = setInterval(() => {
      setSearchProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsSearchingAnim(false), 500); // Small delay after 100%
          return 100;
        }
        return prev + 5;
      });
    }, 100); // 2 seconds total duration
  };

  // Handle experiment selection
  const handleSubExperimentSelect = (subExperiment) => {
    setSelectedSubExperiment(subExperiment);
    
    if (subExperiment.sensorOptions && subExperiment.sensorOptions.length > 0) {
      setSelectedSensorOption(null);
      setPendingFirmware(null);
      setFlashStatus('Select a sensor type');
      setStep(2); // New step for sensor selection
    } else {
      setSelectedSensorOption(null);
      setPendingFirmware(subExperiment.firmwareType);
      setFlashStatus(`${subExperiment.firmware} prepared.`);
      setStep(3); // Auto-advance to device selection
      handleSearch();
    }
  };

  const handleSensorOptionSelect = (option) => {
    setSelectedSensorOption(option);
    setPendingFirmware(option.firmware);
    setFlashStatus(`${option.firmware} selected.`);
    setStep(3); // Auto-advance to device selection
    handleSearch();
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

      setFlashStatus('Flashing firmware...');
      
      console.log('Flashing firmware for device:', device.id, 'with firmware type:', pendingFirmware);
      
      // Check if pendingFirmware is a specific bin file or a generic type
      const isSpecificFirmware = pendingFirmware && pendingFirmware.toLowerCase().endsWith('.bin');
      const firmwareFile = isSpecificFirmware ? pendingFirmware : null;
      
      // Pass both experiment type (for backend routing) and specific firmware file (if any)
      flashFirmware(device.id, selectedSubExperiment.firmwareType, firmwareFile);

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
      'displacement': <FiActivity className="w-6 h-6" />,
      'inclined_plane': <FiCpu className="w-6 h-6" />,
      'pendulum_simple': <FiRadio className="w-6 h-6" />,
      'pendulum_compound': <FiRadio className="w-6 h-6" />,
      'thermal': <FiThermometer className="w-6 h-6" />,
      'light_intensity': <FiActivity className="w-6 h-6" />
    };
    
    return iconMap[firmwareType] || <FiZap className="w-6 h-6" />;
  };

  const flashStatusDisplay = getFlashStatusDisplay();
  const compatibleDevices = getCompatibleDevices();
  const progressPercentage = getProgressPercentage();

  if (!experimentConfig) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden items-center">
      <div className="w-full max-w-3xl flex flex-col h-full">
        
        {/* Experiment Description - Restored Style */}
        <div className="flex-none text-center py-4 border-b border-gray-200/50 mb-2 animate-fade-in">
          <div className="flex items-center justify-center mb-2">
            <span className="text-4xl mr-3 drop-shadow-md">{experimentConfig.icon}</span>
            <div className="text-left">
              <h3 className="text-xl font-bold text-gray-800">{experimentConfig.name}</h3>
              <p className="text-sm text-gray-600">{experimentConfig.description}</p>
            </div>
          </div>
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium shadow-sm" 
               style={{ backgroundColor: `${experimentConfig.color}20`, color: experimentConfig.color }}>
            {experimentConfig.category}
          </div>
        </div>

        {/* Main Content Area - Scrollable */}
        <div className="flex-grow overflow-y-auto min-h-0 px-4 py-2 custom-scrollbar">
            {/* Wizard: Step 1 - Select Experiment Type */}
            {step === 1 && (
            <div className="space-y-4 h-full animate-slide-up">
                <div className="flex items-center gap-3 mb-2 md:mb-4 flex-none">
                    <h4 className="text-lg font-bold text-gray-800">Select Experiment</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
                {subExperiments.map((subExp) => (
                    <div
                    key={subExp.id}
                    onClick={() => handleSubExperimentSelect(subExp)}
                    className={`relative cursor-pointer p-4 md:p-6 rounded-2xl border transition-all duration-300 flex flex-col items-center text-center gap-3 group ${
                        selectedSubExperiment?.id === subExp.id
                        ? (isDark 
                            ? 'bg-slate-800 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)] ring-1 ring-purple-500' 
                            : 'bg-blue-50 border-blue-500 shadow-lg shadow-blue-500/20 ring-1 ring-blue-500')
                        : (isDark 
                            ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:shadow-lg hover:shadow-purple-500/10' 
                            : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-gray-50 hover:shadow-md')
                    }`}
                    >
                    {selectedSubExperiment?.id === subExp.id && (
                        <div className="absolute top-3 right-3">
                            <FiCheckCircle className={`w-5 h-5 ${isDark ? 'text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]' : 'text-green-500'}`} />
                        </div>
                    )}
                    
                    <div className={`p-4 rounded-full transition-colors duration-300 ${
                        selectedSubExperiment?.id === subExp.id
                        ? (isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/10 text-blue-600')
                        : (isDark ? 'bg-slate-700 text-slate-400 group-hover:text-purple-300' : 'bg-gray-100 text-gray-500 group-hover:text-blue-600')
                    }`}>
                        {getExperimentIcon(subExp.firmwareType)}
                    </div>
                    <div className="w-full">
                        <h5 className={`font-bold text-lg mb-1 ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{subExp.name}</h5>
                        <p className={`text-sm line-clamp-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{subExp.description}</p>
                    </div>
                    </div>
                ))}
                </div>
            </div>
            )}

            {/* Wizard: Step 2 - Select Sensor Type (New Step) */}
            {step === 2 && selectedSubExperiment?.sensorOptions && (
            <div className="h-full flex flex-col animate-slide-up">
                <div className="flex items-center gap-3 mb-2 md:mb-4 flex-none">
                    <ResponsiveButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setStep(1)}
                        icon={<FiArrowLeft />}
                        className="!rounded-full !px-3 shadow-sm hover:shadow-md"
                    >
                        Back
                    </ResponsiveButton>
                    <h4 className="text-lg font-bold text-gray-800">Select Sensor Type</h4>
                </div>

                {/* Unified Professional Container */}
                <div className={`flex-1 overflow-hidden rounded-3xl border shadow-sm flex flex-col md:flex-row ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    
                    {/* Left Side: Experiment Info */}
                    <div className={`p-4 md:w-1/3 flex flex-col border-b md:border-b-0 md:border-r ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-gray-50/80 border-gray-100'}`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-sm ${isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-white text-blue-600'}`}>
                            {getExperimentIcon(selectedSubExperiment.firmwareType)}
                        </div>
                        <h5 className={`font-bold text-lg mb-1 ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                            {selectedSubExperiment.name}
                        </h5>
                        <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                            {selectedSubExperiment.description}
                        </p>
                        
                        <div className="mt-auto pt-4 flex flex-wrap gap-2">
                            <span className={`text-[10px] px-2 py-1 rounded-full font-medium border ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-white border-gray-200 text-gray-600'}`}>
                                {selectedSubExperiment.firmwareType}
                            </span>
                            {selectedSubExperiment.category && (
                                <span className={`text-[10px] px-2 py-1 rounded-full font-medium border ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-white border-gray-200 text-gray-600'}`}>
                                    {selectedSubExperiment.category}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right Side: Sensor Options */}
                    <div className="p-4 md:w-2/3">
                        <h5 className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                            Available Sensors
                        </h5>
                        <div className="grid grid-cols-1 gap-2">
                            {selectedSubExperiment.sensorOptions.map((option) => (
                                <div
                                key={option.type}
                                onClick={() => handleSensorOptionSelect(option)}
                                className={`group flex items-center p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                                    selectedSensorOption?.type === option.type
                                    ? (isDark ? 'bg-indigo-900/30 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-blue-50 border-blue-500 shadow-md shadow-blue-500/10')
                                    : (isDark ? 'bg-slate-700/30 border-slate-700 hover:bg-slate-700 hover:border-indigo-500/50' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md')
                                }`}
                                >
                                <div className={`flex items-center justify-center w-10 h-10 rounded-full mr-3 transition-all duration-300 ${
                                    selectedSensorOption?.type === option.type
                                    ? (isDark ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/40' : 'bg-blue-500 text-white shadow-lg shadow-blue-500/30')
                                    : (isDark ? 'bg-slate-700 text-slate-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-300' : 'bg-gray-100 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600')
                                }`}>
                                    <FiCpu className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center">
                                        <div className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{option.label}</div>
                                        <FiArrowLeft className={`w-4 h-4 rotate-180 transition-transform duration-300 ${
                                            isDark ? 'text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1' : 'text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1'
                                        }`} />
                                    </div>
                                </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            )}

            {/* Wizard: Step 3 - Select Device & Flash */}
            {step === 3 && (
            <div className="h-full flex flex-col animate-slide-up">
                <div className="flex items-center justify-between mb-4 flex-none">
                    <div className="flex items-center gap-3">
                        <ResponsiveButton
                            variant="secondary"
                            size="sm"
                            onClick={() => setStep(selectedSubExperiment?.sensorOptions ? 2 : 1)}
                            icon={<FiArrowLeft />}
                            className="!rounded-full !px-3 shadow-sm hover:shadow-md"
                        >
                            Back
                        </ResponsiveButton>
                        <h4 className="text-lg font-bold text-gray-800">Select Device</h4>
                    </div>
                    
                    {/* Search Button */}
                    <button
                        onClick={handleSearch}
                        disabled={isScanning || isSearchingAnim}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all duration-300 ${
                            isScanning || isSearchingAnim
                            ? (isDark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-blue-50 text-blue-500')
                            : (isDark 
                                ? 'bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.5)]' 
                                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30')
                        }`}
                    >
                        {isScanning || isSearchingAnim ? (
                            <FiRefreshCw className="animate-spin" />
                        ) : (
                            <FiSearch />
                        )}
                        <span>{isScanning || isSearchingAnim ? 'Scanning...' : 'Scan Devices'}</span>
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto min-h-0 px-4 py-2 custom-scrollbar">
                    {(isScanning || isSearchingAnim) ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            {/* Custom Search Animation */}
                            <div className="relative w-24 h-24 mb-6">
                                <div className={`absolute inset-0 rounded-full border-4 opacity-25 ${isDark ? 'border-indigo-500' : 'border-blue-500'}`}></div>
                                <div className={`absolute inset-0 rounded-full border-4 border-t-transparent animate-spin ${isDark ? 'border-indigo-400' : 'border-blue-500'}`}></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <FiRadio className={`w-8 h-8 ${isDark ? 'text-indigo-400' : 'text-blue-500'}`} />
                                </div>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                                <div 
                                    className={`h-full transition-all duration-100 ease-linear ${isDark ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-blue-500'}`}
                                    style={{ width: `${searchProgress}%` }}
                                />
                            </div>
                            <span className={`text-sm font-medium ${isDark ? 'text-indigo-300' : 'text-blue-600'}`}>
                                Searching for devices... {Math.round(searchProgress)}%
                            </span>
                        </div>
                    ) : compatibleDevices.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                        <FiWifiOff className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <h5 className="text-lg font-medium text-gray-600">No compatible devices found</h5>
                        <p className="text-sm text-gray-500 mt-1">Ensure your device is powered on and connected to the network.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                        {compatibleDevices
                            .slice()
                            .sort((a, b) => {
                                const getRank = (d) => {
                                    if (d.online_status === 1) return 0;
                                    if (d.online_status === 0 && d.availability === 0) return 1;
                                    return 2;
                                };
                                return getRank(a) - getRank(b);
                            })
                            .map(device => {
                            const getStatus = (d) => {
                            const online = d.online_status === 1;
                            const available = d.availability === 1;
                            
                            if (online) return { label: 'Online', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500', glow: 'shadow-[0_0_10px_rgba(74,222,128,0.4)]' };
                            if (!online && !available) return { label: 'In Use', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500', glow: '' };
                            return { label: 'Offline', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', glow: '' };
                            };
                            const status = getStatus(device);
                            const isDisabled = status.label === 'Offline' || status.label === 'In Use';
                            
                            return (
                            <div
                                key={device.id}
                                onClick={() => !isDisabled && handleFlash(device)}
                                className={`group relative flex items-center p-2 rounded-full border transition-all duration-300 ${
                                    isDisabled 
                                        ? 'opacity-60 cursor-not-allowed bg-gray-50 border-gray-100' 
                                        : `cursor-pointer hover:scale-[1.01] ${isDark 
                                            ? 'bg-slate-800 border-slate-700 hover:border-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                                            : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/10'}`
                                }`}
                            >
                                {/* Disk Icon Area */}
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 mr-4 transition-colors ${
                                    isDisabled 
                                        ? 'bg-gray-200 text-gray-400' 
                                        : (isDark ? 'bg-slate-700 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white group-hover:shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-blue-50 text-blue-500 group-hover:bg-blue-500 group-hover:text-white')
                                }`}>
                                    <FiZap className="w-6 h-6" />
                                </div>

                                {/* Content Area */}
                                <div className="flex-1 min-w-0 flex items-center justify-between pr-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-mono font-bold text-base ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{device.id}</span>
                                            {device.sensor_type && (
                                                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                                                    isDark ? 'bg-indigo-900/50 text-indigo-300 border border-indigo-500/30' : 'bg-blue-100 text-blue-700 border border-blue-200'
                                                }`}>
                                                    {device.sensor_type}
                                                </span>
                                            )}
                                        </div>
                                        <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                            {device.ip_address || 'Unknown IP'}
                                        </div>
                                    </div>

                                    {/* Status Badge */}
                                    <div className={`flex items-center px-3 py-1 rounded-full text-xs font-bold border ${status.bg} ${status.color} ${status.border} ${isDark ? status.glow : ''}`}>
                                        <div className={`w-2 h-2 rounded-full mr-2 ${status.dot} ${status.label === 'Online' ? 'animate-pulse' : ''}`}></div>
                                        {status.label}
                                    </div>
                                </div>
                            </div>
                        )})}
                        </div>
                    )}
                </div>
            </div>
            )}
        </div>

        {/* Footer / Status Bar - Compact */}
        <div className="flex-none mt-2 p-2 md:mt-4 md:p-4 border-t border-gray-200/50">
            <div className="flex items-center justify-center gap-4">
                {step === 1 ? (
                    <ResponsiveButton
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate('/dashboard')}
                        className="!py-2 !px-6 !rounded-full text-sm hover:bg-gray-200 shadow-sm"
                    >
                        Back to Dashboard
                    </ResponsiveButton>
                ) : step === 2 ? (
                    <div className="flex-1"></div> // Spacer for Step 2
                ) : (
                    <div className="flex-1">
                         {/* Compact Status Display */}
                        <div className={`flex items-center gap-3 px-4 py-2 rounded-full border transition-all duration-300 ${
                            isDark 
                                ? 'bg-slate-800 border-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.2)]' 
                                : 'bg-white border-gray-200 shadow-sm'
                        }`}>
                            <span className="flex-shrink-0">{flashStatusDisplay.icon}</span>
                            <div className="flex-1 min-w-0 flex flex-col">
                                <span className={`text-xs font-medium truncate ${flashStatusDisplay.color}`}>
                                    {flashStatus}
                                </span>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-500 ${isDark ? 'bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-gradient-to-r from-green-400 to-green-500'}`}
                                        style={{ width: `${progressPercentage}%` }}
                                    />
                                </div>
                            </div>
                            <span className="text-xs text-gray-400 font-mono w-8 text-right">{progressPercentage}%</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default DynamicExperimentSelector;
