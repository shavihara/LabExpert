import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Plot from 'react-plotly.js';

// Dynamically import the Plotly library and pass it to react-plotly.js via the 'plotly' prop.
// This avoids the factory class component path and bypasses any dynamic require inside the library.
import {
  FiPlay, FiPause, FiStopCircle, FiMaximize, FiMinimize,
  FiZoomIn, FiZoomOut, FiTrendingUp, FiBarChart2, FiDownload,
  FiSave, FiEye, FiEyeOff, FiDollarSign, FiTarget
} from 'react-icons/fi';

import { useFullscreen } from '../context/FullscreenContext';
import { useTheme } from '../context/ThemeContext';

const PlotlyGraph = ({ 
  experimentType, 
  token, 
  sharedWebSocket, 
  sharedExperimentManager,
  chartData,
  fullChartData,
  neglectedData = new Set(),
  graphType,
  isRunning,
  isPaused,
  onStart,
  onPause,
  onStop,
  onReset,
  onNeglectedDataRange,
  config = { max_distance_cm: 150 },
  availableTraces = ['distance','velocity','acceleration'],
  axis = { x: { label: 'Time', unit: 's' }, y: { distance:{label:'Displacement',unit:'cm'}, velocity:{label:'Velocity',unit:'cm/s'}, acceleration:{label:'Acceleration',unit:'cm/s²'}, intensity:{label:'Intensity',unit:'lux'} } },
  onModeChange,
  onAnalysisData,
  externalMode,
  analysisResults,
  bestFitData
}) => {
  const { theme } = useTheme?.() || { theme: 'light' };
  const isDark = theme === 'dark';
  const [plotlyLib, setPlotlyLib] = useState(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import('plotly.js-dist-min');
        const Plotly = mod.default || mod;
        if (mounted) setPlotlyLib(Plotly);
      } catch (e) {
        console.error('Failed to load Plotly:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const [mode, setMode] = useState('live'); // 'live' or 'analysis'
  const { isFullscreen, fullscreenElement, requestFullscreenFor, exitFullscreen } = useFullscreen();
  const plotContainerRef = useRef(null);
  const mapKey = useCallback((k) => ({
    intensity: 'i-t', distance: 's-t', velocity: 'v-t', acceleration: 'a-t'
  })[k] || `${k}-t`, []);

  const [visibleTraces, setVisibleTraces] = useState(() => {
    const initial = { 'ke': false, 'pe': false, 'te': false };
    (availableTraces || []).forEach(k => { initial[mapKey(k)] = true; });
    return initial;
  });
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [measurements, setMeasurements] = useState({});
  const [isNeglectMode, setIsNeglectMode] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [plotConfig, setPlotConfig] = useState({
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    scrollZoom: true,
    showTips: true
  });
  const [dragMode, setDragMode] = useState('pan');

  const plotRef = useRef(null);
  const analysisDataRef = useRef([]);
  const [isMobile, setIsMobile] = useState(false);
  const axisLockRef = useRef(null);
  const axisRangeRef = useRef({ x: null, y: null });

  useEffect(() => {}, []);

  useEffect(() => {
    if (externalMode && externalMode !== mode) {
      setMode(externalMode);
    }
  }, [externalMode]);

  useEffect(() => {
    setDragMode(mode === 'analysis' ? 'select' : 'pan');
  }, [mode]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleFullscreen = async () => {
    if (fullscreenElement === plotContainerRef.current) {
      await exitFullscreen()
    } else {
      await requestFullscreenFor(plotContainerRef.current)
    }
  };

  useEffect(() => {
    const el = plotRef.current?.el;
    if (!el || !plotlyLib) return;
    let unlockTimeout = null;
    let currentLock = null;
    const lockAxes = (target) => {
      if (target === currentLock) return;
      currentLock = target;
      if (target === 'x') {
        plotlyLib.relayout(el, { 'yaxis.fixedrange': true, 'xaxis.fixedrange': false });
      } else if (target === 'y') {
        plotlyLib.relayout(el, { 'xaxis.fixedrange': true, 'yaxis.fixedrange': false });
      } else {
        plotlyLib.relayout(el, { 'xaxis.fixedrange': false, 'yaxis.fixedrange': false });
      }
    };
    const onWheel = (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const bandY = rect.height - Math.min(rect.height * 0.15, 80);
      const bandX = Math.min(rect.width * 0.12, 80);
      const target = y >= bandY ? 'x' : (x <= bandX ? 'y' : null);
      lockAxes(target);
      if (unlockTimeout) clearTimeout(unlockTimeout);
      unlockTimeout = setTimeout(() => {
        currentLock = null;
        lockAxes(null);
      }, 220);
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (unlockTimeout) clearTimeout(unlockTimeout);
    };
  }, [plotlyLib, isFullscreen]);

  // Get intelligent y-axis range based on data type and configuration
  const getYAxisRange = () => {
    const maxDistance = config.max_distance_cm || 150;
    
    // Check what types of data are visible and present
    const hasDisplacement = chartData.some(d => d.distance != null) && visibleTraces['s-t'];
    const hasVelocity = chartData.some(d => d.velocity != null) && visibleTraces['v-t'];
    const hasAcceleration = chartData.some(d => d.acceleration != null) && visibleTraces['a-t'];
    
    // For displacement-only view: 0 to max_distance
    if (hasDisplacement && !hasVelocity && !hasAcceleration) {
      return [0, maxDistance];
    }
    
    // For velocity-only view: symmetric range around zero
    if (hasVelocity && !hasDisplacement && !hasAcceleration) {
      return [-maxDistance, maxDistance];
    }
    
    // For acceleration-only view: symmetric range around zero (scaled appropriately)
    if (hasAcceleration && !hasDisplacement && !hasVelocity) {
      return [-maxDistance * 0.5, maxDistance * 0.5];
    }
    
    // For mixed views (displacement + velocity, displacement + acceleration, etc.)
    // Use symmetric range to accommodate both positive and negative values
    if (hasVelocity || hasAcceleration) {
      return [-maxDistance, maxDistance];
    }
    
    // Default fallback
    return [0, maxDistance];
  };

  // Prepare data for Plotly
  const preparePlotData = useCallback(() => {
    // Special Handling for Pendulum Analysis
    if (analysisResults && analysisResults.length > 0) {
      const sourceData = (bestFitData && bestFitData.dataWithErrors) ? bestFitData.dataWithErrors : analysisResults;
      
      const traces = [
        {
          x: sourceData.map(r => r.length_cm),
          y: sourceData.map(r => r.period_squared),
          error_y: bestFitData && bestFitData.dataWithErrors ? {
            type: 'data',
            array: sourceData.map(r => r.error_y),
            visible: true,
            color: '#3B82F6',
            thickness: 1.5,
            width: 3
          } : undefined,
          error_x: bestFitData && bestFitData.dataWithErrors ? {
             type: 'data',
             array: sourceData.map(r => r.error_x),
             visible: true,
             color: '#3B82F6',
             thickness: 1.5,
             width: 3
          } : undefined,
          type: 'scatter',
          mode: 'markers',
          name: 'Data Points',
          marker: { color: '#3B82F6', size: 10, symbol: 'circle' }
        }
      ];

      if (bestFitData) {
        const lengths = analysisResults.map(r => r.length_cm);
        const periods = analysisResults.map(r => r.period_squared);
        const minL = Math.min(...lengths);
        const maxL = Math.max(...lengths);
        
        // Best Fit
        traces.push({
          x: [minL, maxL],
          y: [bestFitData.slope * minL + bestFitData.intercept, bestFitData.slope * maxL + bestFitData.intercept],
          type: 'scatter',
          mode: 'lines',
          name: 'Best Fit',
          line: { color: '#EF4444', width: 2, dash: 'solid' }
        });
        
        // Error Bars (Min/Max Slopes)
        if (bestFitData.slopeMax !== undefined && bestFitData.slopeMin !== undefined) {
            const meanX = lengths.reduce((a, b) => a + b, 0) / lengths.length;
            const meanY = periods.reduce((a, b) => a + b, 0) / periods.length;
            
            // Max Slope (Steepest)
            // y = m(x - x_bar) + y_bar
            const yMinMax = bestFitData.slopeMax * (minL - meanX) + meanY;
            const yMaxMax = bestFitData.slopeMax * (maxL - meanX) + meanY;
            
            traces.push({
                x: [minL, maxL],
                y: [yMinMax, yMaxMax],
                type: 'scatter',
                mode: 'lines',
                name: 'Max Slope (Steepest)',
                line: { color: '#FCA5A5', width: 1.5, dash: 'dash' }, // Light red
            });

            // Min Slope (Shallowest)
            const yMinMin = bestFitData.slopeMin * (minL - meanX) + meanY;
            const yMaxMin = bestFitData.slopeMin * (maxL - meanX) + meanY;
            
            traces.push({
                x: [minL, maxL],
                y: [yMinMin, yMaxMin],
                type: 'scatter',
                mode: 'lines',
                name: 'Min Slope (Shallowest)',
                line: { color: '#FCA5A5', width: 1.5, dash: 'dash' }, // Light red
            });
        }
      }
      return traces;
    }

    const data = mode === 'analysis' ? analysisDataRef.current : chartData;
    // Filter out neglected points entirely from graph rendering
    const effectiveData = (neglectedData && neglectedData.size > 0)
      ? data.filter((_, i) => !neglectedData.has(i))
      : data;
    const maxPoints = 5000;
    const step = effectiveData.length > maxPoints ? Math.ceil(effectiveData.length / maxPoints) : 1;
    const decimated = step > 1 ? effectiveData.filter((_, i) => i % step === 0) : effectiveData;
    const useGL = true;
    
    const traces = [];
    
    if (visibleTraces['s-t'] && decimated.some(d => d.distance != null)) {
      traces.push({
        x: decimated.map(d => d.time || d.timeDisplay),
        y: decimated.map(d => d.distance || 0),
        type: useGL ? 'scattergl' : 'scatter',
        mode: 'lines',
        name: `${axis?.y?.distance?.label || 'Displacement'}${axis?.y?.distance?.unit ? ' ('+axis.y.distance.unit+')' : ''}`,
        line: { color: '#6366f1', width: 2.5 },
        visible: visibleTraces['s-t'] ? true : 'legendonly'
      });
    }
    
    // Intensity trace (for light intensity experiments)
    if (visibleTraces['i-t'] && decimated.some(d => d.intensity != null)) {
      traces.push({
        x: decimated.map(d => d.time || d.timeDisplay),
        y: decimated.map(d => d.intensity || 0),
        type: useGL ? 'scattergl' : 'scatter',
        mode: 'lines',
        name: `${axis?.y?.intensity?.label || 'Intensity'}${axis?.y?.intensity?.unit ? ' ('+axis.y.intensity.unit+')' : ''}`,
        line: { color: '#f59e0b', width: 2.5 },
        visible: visibleTraces['i-t'] ? true : 'legendonly'
      });
    }
    
    if (visibleTraces['v-t'] && decimated.some(d => d.velocity != null)) {
      traces.push({
        x: decimated.map(d => d.time || d.timeDisplay),
        y: decimated.map(d => d.velocity || 0),
        type: useGL ? 'scattergl' : 'scatter',
        mode: 'lines',
        name: `${axis?.y?.velocity?.label || 'Velocity'}${axis?.y?.velocity?.unit ? ' ('+axis.y.velocity.unit+')' : ''}`,
        line: { color: '#10b981', width: 2.5 },
        visible: visibleTraces['v-t'] ? true : 'legendonly'
      });
    }
    
    if (visibleTraces['a-t'] && decimated.some(d => d.acceleration != null)) {
      traces.push({
        x: decimated.map(d => d.time || d.timeDisplay),
        y: decimated.map(d => d.acceleration || 0),
        type: useGL ? 'scattergl' : 'scatter',
        mode: 'lines',
        name: `${axis?.y?.acceleration?.label || 'Acceleration'}${axis?.y?.acceleration?.unit ? ' ('+axis.y.acceleration.unit+')' : ''}`,
        line: { color: '#ef4444', width: 2.5 },
        visible: visibleTraces['a-t'] ? true : 'legendonly'
      });
    }

    // Energy traces (only in analysis mode)
    if (mode === 'analysis') {
      if (visibleTraces['ke'] && decimated.some(d => d.kineticEnergy != null)) {
        traces.push({
          x: decimated.map(d => d.time || d.timeDisplay),
          y: decimated.map(d => d.kineticEnergy || 0),
          type: useGL ? 'scattergl' : 'scatter',
          mode: 'lines',
          name: 'Kinetic Energy (J)',
          line: { color: '#f59e0b', width: 2, dash: 'dot' },
          visible: visibleTraces['ke'] ? true : 'legendonly'
        });
      }
      
      if (visibleTraces['pe'] && decimated.some(d => d.potentialEnergy != null)) {
        traces.push({
          x: decimated.map(d => d.time || d.timeDisplay),
          y: decimated.map(d => d.potentialEnergy || 0),
          type: useGL ? 'scattergl' : 'scatter',
          mode: 'lines',
          name: 'Potential Energy (J)',
          line: { color: '#8b5cf6', width: 2, dash: 'dot' },
          visible: visibleTraces['pe'] ? true : 'legendonly'
        });
      }
      
      if (visibleTraces['te'] && decimated.some(d => d.totalEnergy != null)) {
        traces.push({
          x: decimated.map(d => d.time || d.timeDisplay),
          y: decimated.map(d => d.totalEnergy || 0),
          type: useGL ? 'scattergl' : 'scatter',
          mode: 'lines',
          name: 'Total Energy (J)',
          line: { color: '#06b6d4', width: 3 },
          visible: visibleTraces['te'] ? true : 'legendonly'
        });
      }
    }

    return traces;
  }, [chartData, visibleTraces, mode, neglectedData, analysisResults, bestFitData]);

  const layout = useMemo(() => {
    if (analysisResults && analysisResults.length > 0) {
      return {
        autosize: true,
        margin: { l: 50, r: 20, t: 30, b: 40 },
        showlegend: true,
        legend: { orientation: 'h', y: 1.1 },
        xaxis: { 
          title: 'Length (cm)', 
          fixedrange: false,
          gridcolor: isDark ? '#334155' : '#e2e8f0',
          zerolinecolor: isDark ? '#475569' : '#94a3b8'
        },
        yaxis: { 
          title: 'Period Squared (s²)', 
          fixedrange: false,
          gridcolor: isDark ? '#334155' : '#e2e8f0',
          zerolinecolor: isDark ? '#475569' : '#94a3b8'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: isDark ? '#e2e8f0' : '#475569' }
      };
    }

    return null;
  }, [analysisResults, isDark, axis, dragMode, selectedRegion, isNeglectMode]);

  // Backend provides energy values for experiments 1.1/1.2, so analysis uses raw chartData
  const calculateEnergyValues = useCallback((data) => data, []);

  // Handle mode switching
  useEffect(() => {
    if (mode === 'analysis') {
      // Capture current data for analysis
      analysisDataRef.current = calculateEnergyValues(chartData);
      if (onAnalysisData) onAnalysisData(analysisDataRef.current);
    }
  }, [mode, chartData, calculateEnergyValues]);

  // Handle plot events
  const handlePlotClick = (event) => {
    if (mode === 'analysis' && event && event.points) {
      const point = event.points[0];
      // Implement measurement tools here
    }
  };

  const handleNeglectRangeClick = () => {
    setIsNeglectMode(prev => {
      const next = !prev;
      if (next) {
        setMode('analysis');
        setActiveTool(null);
        setSelectedRegion(null);
        setMeasurements({});
        setDragMode('select');
      }
      return next;
    });
  };

  const handleSelection = (event) => {
    if (mode === 'analysis' && event && event.range) {
      setSelectedRegion(event.range);
      
      if (isNeglectMode) {
        // Handle neglect range selection
        const { x: [x0, x1] } = event.range;
        const neglectedIndices = [];
        
        // Find indices of data points within the selected range using full data
        fullChartData.forEach((dataPoint, index) => {
          if (dataPoint.time >= x0 && dataPoint.time <= x1) {
            neglectedIndices.push(index);
          }
        });
        
        // Call the onNeglectedDataRange callback with neglected indices
        if (neglectedIndices.length > 0 && onNeglectedDataRange) {
          onNeglectedDataRange(neglectedIndices);
        }
        
        // DON'T reset neglect mode - keep it active for multiple selections
        // setIsNeglectMode(false);
      } else {
        // Normal region selection for measurements
        if (activeTool === 'slope') {
          calculateSlopeMeasurements(event.range);
        } else {
          // Default region selection (including region tool)
          calculateRegionMeasurements(event.range);
        }
      }
    }
  };

  const calculateRegionMeasurements = (range) => {
    if (!range || !analysisDataRef.current.length) return;
    
    const { x: [x0, x1] } = range;
    const filteredData = analysisDataRef.current.filter(
      d => d.time >= x0 && d.time <= x1
    );
    
    if (filteredData.length > 1) {
      const first = filteredData[0];
      const last = filteredData[filteredData.length - 1];
      
      setMeasurements({
        deltaTime: last.time - first.time,
        deltaDistance: last.distance - first.distance,
        deltaVelocity: last.velocity - first.velocity,
        deltaAcceleration: last.acceleration - first.acceleration,
        dataPoints: filteredData.length,
        toolType: 'region'
      });
    }
  };

  const calculateSlopeMeasurements = (range) => {
    if (!range || !analysisDataRef.current.length) return;
    
    const { x: [x0, x1] } = range;
    const filteredData = analysisDataRef.current.filter(
      d => d.time >= x0 && d.time <= x1
    );
    
    if (filteredData.length > 1) {
      const xValues = filteredData.map(d => d.time);
      
      // Helper for linear regression
      const getSlope = (yValues) => {
        const n = xValues.length;
        if (n < 2) return 0;
        
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
          sumX += xValues[i];
          sumY += yValues[i];
          sumXY += xValues[i] * yValues[i];
          sumXX += xValues[i] * xValues[i];
        }
        
        const denominator = (n * sumXX - sumX * sumX);
        return denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
      };

      // Calculate slopes using linear regression for better accuracy
      const distanceSlope = getSlope(filteredData.map(d => d.distance || 0));
      const velocitySlope = getSlope(filteredData.map(d => d.velocity || 0));
      const accelerationSlope = getSlope(filteredData.map(d => d.acceleration || 0));
      
      const first = filteredData[0];
      const last = filteredData[filteredData.length - 1];
      const timeDelta = last.time - first.time;
      
      setMeasurements({
        deltaTime: timeDelta,
        deltaDistance: last.distance - first.distance,
        deltaVelocity: last.velocity - first.velocity,
        deltaAcceleration: last.acceleration - first.acceleration,
        dataPoints: filteredData.length,
        distanceSlope: distanceSlope,
        velocitySlope: velocitySlope,
        accelerationSlope: accelerationSlope,
        toolType: 'slope'
      });
    }
  };

  // Export functions
  const exportToImage = () => {
    if (plotRef.current) {
      // Simple image export implementation
      console.log('Image export functionality - basic implementation');
      
      // Create a simple alert for now since we don't have html2canvas
      alert('Image export functionality will be implemented in a future version');
    }
  };

  const exportToCSV = () => {
    const data = mode === 'analysis' ? analysisDataRef.current : chartData;
    const headers = 'Sample,Time (s),Distance,Velocity,Acceleration,Kinetic Energy (J),Potential Energy (J),Total Energy (J),Neglected';
    const rows = data.map((d, i) => {
      const t = d.time != null ? d.time : d.timeDisplay;
      const neg = neglectedData && neglectedData.has(i) ? 'neglected' : '';
      return `${i + 1},${t},${d.distance || 0},${d.velocity || 0},${d.acceleration || 0},${d.kineticEnergy || 0},${d.potentialEnergy || 0},${d.totalEnergy || 0},${neg}`;
    });
    const csvContent = [headers, ...rows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'experiment-data.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Toolbar components
  const ModeToggle = () => (
    <div className={`relative inline-flex w-[240px] max-w-full items-center rounded-full p-[2px] border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
      <span
        className={`absolute inset-y-[2px] left-[2px] w-1/2 rounded-full shadow transition-transform duration-300 ease-out ${isDark ? 'bg-slate-700' : 'bg-white'} ${
          mode === 'analysis' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      <button
        onClick={() => { setMode('live'); if (onModeChange) onModeChange('live'); }}
        aria-pressed={mode === 'live'}
        className={`relative z-10 flex-1 py-2 text-xs font-semibold text-center cursor-pointer select-none transition-colors ${
          mode === 'live' ? (isDark ? 'text-purple-300' : 'text-purple-700') : (isDark ? 'text-slate-300 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800')
        }`}
      >
        Live Mode
      </button>
      <button
        onClick={() => { setMode('analysis'); if (onModeChange) onModeChange('analysis'); }}
        aria-pressed={mode === 'analysis'}
        className={`relative z-10 flex-1 py-2 text-xs font-semibold text-center cursor-pointer select-none transition-colors ${
          mode === 'analysis' ? (isDark ? 'text-purple-300' : 'text-purple-700') : (isDark ? 'text-slate-300 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800')
        }`}
      >
        Analysis Mode
      </button>
    </div>
  );

  const AnalysisTools = () => {
    const handleToolClick = (tool) => {
      setActiveTool(tool);
      setIsNeglectMode(false);
      setSelectedRegion(null);
      setMeasurements({});
      setDragMode('select');
    };
    
    return (
      <div className={`flex flex-wrap gap-2 p-2 rounded-lg border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-blue-50 border-blue-200'}`}>
        <div className={`hidden sm:flex items-center gap-1 text-xs font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
          <FiBarChart2 size={14} />
          Measurement Tools:
        </div>
        
        <button
          onClick={() => handleToolClick('region')}
          className={`px-2 py-1 border rounded text-xs flex items-center gap-1 ${isDark ? 'hover:bg-slate-700' : 'hover:bg-blue-50'} ${
            activeTool === 'region'
              ? (isDark ? 'bg-slate-700 border-blue-500 text-blue-300' : 'bg-blue-100 border-blue-500 text-blue-700')
              : (isDark ? 'bg-slate-800 border-blue-300 text-slate-200' : 'bg-white border-blue-300')
          }`}
          title="Select region to measure differences"
        >
          <FiTarget size={12} />
          Region Select
        </button>
        
        <button
          onClick={() => handleToolClick('slope')}
          className={`px-2 py-1 border rounded text-xs flex items-center gap-1 ${isDark ? 'hover:bg-slate-700' : 'hover:bg-blue-50'} ${
            activeTool === 'slope'
              ? (isDark ? 'bg-slate-700 border-blue-500 text-blue-300' : 'bg-blue-100 border-blue-500 text-blue-700')
              : (isDark ? 'bg-slate-800 border-blue-300 text-slate-200' : 'bg-white border-blue-300')
          }`}
          title="Calculate slope of selected region"
        >
          <FiTrendingUp size={12} />
          Slope Tool
        </button>
        
        
        <div className="flex items-center gap-1 ml-auto">
          {neglectedData && neglectedData.size > 0 && (
            <span className={`text-xs font-medium px-2 py-1 rounded border ${
              isDark ? 'bg-orange-900/20 text-orange-300 border-orange-600' : 'bg-orange-50 text-orange-700 border-orange-200'
            }`}>
              {neglectedData.size} neglected
            </span>
          )}
          
          <button
            onClick={handleNeglectRangeClick}
            className={`px-2 py-1 border rounded text-xs flex items-center gap-1 ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-blue-50'} ${
              isNeglectMode 
                ? (isDark ? 'border-orange-500 bg-orange-50 text-orange-300' : 'border-orange-500 bg-orange-50 text-orange-700') 
                : (isDark ? 'border-blue-300 text-slate-200' : 'border-blue-300')
            }`}
            title="Select range to neglect data points (stay active for multiple selections)"
          >
            <FiEyeOff size={12} />
            Neglect Range
            {isNeglectMode && <span className="ml-1 text-[10px]">(ACTIVE)</span>}
          </button>
          
          
        </div>
      </div>
    );
  };

  const TraceVisibilityControls = () => {
    const getTraceLabel = (trace) => {
      const predefined = {
        'i-t': axis?.y?.intensity?.label || 'Intensity',
        's-t': axis?.y?.distance?.label || 'Displacement',
        'v-t': axis?.y?.velocity?.label || 'Velocity', 
        'a-t': axis?.y?.acceleration?.label || 'Acceleration',
        'ke': 'Kinetic Energy',
        'pe': 'Potential Energy',
        'te': 'Total Energy'
      }[trace];
      
      if (predefined) return predefined;
      
      // Fallback for custom traces like t2_vs_l
      // Try to find matching key in axis.y
      // mapKey(k) = k + '-t' (usually)
      const rawKey = trace.endsWith('-t') ? trace.slice(0, -2) : trace;
      return axis?.y?.[rawKey]?.label || trace;
    };

    const getTraceColor = (trace) => ({
      'i-t': 'bg-yellow-500 hover:bg-yellow-600',
      's-t': 'bg-blue-500 hover:bg-blue-600',
      'v-t': 'bg-green-500 hover:bg-green-600',
      'a-t': 'bg-red-500 hover:bg-red-600',
      'ke': 'bg-orange-500 hover:bg-orange-600',
      'pe': 'bg-purple-500 hover:bg-purple-600',
      'te': 'bg-cyan-500 hover:bg-cyan-600'
    }[trace] || 'bg-slate-500 hover:bg-slate-600');

    const tone = (t) => ({
      's-t': { ring: 'ring-blue-200', text: 'text-blue-700', bar: 'bg-blue-500' },
      'v-t': { ring: 'ring-green-200', text: 'text-green-700', bar: 'bg-green-500' },
      'a-t': { ring: 'ring-red-200', text: 'text-red-700', bar: 'bg-red-500' },
      'i-t': { ring: 'ring-yellow-200', text: 'text-yellow-700', bar: 'bg-yellow-500' },
      'ke':  { ring: 'ring-orange-200', text: 'text-orange-700', bar: 'bg-orange-500' },
      'pe':  { ring: 'ring-purple-200', text: 'text-purple-700', bar: 'bg-purple-500' },
      'te':  { ring: 'ring-cyan-200', text: 'text-cyan-700', bar: 'bg-cyan-500' }
    }[t] || { ring: 'ring-slate-200', text: 'text-slate-800', bar: 'bg-slate-500' });

    const TraceButton = ({ trace, label }) => {
      const t = tone(trace);
      const textClass = isDark ? t.text.replace('800','200').replace('700','300') : t.text;
      const ringClass = isDark ? t.ring.replace('200','400') : t.ring;
      return (
        <button
          onClick={() => setVisibleTraces(prev => ({ ...prev, [trace]: !prev[trace] }))}
          className={`relative flex-1 min-w-[90px] px-3 py-1.5 text-xs font-medium focus:outline-none border transition-all duration-200 ${
            visibleTraces[trace]
              ? `${isDark ? 'bg-slate-800 border-slate-700' : 'bg-gradient-to-b from-white to-slate-50 border-slate-300'} shadow-sm ring-1 ${ringClass} ${textClass}`
              : `${isDark ? 'bg-transparent text-slate-300 border-transparent hover:bg-slate-700' : 'bg-transparent text-slate-600 border-transparent hover:bg-slate-50'}`
          }`}
          aria-pressed={visibleTraces[trace]}
        >
          {visibleTraces[trace] && <span className={`absolute left-0 right-0 top-0 h-[2px] ${t.bar}`}></span>}
          {label}
        </button>
      );
    };

    const allTraces = useMemo(() => {
      const base = (availableTraces || []).map(k => mapKey(k));
      return mode === 'analysis' ? [...base, 'ke', 'pe', 'te'] : base;
    }, [availableTraces, mode, mapKey]);

    return (
      <div className={`flex flex-wrap w-full rounded-md overflow-hidden border ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
        {allTraces.map(trace => (
          <TraceButton key={trace} trace={trace} label={getTraceLabel(trace)} />
        ))}
      </div>
    );
  };

  const MeasurementDisplay = () => {
    if (!selectedRegion || Object.keys(measurements).length === 0) return null;
    
    const isSlopeTool = measurements.toolType === 'slope';
    
    return (
      <div className={`rounded-lg p-3 border ${isDark ? 'bg-yellow-900/20 border-yellow-700' : 'bg-yellow-50 border-yellow-200'}`}>
        <h4 className={`font-semibold text-sm mb-2 flex items-center gap-2 ${isDark ? 'text-yellow-300' : 'text-yellow-800'}`}>
          <FiDollarSign size={14} />
          {isSlopeTool ? 'Slope Measurements' : 'Region Measurements'}
        </h4>
        <div className={`grid grid-cols-2 gap-2 text-xs ${isDark ? 'text-slate-200' : ''}`}> 
          <div>ΔTime: <span className="font-semibold">{measurements.deltaTime?.toFixed(3)}s</span></div>
          <div>ΔDistance: <span className="font-semibold">{measurements.deltaDistance?.toFixed(3)}cm</span></div>
          <div>ΔVelocity: <span className="font-semibold">{measurements.deltaVelocity?.toFixed(3)}cm/s</span></div>
          {isSlopeTool && (
            <>
              <div>Distance Slope: <span className="font-semibold">{measurements.distanceSlope?.toFixed(3)}cm/s</span></div>
              <div>Velocity Slope: <span className="font-semibold">{measurements.velocitySlope?.toFixed(3)}cm/s²</span></div>
              <div>Acceleration Slope: <span className="font-semibold">{measurements.accelerationSlope?.toFixed(3)}cm/s³</span></div>
            </>
          )}
          <div>Data Points: <span className="font-semibold">{measurements.dataPoints}</span></div>
        </div>
      </div>
    );
  };

  // Guard: wait until Plotly library is loaded
  if (!plotlyLib) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 text-slate-600">
        Loading chart engine...
      </div>
    );
  }

  return (
    <div className="space-y-4">


      {/* Trace Visibility Controls moved inside plot container */}

      {/* Measurement Display */}
      {mode === 'analysis' && <MeasurementDisplay />}

      {/* Plot Container */}
      <div ref={plotContainerRef} className={`bg-white rounded-xl shadow-lg border border-slate-200 ${
        fullscreenElement === plotContainerRef.current ? 'fixed inset-0 z-[10000] p-4 md:p-6' : 'p-2 sm:p-3 md:p-4'
      }`}>
        <div className={`${isFullscreen ? 'mb-4' : 'mb-2'} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <FiBarChart2 className="text-purple-600" />
            <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {mode === 'live' ? 'Real-time Plot' : 'Analysis Plot'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
            <button
              onClick={exportToCSV}
              className="px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-all text-xs flex items-center gap-1 shrink-0"
              title="Export to CSV"
            >
              <FiSave size={14} />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={toggleFullscreen}
              className={`${isDark ? 'px-2 py-1 border border-slate-700 bg-slate-800 text-purple-300 hover:bg-slate-700' : 'px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100'} rounded transition-all text-xs flex items-center gap-1 shrink-0`}
            >
              {fullscreenElement === plotContainerRef.current ? <FiMinimize size={14} /> : <FiMaximize size={14} />}
              <span className="hidden sm:inline">{fullscreenElement === plotContainerRef.current ? 'Exit' : 'Full'}</span>
            </button>
          </div>
        </div>
        <div className="mb-2">
          <ModeToggle />
        </div>

        {/* Unified trace tabs inside the same container */}
        <div className="mb-3">
          <TraceVisibilityControls />
        </div>

        {/* Plotly Graph */}
        <div style={{ height: fullscreenElement === plotContainerRef.current ? 'calc(100vh - 120px)' : '400px' }}>
          <Plot
            ref={plotRef}
            plotly={plotlyLib}
            data={preparePlotData()}
            layout={layout || {
              uirevision: 'keep-zoom',
              font: { color: isDark ? '#e5e7eb' : undefined },
              // Title and icon are rendered in the header above the plot for consistent alignment
              xaxis: {
                title: `${axis?.x?.label || 'Time'}${axis?.x?.unit ? ' ('+axis.x.unit+')' : ''}`,
                showgrid: true,
                gridcolor: isDark ? '#334155' : '#e2e8f0',
                zeroline: false,
                showticklabels: true,
                tickfont: { size: fullscreenElement === plotContainerRef.current ? 14 : 12 },
                titlefont: { size: fullscreenElement === plotContainerRef.current ? 16 : 14 },
                tickangle: isFullscreen ? 0 : 0,
                automargin: true,
                nticks: fullscreenElement === plotContainerRef.current ? 15 : 10,
                tickformat: fullscreenElement === plotContainerRef.current ? '.2f' : undefined,
                range: axisRangeRef.current.x || undefined,
                autorange: axisRangeRef.current.x ? false : true
              },
              yaxis: {
                title: (() => {
                  const active = (availableTraces || []).find(k => visibleTraces[mapKey(k)]);
                  const meta = active ? axis?.y?.[active] : null;
                  return meta ? `${meta.label}${meta.unit ? ' ('+meta.unit+')' : ''}` : 'Value';
                })(),
                showgrid: true,
                gridcolor: isDark ? '#334155' : '#e2e8f0',
                zeroline: true,
                zerolinecolor: isDark ? '#475569' : '#94a3b8',
                zerolinewidth: 1,
                range: axisRangeRef.current.y || getYAxisRange(),
                autorange: axisRangeRef.current.y ? false : true,
                showticklabels: true,
                tickfont: { size: fullscreenElement === plotContainerRef.current ? 14 : 12 },
                titlefont: { size: fullscreenElement === plotContainerRef.current ? 16 : 14 },
                automargin: true,
                nticks: isFullscreen ? 12 : 8
              },
              legend: {
                x: 0,
                y: 1.1,
                orientation: 'h',
                font: { size: fullscreenElement === plotContainerRef.current ? 14 : 12 }
              },
              margin: fullscreenElement === plotContainerRef.current ? { l: 50, r: 35, t: 40, b: 60 } : { l: 40, r: 20, t: 30, b: 45 },
              hovermode: 'closest',
              plot_bgcolor: isDark ? '#0b1220' : '#f8fafc',
              paper_bgcolor: isDark ? '#111827' : '#ffffff',
              autosize: true,
              dragmode: dragMode,
              ...(mode === 'analysis' && {
                selectdirection: 'h'
              })
            }}
            config={{
              ...plotConfig,
              modeBarButtonsToAdd: mode === 'analysis' ? ['select2d', 'lasso2d'] : []
            }}
            onClick={handlePlotClick}
            onSelected={handleSelection}
            onRelayout={(ed) => {
              const xr0 = ed['xaxis.range[0]'];
              const xr1 = ed['xaxis.range[1]'];
              if (typeof xr0 === 'number' && typeof xr1 === 'number') {
                axisRangeRef.current.x = [xr0, xr1];
              }
              const yr0 = ed['yaxis.range[0]'];
              const yr1 = ed['yaxis.range[1]'];
              if (typeof yr0 === 'number' && typeof yr1 === 'number') {
                axisRangeRef.current.y = [yr0, yr1];
              }
              if (typeof ed.dragmode === 'string') {
                setDragMode(ed.dragmode);
                if (ed.dragmode !== 'select') {
                  setActiveTool(null);
                  setIsNeglectMode(false);
                  setSelectedRegion(null);
                  setMeasurements({});
                }
              }
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        {mode === 'analysis' && (
          <div className="mt-3">
            <AnalysisTools />
          </div>
        )}
        {fullscreenElement === plotContainerRef.current && (
          <div className="text-center text-xs text-slate-500 mt-2">
            {mode === 'live' 
              ? 'Real-time data streaming. Use mouse to interact with the plot.'
              : 'Analysis mode enabled. Use selection tools for measurements. Press ESC to exit.'
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default PlotlyGraph;
