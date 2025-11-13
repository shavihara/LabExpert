import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FiPlay, FiPause, FiStopCircle, FiRefreshCw, FiSave, 
  FiClock, FiLoader
} from 'react-icons/fi';
import PlotlyGraph from '../../../../components/PlotlyGraph';
import LiveDataTable from './LiveDataTable';

const ExperimentGraph = ({ experimentType, token, sharedWebSocket, sharedExperimentManager, config = { max_distance_cm: 150 } }) => {
  // ===== DATA HANDLING STATE =====
  const [chartData, setChartData] = useState([]);
  const [neglectedData, setNeglectedData] = useState(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [saveStatus, setSaveStatus] = useState(null);
  
  const chartDataRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const sensorStartTimeRef = useRef(null);
  const dataHandlerCleanupRef = useRef(null);
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);

  // ===== SHARED WEBSOCKET AND EXPERIMENT MANAGER =====
  const { sendMessage, addMessageHandler } = sharedWebSocket;
  const { saveExperimentData, saveStatus: wsSaveStatus, clearData } = sharedExperimentManager;

  // Keep refs in sync with state
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // ===== DIRECT DATA STREAMING HANDLER =====
  const handleDataMessage = useCallback((message) => {
    try {
      // Only check pause state, not running state - allow data processing even after timer stops
      // to capture all data sent by backend until explicit stop
      if (isPausedRef.current) return;

      let d = null;
      if (message?.type === 'processed_data' && message?.data) {
        d = message.data;
        const t = Number(d.t ?? d.time ?? 0);
        const elapsedMs = Number.isFinite(t) ? (t * 1000) : (startTimeRef.current ? (Date.now() - startTimeRef.current) : 0);
        const point = {
          time: elapsedMs,
          timeDisplay: (elapsedMs / 1000).toFixed(2),
          distance: Number(d.s ?? d.displacement ?? d.distance ?? 0),
          velocity: Number(d.v ?? d.velocity ?? 0),
          acceleration: Number(d.a ?? d.acceleration ?? 0),
          sample: d.sample ?? d.packet_id ?? null,
          packet_id: d.packet_id ?? null,
          __originalIndex: chartDataRef.current.length // Add original index for neglect tracking
        };
        
        // Debug logging for sample processing
        console.log(`Processing sample ${point.sample || 'unknown'} (packet ${point.packet_id || 'unknown'}) - total samples: ${chartDataRef.current.length + 1}`);
        
        chartDataRef.current = [...chartDataRef.current, point];
        setChartData([...chartDataRef.current]);
        return;
      }

      if (message?.type === 'sensor_data') {
        d = message.data ?? {};
      } else if (message?.data) {
        d = message.data;
      }

      if (!d) return;

      const timeCandidate = Number(d.time ?? d.timestamp ?? message.timestamp);
      let elapsedMs;
      if (Number.isFinite(timeCandidate)) {
        if (sensorStartTimeRef.current === null) {
          sensorStartTimeRef.current = timeCandidate;
        }
        elapsedMs = timeCandidate - sensorStartTimeRef.current;
      } else {
        elapsedMs = startTimeRef.current ? (Date.now() - startTimeRef.current) : 0;
      }
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) elapsedMs = 0;

      const point = {
        time: elapsedMs,
        timeDisplay: (elapsedMs / 1000).toFixed(2),
        distance: Number(d.distance ?? d.displacement ?? 0),
        velocity: Number(d.velocity ?? 0),
        acceleration: Number(d.acceleration ?? 0),
        __originalIndex: chartDataRef.current.length // Add original index for neglect tracking
      };
      chartDataRef.current = [...chartDataRef.current, point];
      setChartData([...chartDataRef.current]);
    } catch (err) {
      console.error('Error in handleDataMessage:', err);
    }
  }, []);

  // ===== TIMER COUNTDOWN EFFECT =====
  useEffect(() => {
    if (isRunning && !isPaused && totalDuration > 0) {
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const remaining = Math.max(0, totalDuration - elapsed);
        setTimeRemaining(remaining);
        
        if (remaining <= 0) {
          setIsRunning(false);
          setIsPaused(false);
          setTimeRemaining(0);
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          // Note: We DON'T remove the data handler here - let it continue processing
          // data from backend until explicit stop or device status indicates completion
        }
      }, 100);
      
      return () => clearInterval(timerRef.current);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRunning, isPaused, totalDuration]);

  // ===== DEVICE STATUS MESSAGE HANDLER =====
  useEffect(() => {
    const handleDeviceStatus = (message) => {
      if (message.type === 'device_status' && message.data) {
        const { status, device_id, timestamp } = message.data;
        console.log('Received device status:', { status, device_id, timestamp });
        
        if (status === 'experiment_completed') {
          console.log('Experiment completed by ESP32 firmware');
          setIsRunning(false);
          setIsPaused(false);
          setTimeRemaining(0);
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          
          // Remove data handler only when backend signals completion
          if (dataHandlerCleanupRef.current) {
            try { dataHandlerCleanupRef.current(); } catch {}
            dataHandlerCleanupRef.current = null;
          }
          
          alert('✓ Experiment completed successfully by the ESP32 firmware!');
        }
      }
    };

    const removeHandler = addMessageHandler(handleDeviceStatus);
    
    return () => {
      removeHandler();
    };
  }, [addMessageHandler]);

  // ===== WEBSOCKET SAVE STATUS MONITOR =====
  useEffect(() => {
    if (wsSaveStatus) {
      setSaveStatus(wsSaveStatus);
      
      if (wsSaveStatus.status === 'success') {
        alert('✓ Experiment data saved to your profile successfully!');
      } else if (wsSaveStatus.status === 'error') {
        alert('❌ Error saving data: ' + wsSaveStatus.message);
      }
    }
  }, [wsSaveStatus]);

  // ===== EXPERIMENT CONTROL HANDLERS =====
  const handleStart = async () => {
    console.log('Starting experiment with clean state...');
    clearData();
    chartDataRef.current = [];
    setChartData([]);
    sensorStartTimeRef.current = null;
    startTimeRef.current = null;
    
    setIsRunning(true);
    setIsPaused(false);
    
    try {
      const config = JSON.parse(localStorage.getItem('experimentConfig') || '{"duration_s": 10}');
      setTotalDuration(config.duration_s || 10);
      setTimeRemaining(config.duration_s || 10);
    } catch (e) {
      setTotalDuration(10);
      setTimeRemaining(10);
    }
    
    if (dataHandlerCleanupRef.current) {
      try { dataHandlerCleanupRef.current(); } catch {}
      dataHandlerCleanupRef.current = null;
    }
    dataHandlerCleanupRef.current = addMessageHandler(handleDataMessage);
    
    startTimeRef.current = Date.now();
    
    sendMessage({ action: 'start_experiment', experiment_type: experimentType });
    
    console.log('Experiment started with clean state');
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
    if (dataHandlerCleanupRef.current) {
      try { dataHandlerCleanupRef.current(); } catch {}
      dataHandlerCleanupRef.current = null;
    }
    
    sendMessage({ action: 'stop_experiment' });
  };

  const handleReset = () => {
    clearData();
    chartDataRef.current = [];
    setChartData([]);
    setNeglectedData(new Set());
    
    setIsRunning(false);
    setIsPaused(false);
    setTimeRemaining(0);
    setTotalDuration(0);
    sensorStartTimeRef.current = null;
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    console.log('All data and states have been reset');
    
    if (dataHandlerCleanupRef.current) {
      try { dataHandlerCleanupRef.current(); } catch {}
      dataHandlerCleanupRef.current = null;
    }
  };

  // Filter out neglected data points
  const getFilteredChartData = useCallback(() => {
    if (neglectedData.size === 0) {
      return chartData;
    }
    return chartData.filter((_, index) => !neglectedData.has(index));
  }, [chartData, neglectedData]);

  // Handle neglected data changes from LiveDataTable
  const handleNeglectedDataChange = (newNeglectedData) => {
    setNeglectedData(newNeglectedData);
  };

  // Handle neglected data range selection from PlotlyGraph
  const handleNeglectedDataRange = (neglectedIndices) => {
    // Create a new Set with the neglected indices
    const newNeglectedData = new Set(neglectedIndices);
    setNeglectedData(newNeglectedData);
  };

  const handleSaveToProfile = async () => {
    try {
      saveExperimentData({
        experiment_type: experimentType,
        data: chartData,
        timestamp: new Date().toISOString()
      });
      
      setSaveStatus({ status: 'loading', message: 'Saving data...' });
      
      const checkStatus = () => {
        if (saveStatus && saveStatus.status !== 'loading') {
          clearInterval(statusInterval);
        }
      };
      
      const statusInterval = setInterval(checkStatus, 100);
      setTimeout(() => clearInterval(statusInterval), 5000);
      
    } catch (error) {
      alert('❌ Error saving data: ' + error.message);
    }
  };

  // ===== UI STATUS HELPERS =====
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

  // ===== ESC KEY HANDLER FOR FULLSCREEN =====
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (isTableFullscreen) setIsTableFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isTableFullscreen]);

  return (
    <div className="space-y-4">
      {/* ===== STATUS BAR AND CONTROLS ===== */}
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
            {/* Sample count debugging */}
            {chartData.length > 0 && (
              <div className="text-xs opacity-75 mt-1 border-t border-purple-200 pt-1">
                <div>First: {new Date(chartData[0].timestamp).toLocaleTimeString()}</div>
                <div>Last: {new Date(chartData[chartData.length - 1].timestamp).toLocaleTimeString()}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== CONTROL BUTTONS ===== */}
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
          <button
            onClick={handleReset}
            disabled={isRunning}
            className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiRefreshCw size={16} /> Reset
          </button>
        </div>
      </div>

      {/* ===== PLOTLY GRAPH INTEGRATION ===== */}
      {/* This replaces the old Chart.js/Recharts implementation */}
      <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-xl border-2 border-slate-200 p-4">
        <PlotlyGraph 
          experimentType={experimentType}
          token={token}
          sharedWebSocket={sharedWebSocket}
          sharedExperimentManager={sharedExperimentManager}
          chartData={getFilteredChartData()}
          fullChartData={chartData} // Pass full data for proper index calculation
          isRunning={isRunning}
          isPaused={isPaused}
          onStart={handleStart}
          onPause={handlePause}
          onStop={handleStop}
          onReset={handleReset}
          onNeglectedDataRange={handleNeglectedDataRange} // Handle range selection for neglecting data
          config={config} // Pass configuration for fixed axis bounds
        />
      </div>

      {/* ===== LIVE DATA TABLE ===== */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
        <LiveDataTable 
          data={chartData}
          isFullscreen={isTableFullscreen}
          onToggleFullscreen={() => setIsTableFullscreen(!isTableFullscreen)}
          onNeglectedDataChange={handleNeglectedDataChange}
          neglectedData={neglectedData}
        />
      </div>

      {/* ===== EXPORT AND SAVE BUTTONS ===== */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-md border-2 border-purple-200 p-4">
        <div className="flex flex-wrap gap-2">
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
            Start the experiment to enable save options
          </p>
        )}
      </div>
    </div>
  );
};

export default ExperimentGraph;