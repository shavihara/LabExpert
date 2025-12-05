import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FiPlay, FiPause, FiStopCircle, FiRefreshCw, FiSave, 
  FiClock, FiLoader, FiSkipForward, FiBarChart2
} from 'react-icons/fi';
import PlotlyGraph from '../../../../components/PlotlyGraph';
import { useTheme } from '../../../../context/ThemeContext';
import LiveDataTable from './LiveDataTable';

const ExperimentGraph = ({ experimentType, token, sharedWebSocket, sharedExperimentManager, config = { max_distance_cm: 150 }, subExperiment, externalControls = false, onNextAttempt, experimentResults, setExperimentResults }) => {
  const BACKEND_URL = `http://${window.location.hostname.replace(':3000', '')}:5000`;
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  // ===== DATA HANDLING STATE =====
  const [chartData, setChartData] = useState([]);
  const [neglectedData, setNeglectedData] = useState(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [runningTime, setRunningTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [saveStatus, setSaveStatus] = useState(null);
  const [isAnalysisMode, setIsAnalysisMode] = useState(false);
  const [analysisData, setAnalysisData] = useState([]);
  const [positionStats, setPositionStats] = useState(null);
  const [graphCardHeight, setGraphCardHeight] = useState(null);
  const graphRORef = useRef(null);
  const graphCardElRef = useRef(null);
  const tableContainerRef = useRef(null);
  const setGraphCardEl = useCallback((el) => {
    graphCardElRef.current = el;
    if (graphRORef.current) {
      try { graphRORef.current.disconnect(); } catch {}
      graphRORef.current = null;
    }
    if (el) {
      setGraphCardHeight(el.clientHeight);
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          setGraphCardHeight(el.clientHeight);
        });
        ro.observe(el);
        graphRORef.current = ro;
      }
    }
  }, []);
  const [isLg, setIsLg] = useState(() => typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false);
  const [notif, setNotif] = useState(null);
  const [bestFitData, setBestFitData] = useState(null);
  
  const chartDataRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const sensorStartTimeRef = useRef(null);
  const dataHandlerCleanupRef = useRef(null);
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const completionTriggeredRef = useRef(false);
  const pendingResultRef = useRef(false);
  const configRef = useRef(config);
  const subExperimentRef = useRef(subExperiment);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { subExperimentRef.current = subExperiment; }, [subExperiment]);

  // ===== SHARED WEBSOCKET AND EXPERIMENT MANAGER =====
  const { sendMessage, addMessageHandler } = sharedWebSocket;
  const { saveExperimentData, saveStatus: wsSaveStatus, clearData } = sharedExperimentManager;

  // Keep refs in sync with state
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => {
    const d = Number(config?.duration_s);
    if (Number.isFinite(d) && d > 0) {
      setTotalDuration(d);
      if (!isRunning) {
        setTimeRemaining(d);
      }
    }
  }, [config?.duration_s, isRunning]);

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

  useEffect(() => {
    const onStart = () => handleStart();
    const onPause = () => handlePause();
    const onStop = () => handleStop();
    const onReset = () => handleReset();
    window.addEventListener('labex:controls:start', onStart);
    window.addEventListener('labex:controls:pause', onPause);
    window.addEventListener('labex:controls:stop', onStop);
    window.addEventListener('labex:controls:reset', onReset);
    return () => {
      window.removeEventListener('labex:controls:start', onStart);
      window.removeEventListener('labex:controls:pause', onPause);
      window.removeEventListener('labex:controls:stop', onStop);
      window.removeEventListener('labex:controls:reset', onReset);
    };
  }, []);

  useEffect(() => {
    try {
      const detail = {
        status: getStatusText(),
        isRunning,
        isPaused,
        timeRemaining,
        runningTime,
        config,
        samples: chartData.length
      };
      window.dispatchEvent(new CustomEvent('labex:tiles:update', { detail }));
    } catch {}
  }, [isRunning, isPaused, timeRemaining, runningTime, config, chartData]);

  const isCountUpMode = (subExperiment?.id === '2.1' || subExperiment?.id === '2.2' || ['pendulum_simple','pendulum_compound'].includes(experimentType));

  // ===== DIRECT DATA STREAMING HANDLER =====
  const handleDataMessage = useCallback((message) => {
    try {
      // Handle Experiment Results (Pendulum Analysis)
      if (message?.type === 'experiment_result' || (message?.data?.type === 'experiment_result')) {
        const result = message.data?.type === 'experiment_result' ? message.data : message;
        console.log('Received Experiment Result:', result);
        
        if (setExperimentResults) {
          setExperimentResults(prev => {
            if (pendingResultRef.current && prev.length > 0) {
              const base = prev.slice(0, -1);
              pendingResultRef.current = false;
              return [...base, result];
            }
            return [...prev, result];
          });
        }
        
        // Also stop the experiment locally
        setIsRunning(false);
        setIsPaused(false);
        setTimeRemaining(0);
        if (timerRef.current) clearInterval(timerRef.current);
        
        alert(`Attempt Completed!\nPeriod: ${result.period?.toFixed(4)}s\nT²: ${result.period_squared?.toFixed(4)}s²`);
        return;
      }

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
          angle: Number(d.angle ?? d.theta ?? 0),
          angular_velocity: Number(d.angular_velocity ?? d.omega ?? 0),
          period: Number(d.period ?? d.T ?? 0),
          damping_coefficient: Number(d.damping_coefficient ?? d.zeta ?? 0),
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

        const countVal = Number(d.oscillation_count ?? d.count ?? 0);
        const currentConfig = configRef.current || {};
        const maxCountCfg = Number(currentConfig?.max_count ?? 0);
        const pendId = subExperimentRef.current?.id;
        const isPendulum = (pendId === '2.1' || pendId === '2.2');
        if (isPendulum && Number.isFinite(maxCountCfg) && maxCountCfg > 0 && countVal >= maxCountCfg && !completionTriggeredRef.current) {
          completionTriggeredRef.current = true;
          setIsRunning(false);
          setIsPaused(false);
          if (timerRef.current) clearInterval(timerRef.current);
          try { sendMessage({ action: 'stop_experiment' }); } catch {}

          if (setExperimentResults) {
            const total_time = Number(d.t ?? d.time ?? (point.time / 1000));
            const length_cm = Number(currentConfig?.pendulum_length_cm ?? 0);
            const period = Number(d.period ?? d.T ?? 0);
            const period_squared = Number.isFinite(period) ? period * period : undefined;
            const result = { type: 'experiment_result', length_cm, total_time, count: countVal, period, period_squared };
            setExperimentResults(prev => [...prev, result]);
            pendingResultRef.current = true;
          }
        }
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
        angle: Number(d.angle ?? d.theta ?? 0),
        angular_velocity: Number(d.angular_velocity ?? d.omega ?? 0),
        period: Number(d.period ?? d.T ?? 0),
        damping_coefficient: Number(d.damping_coefficient ?? d.zeta ?? 0),
        intensity: Number(d.intensity ?? d.lux ?? d.light ?? 0),
        __originalIndex: chartDataRef.current.length // Add original index for neglect tracking
      };
      chartDataRef.current = [...chartDataRef.current, point];
      setChartData([...chartDataRef.current]);

      const countVal2 = Number(d.oscillation_count ?? d.count ?? 0);
      const currentConfig2 = configRef.current || {};
      const maxCountCfg2 = Number(currentConfig2?.max_count ?? 0);
      const pendId2 = subExperimentRef.current?.id;
      const isPendulum2 = (pendId2 === '2.1' || pendId2 === '2.2');
      if (isPendulum2 && Number.isFinite(maxCountCfg2) && maxCountCfg2 > 0 && countVal2 >= maxCountCfg2 && !completionTriggeredRef.current) {
        completionTriggeredRef.current = true;
        setIsRunning(false);
        setIsPaused(false);
        if (timerRef.current) clearInterval(timerRef.current);
        try { sendMessage({ action: 'stop_experiment' }); } catch {}

        if (setExperimentResults) {
          const total_time = Number(d.t ?? d.time ?? (point.time / 1000));
          const length_cm = Number(currentConfig2?.pendulum_length_cm ?? 0);
          const period = Number(d.period ?? d.T ?? 0);
          const period_squared = Number.isFinite(period) ? period * period : undefined;
          const result = { type: 'experiment_result', length_cm, total_time, count: countVal2, period, period_squared };
          setExperimentResults(prev => [...prev, result]);
          pendingResultRef.current = true;
        }
      }
    } catch (err) {
      console.error('Error in handleDataMessage:', err);
    }
  }, []);

  // ===== TIMER COUNTDOWN EFFECT =====
  useEffect(() => {
    if (isRunning && !isPaused) {
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setRunningTime(elapsed);
        if (!isCountUpMode) {
          const remaining = Math.max(0, totalDuration - elapsed);
          setTimeRemaining(remaining);
          if (remaining <= 0) {
            setIsRunning(false);
            setIsPaused(false);
            setTimeRemaining(0);
            if (timerRef.current) clearInterval(timerRef.current);
          }
        }
      }, 100);
      return () => clearInterval(timerRef.current);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isRunning, isPaused, totalDuration, isCountUpMode]);

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

  useEffect(() => {
    const handleStats = (message) => {
      const stats = message?.position_stats || message?.data?.position_stats;
      if (stats) setPositionStats(stats);
    };
    const removeStats = addMessageHandler(handleStats);
    return () => {
      removeStats();
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
    setRunningTime(0);
    completionTriggeredRef.current = false;
    pendingResultRef.current = false;
    
    let startConfig = { duration_s: 10 };
    try {
      startConfig = JSON.parse(localStorage.getItem('experimentConfig') || '{"duration_s": 10}');
      if (isCountUpMode) {
        setTotalDuration(0);
        setTimeRemaining(0);
      } else {
        setTotalDuration(startConfig.duration_s || 10);
        setTimeRemaining(startConfig.duration_s || 10);
      }
    } catch (e) {
      if (isCountUpMode) {
        setTotalDuration(0);
        setTimeRemaining(0);
      } else {
        setTotalDuration(10);
        setTimeRemaining(10);
      }
    }
    
    if (dataHandlerCleanupRef.current) {
      try { dataHandlerCleanupRef.current(); } catch {}
      dataHandlerCleanupRef.current = null;
    }
    dataHandlerCleanupRef.current = addMessageHandler(handleDataMessage);
    
    startTimeRef.current = Date.now();

    // Build config for start based on sub-experiment
    let startCfg = {};
    if (subExperiment?.id === '2.1' || subExperiment?.id === '2.2') {
      if (config?.max_count != null) {
        startCfg.max_count = parseInt(config.max_count);
        startCfg.maxCount = parseInt(config.max_count);
      }
      if (config?.pendulum_length_cm != null) {
        startCfg.pendulum_length_cm = Number(config.pendulum_length_cm);
        startCfg.pendulumLengthCm = Number(config.pendulum_length_cm);
      }
      if (config?.pivot_to_com_distance_cm != null) {
        startCfg.pivot_to_com_distance_cm = Number(config.pivot_to_com_distance_cm);
        startCfg.pivotToComDistanceCm = Number(config.pivot_to_com_distance_cm);
      }
    } else {
      startCfg = {
        frequency: config?.frequency_hz || 50,
        duration: config?.duration_s || 60,
        mode: 'distance'
      };
      if (config?.max_distance_cm != null) {
        startCfg.maxRange = Math.round(config.max_distance_cm * 10);
      }
    }

    // Prefer unified start via experiment manager (includes config)
    if (sharedExperimentManager?.startExperiment) {
      sharedExperimentManager.startExperiment(startCfg, experimentType);
    } else {
      sendMessage({ action: 'start_experiment', config: startCfg, experiment_type: experimentType });
    }

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
    setRunningTime(0);
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

  const handleFinish = () => {
    if (!experimentResults || experimentResults.length < 2) {
      alert("Need at least 2 data points for analysis");
      return;
    }
    
    // Linear Regression: T^2 = m * L + c
    const n = experimentResults.length;
    const sumX = experimentResults.reduce((acc, r) => acc + r.length_cm, 0);
    const sumY = experimentResults.reduce((acc, r) => acc + r.period_squared, 0);
    const sumXY = experimentResults.reduce((acc, r) => acc + r.length_cm * r.period_squared, 0);
    const sumXX = experimentResults.reduce((acc, r) => acc + r.length_cm * r.length_cm, 0);
    
    const denominator = (n * sumXX - sumX * sumX);
    if (denominator === 0) {
      alert("Cannot calculate fit: variance in X is zero");
      return;
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate g
    // T^2 = (4*pi^2/g) * L
    // Slope m = 4*pi^2 / g  => g = 4*pi^2 / m
    // Note: L is in cm, so we treat slope as s^2/cm.
    // g (cm/s^2) = 4*pi^2 / slope
    // g (m/s^2) = (4*pi^2 / slope) / 100
    
    const g_cal = slope !== 0 ? ((4 * Math.PI * Math.PI) / slope) / 100 : 0; 
    
    setBestFitData({ slope, intercept, g_cal });
    alert(`Analysis Complete!\nSlope: ${slope.toFixed(6)} s²/cm\nCalculated g: ${g_cal.toFixed(3)} m/s²`);
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
      if (!token || tableData.length === 0) {
        alert('❌ No data to save or not logged in');
        return;
      }
      setSaveStatus({ status: 'loading', message: 'Uploading CSV...' });
      setNotif({ type: 'info', message: 'Saving to profile...' });
      setTimeout(() => setNotif(null), 3000);
      const cols = tableColumns
      const headers = `${cols.map(c => c.label).join(',')},Neglected`
      const csvRows = tableData.map((row, idx) => {
        const originalIndex = row.__originalIndex ?? idx
        const neg = neglectedData.has(originalIndex) ? 'neglected' : ''
        const base = cols.map(c => {
          const value = row[c.key]
          if (typeof value === 'string' && value.includes(',')) return `"${value}"`
          return value
        }).join(',')
        return `${base},${neg}`
      })
      const csvContent = [headers, ...csvRows].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const filename = `experiment_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
      const form = new FormData()
      form.append('experiment_type', experimentType)
      form.append('sub_experiment', (subExperiment && (subExperiment.id || subExperiment.key || subExperiment.name)) || 'default')
      form.append('timestamp', new Date().toISOString())
      form.append('file', blob, filename)
      const response = await fetch(`${BACKEND_URL}/api/experiments/upload_csv`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      })
      if (response.ok) {
        setSaveStatus({ status: 'success', message: 'Saved to profile' })
        setNotif({ type: 'success', message: 'Saved to profile' });
        setTimeout(() => setNotif(null), 3000);
      } else {
        setSaveStatus({ status: 'error', message: 'Failed to save' })
        setNotif({ type: 'error', message: 'Failed to save data' });
        setTimeout(() => setNotif(null), 3000);
      }
    } catch (error) {
      setSaveStatus({ status: 'error', message: 'Error saving' })
      alert('❌ Error saving data: ' + error.message)
      setNotif({ type: 'error', message: 'Error saving data' });
      setTimeout(() => setNotif(null), 3000);
    }
  };

  // ===== UI STATUS HELPERS =====
  const getStatusColor = () => {
    if (isDark) {
      if (isRunning && !isPaused) return 'bg-green-900/20 text-green-300 border-green-600';
      if (isPaused) return 'bg-yellow-900/20 text-yellow-300 border-yellow-600';
      return 'bg-slate-800 text-slate-300 border-slate-600';
    }
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

  useEffect(() => {
    const onFsChange = () => {
      const el = document.fullscreenElement || null;
      setIsTableFullscreen(el === tableContainerRef.current);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ===== METADATA-DERIVED TRACES AND AXIS =====
  const showResultsTable = !isRunning && experimentResults && experimentResults.length > 0;

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
    if (showResultsTable) {
      if (subExperiment?.id === '2.1') {
        return [
          { key: 'length_cm', label: 'Length (cm)', format: 'float', precision: 1 },
          { key: 'count', label: 'Total Oscillations', format: 'int' },
          { key: 'total_time', label: 'Total Time (s)', format: 'float', precision: 3 }
        ];
      }
      return [
        { key: 'length_cm', label: 'Length (cm)', format: 'float', precision: 1 },
        { key: 'total_time', label: 'Total Time (s)', format: 'float', precision: 3 },
        { key: 'count', label: 'Count', format: 'int' },
        { key: 'period', label: 'Period T (s)', format: 'float', precision: 4 },
        { key: 'period_squared', label: 'T² (s²)', format: 'float', precision: 4 }
      ];
    }

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
  }, [subExperiment, availableTraces, axisMeta, isAnalysisMode, showResultsTable]);

  const tableData = React.useMemo(() => {
    if (showResultsTable) return experimentResults;

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
  }, [chartData, analysisData, availableTraces, isAnalysisMode, showResultsTable, experimentResults]);

  return (
    <div className="space-y-4">

      {/* ===== STATUS/TIMER/CONFIG TILES ABOVE CONTROLS (right aligned) ===== */}
      

      {!externalControls && !isAnalysisMode && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-3">
          {(subExperiment?.id?.startsWith('2') || ['pendulum_simple', 'pendulum_compound'].includes(experimentType)) ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleStart}
                disabled={isRunning}
                className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
              >
                <FiPlay size={16} /> Start
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
              <button
                onClick={() => {
                  handleReset();
                  if (onNextAttempt) onNextAttempt();
                }}
                disabled={isRunning}
                className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
              >
                <FiSkipForward size={16} /> Next Attempt
              </button>
              <button
                onClick={handleFinish}
                disabled={isRunning || !experimentResults || experimentResults.length < 2}
                className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
              >
                <FiBarChart2 size={16} /> Finish
              </button>
            </div>
          ) : (
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
          )}
        </div>
      )}

      

      {/* ===== UNIFIED GRAPH AND TABLE LAYOUT ===== */}
      <div className={`grid grid-cols-1 ${isAnalysisMode ? 'gap-4' : 'lg:grid-cols-10 gap-4'}`}>
        
        {/* GRAPH CARD */}
        <div 
          ref={!isAnalysisMode ? setGraphCardEl : null} 
          className={`bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900 rounded-2xl shadow-xl border-2 border-slate-200 dark:border-slate-700 p-2 sm:p-3 md:p-4 ${isAnalysisMode ? '' : 'lg:col-span-6'}`}
        >
          {isAnalysisMode && positionStats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
              {[
                {label: 'Mean', value: Number(positionStats.mean).toFixed(2)},
                {label: 'Std Dev', value: Number(positionStats.std).toFixed(2)},
                {label: 'Min', value: Number(positionStats.min).toFixed(2)},
                {label: 'Max', value: Number(positionStats.max).toFixed(2)},
              ].map((tile, idx) => (
                <div key={idx} className={`rounded-xl px-3 py-2 text-center border transition-colors 
                  ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className={`text-[11px] font-semibold tracking-wide uppercase mb-1 
                    ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{tile.label}</div>
                  <div className={`text-base sm:text-lg font-mono font-semibold 
                    ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{tile.value}</div>
                </div>
              ))}
            </div>
          )}
          
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
            analysisResults={showResultsTable ? experimentResults : null}
            bestFitData={bestFitData}
          />
        </div>

        {/* TABLE CARD */}
        <div 
          className={`bg-white rounded-xl shadow-lg border border-slate-200 ${isAnalysisMode ? 'p-4' : 'p-2 sm:p-3 md:p-4 lg:col-span-4 overflow-y-auto min-h-0'}`}
          style={(!isAnalysisMode && isLg && !isTableFullscreen) ? { height: (graphCardHeight || 400), maxHeight: (graphCardHeight || 400) } : undefined}
        >
          {(subExperiment?.id === '2.1' && !showResultsTable) ? (
            <div className="text-center text-sm text-slate-600">Results will appear after completion</div>
          ) : (
            <LiveDataTable 
              data={tableData}
              isFullscreen={isTableFullscreen}
              onToggleFullscreen={() => setIsTableFullscreen(!isTableFullscreen)}
              onNeglectedDataChange={handleNeglectedDataChange}
              neglectedData={neglectedData}
              columns={tableColumns}
              visibleRowCount={isAnalysisMode ? 20 : undefined}
              hideNeglectColumn={!isAnalysisMode}
              hideSampleColumn={!isAnalysisMode}
              hideCopyButton={!isAnalysisMode}
              hideNeglectAllButton={!isAnalysisMode}
              hideCsvButton={!isAnalysisMode}
              containerClassName={!isAnalysisMode ? "" : undefined}
              onContainerRef={(el) => { tableContainerRef.current = el; }}
            />
          )}
        </div>
      </div>

      {/* ===== EXPORT AND SAVE BUTTONS ===== */}
      <div className={`${isDark ? 'bg-slate-800 border-slate-600' : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200'} rounded-xl shadow-md border-2 p-4`}>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSaveToProfile}
            disabled={chartData.length === 0}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
          >
            <FiSave size={16} /> Save to Profile
          </button>
        </div>
        {saveStatus && (
          <div className={`mt-3 text-xs font-semibold px-3 py-2 rounded-lg inline-block border ${
            saveStatus.status === 'loading' ? (isDark ? 'bg-blue-900/20 text-blue-300 border-blue-600' : 'bg-blue-50 text-blue-700 border-blue-200') :
            saveStatus.status === 'success' ? (isDark ? 'bg-green-900/20 text-green-300 border-green-600' : 'bg-green-50 text-green-700 border-green-200') :
            (isDark ? 'bg-red-900/20 text-red-300 border-red-600' : 'bg-red-50 text-red-700 border-red-200')
          }`}>
            {saveStatus.message}
          </div>
        )}
        {chartData.length === 0 && (
          <p className={`text-center text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Start the experiment to enable save options
          </p>
        )}
      </div>
      {notif && (
        <div className={`fixed top-[calc(var(--header-height)+8px)] right-4 z-50 px-4 py-3 rounded-xl shadow-lg border-2 ${
          notif.type === 'success' ? 'bg-green-50 border-green-300 text-green-800' :
          notif.type === 'error' ? 'bg-red-50 border-red-300 text-red-800' :
          'bg-blue-50 border-blue-300 text-blue-800'
        }`}>
          <span className="text-sm font-semibold">{notif.message}</span>
        </div>
      )}
    </div>
  );
};

export default ExperimentGraph;
