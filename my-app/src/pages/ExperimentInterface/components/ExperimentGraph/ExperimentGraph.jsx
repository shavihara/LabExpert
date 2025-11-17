import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FiPlay, FiPause, FiStopCircle, FiRefreshCw, FiSave, 
  FiClock, FiLoader
} from 'react-icons/fi';
import PlotlyGraph from '../../../../components/PlotlyGraph';
import LiveDataTable from './LiveDataTable';

const ExperimentGraph = ({ experimentType, token, sharedWebSocket, sharedExperimentManager, config = { max_distance_cm: 150 }, subExperiment }) => {
  // ===== DATA HANDLING STATE =====
  const [chartData, setChartData] = useState([]);
  const [neglectedData, setNeglectedData] = useState(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [saveStatus, setSaveStatus] = useState(null);
  const [isAnalysisMode, setIsAnalysisMode] = useState(false);
  const [analysisData, setAnalysisData] = useState([]);
  const [graphCardHeight, setGraphCardHeight] = useState(null);
  const graphRORef = useRef(null);
  const graphCardElRef = useRef(null);
  const setGraphCardEl = useCallback((el) => {
    graphCardElRef.current = el;
    if (graphRORef.current) {
      try { graphRORef.current.disconnect(); } catch {}
      graphRORef.current = null;
    }
    if (el) {
      setGraphCardHeight(el.clientHeight);
      const ro = new ResizeObserver(() => {
        setGraphCardHeight(el.clientHeight);
      });
      ro.observe(el);
      graphRORef.current = ro;
    }
  }, []);
  const [isLg, setIsLg] = useState(() => typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false);
  
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

  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null;
    const handler = (e) => setIsLg(e.matches);
    if (mq) {
      mq.addEventListener('change', handler);
    }
    return () => {
      if (mq) mq.removeEventListener('change', handler);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (graphRORef.current) {
        try { graphRORef.current.disconnect(); } catch {}
        graphRORef.current = null;
      }
    };
  }, []);

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
          intensity: Number(d.intensity ?? d.lux ?? d.light ?? 0),
          kineticEnergy: Number(d.ke ?? d.kineticEnergy ?? 0),
          potentialEnergy: Number(d.pe ?? d.potentialEnergy ?? 0),
          totalEnergy: Number(d.te ?? d.totalEnergy ?? 0),
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
        intensity: Number(d.intensity ?? d.lux ?? d.light ?? 0),
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
    
    let startConfig = { duration_s: 10 };
    try {
      startConfig = JSON.parse(localStorage.getItem('experimentConfig') || '{"duration_s": 10}');
      setTotalDuration(startConfig.duration_s || 10);
      setTimeRemaining(startConfig.duration_s || 10);
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

  // Keep full data for display; analysis tools can choose to ignore neglected points if needed
  const getFilteredChartData = useCallback(() => chartData, [chartData]);

  // Handle neglected data changes from LiveDataTable
  const handleNeglectedDataChange = (newNeglectedData) => {
    setNeglectedData(newNeglectedData);
  };

  // Handle neglected data range selection from PlotlyGraph
  const handleNeglectedDataRange = (neglectedIndices) => {
    // Union new indices with existing neglected set to allow multiple selections
    setNeglectedData((prev) => {
      const s = new Set(prev);
      neglectedIndices.forEach((i) => s.add(i));
      return s;
    });
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

  // ===== METADATA-DERIVED TRACES AND AXIS =====
  const availableTraces = React.useMemo(() => {
    if (!subExperiment || !subExperiment.graphConfig) {
      return experimentType === 'light_intensity' ? ['intensity'] : ['distance','velocity','acceleration'];
    }
    const yAxes = subExperiment.graphConfig.yAxes;
    return Array.isArray(yAxes) ? yAxes : (typeof yAxes === 'string' ? [yAxes] : []);
  }, [subExperiment, experimentType]);

  const axisMeta = React.useMemo(() => {
    const units = (subExperiment && subExperiment.units) || { time: 's' };
    const labels = (subExperiment && subExperiment.graphConfig && subExperiment.graphConfig.yAxisLabels) || [];
    const yAxes = availableTraces;
    const y = {};
    yAxes.forEach((k, i) => {
      y[k] = { label: labels[i] || (k.charAt(0).toUpperCase() + k.slice(1)), unit: units[k] || '' };
    });
    return { x: { label: 'Time', unit: units.time || 's' }, y };
  }, [subExperiment, availableTraces]);

  const tableColumns = React.useMemo(() => {
    if (subExperiment && subExperiment.tableConfig && Array.isArray(subExperiment.tableConfig.columns)) {
      const base = subExperiment.tableConfig.columns.slice();
      const timeCol = base.find(c => c.key === 'time') || { key: 'time', label: `Time (${axisMeta.x.unit})`, format: 'float', precision: 2 };
      const rest = base.filter(c => c.key !== 'time' && c.key !== 'sample');
      const cols = [
        { key: 'sample', label: 'Sample', format: 'int' },
        timeCol,
        ...rest
      ];
      if (isAnalysisMode) {
        cols.push(
          { key: 'kineticEnergy', label: 'Kinetic Energy (J)', format: 'float', precision: 3 },
          { key: 'potentialEnergy', label: 'Potential Energy (J)', format: 'float', precision: 3 },
          { key: 'totalEnergy', label: 'Total Energy (J)', format: 'float', precision: 3 }
        );
      }
      return cols;
    }
    const cols = [
      { key: 'sample', label: 'Sample', format: 'int' },
      { key: 'time', label: `Time (${axisMeta.x.unit})`, format: 'float', precision: 2 }
    ];
    availableTraces.forEach(k => {
      const meta = axisMeta.y[k] || { label: k, unit: '' };
      cols.push({ key: k, label: meta.unit ? `${meta.label} (${meta.unit})` : meta.label, format: 'float', precision: 2 });
    });
    if (isAnalysisMode) {
      cols.push(
        { key: 'kineticEnergy', label: 'Kinetic Energy (J)', format: 'float', precision: 3 },
        { key: 'potentialEnergy', label: 'Potential Energy (J)', format: 'float', precision: 3 },
        { key: 'totalEnergy', label: 'Total Energy (J)', format: 'float', precision: 3 }
      );
    }
    return cols;
  }, [subExperiment, availableTraces, axisMeta, isAnalysisMode]);

  const tableData = React.useMemo(() => {
    const source = isAnalysisMode ? analysisData : chartData;
    return source.map(row => {
      const obj = { time: Number((row.time / 1000).toFixed(2)), __originalIndex: row.__originalIndex };
      availableTraces.forEach(k => { obj[k] = row[k]; });
      const s = row.sample != null ? row.sample : (row.packet_id != null ? row.packet_id : (row.__originalIndex != null ? row.__originalIndex + 1 : null));
      obj.sample = s;
      if (isAnalysisMode) {
        obj.kineticEnergy = row.kineticEnergy;
        obj.potentialEnergy = row.potentialEnergy;
        obj.totalEnergy = row.totalEnergy;
      }
      return obj;
    });
  }, [chartData, analysisData, availableTraces, isAnalysisMode]);

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

      {isAnalysisMode ? (
        <>
          <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-xl border-2 border-slate-200 p-2 sm:p-3 md:p-4">
            <PlotlyGraph 
              experimentType={experimentType}
              token={token}
              sharedWebSocket={sharedWebSocket}
              sharedExperimentManager={sharedExperimentManager}
              chartData={chartData}
              fullChartData={chartData}
              neglectedData={neglectedData}
              isRunning={isRunning}
              isPaused={isPaused}
              onStart={handleStart}
              onPause={handlePause}
              onStop={handleStop}
              onReset={handleReset}
              onNeglectedDataRange={handleNeglectedDataRange}
              config={config}
              availableTraces={availableTraces}
              axis={axisMeta}
              onModeChange={(m) => setIsAnalysisMode(m === 'analysis')}
              onAnalysisData={(data) => setAnalysisData(data)}
              externalMode={isAnalysisMode ? 'analysis' : 'live'}
            />
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
            <LiveDataTable 
              data={tableData}
              isFullscreen={isTableFullscreen}
              onToggleFullscreen={() => setIsTableFullscreen(!isTableFullscreen)}
              onNeglectedDataChange={handleNeglectedDataChange}
              neglectedData={neglectedData}
              columns={tableColumns}
              visibleRowCount={20}
            />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
          <div ref={setGraphCardEl} className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-xl border-2 border-slate-200 p-2 sm:p-3 md:p-4 lg:col-span-6">
            <PlotlyGraph 
              experimentType={experimentType}
              token={token}
              sharedWebSocket={sharedWebSocket}
              sharedExperimentManager={sharedExperimentManager}
              chartData={chartData}
              fullChartData={chartData}
              neglectedData={neglectedData}
              isRunning={isRunning}
              isPaused={isPaused}
              onStart={handleStart}
              onPause={handlePause}
              onStop={handleStop}
              onReset={handleReset}
              onNeglectedDataRange={handleNeglectedDataRange}
              config={config}
              availableTraces={availableTraces}
              axis={axisMeta}
              onModeChange={(m) => setIsAnalysisMode(m === 'analysis')}
              onAnalysisData={(data) => setAnalysisData(data)}
              externalMode={isAnalysisMode ? 'analysis' : 'live'}
            />
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-2 sm:p-3 md:p-4 lg:col-span-4 overflow-y-auto min-h-0" style={isLg && !isTableFullscreen ? { height: (graphCardHeight || 400), maxHeight: (graphCardHeight || 400) } : undefined}>
            <LiveDataTable 
              data={tableData}
              isFullscreen={isTableFullscreen}
              onToggleFullscreen={() => setIsTableFullscreen(!isTableFullscreen)}
              onNeglectedDataChange={handleNeglectedDataChange}
              neglectedData={neglectedData}
              columns={tableColumns}
              hideNeglectColumn={true}
              hideSampleColumn={true}
              hideCopyButton={true}
              hideNeglectAllButton={true}
              hideCsvButton={true}
              visibleRowCount={isAnalysisMode ? 20 : undefined}
              containerClassName=""
            />
          </div>
        </div>
      )}

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
