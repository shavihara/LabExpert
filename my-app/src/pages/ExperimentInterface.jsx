import React, { useState, useEffect } from 'react';
import { useWebSocket, useDeviceManager, useExperimentManager } from '../hooks/useWebSocket';
import { deviceAPI } from '../utils/api';
import { 
  FiSettings, FiBarChart2, FiX, FiWifi, FiWifiOff, FiLogOut, FiRepeat
} from 'react-icons/fi';

// Import extracted components
import ConfigurationModal from './ExperimentInterface/components/ConfigurationModal/ConfigurationModal';
import ConfigPanel from './ExperimentInterface/components/ConfigPanel/ConfigPanel';
import ExperimentGraph from './ExperimentInterface/components/ExperimentGraph/ExperimentGraph';

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