import React, { useState, useEffect, useRef, useCallback } from 'react';
import Plot from 'react-plotly.js';

// Dynamically import the Plotly library and pass it to react-plotly.js via the 'plotly' prop.
// This avoids the factory class component path and bypasses any dynamic require inside the library.
import {
  FiPlay, FiPause, FiStopCircle, FiRefreshCw, FiMaximize, FiMinimize,
  FiZoomIn, FiZoomOut, FiTrendingUp, FiBarChart2, FiDownload,
  FiSave, FiEye, FiEyeOff, FiDollarSign, FiTarget, FiMove
} from 'react-icons/fi';

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
  onAnalysisData
}) => {
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
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  const plotRef = useRef(null);
  const analysisDataRef = useRef([]);

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
    const data = mode === 'analysis' ? analysisDataRef.current : chartData;
    // Filter out neglected points entirely from graph rendering
    const effectiveData = (neglectedData && neglectedData.size > 0)
      ? data.filter((_, i) => !neglectedData.has(i))
      : data;
    
    const traces = [];
    
    if (visibleTraces['s-t'] && effectiveData.some(d => d.distance != null)) {
      traces.push({
        x: effectiveData.map(d => d.time || d.timeDisplay),
        y: effectiveData.map(d => d.distance || 0),
        type: 'scatter',
        mode: 'lines',
        name: `${axis?.y?.distance?.label || 'Displacement'}${axis?.y?.distance?.unit ? ' ('+axis.y.distance.unit+')' : ''}`,
        line: { color: '#6366f1', width: 2.5 },
        visible: visibleTraces['s-t'] ? true : 'legendonly'
      });
    }
    
    // Intensity trace (for light intensity experiments)
    if (visibleTraces['i-t'] && effectiveData.some(d => d.intensity != null)) {
      traces.push({
        x: effectiveData.map(d => d.time || d.timeDisplay),
        y: effectiveData.map(d => d.intensity || 0),
        type: 'scatter',
        mode: 'lines',
        name: `${axis?.y?.intensity?.label || 'Intensity'}${axis?.y?.intensity?.unit ? ' ('+axis.y.intensity.unit+')' : ''}`,
        line: { color: '#f59e0b', width: 2.5 },
        visible: visibleTraces['i-t'] ? true : 'legendonly'
      });
    }
    
    if (visibleTraces['v-t'] && effectiveData.some(d => d.velocity != null)) {
      traces.push({
        x: effectiveData.map(d => d.time || d.timeDisplay),
        y: effectiveData.map(d => d.velocity || 0),
        type: 'scatter',
        mode: 'lines',
        name: `${axis?.y?.velocity?.label || 'Velocity'}${axis?.y?.velocity?.unit ? ' ('+axis.y.velocity.unit+')' : ''}`,
        line: { color: '#10b981', width: 2.5 },
        visible: visibleTraces['v-t'] ? true : 'legendonly'
      });
    }
    
    if (visibleTraces['a-t'] && effectiveData.some(d => d.acceleration != null)) {
      traces.push({
        x: effectiveData.map(d => d.time || d.timeDisplay),
        y: effectiveData.map(d => d.acceleration || 0),
        type: 'scatter',
        mode: 'lines',
        name: `${axis?.y?.acceleration?.label || 'Acceleration'}${axis?.y?.acceleration?.unit ? ' ('+axis.y.acceleration.unit+')' : ''}`,
        line: { color: '#ef4444', width: 2.5 },
        visible: visibleTraces['a-t'] ? true : 'legendonly'
      });
    }

    // Energy traces (only in analysis mode)
    if (mode === 'analysis') {
      if (visibleTraces['ke'] && effectiveData.some(d => d.kineticEnergy != null)) {
        traces.push({
          x: effectiveData.map(d => d.time || d.timeDisplay),
          y: effectiveData.map(d => d.kineticEnergy || 0),
          type: 'scatter',
          mode: 'lines',
          name: 'Kinetic Energy (J)',
          line: { color: '#f59e0b', width: 2, dash: 'dot' },
          visible: visibleTraces['ke'] ? true : 'legendonly'
        });
      }
      
      if (visibleTraces['pe'] && effectiveData.some(d => d.potentialEnergy != null)) {
        traces.push({
          x: effectiveData.map(d => d.time || d.timeDisplay),
          y: effectiveData.map(d => d.potentialEnergy || 0),
          type: 'scatter',
          mode: 'lines',
          name: 'Potential Energy (J)',
          line: { color: '#8b5cf6', width: 2, dash: 'dot' },
          visible: visibleTraces['pe'] ? true : 'legendonly'
        });
      }
      
      if (visibleTraces['te'] && effectiveData.some(d => d.totalEnergy != null)) {
        traces.push({
          x: effectiveData.map(d => d.time || d.timeDisplay),
          y: effectiveData.map(d => d.totalEnergy || 0),
          type: 'scatter',
          mode: 'lines',
          name: 'Total Energy (J)',
          line: { color: '#06b6d4', width: 3 },
          visible: visibleTraces['te'] ? true : 'legendonly'
        });
      }
    }

    return traces;
  }, [chartData, mode, visibleTraces, neglectedData]);

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
    setIsNeglectMode(prev => !prev);
  };

  const handleClearNeglectSelections = () => {
    // Clear all neglected data
    if (onNeglectedDataChange) {
      onNeglectedDataChange(new Set());
    }
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
      const first = filteredData[0];
      const last = filteredData[filteredData.length - 1];
      
      // Calculate slopes for different measurements
      const timeDelta = last.time - first.time;
      const distanceSlope = timeDelta !== 0 ? (last.distance - first.distance) / timeDelta : 0;
      const velocitySlope = timeDelta !== 0 ? (last.velocity - first.velocity) / timeDelta : 0;
      const accelerationSlope = timeDelta !== 0 ? (last.acceleration - first.acceleration) / timeDelta : 0;
      
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
    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
      <button
        onClick={() => { setMode('live'); if (onModeChange) onModeChange('live'); }}
        className={`px-3 py-2 font-semibold transition-all rounded-md text-xs ${
          mode === 'live'
            ? 'bg-white text-purple-700 shadow-md'
            : 'text-slate-600 hover:text-slate-800'
        }`}
      >
        Live Mode
      </button>
      <button
        onClick={() => { setMode('analysis'); if (onModeChange) onModeChange('analysis'); }}
        className={`px-3 py-2 font-semibold transition-all rounded-md text-xs ${
          mode === 'analysis'
            ? 'bg-white text-purple-700 shadow-md'
            : 'text-slate-600 hover:text-slate-800'
        }`}
      >
        Analysis Mode
      </button>
    </div>
  );

  const AnalysisTools = () => {
    const handleToolClick = (tool) => {
      setActiveTool(tool);
      
      // Update plot configuration based on selected tool
      switch (tool) {
        case 'region':
          setPlotConfig(prev => ({
            ...prev,
            dragmode: 'select',
            modeBarButtonsToRemove: ['lasso2d']
          }));
          break;
        case 'slope':
          setPlotConfig(prev => ({
            ...prev,
            dragmode: 'select',
            modeBarButtonsToRemove: ['lasso2d']
          }));
          break;
        case 'pan':
          setPlotConfig(prev => ({
            ...prev,
            dragmode: 'pan',
            modeBarButtonsToRemove: ['select2d', 'lasso2d']
          }));
          break;
        default:
          setPlotConfig(prev => ({
            ...prev,
            dragmode: 'select',
            modeBarButtonsToRemove: ['lasso2d']
          }));
      }
    };
    
    return (
      <div className="flex flex-wrap gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-1 text-xs font-semibold text-blue-700">
          <FiBarChart2 size={14} />
          Measurement Tools:
        </div>
        
        <button
          onClick={() => handleToolClick('region')}
          className={`px-2 py-1 border rounded text-xs flex items-center gap-1 hover:bg-blue-50 ${
            activeTool === 'region'
              ? 'bg-blue-100 border-blue-500 text-blue-700'
              : 'bg-white border-blue-300'
          }`}
          title="Select region to measure differences"
        >
          <FiTarget size={12} />
          Region Select
        </button>
        
        <button
          onClick={() => handleToolClick('slope')}
          className={`px-2 py-1 border rounded text-xs flex items-center gap-1 hover:bg-blue-50 ${
            activeTool === 'slope'
              ? 'bg-blue-100 border-blue-500 text-blue-700'
              : 'bg-white border-blue-300'
          }`}
          title="Calculate slope of selected region"
        >
          <FiTrendingUp size={12} />
          Slope Tool
        </button>
        
        <button
          onClick={() => handleToolClick('pan')}
          className={`px-2 py-1 border rounded text-xs flex items-center gap-1 hover:bg-blue-50 ${
            activeTool === 'pan'
              ? 'bg-blue-100 border-blue-500 text-blue-700'
              : 'bg-white border-blue-300'
          }`}
          title="Pan and move the plot"
        >
          <FiMove size={12} />
          Pan Tool
        </button>
        
        <div className="flex items-center gap-1 ml-auto">
          {neglectedData && neglectedData.size > 0 && (
            <span className="text-xs text-orange-600 font-medium px-2 py-1 bg-orange-50 rounded border border-orange-200">
              {neglectedData.size} neglected
            </span>
          )}
          
          <button
            onClick={handleNeglectRangeClick}
            className={`px-2 py-1 bg-white border rounded text-xs flex items-center gap-1 hover:bg-blue-50 ${
              isNeglectMode 
                ? 'border-orange-500 bg-orange-50 text-orange-700' 
                : 'border-blue-300'
            }`}
            title="Select range to neglect data points (stay active for multiple selections)"
          >
            <FiEyeOff size={12} />
            Neglect Range
            {isNeglectMode && <span className="ml-1 text-[10px]">(ACTIVE)</span>}
          </button>
          
          {neglectedData && neglectedData.size > 0 && (
            <button
              onClick={handleClearNeglectSelections}
              className="px-2 py-1 bg-red-50 border border-red-300 rounded text-xs flex items-center gap-1 hover:bg-red-100 text-red-700"
              title="Clear all neglected selections"
            >
              <FiRefreshCw size={12} />
              Clear
            </button>
          )}
        </div>
      </div>
    );
  };

  const TraceVisibilityControls = () => {
    const getTraceLabel = (trace) => ({
      'i-t': axis?.y?.intensity?.label || 'Intensity',
      's-t': axis?.y?.distance?.label || 'Displacement',
      'v-t': axis?.y?.velocity?.label || 'Velocity', 
      'a-t': axis?.y?.acceleration?.label || 'Acceleration',
      'ke': 'Kinetic Energy',
      'pe': 'Potential Energy',
      'te': 'Total Energy'
    }[trace]);

    const getTraceColor = (trace) => ({
      'i-t': 'bg-yellow-500 hover:bg-yellow-600',
      's-t': 'bg-blue-500 hover:bg-blue-600',
      'v-t': 'bg-green-500 hover:bg-green-600',
      'a-t': 'bg-red-500 hover:bg-red-600',
      'ke': 'bg-orange-500 hover:bg-orange-600',
      'pe': 'bg-purple-500 hover:bg-purple-600',
      'te': 'bg-cyan-500 hover:bg-cyan-600'
    }[trace]);

    const TraceButton = ({ trace, label }) => (
      <button
        onClick={() => setVisibleTraces(prev => ({ ...prev, [trace]: !prev[trace] }))}
        className={`px-3 py-2 rounded-lg font-medium text-xs transition-all duration-200 shadow-sm border-2 ${
          visibleTraces[trace]
            ? `${getTraceColor(trace)} text-white border-transparent shadow-md transform scale-105`
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            visibleTraces[trace] ? 'bg-white' : 'bg-slate-300'
          }`}></div>
          <span>{label}</span>
        </div>
      </button>
    );

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FiEye size={16} className="text-slate-600" />
          <span className="text-sm font-semibold text-slate-700">Show Traces</span>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {(availableTraces || []).map(k => mapKey(k)).map(trace => (
            <TraceButton key={trace} trace={trace} label={getTraceLabel(trace)} />
          ))}
        </div>
        
        {mode === 'analysis' && (
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <FiBarChart2 size={16} className="text-slate-600" />
              <span className="text-sm font-semibold text-slate-700">Energy Analysis</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {['ke', 'pe', 'te'].map(trace => (
                <TraceButton key={trace} trace={trace} label={getTraceLabel(trace)} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const MeasurementDisplay = () => {
    if (!selectedRegion || Object.keys(measurements).length === 0) return null;
    
    const isSlopeTool = measurements.toolType === 'slope';
    
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <h4 className="font-semibold text-yellow-800 text-sm mb-2 flex items-center gap-2">
          <FiDollarSign size={14} />
          {isSlopeTool ? 'Slope Measurements' : 'Region Measurements'}
        </h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
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
      {/* Mode Toggle */}
      <ModeToggle />

      {/* Analysis Tools */}
      {mode === 'analysis' && <AnalysisTools />}

      {/* Trace Visibility Controls */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl shadow-md border border-slate-200 p-4">
        <TraceVisibilityControls />
      </div>

      {/* Measurement Display */}
      {mode === 'analysis' && <MeasurementDisplay />}

      {/* Plot Container */}
      <div className={`bg-white rounded-xl shadow-lg border border-slate-200 p-4 ${
        isFullscreen ? 'fixed inset-4 z-50' : ''
      }`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
            <FiBarChart2 className="text-purple-600" />
            {mode === 'live' ? 'Real-time Plot' : 'Analysis Plot'}
          </h3>
          
          <div className="flex gap-2">
            {/* Export Buttons */}
            <button
              onClick={exportToImage}
              className="px-2 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-all text-xs flex items-center gap-1"
              title="Export to Image"
            >
              <FiDownload size={14} />
              <span className="hidden sm:inline">Image</span>
            </button>
            
            <button
              onClick={exportToCSV}
              className="px-2 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-all text-xs flex items-center gap-1"
              title="Export to CSV"
            >
              <FiSave size={14} />
              <span className="hidden sm:inline">CSV</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="px-2 py-1.5 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-all text-xs flex items-center gap-1"
            >
              {isFullscreen ? <FiMinimize size={14} /> : <FiMaximize size={14} />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Full'}</span>
            </button>
          </div>
        </div>

        {/* Plotly Graph */}
        <div style={{ height: isFullscreen ? 'calc(100vh - 150px)' : '400px' }}>
          <Plot
            ref={plotRef}
            plotly={plotlyLib}
            data={preparePlotData()}
            layout={{
              title: {
                text: `${mode === 'live' ? 'Real-time' : 'Analysis'} Physics Experiment`,
                font: { size: 16 }
              },
              xaxis: {
                title: `${axis?.x?.label || 'Time'}${axis?.x?.unit ? ' ('+axis.x.unit+')' : ''}`,
                showgrid: true,
                gridcolor: '#e2e8f0',
                zeroline: false
              },
              yaxis: {
                title: (() => {
                  const active = (availableTraces || []).find(k => visibleTraces[mapKey(k)]);
                  const meta = active ? axis?.y?.[active] : null;
                  return meta ? `${meta.label}${meta.unit ? ' ('+meta.unit+')' : ''}` : 'Value';
                })(),
                showgrid: true,
                gridcolor: '#e2e8f0',
                zeroline: true,
                zerolinecolor: '#94a3b8',
                zerolinewidth: 1,
                range: getYAxisRange() // Dynamic y-axis bounds based on data type and configuration
              },
              legend: {
                x: 0,
                y: 1.1,
                orientation: 'h'
              },
              margin: { l: 60, r: 30, t: 60, b: 60 },
              hovermode: 'closest',
              plot_bgcolor: '#f8fafc',
              paper_bgcolor: '#ffffff',
              ...(mode === 'analysis' && {
                dragmode: activeTool === 'pan' ? 'pan' : 'select',
                selectdirection: 'h'
              })
            }}
            config={{
              ...plotConfig,
              modeBarButtonsToAdd: mode === 'analysis' ? ['select2d', 'lasso2d'] : []
            }}
            onClick={handlePlotClick}
            onSelected={handleSelection}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        {isFullscreen && (
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
