import React, { useState, useEffect, useCallback, memo } from 'react';
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
  const [showConfigModal, setShowConfigModal] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [experimentConfig, setExperimentConfig] = useState(null);
  const [selectedSubExperiment, setSelectedSubExperiment] = useState(null);
  const [rawData, setRawData] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingError, setLoadingError] = useState(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [config, setConfig] = useState({ frequency_hz: 20, max_distance_cm: 150, duration_s: 10 });
  const [experimentType, setExperimentType] = useState(localStorage.getItem('experimentType') || 'displacement');
  
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
  const { sendMessage, lastMessage, connectionStatus } = sharedWebSocket;
  const sharedDeviceManager = useDeviceManager(sharedWebSocket);
  const sharedExperimentManager = useExperimentManager(sharedWebSocket, experimentData, setExperimentData);
  
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
        setConfig(cfg.subExperiment.defaultConfig);
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
      
      // Use setTimeout to avoid toast functions triggering re-renders
      setTimeout(() => {
        showError(`Failed to load experiment: ${error.message}`);
      }, 100);
    }
  }, [experimentId, setSelectedExperimentId, setActiveExperiment]); // Removed showInfo and showError from dependencies

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('labex:header:collapse'))
  }, [])
  
  // Handle WebSocket connection status
  useEffect(() => {
    setIsConnected(connectionStatus === 'connected');
    if (connectionStatus === 'connected') {
      // Use setTimeout to avoid toast functions triggering re-renders
      setTimeout(() => {
        showSuccess('Connected to server');
      }, 100);
    } else if (connectionStatus === 'disconnected') {
      // Use setTimeout to avoid toast functions triggering re-renders
      setTimeout(() => {
        showError('Disconnected from server');
      }, 100);
    }
  }, [connectionStatus]); // Removed showSuccess and showError from dependencies
  
  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    try {
      // Check if the message data is valid before parsing
      if (!lastMessage.data || lastMessage.data === 'undefined') {
        console.warn('Received invalid WebSocket message data:', lastMessage.data);
        return;
      }
      
      const data = JSON.parse(lastMessage.data);
      
      // Handle different message types
      switch (data.type) {
        case 'experiment_data':
          setRawData(prevData => [...prevData, data.payload]);
          setExperimentData(prevData => [...prevData, data.payload]);
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
          setSelectedDevice(null);
          setIsConnected(false);
          // Use setTimeout to avoid toast functions triggering re-renders
          setTimeout(() => {
            showInfo('Device disconnected');
          }, 100);
          break;
          
        case 'experiment_status':
          setExperimentStatus(data.payload.status);
          break;
          
        case 'error':
          // Use setTimeout to avoid toast functions triggering re-renders
          setTimeout(() => {
            showError(data.payload.message);
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
  const handleExperimentComplete = useCallback(({ device, experimentType, token }) => {
    try {
      localStorage.setItem('selectedDevice', JSON.stringify(device));
      localStorage.setItem('experimentType', experimentType);
      setSelectedDevice(device);
      setExperimentType(experimentType);
      setShowConfigModal(false);
      showSuccess('Experiment configured successfully');
      
      // Send configuration to server
      sendMessage({
        action: 'configure_experiment',
        payload: { device, experimentType, token }
      });
    } catch (error) {
      console.error('Error completing experiment setup:', error);
      showError('Failed to configure experiment');
    }
  }, [sendMessage, showSuccess, showError]);
  
  // Handle device disconnection
  const handleDisconnect = useCallback(() => {
    try {
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
    return experimentConfig?.name || 'Experiment';
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
          title={experimentConfig?.name || 'Experiment Setup'} 
          size="full"
        >
          <div className="animate-fade-in">
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
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  {getExperimentName()}
                </h1>
                <p className="text-xs md:text-sm text-slate-600 mt-1 md:mt-2">
                  {getExperimentDescription()}
                </p>
                
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${selectedDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}> 
                    <span className={`w-2 h-2 rounded-full ${selectedDevice ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {selectedDevice ? 'Connected' : 'Disconnected'}
                  </div>
                  {selectedDevice && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300">
                      <span className="text-slate-600">Device:</span>
                      <span className="font-semibold">{selectedDevice.id}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
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
              </div>
            </div>
          </ResponsiveCard>
          
          {/* Main Content */}
          <ResponsiveCard padding="xs">
            <div className="flex items-center justify-between mb-1 md:mb-6">
              <h2 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FiBarChart2 className="text-purple-600" />
                Live Data Feed
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('labex:controls:start'))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all text-sm"
                >
                  <FiPlay className="w-4 h-4" /> Start
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('labex:controls:pause'))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 transition-all text-sm"
                >
                  <FiPause className="w-4 h-4" /> Pause
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('labex:controls:stop'))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-all text-sm"
                >
                  <FiStopCircle className="w-4 h-4" /> Stop
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('labex:controls:reset'))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-all text-sm"
                >
                  <FiRefreshCw className="w-4 h-4" /> Reset
                </button>
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
              externalControls={true}
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
