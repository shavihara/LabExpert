import React, { useState, useEffect } from 'react';
import { useWebSocket, useDeviceManager, useExperimentManager } from '../hooks/useWebSocket';
import { deviceAPI } from '../utils/api';
import { 
  FiSettings, FiBarChart2, FiX, FiWifi, FiWifiOff, FiLogOut, FiRepeat, FiPlay, FiPause, FiStopCircle, FiRefreshCw
} from 'react-icons/fi';

// Import extracted components
import ConfigurationModal from './ExperimentInterface/components/ConfigurationModal/ConfigurationModal';
import ConfigPanel from './ExperimentInterface/components/ConfigPanel/ConfigPanel';
import ExperimentGraph from './ExperimentInterface/components/ExperimentGraph/ExperimentGraph';

// =================================================================================
// MAIN INTERFACE COMPONENT
// =================================================================================
const ExperimentInterface = ({ experimentId = 4 }) => {
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

  useEffect(() => {
    const needsMass = ['distance', 'inclined_plane', 'tof', 'displacement'].includes(experimentType);
    setConfig((prev) => {
      if (needsMass) {
        if (prev.mass === undefined) {
          return { ...prev, mass: 0 };
        }
        return prev;
      } else {
        if (prev.mass !== undefined) {
          const { mass, ...rest } = prev;
          return rest;
        }
        return prev;
      }
    });
  }, [experimentType]);

  const getExperimentName = () => {
    if (experimentType === 'tof') return 'Displacement Analysis';
    if (experimentType === 'oscillation') return 'Inclined Plane';
    return 'Experiment';
  };

  return (
    <div className="p-4 md:p-8 pt-[var(--header-height)] bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 min-h-screen">
      
      {showConfigModal && (
        <ConfigurationModal 
          experimentId={experimentId}
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1">
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  {getExperimentName()}
                </h1>
                
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${selectedDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}> 
                    <span className={`w-2 h-2 rounded-full ${selectedDevice ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {selectedDevice ? 'Connected' : 'Disconnected'}
                  </div>
                  {selectedDevice && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300">
                      <FiWifi className="text-green-500" />
                      <span className="truncate">Device: <span className="font-semibold">{selectedDevice.id}</span></span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowConfigPanel(true)}
                    className="inline-flex items-center whitespace-nowrap gap-1.5 px-2 py-2 md:px-4 md:py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all shadow-md text-xs md:text-sm"
                  >
                    <FiSettings size={16} /> 
                    <span>Configure</span>
                  </button>
                  <button
                    onClick={() => setShowConfigModal(true)}
                    className="inline-flex items-center whitespace-nowrap gap-1.5 px-2 py-2 md:px-4 md:py-2.5 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-all shadow-md text-xs md:text-sm"
                  >
                    <FiRepeat size={16} /> 
                    <span>Change Experiment</span>
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="inline-flex items-center whitespace-nowrap gap-1.5 px-2 py-2 md:px-4 md:py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-all shadow-md text-xs md:text-sm"
                  >
                    <FiLogOut size={16} /> 
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== MAIN CONTENT ===== */}
          <div className="bg-white rounded-xl md:rounded-2xl shadow-lg border border-slate-200 p-3 md:p-6">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <h2 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FiBarChart2 className="text-purple-600" />
                <span className="hidden sm:inline">Live Data Feed</span>
                <span className="sm:hidden">Live Data</span>
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
            <ExperimentGraph 
              experimentType={experimentType} 
              token={userToken} 
              sharedWebSocket={sharedWebSocket}
              sharedExperimentManager={sharedExperimentManager}
              config={config}
              externalControls={true}
            />
          </div>

        </div>
      )}
      
      {/* ===== ANIMATION STYLES ===== */}
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
