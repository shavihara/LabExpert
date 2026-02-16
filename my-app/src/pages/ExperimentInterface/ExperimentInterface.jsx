import React, { useState, useEffect, useCallback, memo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { useWebSocket, useDeviceManager, useExperimentManager } from '../../hooks/useWebSocket';
import { 
  FiSettings, FiBarChart2, FiX, FiWifi, FiWifiOff, FiLogOut, FiRepeat, FiPlay, FiPause, FiStopCircle, FiRefreshCw
} from 'react-icons/fi';

// New modular components
import DynamicExperimentSelector from '../../components/experiment-selector/DynamicExperimentSelector';
import ExperimentGraph from './components/ExperimentGraph/ExperimentGraph';
import { ResponsiveCard, ResponsiveButton, StatusIndicator, ResponsiveModal } from '../../components/ui-system/ResponsiveUI';
import { useExperimentStore } from '../../stores/experimentStore';
import { useToast } from '../../components/common/Toast';
import { experimentManager, getExperimentConfig } from '../../experiments';
import ConfigPanel from './components/ConfigPanel/ConfigPanel';

// Performance optimization
// Using existing Plotly-based ExperimentGraph for unified UI

const ExperimentInterface = ({ experimentId = '1.1' }) => {
  console.log('ExperimentInterface rendered with experimentId:', experimentId);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [showConfigModal, setShowConfigModal] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState(() => {
    try {
      const saved = localStorage.getItem('selectedDevice');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [experimentConfig, setExperimentConfig] = useState(null);
  const [selectedSubExperiment, setSelectedSubExperiment] = useState(null);
  const [rawData, setRawData] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingError, setLoadingError] = useState(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [config, setConfig] = useState({ frequency_hz: 20, max_distance_cm: 150, duration_s: 10, run_indefinite: true });
  const [experimentType, setExperimentType] = useState(localStorage.getItem('experimentType') || 'displacement');
  const [tileState, setTileState] = useState({ status: 'Stopped', timeRemaining: 0, samples: 0, config });
  const [experimentResults, setExperimentResults] = useState([]);
  const [previewFrame, setPreviewFrame] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [streamUrl, setStreamUrl] = useState('');
  
  const configTimerRef = React.useRef(null);
  const pendingConfigRef = React.useRef(null);
  const lastConfigSentRef = React.useRef(0);
  const CONFIG_THROTTLE_MS = 300;
  
  // Store integration
  const {
    setActiveExperiment,
    setExperimentData,
    setExperimentStatus,
    setSelectedExperimentId,
    experimentStatus,
    experimentData
  } = useExperimentStore();
  
  // Toast notifications
  const { showSuccess, showError, showInfo } = useToast();
  
  // WebSocket connection
  const userToken = localStorage.getItem('token');
  const sharedWebSocket = useWebSocket(userToken, true);
  const { sendMessage, lastMessage, isConnected: wsIsConnected, addMessageHandler } = sharedWebSocket;
  const sharedDeviceManager = useDeviceManager(sharedWebSocket);
  const sharedExperimentManager = useExperimentManager(sharedWebSocket, experimentData, setExperimentData);
  const aiCompletedRef = React.useRef(false);

  useEffect(() => {
    if (wsIsConnected && selectedDevice?.id === 'local_camera') {
      // Use port 5000 as per backend configuration (see api.js)
      const url = `http://localhost:5000/video_feed?device_id=local_camera&t=${Date.now()}`;
      console.log('Setting stream URL:', url);
      setStreamUrl(url);
    }
  }, [wsIsConnected, selectedDevice?.id]);
  
  const queueAIConfigUpdate = useCallback((partial) => {
    if (!wsIsConnected || selectedDevice?.id !== 'local_camera') return;
    pendingConfigRef.current = { ...(pendingConfigRef.current || {}), ...partial };
    if (!configTimerRef.current) {
      const now = Date.now();
      const delay = Math.max(0, CONFIG_THROTTLE_MS - (now - lastConfigSentRef.current));
      configTimerRef.current = setTimeout(() => {
        lastConfigSentRef.current = Date.now();
        const merged = { ...config, ...(pendingConfigRef.current || {}) };
        const aiCfg = {
          ...merged,
          experiment_type: 'video_oscillation',
          camera_id: selectedDevice?.camera_id,
          device_id: 'local_camera'
        };
        sendMessage({
          action: 'configure_experiment',
          device_id: 'local_camera',
          config: aiCfg,
          experiment_type: 'video_oscillation'
        });
        pendingConfigRef.current = null;
        configTimerRef.current = null;
      }, delay);
    }
  }, [wsIsConnected, selectedDevice, config, sendMessage]);
  
  const handleTrackerClick = useCallback((e) => {
    const target = e.target;
    const iw = target.naturalWidth || 640;
    const ih = target.naturalHeight || 480;
    const rect = target.getBoundingClientRect();
    const rx = e.clientX - rect.left;
    const ry = e.clientY - rect.top;
    const x = Math.round((rx / rect.width) * iw);
    const y = Math.round((ry / rect.height) * ih);
    const w = 50;
    const h = 50;
    const x0 = Math.max(0, x - Math.floor(w / 2));
    const y0 = Math.max(0, y - Math.floor(h / 2));
    const bbox = [x0, y0, w, h];
    setConfig(prev => ({ ...prev, tracking_mode: 'csrt', tracker_bbox: bbox }));
    queueAIConfigUpdate({ tracking_mode: 'csrt', tracker_bbox: bbox });
  }, [queueAIConfigUpdate, setConfig]);
  
  // Load experiment configuration (main + default sub-experiment)
  useEffect(() => {
    try {
      console.log('Loading experiment with ID:', experimentId);
      const subExperimentId = `${experimentId}.1`;
      console.log('Attempting to load sub-experiment:', subExperimentId);
      
      const cfg = getExperimentConfig(experimentId, subExperimentId);
      console.log('Experiment config result:', cfg);
      
      if (!cfg?.mainExperiment) {
        console.error('Invalid config structure:', cfg);
        throw new Error(`Experiment ${experimentId} not found`);
      }
      
      console.log('Setting experiment config:', cfg.mainExperiment);
      setExperimentConfig(cfg.mainExperiment);
      setSelectedSubExperiment(cfg.subExperiment);
      if (cfg.subExperiment?.defaultConfig) {
        setConfig({ ...cfg.subExperiment.defaultConfig, run_indefinite: true });
      }
      setSelectedExperimentId(experimentId);
      setActiveExperiment(cfg.mainExperiment);
      setLoadingError(null);
      
      // Use setTimeout to avoid toast functions triggering re-renders
      setTimeout(() => {
        showInfo(`Loaded experiment: ${cfg.mainExperiment.name}`);
      }, 100);
    } catch (error) {
      console.error('Error loading experiment:', error);
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
      setLoadingError(error.message);
      setShowConfigModal(true);
      
      // Use setTimeout to avoid toast functions triggering re-renders
      setTimeout(() => {
        showError(`Failed to load experiment: ${error.message}`);
      }, 100);
    }
  }, [experimentId, setSelectedExperimentId, setActiveExperiment]); // Removed showInfo and showError from dependencies

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('labex:header:expand'))
  }, [])

  useEffect(() => {
    const handler = (e) => setTileState(e.detail || {});
    window.addEventListener('labex:tiles:update', handler);
    return () => window.removeEventListener('labex:tiles:update', handler);
  }, []);
  
  useEffect(() => {
    const isAI = (experimentId == '5' || experimentId === 5) && (selectedSubExperiment?.id === '5.1');
    const deviceId = selectedDevice?.camera_id || 0;
    
    if (isAI && wsIsConnected && !showConfigModal && selectedDevice?.id === 'local_camera') {
        const aiCfg = {
          ...config,
          camera_id: deviceId,
          experiment_type: 'video_oscillation',
          preview_fps: 15,
          device_id: 'local_camera'
        };
        sendMessage({
          action: 'configure_experiment',
          device_id: 'local_camera',
          config: aiCfg,
          experiment_type: 'video_oscillation'
        });
        
        // Start the AI video processing
        sendMessage({
          action: 'start_experiment',
          device_id: 'local_camera',
          config: aiCfg,
          experiment_type: 'video_oscillation'
        });
    }

    return () => {
        // Stop AI processing and release device when component unmounts
        if (wsIsConnected && isAI) {
            sendMessage({
                action: 'release_device'
            });
        }
    };
}, [experimentId, selectedSubExperiment, selectedDevice, wsIsConnected, showConfigModal, sendMessage]); // Removed config from dependencies to prevent restart on slider change

  const formatTime = (seconds) => {
    const sec = Number(seconds);
    if (!Number.isFinite(sec)) return '0:00.0';
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    const t = Math.floor((s % 1) * 10);
    return `${m}:${String(r).padStart(2, '0')}.${t}`;
  };
  
  // Handle WebSocket messages for AI video processing
  useEffect(() => {
    const handleAIMessage = (data) => {
      if (data.type === 'processed_data' && data.experiment_type === 'video_oscillation') {
        // Update oscillation count from backend AI processing
        if (!aiCompletedRef.current) {
          if (data.data?.oscillation_count !== undefined) {
            setTileState(prev => ({
              ...prev,
              count: data.data.oscillation_count,
              runningTime: data.data.time_elapsed || 0
            }));
          }
        }
        if (data.data?.detection_confidence !== undefined) {
          setTileState(prev => ({
            ...prev,
            detection_confidence: data.data.detection_confidence
          }));
        }
        if (data.data?.center_x !== undefined || data.data?.center_y !== undefined) {
          setTileState(prev => ({
            ...prev,
            center_x: data.data.center_x,
            center_y: data.data.center_y
          }));
        }
        
        // Add to experiment data for graph
        if (data.data) {
          setExperimentData(prev => [...prev, data.data]);
        }

        // Auto-stop when reaching configured max count and append result row
        const maxCount = Number(config?.max_count ?? 0);
        const currentCount = Number(data?.data?.oscillation_count ?? data?.data?.count ?? 0);
        const isValidMax = Number.isFinite(maxCount) && maxCount > 0;
        if (!aiCompletedRef.current && isValidMax && currentCount >= maxCount) {
          aiCompletedRef.current = true;
          const total_time = Number(data?.data?.total_time ?? data?.data?.time_elapsed ?? 0);
          const length_cm = Number(config?.pendulum_length_cm ?? 0);
          const period = (Number.isFinite(total_time) && total_time > 0 && currentCount > 0) ? (total_time / currentCount) : Number(data?.data?.period ?? 0);
          const period_squared = Number.isFinite(period) ? period * period : 0;
          const result = { type: 'experiment_result', length_cm, total_time, count: currentCount, period, period_squared };
          setExperimentResults(prev => [...prev, result]);
          setTileState(prev => ({ ...prev, status: 'Stopped', runningTime: total_time }));
          sendMessage({
            action: 'stop_experiment',
            device_id: 'local_camera',
            experiment_type: 'video_oscillation'
          });
        }
      }
      
      // Video preview handled via MJPEG stream now to reduce lag
      /* 
      if (data.type === 'video_preview' && data.experiment_type === 'video_oscillation') {
        if (data.frame) {
          setPreviewFrame(data.frame);
          setAiError(null);
        }
      } 
      */
      
      // Handle experiment status updates
      if (data.type === 'experiment_started' && data.experiment_type === 'video_oscillation') {
        setTileState(prev => ({ ...prev, status: 'Running' }));
        setAiError(null);
        aiCompletedRef.current = false;
      }
      
      if (data.type === 'experiment_stopped' && data.experiment_type === 'video_oscillation') {
        setTileState(prev => ({ ...prev, status: 'Stopped' }));
        aiCompletedRef.current = true;
      }

      if (data.type === 'error' && data.experiment_type === 'video_oscillation') {
        setAiError(data.message || data.payload?.message || 'AI video error');
      }
    };
    
    const unsubscribe = addMessageHandler(handleAIMessage);
    return unsubscribe;
  }, [addMessageHandler]);

  // Handle WebSocket connection status
  useEffect(() => {
    setIsConnected(wsIsConnected);
    if (wsIsConnected) {
      // Use setTimeout to avoid toast functions triggering re-renders
      setTimeout(() => {
        showSuccess('Connected to server');
      }, 100);
    } else {
      // Use setTimeout to avoid toast functions triggering re-renders
      setTimeout(() => {
        showError('Disconnected from server');
      }, 100);
    }
  }, [wsIsConnected]); // Removed showSuccess and showError from dependencies
  
  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    try {
      let data = lastMessage;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch {}
      }
      
      // Handle different message types
      switch (data.type) {
        case 'experiment_data':
          setRawData(prevData => [...prevData, data.payload]);
          setExperimentData(prevData => [...prevData, data.payload]);
          break;

        case 'processed_data':
          setRawData(prevData => [...prevData, data.data]);
          setExperimentData(prevData => [...prevData, data.data]);
          break;
          
        case 'device_connected':
          setSelectedDevice(data.payload);
          setIsConnected(true);
          // Use setTimeout to avoid toast functions triggering re-renders
          setTimeout(() => {
            showSuccess('Device connected successfully');
          }, 100);
          break;
          
        case 'device_disconnected':
          // Ignore disconnects for local_camera to keep AI preview running
          if (selectedDevice?.id !== 'local_camera') {
            setSelectedDevice(null);
            setIsConnected(false);
            setTimeout(() => {
              showInfo('Device disconnected');
            }, 100);
          }
          break;
          
        case 'experiment_status':
          setExperimentStatus(data.payload.status);
          break;
          
        case 'error':
          // Use setTimeout to avoid toast functions triggering re-renders
          setTimeout(() => {
            showError(data?.payload?.message || data?.message || 'Error');
          }, 100);
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      console.error('Message data that caused error:', lastMessage.data);
    }
  }, [lastMessage, setExperimentData, setExperimentStatus]); // Removed toast functions from dependencies
  
  // Handle experiment completion
  const handleExperimentComplete = useCallback(({ device, experimentType, token, subExperiment }) => {
    try {
      localStorage.setItem('selectedDevice', JSON.stringify(device));
      localStorage.setItem('experimentType', experimentType);
      setSelectedDevice(device);
      setExperimentType(experimentType);
      
      if (subExperiment) {
        setSelectedSubExperiment(subExperiment);
        if (subExperiment.defaultConfig) {
          setConfig(subExperiment.defaultConfig);
        }
      }

      setShowConfigModal(false);
      showSuccess('Experiment configured successfully');
      
      // Apply default configuration immediately using unified experiment manager
      try {
        const expType = subExperiment?.firmwareType || experimentType;
        const cfg = subExperiment?.defaultConfig ? { ...subExperiment.defaultConfig, run_indefinite: true } : {};
        localStorage.setItem('experimentConfig', JSON.stringify(cfg));
        sharedExperimentManager.applyConfiguration(device.id, cfg, expType);
      } catch {}
    } catch (error) {
      console.error('Error completing experiment setup:', error);
      showError('Failed to configure experiment');
    }
  }, [sendMessage, showSuccess, showError]);
  
  // Handle device disconnection
  const handleDisconnect = useCallback(() => {
    try {
      if (selectedSubExperiment?.id === '5.1') {
        sendMessage({
          action: 'stop_experiment',
          device_id: 'local_camera',
          experiment_type: 'video_oscillation'
        });
      }
      sendMessage({ action: 'release_device' });
      setSelectedDevice(null);
      setIsConnected(false);
      setRawData([]);
      setExperimentData([]);
      
      localStorage.removeItem('selectedDevice');
      localStorage.removeItem('experimentType');
      
      showInfo('Device disconnected');
      window.dispatchEvent(new CustomEvent('labex:header:expand'))
      navigate('/dashboard');
    } catch (error) {
      console.error('Error disconnecting device:', error);
      showError('Failed to disconnect device');
    }
  }, [sendMessage, setExperimentData, showInfo, showError]);
  
  // Handle data export
  const handleExport = useCallback((exportData) => {
    try {
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `experiment_${experimentId}_${new Date().toISOString()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      
      showSuccess('Experiment data exported successfully');
    } catch (error) {
      console.error('Error exporting data:', error);
      showError('Failed to export experiment data');
    }
  }, [experimentId, showSuccess, showError]);
  
  // Get experiment name from configuration
  const getExperimentName = () => {
    return selectedSubExperiment?.name || experimentConfig?.name || 'Experiment';
  };
  
  // Get experiment description
  const getExperimentDescription = () => {
    return experimentConfig?.description || 'Real-time experiment data visualization';
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 md:p-8">
      
      {(showConfigModal || !experimentConfig) && (
        <ResponsiveModal 
          isOpen={true} 
          onClose={() => setShowConfigModal(false)} 
          title="Experiment Setup"
          size="xl"
          className="h-[85vh]"
          noBodyScroll={true}
        >
          <div className="animate-fade-in h-full">
            <DynamicExperimentSelector
              experimentId={experimentId}
              onComplete={handleExperimentComplete}
              sharedWebSocket={sharedWebSocket}
              sharedDeviceManager={sharedDeviceManager}
              sharedExperimentManager={sharedExperimentManager}
            />
          </div>
        </ResponsiveModal>
      )}
      
      {/* Loading Error State */}
      {loadingError && !showConfigModal && (
        <div className="max-w-[800px] mx-auto mt-8">
          <ResponsiveCard className="p-6 text-center">
            <div className="text-red-600 mb-4">
              <FiX className="w-12 h-12 mx-auto" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Experiment Loading Failed</h2>
            <p className="text-gray-600 mb-4">{loadingError}</p>
            <ResponsiveButton
              onClick={() => {
                setLoadingError(null);
                setShowConfigModal(true);
              }}
              variant="primary"
            >
              Try Again
            </ResponsiveButton>
          </ResponsiveCard>
        </div>
      )}
      
      {/* Main Interface */}
      {!showConfigModal && experimentConfig && (
        <div className="max-w-[1800px] mx-auto space-y-6">
          
          {/* Header */}
          <ResponsiveCard className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1">
                <div className="hidden sm:flex items-center gap-2 mb-2">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${selectedDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span className={`w-2 h-2 rounded-full ${selectedDevice ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {selectedDevice ? 'Connected' : 'Disconnected'}
                  </div>
                  {selectedDevice && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300 text-xs">
                      <span className="text-slate-600">Device:</span>
                      <span className="font-semibold">{selectedDevice.id}</span>
                    </div>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  {getExperimentName()}
                </h1>
                <p className="text-xs md:text-sm text-slate-600 mt-1 md:mt-2">
                  {getExperimentDescription()}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="hidden sm:flex items-center justify-end gap-2 w-full">
                  <ResponsiveButton
                    onClick={() => setShowConfigPanel(true)}
                    variant="primary"
                    size="sm"
                  >
                    <FiSettings className="w-4 h-4 mr-1" />
                    Configure
                  </ResponsiveButton>
                  <ResponsiveButton
                    onClick={() => setShowConfigModal(true)}
                    variant="secondary"
                    size="sm"
                  >
                    <FiRepeat className="w-4 h-4 mr-1" />
                    Change Experiment
                  </ResponsiveButton>
                  <ResponsiveButton
                    onClick={handleDisconnect}
                    variant="danger"
                    size="sm"
                  >
                    <FiLogOut className="w-4 h-4 mr-1" />
                    Disconnect
                  </ResponsiveButton>
                </div>
                {/* Mobile compact status + controls */}
                <div className="flex sm:hidden items-center justify-between gap-2 w-full">
                  <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full border bg-slate-100 text-slate-700 border-slate-300">
                    <span className={`w-2 h-2 rounded-full ${selectedDevice ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <FiWifi className={`${selectedDevice ? 'text-green-600' : 'text-red-600'} w-4 h-4`} />
                    {selectedDevice && <span className="text-xs font-semibold">{String(selectedDevice.id).slice(0,5)}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowConfigPanel(true)}
                      className="p-2 rounded-lg bg-blue-600 text-white shadow-md"
                      aria-label="Configure"
                    >
                      <FiSettings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowConfigModal(true)}
                      className="p-2 rounded-lg bg-gray-600 text-white shadow-md"
                      aria-label="Change Experiment"
                    >
                      <FiRepeat className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="p-2 rounded-lg bg-red-600 text-white shadow-md"
                      aria-label="Disconnect"
                    >
                      <FiLogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </ResponsiveCard>
          
          {/* AI Pendulum: Camera + Counter above Live Data Feed */}
          {(experimentConfig?.id === '5' && selectedSubExperiment?.id === '5.1') && (
            <div className="bg-gradient-to-br from-white to-purple-50 rounded-3xl p-4 sm:p-6 shadow-xl border-2 border-purple-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                <div className="rounded-xl overflow-hidden border-2 border-purple-200 bg-black">
                  <div className="aspect-video relative flex items-center justify-center bg-black">
                    {wsIsConnected && selectedDevice?.id === 'local_camera' ? (
                      <div className="w-full h-full relative">
                        <img
                           src={streamUrl}
                           className="w-full h-full object-contain"
                           alt="AI Detection Preview"
                           style={{ cursor: 'crosshair' }}
                           onError={(e) => {
                              console.error("Video stream error", e);
                              if (wsIsConnected) setAiError('Video stream unavailable - Check backend');
                           }}
                           onClick={handleTrackerClick}
                           onLoad={() => setAiError(null)}
                         />
                        {aiError && (
                           <div className="absolute top-0 left-0 right-0 bg-red-500 bg-opacity-75 text-white p-2 text-center">
                              {aiError}
                           </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-white text-center p-4">
                        {aiError ? (
                          <>
                            <div className="mb-2">AI Video Error</div>
                            <div className="text-xs text-slate-300">{aiError}</div>
                          </>
                        ) : (
                          <>
                            <div className="animate-pulse mb-2">Waiting for AI Video Feed...</div>
                            <div className="text-xs text-slate-400">Ensure camera is connected and backend is running</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl p-6 bg-white shadow-md border border-purple-200">
                  <div className="text-center">
                    <div className="text-xs sm:text-sm font-bold text-slate-500 mb-2">Oscillation Count</div>
                    <div className="text-6xl sm:text-7xl font-extrabold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4">
                      {Number(tileState?.count ?? 0)}
                    </div>
                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                      <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                        <div className="text-xs font-bold text-purple-700">MAX COUNT</div>
                        <div className="text-2xl sm:text-3xl font-bold text-purple-900">
                          {config.max_count || 50}
                        </div>
                      </div>
                      <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                        <div className="text-xs font-bold text-indigo-700">TIME</div>
                        <div className="text-2xl sm:text-3xl font-bold text-indigo-900">
                          {formatTime(tileState.runningTime || 0)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 text-left max-w-lg mx-auto">
                      <div className="grid grid-cols-1 gap-4">
                        {/* Hue Range */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-slate-600 font-semibold">Hue (0-180)</label>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500 w-8">Min:</span>
                                    <input 
                                        type="range" min="0" max="180"
                                        value={config.h_range?.[0] ?? 0}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const newRange = [val, config.h_range?.[1] ?? 50];
                                            setConfig(prev => ({ ...prev, h_range: newRange }));
                                            queueAIConfigUpdate({ h_range: newRange });
                                        }}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                    <span className="text-xs font-mono w-8 text-right">{config.h_range?.[0] ?? 0}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500 w-8">Max:</span>
                                    <input 
                                        type="range" min="0" max="180"
                                        value={config.h_range?.[1] ?? 50}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const newRange = [config.h_range?.[0] ?? 0, val];
                                            setConfig(prev => ({ ...prev, h_range: newRange }));
                                            queueAIConfigUpdate({ h_range: newRange });
                                        }}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                    <span className="text-xs font-mono w-8 text-right">{config.h_range?.[1] ?? 50}</span>
                                </div>
                            </div>
                        </div>

                        {/* Saturation Range */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-slate-600 font-semibold">Saturation (0-255)</label>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500 w-8">Min:</span>
                                    <input 
                                        type="range" min="0" max="255"
                                        value={config.s_range?.[0] ?? 100}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const newRange = [val, config.s_range?.[1] ?? 255];
                                            setConfig(prev => ({ ...prev, s_range: newRange }));
                                            queueAIConfigUpdate({ s_range: newRange });
                                        }}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                    <span className="text-xs font-mono w-8 text-right">{config.s_range?.[0] ?? 100}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500 w-8">Max:</span>
                                    <input 
                                        type="range" min="0" max="255"
                                        value={config.s_range?.[1] ?? 255}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const newRange = [config.s_range?.[0] ?? 100, val];
                                            setConfig(prev => ({ ...prev, s_range: newRange }));
                                            queueAIConfigUpdate({ s_range: newRange });
                                        }}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                    <span className="text-xs font-mono w-8 text-right">{config.s_range?.[1] ?? 255}</span>
                                </div>
                            </div>
                        </div>

                        {/* Value Range */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-slate-600 font-semibold">Value (0-255)</label>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500 w-8">Min:</span>
                                    <input 
                                        type="range" min="0" max="255"
                                        value={config.v_range?.[0] ?? 50}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const newRange = [val, config.v_range?.[1] ?? 255];
                                            setConfig(prev => ({ ...prev, v_range: newRange }));
                                            queueAIConfigUpdate({ v_range: newRange });
                                        }}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                    <span className="text-xs font-mono w-8 text-right">{config.v_range?.[0] ?? 50}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500 w-8">Max:</span>
                                    <input 
                                        type="range" min="0" max="255"
                                        value={config.v_range?.[1] ?? 255}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const newRange = [config.v_range?.[0] ?? 50, val];
                                            setConfig(prev => ({ ...prev, v_range: newRange }));
                                            queueAIConfigUpdate({ v_range: newRange });
                                        }}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                    <span className="text-xs font-mono w-8 text-right">{config.v_range?.[1] ?? 255}</span>
                                </div>
                            </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.adaptive_color ?? false}
                                onChange={(e) => {
                                    const val = e.target.checked;
                                    setConfig(prev => ({ ...prev, adaptive_color: val }));
                                    queueAIConfigUpdate({ adaptive_color: val });
                                }}
                                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-xs sm:text-sm text-slate-700 font-medium">Adaptive Color</span>
                        </label>
                        
                        <button
                            onClick={() => {
                                queueAIConfigUpdate({ reset_tracking: true });
                                // Also trigger explicit reset action if needed
                                sendMessage({
                                    action: 'reset_tracking',
                                    device_id: 'local_camera',
                                    experiment_type: 'video_oscillation'
                                });
                            }}
                            className="px-3 py-1.5 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs sm:text-sm font-medium transition-colors"
                        >
                            Reset Tracking
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                        <button
                          onClick={() => {
                            setConfig(prev => ({ ...prev, tracking_mode: 'color' }));
                            queueAIConfigUpdate({ tracking_mode: 'color' });
                          }}
                          className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-medium transition-colors"
                        >
                          Color
                        </button>
                        <button
                          onClick={() => {
                            setConfig(prev => ({ ...prev, tracking_mode: 'auto' }));
                            queueAIConfigUpdate({ tracking_mode: 'auto' });
                          }}
                          className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-medium transition-colors"
                        >
                          Auto
                        </button>
                        <button
                          onClick={() => {
                            setConfig(prev => ({ ...prev, tracking_mode: 'aruco' }));
                            queueAIConfigUpdate({ tracking_mode: 'aruco' });
                          }}
                          className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-medium transition-colors"
                        >
                          ArUco
                        </button>
                        <button
                          onClick={() => {
                            setConfig(prev => ({ ...prev, tracking_mode: 'csrt' }));
                            queueAIConfigUpdate({ tracking_mode: 'csrt' });
                          }}
                          className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-medium transition-colors"
                        >
                          CSRT
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Oscillation Counter Display for Experiment 2 */}
          {experimentConfig?.id === '2' && (
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-3xl p-6 sm:p-10 shadow-xl border-2 border-blue-200">
              <div className="text-center">
                <div className="text-xs sm:text-sm font-bold text-slate-500 mb-2">Oscillation Count</div>
                <div className="text-6xl sm:text-9xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-4 animate-pulse">
                  {rawData.length > 0 ? (rawData[rawData.length - 1].oscillation_count ?? rawData[rawData.length - 1].count ?? 0) : 0}
                </div>
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <div className="bg-white rounded-xl p-4 shadow-md">
                    <div className="text-xs font-bold text-slate-500">MAX COUNT</div>
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600">
                      {config.max_count || 50}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-md">
                    <div className="text-xs font-bold text-slate-500">TIME</div>
                    <div className="text-2xl sm:text-3xl font-bold text-cyan-600">
                      {rawData.length > 0 
                        ? (rawData[rawData.length - 1].time ?? rawData[rawData.length - 1].t ?? 0).toFixed(2)
                        : '0.00'} s
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main Content */}
          <ResponsiveCard padding="xs">
              <div className="mb-1 md:mb-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <FiBarChart2 className="text-purple-600" />
                    Live Data Feed
                  </h2>
                  <div className="hidden sm:grid grid-cols-3 gap-3 w-full pl-4">
                    <div className={`rounded-xl border-2 p-3 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`}>
                      <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-slate-300 opacity-80' : 'text-slate-600 opacity-75'}`}>Status</div>
                      <div className={`text-lg font-bold ${isDark ? 'text-slate-100' : ''}`}>{tileState.status || 'Stopped'}</div>
                    </div>
                    
                    {(experimentConfig?.id === '2' || experimentConfig?.id === '5') ? (
                      <div className={`rounded-xl border-2 p-3 ${isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50'}`}>
                        <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Running Time</div>
                        <div className={`text-2xl font-bold font-mono ${isDark ? 'text-blue-200' : 'text-blue-900'} flex items-center gap-2`}>
                          {formatTime(tileState.runningTime || 0)}
                        </div>
                      </div>
                    ) : (
                      tileState?.config?.run_indefinite === true ? (
                        <div className={`rounded-xl border-2 p-3 ${isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50'}`}>
                          <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Running Time</div>
                          <div className={`text-2xl font-bold font-mono ${isDark ? 'text-blue-200' : 'text-blue-900'} flex items-center gap-2`}>
                            {formatTime(tileState.runningTime || 0)}
                          </div>
                        </div>
                      ) : (
                        <div className={`rounded-xl border-2 p-3 transition-all duration-300 ${
                          tileState.isCountdownMode 
                            ? (isDark ? 'border-orange-500 bg-orange-900/30 animate-pulse' : 'border-orange-400 bg-orange-100 animate-pulse') 
                            : (isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50')
                        }`}>
                          <div className={`text-xs font-semibold mb-1 transition-colors ${
                            tileState.isCountdownMode 
                              ? (isDark ? 'text-orange-300' : 'text-orange-700') 
                              : (isDark ? 'text-blue-300' : 'text-blue-700')
                          }`}>Time Remaining</div>
                          <div className={`text-2xl font-bold font-mono flex items-center gap-2 transition-all duration-300 ${
                            tileState.isCountdownMode 
                              ? (isDark ? 'text-orange-200 scale-110' : 'text-orange-800 scale-110') 
                              : (isDark ? 'text-blue-200' : 'text-blue-900')
                          }`}>
                            {formatTime(tileState.timeRemaining || 0)}
                          </div>
                        </div>
                      )
                    )}

                    <div className={`rounded-xl border-2 p-3 ${isDark ? 'border-purple-700 bg-purple-900/20' : 'border-purple-300 bg-purple-50'}`}>
                      <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Configuration</div>
                      <div className={`text-sm ${isDark ? 'text-purple-200' : 'text-purple-900'}`}>
                        {(experimentConfig?.id === '2' || experimentConfig?.id === '5') ? (
                          <div className="flex flex-col gap-1">
                            {(selectedSubExperiment?.id === '2.1' || selectedSubExperiment?.id === '5.1') && (
                                <>
                                  <div>Max Count: {config?.max_count || 50}</div>
                                  <div>Length: {config?.pendulum_length_cm || 100} cm</div>
                                </>
                            )}
                            {selectedSubExperiment?.id === '2.2' && (
                                <>
                                  <div>Max Count: {config?.max_count || 50}</div>
                                  <div>Dist: {config?.pivot_to_com_distance_cm || 50} cm</div>
                                </>
                            )}
                            {!['2.1', '2.2', '5.1'].includes(selectedSubExperiment?.id) && (
                                <div>Freq: {config?.frequency_hz || 10} Hz</div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div>Duration: {tileState?.config?.run_indefinite === true ? 'Indefinite' : ((tileState?.config?.duration_s) || 10) + 's'}</div>
                            <div className={`text-xs ${isDark ? 'opacity-80' : 'opacity-75'}`}>Samples: {tileState.samples || 0}</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:hidden">
                  <div className={`rounded-lg border p-2 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`}>
                    <div className={`text-[11px] font-semibold mb-1 ${isDark ? 'text-slate-300 opacity-80' : 'opacity-75'}`}>Status</div>
                    <div className={`text-base font-bold ${isDark ? 'text-slate-100' : ''}`}>{tileState.status || 'Stopped'}</div>
                  </div>
                  
                  {experimentConfig?.id === '2' || experimentConfig?.id === '5' ? (
                    <div className={`rounded-lg border p-2 ${isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50'}`}>
                      <div className={`text-[11px] font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Running Time</div>
                      <div className={`text-lg font-bold font-mono ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>
                        {formatTime(tileState.runningTime || 0)}
                      </div>
                    </div>
                  ) : (
                    tileState?.config?.run_indefinite === true ? (
                      <div className={`rounded-lg border p-2 ${isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50'}`}>
                        <div className={`text-[11px] font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Running Time</div>
                        <div className={`text-lg font-bold font-mono ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>
                          {formatTime(tileState.runningTime || 0)}
                        </div>
                      </div>
                    ) : (
                      <div className={`rounded-lg border p-2 transition-all duration-300 ${
                        tileState.isCountdownMode 
                          ? (isDark ? 'border-orange-500 bg-orange-900/30 animate-pulse' : 'border-orange-400 bg-orange-100 animate-pulse') 
                          : (isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50')
                      }`}>
                        <div className={`text-[11px] font-semibold mb-1 transition-colors ${
                          tileState.isCountdownMode 
                            ? (isDark ? 'text-orange-300' : 'text-orange-700') 
                            : (isDark ? 'text-blue-300' : 'text-blue-700')
                        }`}>Time Remaining</div>
                        <div className={`text-lg font-bold font-mono transition-all duration-300 ${
                          tileState.isCountdownMode 
                            ? (isDark ? 'text-orange-200 scale-110' : 'text-orange-800 scale-110') 
                            : (isDark ? 'text-blue-200' : 'text-blue-900')
                        }`}>
                          {formatTime(tileState.timeRemaining || 0)}
                        </div>
                      </div>
                    )
                  )}

                  <div className={`rounded-lg border p-2 ${isDark ? 'border-purple-700 bg-purple-900/20' : 'border-purple-300 bg-purple-50'} col-span-2`}>
                    <div className={`text-[11px] font-semibold mb-1 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Configuration</div>
                    <div className={`text-xs ${isDark ? 'text-purple-200' : 'text-purple-900'} flex justify-between`}>
                      {experimentConfig?.id === '2' || experimentConfig?.id === '5' ? (
                        <div className="flex justify-between w-full">
                          {selectedSubExperiment?.id === '2.1' && (
                              <>
                                <span>Max: {config?.max_count || 50}</span>
                                <span>L: {config?.pendulum_length_cm || 100}cm</span>
                              </>
                          )}
                          {selectedSubExperiment?.id === '5.1' && (
                              <>
                                <span>Max: {config?.max_count || 50}</span>
                                <span>L: {config?.pendulum_length_cm || 100}cm</span>
                              </>
                          )}
                          {selectedSubExperiment?.id === '2.2' && (
                              <>
                                <span>Max: {config?.max_count || 50}</span>
                                <span>D: {config?.pivot_to_com_distance_cm || 50}cm</span>
                              </>
                          )}
                          {!['2.1', '2.2', '5.1'].includes(selectedSubExperiment?.id) && (
                              <span>Freq: {config?.frequency_hz || 10} Hz</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <span>Duration: {tileState?.config?.run_indefinite === true ? 'Indefinite' : ((tileState?.config?.duration_s) || 10) + 's'}</span>
                          <span>Samples: {tileState.samples || 0}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Optimized Graph Renderer */}
              <ExperimentGraph 
                experimentType={experimentType}
                token={userToken}
                sharedWebSocket={sharedWebSocket}
                sharedExperimentManager={sharedExperimentManager}
                config={config}
                subExperiment={selectedSubExperiment}
                externalControls={false}
                onNextAttempt={() => setShowConfigPanel(true)}
                experimentResults={experimentResults}
                setExperimentResults={setExperimentResults}
              />
            </ResponsiveCard>
          
        </div>
      )}

      {showConfigPanel && (
        <ConfigPanel 
          config={config}
          onChange={setConfig}
          onClose={() => setShowConfigPanel(false)}
          selectedDevice={selectedDevice}
          userToken={userToken}
          sharedExperimentManager={sharedExperimentManager}
          selectedSubExperiment={selectedSubExperiment}
        />
      )}
      
      {/* Animation Styles */}
      <style>{`
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
