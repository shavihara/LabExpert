import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FiPlay, FiPause, FiStopCircle, FiRefreshCw, FiSave, 
  FiClock, FiLoader, FiSkipForward, FiBarChart2, FiTarget
} from 'react-icons/fi';
import PlotlyGraph from '../../../../components/PlotlyGraph';
import ConfirmDialog from '../../../../components/common/ConfirmDialog';
import { useTheme } from '../../../../context/ThemeContext';
import LiveDataTable from './LiveDataTable';

const ExperimentGraph = ({ experimentType, token, sharedWebSocket, sharedExperimentManager, config = { max_distance_cm: 150 }, subExperiment, externalControls = false, onNextAttempt, experimentResults, setExperimentResults, onComplete }) => {
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
  const [displayRangeSeconds, setDisplayRangeSeconds] = useState(0);
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const lastCountRef = useRef(0);
  
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
  const timeRemainingRef = useRef(0);
  const rafPendingRef = useRef(false);
  const lastFlushRef = useRef(0);
  const FLUSH_INTERVAL_MS = 50;

  const scheduleChartFlush = useCallback(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (rafPendingRef.current) return;
    const due = now - lastFlushRef.current >= FLUSH_INTERVAL_MS;
    if (due) {
      lastFlushRef.current = now;
      setChartData([...chartDataRef.current]);
    } else {
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        lastFlushRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
        setChartData([...chartDataRef.current]);
      });
    }
  }, []);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { subExperimentRef.current = subExperiment; }, [subExperiment]);

  // ===== SHARED WEBSOCKET AND EXPERIMENT MANAGER =====
  const { sendMessage, addMessageHandler } = sharedWebSocket;
  const { saveExperimentData, saveStatus: wsSaveStatus, clearData } = sharedExperimentManager;

  // Keep refs in sync with state
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { timeRemainingRef.current = timeRemaining; }, [timeRemaining]);
  const [startCountdown, setStartCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(0);
  const [isCountdownMode, setIsCountdownMode] = useState(false);
  useEffect(() => {
    const base = Number(config?.duration_s);
    const indef = !!config?.run_indefinite;
    if (!indef && Number.isFinite(base) && base > 0) {
      setTotalDuration(base);
      setDisplayRangeSeconds(base);
      if (!isRunning) {
        setTimeRemaining(base);
      }
    } else {
      setTotalDuration(0);
      if (!isRunning) {
        setTimeRemaining(0);
      }
    }
  }, [config?.duration_s, config?.run_indefinite, isRunning]);

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
        samples: chartDataRef.current.length,
        isCountdownMode,
        count: lastCountRef.current
      };
      window.dispatchEvent(new CustomEvent('labex:tiles:update', { detail }));
    } catch {}
  }, [isRunning, isPaused, timeRemaining, runningTime, config, isCountdownMode]);

  const isCountUpMode = (subExperiment?.id === '2.1' || subExperiment?.id === '2.2' || subExperiment?.id === '5.1' || ['pendulum_simple','pendulum_compound'].includes(experimentType));

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
        
        // alert(`Attempt Completed!\nPeriod: ${result.period?.toFixed(4)}s\nT²: ${result.period_squared?.toFixed(4)}s²`);
        return;
      }

      if (isPausedRef.current) return;

      let d = null;
      if (message?.type === 'processed_data' && message?.data) {
        d = message.data;
        const t = Number(d.t ?? d.time ?? 0);
        const elapsedMs = Number.isFinite(t) ? (t * 1000) : (startTimeRef.current ? (Date.now() - startTimeRef.current) : 0);
        const tc = Number(d.celsius ?? d.C ?? d.temp_c ?? d.temperature_c);
        const tf = Number(d.fahrenheit ?? d.temp_f);
        const tk = Number(d.kelvin ?? d.temp_k);
        const cVal = Number.isFinite(tc) ? tc : (Number.isFinite(tf) ? (tf - 32) * 5/9 : (Number.isFinite(tk) ? tk - 273.15 : 0));
        const fVal = Number.isFinite(tf) ? tf : (Number.isFinite(cVal) ? cVal * 9/5 + 32 : (Number.isFinite(tk) ? (tk - 273.15) * 9/5 + 32 : 0));
        const kVal = Number.isFinite(tk) ? tk : (Number.isFinite(cVal) ? cVal + 273.15 : (Number.isFinite(tf) ? (tf - 32) * 5/9 + 273.15 : 0));
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
          celsius: cVal,
          fahrenheit: fVal,
          kelvin: kVal,
          kineticEnergy: Number(d.ke ?? d.kineticEnergy ?? 0),
          potentialEnergy: Number(d.pe ?? d.potentialEnergy ?? 0),
          totalEnergy: Number(d.te ?? d.totalEnergy ?? 0),
          sample: d.sample ?? d.packet_id ?? null,
          packet_id: d.packet_id ?? null,
          __originalIndex: chartDataRef.current.length
        };
        
        // Debug logging for sample processing
        console.log(`Processing sample ${point.sample || 'unknown'} (packet ${point.packet_id || 'unknown'}) - total samples: ${chartDataRef.current.length + 1}`);
        
        chartDataRef.current = [...chartDataRef.current, point];
        scheduleChartFlush();

        const countVal = Number(d.oscillation_count ?? d.count ?? 0);
        const currentConfig = configRef.current || {};
        const maxCountCfg = Number(currentConfig?.max_count ?? 0);
        const pendId = subExperimentRef.current?.id;
        const isPendulum = (pendId === '2.1' || pendId === '2.2' || pendId === '5.1');
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

      const tc2 = Number(d.celsius ?? d.C ?? d.temp_c ?? d.temperature_c);
      const tf2 = Number(d.fahrenheit ?? d.temp_f);
      const tk2 = Number(d.kelvin ?? d.temp_k);
      const cVal2 = Number.isFinite(tc2) ? tc2 : (Number.isFinite(tf2) ? (tf2 - 32) * 5/9 : (Number.isFinite(tk2) ? tk2 - 273.15 : 0));
      const fVal2 = Number.isFinite(tf2) ? tf2 : (Number.isFinite(cVal2) ? cVal2 * 9/5 + 32 : (Number.isFinite(tk2) ? (tk2 - 273.15) * 9/5 + 32 : 0));
      const kVal2 = Number.isFinite(tk2) ? tk2 : (Number.isFinite(cVal2) ? cVal2 + 273.15 : (Number.isFinite(tf2) ? (tf2 - 32) * 5/9 + 273.15 : 0));
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
        celsius: cVal2,
        fahrenheit: fVal2,
        kelvin: kVal2,
        __originalIndex: chartDataRef.current.length
      };
      chartDataRef.current = [...chartDataRef.current, point];
      scheduleChartFlush();

      const countVal2 = Number(d.oscillation_count ?? d.count ?? 0);
      if (Number.isFinite(countVal2)) {
        lastCountRef.current = countVal2;
      }
      const currentConfig2 = configRef.current || {};
      const maxCountCfg2 = Number(currentConfig2?.max_count ?? 0);
      const pendId2 = subExperimentRef.current?.id;
      const isPendulum2 = (pendId2 === '2.1' || pendId2 === '2.2' || pendId2 === '5.1');
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

  const isDelayModeRef = useRef(false);

  // ===== SMOOTH TIMER COUNTDOWN EFFECT =====
  useEffect(() => {
    let animationFrameId = null;
    
    const updateTimer = () => {
      if (isRunning && !isPaused) {
        const now = Date.now();
        const elapsed = (now - startTimeRef.current) / 1000;
        
        const isDelayExp = isDelayModeRef.current;

        if (isDelayExp && elapsed < 0) {
          // Countdown phase
          setRunningTime(0);
          setIsCountdownMode(true);
          // Show countdown: 3, 2, 1
          const countdown = Math.ceil(Math.abs(elapsed));
          setTimeRemaining(countdown > 0 ? countdown : totalDuration);
        } else {
          setIsCountdownMode(false);
          // Normal phase
          setRunningTime(elapsed);
          
          if (!isCountUpMode && totalDuration > 0) {
            const remaining = Math.max(0, totalDuration - elapsed);
            setTimeRemaining(remaining);
            if (remaining <= 0) {
              setIsRunning(false);
              setIsPaused(false);
              setTimeRemaining(0);
              if (sharedExperimentManager?.stopExperiment) {
                sharedExperimentManager.stopExperiment();
              } else {
                sendMessage({ action: 'stop_experiment' });
              }
              if (!completionTriggeredRef.current) {
                completionTriggeredRef.current = true;
                if (onComplete) onComplete(chartDataRef.current);
              }
              return;
            }
          } else if (!isCountUpMode && totalDuration === 0) {
            setTimeRemaining(0);
          }
        }
        
        // Continue the animation loop
        animationFrameId = requestAnimationFrame(updateTimer);
      }
    };

    if (isRunning && !isPaused) {
      animationFrameId = requestAnimationFrame(updateTimer);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, isPaused, totalDuration, isCountUpMode, sharedExperimentManager, sendMessage, onComplete]);

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
          
          // alert('✓ Experiment completed successfully by the ESP32 firmware!');
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
    
    setIsRunning(true);
    setIsPaused(false);
    setRunningTime(0);
    completionTriggeredRef.current = false;
    pendingResultRef.current = false;
    
    const subId = subExperiment?.id;
    const isDelayExp = (subId === 'distance' || subId === 'inclined_plane' || subId === '1.1' || subId === '1.2');
    isDelayModeRef.current = isDelayExp;

    let startConfig = { duration_s: 10 };
    try {
      startConfig = JSON.parse(localStorage.getItem('experimentConfig') || '{"duration_s": 10, "run_indefinite": true}');
      if (isCountUpMode || startConfig.run_indefinite === true) {
        setTotalDuration(0);
        setTimeRemaining(0);
      } else {
        const uiDur = (startConfig.duration_s || 10);
        setTotalDuration(uiDur);
        setTimeRemaining(uiDur);
      }
    } catch (e) {
      setTotalDuration(0);
      setTimeRemaining(0);
    }
    
    if (dataHandlerCleanupRef.current) {
      try { dataHandlerCleanupRef.current(); } catch {}
      dataHandlerCleanupRef.current = null;
    }
    dataHandlerCleanupRef.current = addMessageHandler(handleDataMessage);
    
    if (isDelayExp) {
      startTimeRef.current = Date.now() + 3000;
    } else {
      startTimeRef.current = Date.now();
    }

    // Build config for start based on sub-experiment
    let startCfg = {};
    if (subExperiment?.id === '2.1' || subExperiment?.id === '2.2' || subExperiment?.id === '5.1') {
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
        mode: 'distance'
      };
      if (!(config?.run_indefinite === true)) {
        startCfg.duration = config?.duration_s || 60;
      } else {
        startCfg.run_indefinite = true;
      }
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
    if (isDelayExp) {
      setStartCountdown(true);
      setCountdownValue(1);
      setTimeout(() => setCountdownValue(2), 1000);
      setTimeout(() => setCountdownValue(3), 2000);
      setTimeout(() => setStartCountdown(false), 3000);
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
    setShowResetConfirm(true);
  };

  const executeReset = (keepResults = false) => {
    clearData();
    chartDataRef.current = [];
    setChartData([]);
    setNeglectedData(new Set());
    setAnalysisData([]);
    if (setExperimentResults && !keepResults) {
      setExperimentResults([]);
    }
    setBestFitData(null);
    setPositionStats(null);
    
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
    setShowResetConfirm(false);
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
    
    // Calculate Standard Error of Slope
    const meanX = sumX / n;
    const residuals = experimentResults.map(r => r.period_squared - (slope * r.length_cm + intercept));
    const rss = residuals.reduce((acc, r) => acc + r * r, 0);
    const s_squared = n > 2 ? rss / (n - 2) : 0; // Variance of residuals
    const sumSqDiffX = experimentResults.reduce((acc, r) => acc + (r.length_cm - meanX) ** 2, 0);
    const seSlope = sumSqDiffX > 0 ? Math.sqrt(s_squared / sumSqDiffX) : 0;

    // Upper and Lower Error Slopes
    const slopeMax = slope + seSlope;
    const slopeMin = slope - seSlope;

    // Calculate g
    // T^2 = (4*pi^2/g) * L
    // Slope m = 4*pi^2 / g  => g = 4*pi^2 / m
    // Note: L is in cm, so we treat slope as s^2/cm.
    // g (cm/s^2) = 4*pi^2 / slope
    // g (m/s^2) = (4*pi^2 / slope) / 100
    
    const calculateG = (m) => m !== 0 ? ((4 * Math.PI * Math.PI) / m) / 100 : 0;
    
    const g_cal = calculateG(slope);
    const g_min = calculateG(slopeMax); // steeper slope -> smaller g
    const g_max = calculateG(slopeMin); // shallower slope -> larger g

    // Prepare data with error bars
    const dataWithErrors = experimentResults.map(r => {
      const T = Math.sqrt(r.period_squared);
      // Estimate errors: L +/- 0.1cm, T +/- 0.1s (per oscillation count)
      const deltaL = 0.1;
      const deltaT = 0.1 / (r.count || 1); 
      // Error propagation for T^2: delta(T^2) = 2 * T * deltaT
      const deltaTSq = 2 * T * deltaT;
      
      return {
        ...r,
        error_x: deltaL,
        error_y: deltaTSq
      };
    });
    
    setBestFitData({ 
      slope, intercept, g_cal,
      slopeMax, slopeMin,
      g_min, g_max,
      seSlope,
      dataWithErrors
    });
    // alert(`Analysis Complete!\nSlope: ${slope.toFixed(6)} s²/cm\nCalculated g: ${g_cal.toFixed(3)} m/s²`);
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
  const showResultsTable = experimentResults && experimentResults.length > 0;

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
    const colors = (subExperiment && subExperiment.graphConfig && subExperiment.graphConfig.colors) || [];
    const yAxes = availableTraces;
    const y = {};
    yAxes.forEach((k, i) => {
      y[k] = { label: labels[i] || (k.charAt(0).toUpperCase() + k.slice(1)), unit: units[k] || '', color: colors[i] };
    });
    return { x: { label: 'Time', unit: units.time || 's' }, y };
  }, [subExperiment, availableTraces]);

  const tableColumns = React.useMemo(() => {
    if (showResultsTable) {
      if (subExperiment?.id === '2.1') {
        return [
          { key: 'length_cm', label: 'Length (cm)', format: 'float', precision: 1 },
          { key: 'count', label: 'osci Count', format: 'int' },
          { key: 'total_time', label: 'Total Time (s)', format: 'float', precision: 3 },
          { key: 'period', label: 'Period T (s)', format: 'float', precision: 4 },
          { key: 'period_squared', label: 'T² (s²)', format: 'float', precision: 4 }
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
    const limitMs = (displayRangeSeconds || 0) * 1000 + 250;
    const bounded = (displayRangeSeconds && displayRangeSeconds > 0) ? source.filter(row => (row.time || 0) <= limitMs) : source;
    const tableKeys = (subExperiment && subExperiment.tableConfig && Array.isArray(subExperiment.tableConfig.columns))
      ? subExperiment.tableConfig.columns
          .map(c => c.key)
          .filter(k => k !== 'time' && k !== 'sample')
      : availableTraces;
    return bounded.map(row => {
      const obj = { time: Number((row.time / 1000).toFixed(2)), __originalIndex: row.__originalIndex };
      tableKeys.forEach(k => { obj[k] = row[k]; });
      const s = row.sample != null ? row.sample : (row.packet_id != null ? row.packet_id : (row.__originalIndex != null ? row.__originalIndex + 1 : null));
      obj.sample = s;
      if (isAnalysisMode) {
        obj.kineticEnergy = row.kineticEnergy;
        obj.potentialEnergy = row.potentialEnergy;
        obj.totalEnergy = row.totalEnergy;
      }
      return obj;
    });
  }, [chartData, analysisData, availableTraces, isAnalysisMode, showResultsTable, experimentResults, displayRangeSeconds]);

  return (
    <div className="space-y-4">

      {/* ===== STATUS/TIMER/CONFIG TILES ABOVE CONTROLS (right aligned) ===== */}
      

      {!externalControls && !isAnalysisMode && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-3">
          {(subExperiment?.id?.startsWith('2') || subExperiment?.id === '5.1' || ['pendulum_simple', 'pendulum_compound'].includes(experimentType)) ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleStart}
                disabled={isRunning}
                className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-sm"
              >
                {startCountdown && (subExperiment?.id === 'distance' || subExperiment?.id === 'inclined_plane') ? (
                  <span className="font-mono text-lg">{countdownValue}</span>
                ) : (
                  <>
                    <FiPlay size={16} /> Start
                  </>
                )}
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
                  executeReset(true);
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
                <FiTarget size={16} /> Process
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

      

      {bestFitData && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-3">
          <h3 className="font-bold text-slate-700 mb-2">Analysis Results (Find G)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <div>
                <div className="text-xs text-slate-500">Calculated g</div>
                <div className="text-lg font-mono font-bold text-indigo-600">{bestFitData.g_cal.toFixed(3)} m/s²</div>
             </div>
             <div>
                <div className="text-xs text-slate-500">Slope</div>
                <div className="text-lg font-mono font-bold text-slate-700">{bestFitData.slope.toFixed(4)} s²/cm</div>
             </div>
             <div>
                <div className="text-xs text-slate-500">g Range (Uncertainty)</div>
                <div className="text-sm font-mono text-slate-600">
                    {bestFitData.g_min.toFixed(3)} - {bestFitData.g_max.toFixed(3)} m/s²
                </div>
             </div>
              <div>
                <div className="text-xs text-slate-500">Percentage Error</div>
                <div className="text-lg font-mono font-bold text-slate-700">
                    {Math.abs((9.81 - bestFitData.g_cal)/9.81 * 100).toFixed(2)}%
                </div>
             </div>
          </div>
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
          fullChartData={chartDataRef.current}
          neglectedData={neglectedData}
          graphType={subExperiment?.graphType || 'line'}
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
          onAnalysisData={(d) => setAnalysisData(d)}
          externalMode={isAnalysisMode ? 'analysis' : 'live'}
          analysisResults={showResultsTable ? experimentResults : null}
          bestFitData={bestFitData}
          displayRangeSeconds={displayRangeSeconds}
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

      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={() => executeReset(false)}
        title="Reset Experiment Data"
        message="Are you sure you want to reset all data? This action cannot be undone and all current measurements will be lost."
        type="warning"
      />
    </div>
  );
};

export default ExperimentGraph;
