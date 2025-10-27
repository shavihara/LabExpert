import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, ReferenceLine } from 'recharts';
import { useWebSocket, useDeviceManager } from '../hooks/useWebSocket';
import { 
  FiSettings, FiBarChart2, FiPlay, FiPause, FiStopCircle, FiX, FiCheckCircle, 
  FiAlertTriangle, FiLoader, FiWifi, FiWifiOff, FiZap, FiLogOut, FiRepeat,
  FiDownload, FiSave, FiMaximize, FiMinimize, FiTrendingUp, FiFilter,
  FiRefreshCw, FiTable, FiEye, FiZoomIn, FiZoomOut, FiClock
} from 'react-icons/fi';

// =================================================================================
// Configuration Modal Component
// =================================================================================
const ConfigurationModal = ({ onComplete }) => {
  const userToken = localStorage.getItem('token');
  const [experimentType, setExperimentType] = useState('distance');
  const [flashStatus, setFlashStatus] = useState('Select a sensor to begin');
  const [isFlashing, setIsFlashing] = useState(false);

  const {
    devices,
    isScanning,
    isConnected,
    scanDevices,
    selectDevice,
  } = useDeviceManager(userToken);

  useEffect(() => {
    if (isConnected && !isScanning && devices.length === 0) {
      scanDevices();
    }
  }, [isConnected, isScanning, devices.length, scanDevices]);

  const handleFlash = async (device) => {
    setIsFlashing(true);
    setFlashStatus('Allocating device...');

    try {
      selectDevice(device.id);
      await new Promise(resolve => setTimeout(resolve, 500));

      setFlashStatus('Flashing firmware via OTA...');
      
      const response = await fetch(`http://${window.location.hostname}:5000/api/sensor/select_experiment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ 
          experiment_type: experimentType,
          device_id: device.id
        })
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.message || data.error || 'Firmware flash failed');
      }

      setFlashStatus('✓ Firmware flashed successfully');
      
      setTimeout(() => {
        const expType = experimentType === 'distance' ? 'tof' : 'oscillation';
        onComplete({ device, experimentType: expType, token: userToken });
      }, 1000);

    } catch (err) {
      console.error(err);
      setFlashStatus(`✗ Error: ${err.message}`);
      setIsFlashing(false);
    }
  };

  const tofDevices = devices.filter(d => 
    (d.sensor_type || '').toUpperCase().includes('TOF')
  );

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden transform transition-all animate-fade-in">
        
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-6">
          <h2 className="text-3xl font-bold text-white">Experiment Setup</h2>
          <p className="text-purple-100 mt-2">Choose your experiment and sensor to begin</p>
        </div>

        <div className="p-8 space-y-8">
          <div>
            <h3 className="text-xl font-semibold text-slate-800 mb-4">1. Select Experiment Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setExperimentType('distance')}
                className={`p-6 rounded-xl border-2 transition-all duration-300 group ${
                  experimentType === 'distance'
                    ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                }`}
              >
                <div className="text-4xl mb-3">📏</div>
                <div className="font-semibold text-slate-800 text-lg">Displacement Analysis</div>
                <p className="text-sm text-slate-500 mt-1">Measure distance, velocity, and acceleration.</p>
              </button>
              <button
                onClick={() => setExperimentType('oscillation')}
                className={`p-6 rounded-xl border-2 transition-all duration-300 group ${
                  experimentType === 'oscillation'
                    ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                }`}
              >
                <div className="text-4xl mb-3">📐</div>
                <div className="font-semibold text-slate-800 text-lg">Inclined Plane</div>
                <p className="text-sm text-slate-500 mt-1">Analyze motion on an inclined plane.</p>
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-slate-800 mb-4">2. Select Sensor</h3>
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

// =================================================================================
// Configuration Panel Component
// =================================================================================
const ConfigPanel = ({ config, onChange, onClose, selectedDevice, userToken }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleApplyConfiguration = async () => {
    if (!selectedDevice) {
      setStatusMessage('❌ No device selected');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Applying configuration...');

    try {
      // Save config to localStorage for timer access
      localStorage.setItem('experimentConfig', JSON.stringify(config));
      
      const response = await fetch(`http://${window.location.hostname}:5000/api/sensor/configure?device_id=${selectedDevice.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          frequency: config.frequency_hz,
          duration: config.duration_s,
          mode: "distance"
        })
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.message || 'Configuration failed');
      }

      setStatusMessage('✓ Configuration applied successfully');
      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (err) {
      console.error(err);
      setStatusMessage(`❌ Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-fade-in">
        
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">Configuration</h2>
            <p className="text-blue-100 text-sm mt-1">Adjust experiment parameters</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Sampling Frequency (Hz)
            </label>
            <input
              type="number"
              value={config.frequency_hz}
              onChange={(e) => onChange({ ...config, frequency_hz: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              min="1"
              max="100"
            />
            <p className="text-xs text-slate-500 mt-1">Recommended: 20-50 Hz</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Max Distance (cm)
            </label>
            <input
              type="number"
              value={config.max_distance_cm}
              onChange={(e) => onChange({ ...config, max_distance_cm: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              min="10"
              max="400"
            />
            <p className="text-xs text-slate-500 mt-1">Maximum measurable distance</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Duration (seconds)
            </label>
            <input
              type="number"
              value={config.duration_s}
              onChange={(e) => onChange({ ...config, duration_s: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              min="1"
              max="300"
            />
            <p className="text-xs text-slate-500 mt-1">Total experiment duration</p>
          </div>

          {statusMessage && (
            <div className={`p-3 rounded-lg text-sm font-medium text-center ${
              statusMessage.includes('✓') ? 'bg-green-100 text-green-700' : 
              statusMessage.includes('❌') ? 'bg-red-100 text-red-700' : 
              'bg-blue-100 text-blue-700'
            }`}>
              {statusMessage}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyConfiguration}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {isSubmitting ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =================================================================================
// Data Statistics Component
// =================================================================================
const DataStatistics = ({ data, dataType }) => {
  const calculateStats = () => {
    if (data.length === 0) return null;

    const values = data.map(d => {
      if (dataType === 's-t') return d.distance;
      if (dataType === 'v-t') return d.velocity;
      if (dataType === 'a-t') return d.acceleration;
      return 0;
    });

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length);

    return { mean, max, min, std, count: values.length };
  };

  const stats = calculateStats();

  if (!stats) return null;

  const getUnit = () => {
    if (dataType === 's-t') return 'cm';
    if (dataType === 'v-t') return 'cm/s';
    if (dataType === 'a-t') return 'cm/s²';
    return '';
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-3">
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-2 md:p-3 rounded-lg border border-blue-200">
        <div className="text-[10px] md:text-xs text-blue-600 font-semibold mb-0.5 md:mb-1">Mean</div>
        <div className="text-sm md:text-lg font-bold text-blue-900 truncate">{stats.mean.toFixed(3)} {getUnit()}</div>
      </div>
      <div className="bg-gradient-to-br from-green-50 to-green-100 p-2 md:p-3 rounded-lg border border-green-200">
        <div className="text-[10px] md:text-xs text-green-600 font-semibold mb-0.5 md:mb-1">Max</div>
        <div className="text-sm md:text-lg font-bold text-green-900 truncate">{stats.max.toFixed(3)} {getUnit()}</div>
      </div>
      <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-2 md:p-3 rounded-lg border border-orange-200">
        <div className="text-[10px] md:text-xs text-orange-600 font-semibold mb-0.5 md:mb-1">Min</div>
        <div className="text-sm md:text-lg font-bold text-orange-900 truncate">{stats.min.toFixed(3)} {getUnit()}</div>
      </div>
      <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-2 md:p-3 rounded-lg border border-purple-200">
        <div className="text-[10px] md:text-xs text-purple-600 font-semibold mb-0.5 md:mb-1">Std Dev</div>
        <div className="text-sm md:text-lg font-bold text-purple-900 truncate">{stats.std.toFixed(3)} {getUnit()}</div>
      </div>
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-2 md:p-3 rounded-lg border border-slate-200 col-span-2 sm:col-span-1">
        <div className="text-[10px] md:text-xs text-slate-600 font-semibold mb-0.5 md:mb-1">Samples</div>
        <div className="text-sm md:text-lg font-bold text-slate-900">{stats.count}</div>
      </div>
    </div>
  );
};

// =================================================================================
// Live Data Table Component
// =================================================================================
const LiveDataTable = ({ data, graphType, isFullscreen, onToggleFullscreen }) => {
  const [showAllData, setShowAllData] = useState(false);
  const tableRef = useRef(null);

  const displayData = showAllData ? data : data.slice(-20);

  const getColumnHeaders = () => {
    if (graphType === 's-t') {
      return ['Time (s)', 'Distance (cm)'];
    } else if (graphType === 'v-t') {
      return ['Time (s)', 'Velocity (cm/s)'];
    } else if (graphType === 'a-t') {
      return ['Time (s)', 'Acceleration (cm/s²)'];
    }
    return ['Time (s)', 'Value'];
  };

  const getRowData = (item) => {
    if (graphType === 's-t') {
      return [
        item.timeDisplay,
        item.distance?.toFixed(3) || '-'
      ];
    } else if (graphType === 'v-t') {
      return [
        item.timeDisplay,
        item.velocity?.toFixed(3) || '-'
      ];
    } else if (graphType === 'a-t') {
      return [
        item.timeDisplay,
        item.acceleration?.toFixed(3) || '-'
      ];
    }
    return [item.timeDisplay, '-'];
  };

  const exportToCSV = () => {
    const headers = getColumnHeaders();
    const csvContent = [
      headers.join(','),
      ...data.map(item => getRowData(item).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `experiment_data_${graphType}_${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white p-6' : 'relative'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <FiTable className="text-blue-600" />
          Live Data ({displayData.length} readings)
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAllData(!showAllData)}
            className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-all text-sm font-semibold flex items-center gap-1"
          >
            <FiEye size={14} />
            {showAllData ? 'Show Latest 20' : `Show All (${data.length})`}
          </button>
          <button
            onClick={onToggleFullscreen}
            className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-all text-sm font-semibold flex items-center gap-1"
          >
            {isFullscreen ? <FiMinimize size={14} /> : <FiMaximize size={14} />}
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
        </div>
      </div>

      <div 
        ref={tableRef}
        className={`overflow-auto border-2 border-slate-200 rounded-lg bg-white ${
          isFullscreen ? 'max-h-[calc(100vh-200px)]' : 'max-h-80'
        }`}
      >
        <table className="w-full">
          <thead className="bg-gradient-to-r from-slate-100 to-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider border-b-2 border-slate-300">
                #
              </th>
              {getColumnHeaders().map((header, idx) => (
                <th 
                  key={idx}
                  className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider border-b-2 border-slate-300"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {displayData.length === 0 ? (
              <tr>
                <td colSpan={getColumnHeaders().length + 1} className="px-4 py-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <FiAlertTriangle className="h-8 w-8 text-slate-400" />
                    <span>No data available yet. Start the experiment to see readings.</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayData.map((item, idx) => (
                <tr 
                  key={idx}
                  className="hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-2 text-sm font-medium text-slate-600">
                    {showAllData ? idx + 1 : data.length - 20 + idx + 1}
                  </td>
                  {getRowData(item).map((value, colIdx) => (
                    <td 
                      key={colIdx}
                      className="px-4 py-2 text-sm text-slate-800 font-mono"
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isFullscreen && (
        <div className="mt-4 text-sm text-slate-500 text-center">
          Press ESC or click Exit Fullscreen to return
        </div>
      )}
    </div>
  );
};

// =================================================================================
// Experiment Graph Component (with enhanced features)
// =================================================================================
const ExperimentGraph = ({ experimentType, token }) => {
  const [chartData, setChartData] = useState([]);
  const [graphType, setGraphType] = useState('s-t');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [zoomDomain, setZoomDomain] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const chartDataRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const { sendMessage, lastMessage } = useWebSocket(token, false);

  // Timer countdown effect
  useEffect(() => {
    if (isRunning && !isPaused && totalDuration > 0) {
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const remaining = Math.max(0, totalDuration - elapsed);
        setTimeRemaining(remaining);
        
        if (remaining <= 0) {
          handleStop();
        }
      }, 100);
      
      return () => clearInterval(timerRef.current);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRunning, isPaused, totalDuration]);

  useEffect(() => {
    if (lastMessage?.data?.distance !== undefined) {
      const newData = {
        time: lastMessage.data.time || Date.now(),
        timeDisplay: (lastMessage.data.time / 1000).toFixed(2),
        distance: lastMessage.data.distance,
        velocity: lastMessage.data.velocity || 0,
        acceleration: lastMessage.data.acceleration || 0
      };
      
      chartDataRef.current = [...chartDataRef.current, newData];
      setChartData(chartDataRef.current);
    }
  }, [lastMessage]);

  const handleStart = async () => {
    chartDataRef.current = [];
    setChartData([]);
    setIsRunning(true);
    setIsPaused(false);
    
    // Get duration from configuration
    try {
      const config = JSON.parse(localStorage.getItem('experimentConfig') || '{"duration_s": 10}');
      setTotalDuration(config.duration_s || 10);
      setTimeRemaining(config.duration_s || 10);
      startTimeRef.current = Date.now();
    } catch (e) {
      setTotalDuration(10);
      setTimeRemaining(10);
      startTimeRef.current = Date.now();
    }
    
    sendMessage({ action: 'start_experiment' });
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
    sendMessage({ action: isPaused ? 'resume_experiment' : 'pause_experiment' });
  };

  const handleStop = () => {
    setIsRunning(false);
    setIsPaused(false);
    setTimeRemaining(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    sendMessage({ action: 'stop_experiment' });
  };

  const handleSaveToProfile = async () => {
    try {
      const response = await fetch(`http://${window.location.hostname}:5000/api/experiment/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          experiment_type: experimentType,
          graph_type: graphType,
          data: chartData,
          timestamp: new Date().toISOString()
        })
      });

      if (response.ok) {
        alert('✓ Experiment data saved to your profile successfully!');
      } else {
        throw new Error('Failed to save data');
      }
    } catch (error) {
      alert('❌ Error saving data: ' + error.message);
    }
  };

  const exportToCSV = () => {
    const headers = graphType === 's-t' 
      ? ['Time (s)', 'Distance (cm)']
      : graphType === 'v-t'
      ? ['Time (s)', 'Velocity (cm/s)']
      : ['Time (s)', 'Acceleration (cm/s²)'];
    
    const csvContent = [
      headers.join(','),
      ...chartData.map(item => {
        if (graphType === 's-t') {
          return `${item.timeDisplay},${item.distance?.toFixed(3)}`;
        } else if (graphType === 'v-t') {
          return `${item.timeDisplay},${item.velocity?.toFixed(3)}`;
        } else {
          return `${item.timeDisplay},${item.acceleration?.toFixed(3)}`;
        }
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `experiment_${graphType}_${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getYAxisData = () => {
    if (graphType === 's-t') return 'distance';
    if (graphType === 'v-t') return 'velocity';
    if (graphType === 'a-t') return 'acceleration';
    return 'distance';
  };

  const getYAxisLabel = () => {
    if (graphType === 's-t') return 'Distance (cm)';
    if (graphType === 'v-t') return 'Velocity (cm/s)';
    if (graphType === 'a-t') return 'Acceleration (cm/s²)';
    return 'Value';
  };

  const getLineColor = () => {
    if (graphType === 's-t') return '#3b82f6';
    if (graphType === 'v-t') return '#10b981';
    if (graphType === 'a-t') return '#f59e0b';
    return '#3b82f6';
  };

  const getStatusColor = () => {
    if (isRunning && !isPaused) return 'bg-green-100 text-green-700 border-green-300';
    if (isPaused) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-slate-100 text-slate-600 border-slate-300';
  };

  const getStatusText = () => {
    if (isRunning && !isPaused) return 'Running';
    if (isPaused) return 'Paused';
    return 'Stopped';
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (isGraphFullscreen) setIsGraphFullscreen(false);
        if (isTableFullscreen) setIsTableFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isGraphFullscreen, isTableFullscreen]);

  const GraphComponent = () => (
    <div className={`bg-white rounded-xl shadow-lg border border-slate-200 p-4 ${
      isGraphFullscreen ? 'fixed inset-4 z-50' : ''
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
          <FiBarChart2 className="text-purple-600" />
          <span className="hidden sm:inline">Real-time Plot</span>
          <span className="sm:hidden">Plot</span>
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setZoomDomain(null)}
            className="px-2 py-1.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-all text-xs flex items-center gap-1"
            title="Reset Zoom"
          >
            <FiRefreshCw size={14} />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <button
            onClick={() => setIsGraphFullscreen(!isGraphFullscreen)}
            className="px-2 py-1.5 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-all text-xs flex items-center gap-1"
          >
            {isGraphFullscreen ? <FiMinimize size={14} /> : <FiMaximize size={14} />}
            <span className="hidden sm:inline">{isGraphFullscreen ? 'Exit' : 'Full'}</span>
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={isGraphFullscreen ? window.innerHeight - 150 : 350}>
        <LineChart 
          data={chartData} 
          margin={{ top: 5, right: 10, left: -5, bottom: 5 }}
          onMouseDown={(e) => {
            if (e && e.activeLabel) {
              setZoomDomain({ start: e.activeLabel });
            }
          }}
          onMouseMove={(e) => {
            if (zoomDomain?.start && e && e.activeLabel) {
              setZoomDomain({ ...zoomDomain, end: e.activeLabel });
            }
          }}
          onMouseUp={() => {
            if (zoomDomain?.start && zoomDomain?.end) {
              // Zoom applied
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="timeDisplay" 
            label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
            tick={{ fontSize: 11 }}
            domain={zoomDomain ? [zoomDomain.start, zoomDomain.end] : ['auto', 'auto']}
          />
          <YAxis 
            dataKey={getYAxisData()} 
            label={{ value: getYAxisLabel(), angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 11 }}
            width={50}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: 'white', 
              borderRadius: '8px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              border: '2px solid #e2e8f0',
              fontSize: '12px'
            }}
            labelStyle={{ color: '#334155', fontWeight: 'bold' }}
          />
          <Brush 
            dataKey="timeDisplay" 
            height={25} 
            stroke="#8b5cf6"
            fill="#f5f3ff"
            onChange={(domain) => {
              if (domain) {
                setZoomDomain({ start: domain.startIndex, end: domain.endIndex });
              }
            }}
          />
          <Line 
            type="monotone" 
            dataKey={getYAxisData()} 
            stroke={getLineColor()} 
            strokeWidth={2.5} 
            dot={false} 
            activeDot={{ r: 5, strokeWidth: 2, fill: 'white' }}
          />
        </LineChart>
      </ResponsiveContainer>
      {isGraphFullscreen && (
        <div className="text-center text-xs text-slate-500 mt-2">
          Use mouse to drag and select area to zoom. Scroll to zoom in/out. Press ESC to exit.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Status Bar and Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Status Indicator */}
        <div className={`rounded-xl border-2 p-3 ${getStatusColor()} transition-all`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold opacity-75 mb-1">Status</div>
              <div className="text-lg font-bold flex items-center gap-2">
                {isRunning && !isPaused && <span className="animate-pulse">●</span>}
                {getStatusText()}
              </div>
            </div>
            {isRunning && (
              <FiLoader className={`h-6 w-6 ${!isPaused && 'animate-spin'}`} />
            )}
          </div>
        </div>

        {/* Timer */}
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3">
          <div className="text-xs font-semibold text-blue-700 mb-1">Time Remaining</div>
          <div className="text-2xl font-bold text-blue-900 font-mono flex items-center gap-2">
            <FiClock className="h-5 w-5" />
            {formatTime(timeRemaining)}
          </div>
        </div>

        {/* Configuration Info */}
        <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-3">
          <div className="text-xs font-semibold text-purple-700 mb-1">Configuration</div>
          <div className="text-sm text-purple-900">
            <div>Duration: {totalDuration || 10}s</div>
            <div className="text-xs opacity-75">Samples: {chartData.length}</div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleStart}
            disabled={isRunning}
            className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiPlay size={16} /> Start
          </button>
          <button
            onClick={handlePause}
            disabled={!isRunning}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm ${
              isPaused 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-yellow-500 hover:bg-yellow-600'
            }`}
          >
            {isPaused ? <><FiPlay size={16} /> Resume</> : <><FiPause size={16} /> Pause</>}
          </button>
          <button
            onClick={handleStop}
            disabled={!isRunning}
            className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiStopCircle size={16} /> Stop
          </button>
        </div>
      </div>

      {/* Graph Type Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
        {[
          { key: 's-t', label: 'Distance', shortLabel: 'S-T' },
          { key: 'v-t', label: 'Velocity', shortLabel: 'V-T' },
          { key: 'a-t', label: 'Acceleration', shortLabel: 'A-T' }
        ].map(type => (
          <button
            key={type.key}
            onClick={() => setGraphType(type.key)}
            className={`flex-1 px-3 py-2 font-semibold transition-all rounded-md whitespace-nowrap text-xs sm:text-sm ${
              graphType === type.key
                ? 'bg-white text-purple-700 shadow-md'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <span className="hidden sm:inline">{type.label}</span>
            <span className="sm:hidden">{type.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Statistics */}
      <DataStatistics data={chartData} dataType={graphType} />

      {/* Split View: Graph (2/3) + Table (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Graph - 2/3 width */}
        <div className="lg:col-span-2">
          <GraphComponent />
        </div>

        {/* Table - 1/3 width */}
        <div className="lg:col-span-1">
          <LiveDataTable 
            data={chartData}
            graphType={graphType}
            isFullscreen={isTableFullscreen}
            onToggleFullscreen={() => setIsTableFullscreen(!isTableFullscreen)}
          />
        </div>
      </div>

      {/* Export and Save Buttons */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-md border-2 border-purple-200 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportToCSV}
            disabled={chartData.length === 0}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiDownload size={16} /> Export CSV
          </button>
          <button
            onClick={handleSaveToProfile}
            disabled={chartData.length === 0}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiSave size={16} /> Save to Profile
          </button>
        </div>
        {chartData.length === 0 && (
          <p className="text-center text-xs text-slate-500 mt-2">
            Start the experiment to enable export and save options
          </p>
        )}
      </div>
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
  const [selectedDevice, setSelectedDevice] = useState(null);

  const { sendMessage } = useWebSocket(userToken, true);
  const { releaseDevice } = useDeviceManager(userToken);

  const handleDisconnect = () => {
    sendMessage({ action: 'release_device' });
    releaseDevice();
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
    localStorage.setItem('selectedDevice', JSON.stringify(device));
    localStorage.setItem('experimentType', expType);
    setSelectedDevice(device);
    setExperimentType(expType);
    setShowConfigPanel(false);
    setShowConfigModal(false);
  };

  const getExperimentName = () => {
    if (experimentType === 'tof') return 'Displacement Analysis';
    if (experimentType === 'oscillation') return 'Inclined Plane';
    return 'Experiment';
  };

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 min-h-screen">
      
      {showConfigModal && <ConfigurationModal onComplete={handleComplete} />}
      {showConfigPanel && (
        <ConfigPanel 
          config={config}
          onChange={setConfig}
          onClose={() => setShowConfigPanel(false)}
          selectedDevice={selectedDevice}
          userToken={userToken}
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
            <ExperimentGraph experimentType={experimentType} token={userToken} />
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
