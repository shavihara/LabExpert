import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
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
  const [config, setConfig] = useState({ frequency_hz: 20, max_distance_cm: 150, duration_s: 10, run_indefinite: true });
  const [experimentType, setExperimentType] = useState('tof');
  const [tileState, setTileState] = useState({ status: 'Stopped', timeRemaining: 0, samples: 0, config });
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const userToken = localStorage.getItem('token');
  const { theme } = useTheme();
  const isDark = theme === 'dark';

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

  useEffect(() => {
    const handler = (e) => setTileState(e.detail || {});
    window.addEventListener('labex:tiles:update', handler);
    return () => window.removeEventListener('labex:tiles:update', handler);
  }, []);

  useEffect(() => {
    const h = (e) => setExperimentType(e.detail);
    window.addEventListener('labex:experiment-type:changed', h);
    return () => window.removeEventListener('labex:experiment-type:changed', h);
  }, []);

  const formatTime = (seconds) => {
    const sec = Number(seconds);
    if (!Number.isFinite(sec)) return '0:00.0';
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    const t = Math.floor((s % 1) * 10);
    return `${m}:${String(r).padStart(2, '0')}.${t}`;
  };

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
    if (experimentType === 'tof' || experimentType === 'distance' || experimentType === 'displacement') return 'Free Fall Experiment';
    if (experimentType === 'inclined_plane') return 'Modern Galileo Experiment';
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
                <div className="hidden sm:flex items-center gap-2 mb-2">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${selectedDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}> 
                    <span className={`w-2 h-2 rounded-full ${selectedDevice ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {selectedDevice ? 'Connected' : 'Disconnected'}
                  </div>
                  {selectedDevice && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300 text-xs">
                      <FiWifi className="text-green-500" />
                      <span className="truncate">Device: <span className="font-semibold">{selectedDevice.id}</span></span>
                    </div>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  {getExperimentName()}
                </h1>
                
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="hidden sm:flex items-center justify-end gap-2 w-full">
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
          </div>

          {/* ===== MAIN CONTENT ===== */}
          <div className="bg-white rounded-xl md:rounded-2xl shadow-lg border border-slate-200 p-3 md:p-6">
            <div className="mb-4 md:mb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <FiBarChart2 className="text-purple-600" /> 
                  <span className="hidden sm:inline">Live Data Feed</span>
                  <span className="sm:hidden">Live Data</span>
                </h2>
                <div className="hidden sm:grid grid-cols-3 gap-3 w-full pl-4">
                  <div className={`rounded-xl border-2 p-3 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`}>
                    <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-slate-300 opacity-80' : 'text-slate-600 opacity-75'}`}>Status</div>
                    <div className={`text-lg font-bold ${isDark ? 'text-slate-100' : ''}`}>{tileState.status || 'Stopped'}</div>
                  </div>
                  {tileState?.config?.run_indefinite === true ? (
                    <div className={`rounded-xl border-2 p-3 ${isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50'}`}>
                      <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Running Time</div>
                      <div className={`text-2xl font-bold font-mono ${isDark ? 'text-blue-200' : 'text-blue-900'} flex items-center gap-2`}>{formatTime(tileState.runningTime || 0)}</div>
                    </div>
                  ) : (
                    <div className={`rounded-xl border-2 p-3 ${isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50'}`}>
                      <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Time Remaining</div>
                      <div className={`text-2xl font-bold font-mono ${isDark ? 'text-blue-200' : 'text-blue-900'} flex items-center gap-2`}>{formatTime(tileState.timeRemaining || 0)}</div>
                    </div>
                  )}
                  <div className={`rounded-xl border-2 p-3 ${isDark ? 'border-purple-700 bg-purple-900/20' : 'border-purple-300 bg-purple-50'}`}>
                    <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Configuration</div>
                    <div className={`text-sm ${isDark ? 'text-purple-200' : 'text-purple-900'}`}>
                      <div>Duration: {(tileState?.config?.duration_s) || 10}s</div>
                      <div className={`text-xs ${isDark ? 'opacity-80' : 'opacity-75'}`}>Samples: {tileState.samples || 0}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:hidden">
                <div className={`rounded-lg border p-2 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`}>
                  <div className={`text-[11px] font-semibold mb-1 ${isDark ? 'text-slate-300 opacity-80' : 'opacity-75'}`}>Status</div>
                  <div className={`text-base font-bold ${isDark ? 'text-slate-100' : ''}`}>{tileState.status || 'Stopped'}</div>
                </div>
                {tileState?.config?.run_indefinite === true ? (
                  <div className={`rounded-lg border p-2 ${isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50'}`}>
                    <div className={`text-[11px] font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Running Time</div>
                    <div className={`text-lg font-bold font-mono ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>{formatTime(tileState.runningTime || 0)}</div>
                  </div>
                ) : (
                  <div className={`rounded-lg border p-2 ${isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-300 bg-blue-50'}`}>
                    <div className={`text-[11px] font-semibold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Time Remaining</div>
                    <div className={`text-lg font-bold font-mono ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>{formatTime(tileState.timeRemaining || 0)}</div>
                  </div>
                )}
                <div className={`rounded-lg border p-2 ${isDark ? 'border-purple-700 bg-purple-900/20' : 'border-purple-300 bg-purple-50'} col-span-2`}>
                  <div className={`text-[11px] font-semibold mb-1 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Configuration</div>
                  <div className={`text-xs ${isDark ? 'text-purple-200' : 'text-purple-900'} flex justify-between`}>
                  <span>Duration: {tileState?.config?.run_indefinite === true ? 'Indefinite' : ((tileState?.config?.duration_s) || 10) + 's'}</span>
                    <span>Samples: {tileState.samples || 0}</span>
                  </div>
                </div>
              </div>
            </div>
            <ExperimentGraph 
              experimentType={experimentType} 
              token={userToken} 
              sharedWebSocket={sharedWebSocket}
              sharedExperimentManager={sharedExperimentManager}
              config={config}
              externalControls={false}
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
