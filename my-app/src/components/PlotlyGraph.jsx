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
  graphType,
  isRunning,
  isPaused,
  onStart,
  onPause,
  onStop,
  onReset
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
  const [visibleTraces, setVisibleTraces] = useState({
    's-t': true,
    'v-t': true,
    'a-t': true,
    'ke': false,
    'pe': false,
    'te': false
  });
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [measurements, setMeasurements] = useState({});
  const [plotConfig, setPlotConfig] = useState({
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    scrollZoom: true,
    showTips: true
  });

  const plotRef = useRef(null);
  const analysisDataRef = useRef([]);

  // Prepare data for Plotly
  const preparePlotData = useCallback(() => {
    const data = mode === 'analysis' ? analysisDataRef.current : chartData;
    
    const traces = [];
    
    if (visibleTraces['s-t'] && data.some(d => d.distance != null)) {
      traces.push({
        x: data.map(d => d.time || d.timeDisplay),
        y: data.map(d => d.distance || 0),
        type: 'scatter',
        mode: 'lines',
        name: 'Displacement (cm)',
        line: { color: '#6366f1', width: 2.5 },
        visible: visibleTraces['s-t'] ? true : 'legendonly'
      });
    }
    
    if (visibleTraces['v-t'] && data.some(d => d.velocity != null)) {
      traces.push({
        x: data.map(d => d.time || d.timeDisplay),
        y: data.map(d => d.velocity || 0),
        type: 'scatter',
        mode: 'lines',
        name: 'Velocity (cm/s)',
        line: { color: '#10b981', width: 2.5 },
        visible: visibleTraces['v-t'] ? true : 'legendonly'
      });
    }
    
    if (visibleTraces['a-t'] && data.some(d => d.acceleration != null)) {
      traces.push({
        x: data.map(d => d.time || d.timeDisplay),
        y: data.map(d => d.acceleration || 0),
        type: 'scatter',
        mode: 'lines',
        name: 'Acceleration (cm/s²)',
        line: { color: '#ef4444', width: 2.5 },
        visible: visibleTraces['a-t'] ? true : 'legendonly'
      });
    }

    // Energy traces (only in analysis mode)
    if (mode === 'analysis') {
      if (visibleTraces['ke'] && data.some(d => d.kineticEnergy != null)) {
        traces.push({
          x: data.map(d => d.time || d.timeDisplay),
          y: data.map(d => d.kineticEnergy || 0),
          type: 'scatter',
          mode: 'lines',
          name: 'Kinetic Energy (J)',
          line: { color: '#f59e0b', width: 2, dash: 'dot' },
          visible: visibleTraces['ke'] ? true : 'legendonly'
        });
      }
      
      if (visibleTraces['pe'] && data.some(d => d.potentialEnergy != null)) {
        traces.push({
          x: data.map(d => d.time || d.timeDisplay),
          y: data.map(d => d.potentialEnergy || 0),
          type: 'scatter',
          mode: 'lines',
          name: 'Potential Energy (J)',
          line: { color: '#8b5cf6', width: 2, dash: 'dot' },
          visible: visibleTraces['pe'] ? true : 'legendonly'
        });
      }
      
      if (visibleTraces['te'] && data.some(d => d.totalEnergy != null)) {
        traces.push({
          x: data.map(d => d.time || d.timeDisplay),
          y: data.map(d => d.totalEnergy || 0),
          type: 'scatter',
          mode: 'lines',
          name: 'Total Energy (J)',
          line: { color: '#06b6d4', width: 3 },
          visible: visibleTraces['te'] ? true : 'legendonly'
        });
      }
    }

    return traces;
  }, [chartData, mode, visibleTraces]);

  // Calculate energy values for analysis
  const calculateEnergyValues = useCallback((data) => {
    return data.map(point => {
      const mass = 0.1; // Default mass in kg (adjust based on experiment)
      const g = 9.81; // Gravity constant
      
      const ke = 0.5 * mass * Math.pow((point.velocity || 0) / 100, 2); // Convert cm/s to m/s
      const pe = mass * g * (point.distance || 0) / 100; // Convert cm to m
      const te = ke + pe;
      
      return {
        ...point,
        kineticEnergy: ke,
        potentialEnergy: pe,
        totalEnergy: te
      };
    });
  }, []);

  // Handle mode switching
  useEffect(() => {
    if (mode === 'analysis') {
      // Capture current data for analysis
      analysisDataRef.current = calculateEnergyValues(chartData);
    }
  }, [mode, chartData, calculateEnergyValues]);

  // Handle plot events
  const handlePlotClick = (event) => {
    if (mode === 'analysis' && event && event.points) {
      const point = event.points[0];
      // Implement measurement tools here
    }
  };

  const handleSelection = (event) => {
    if (mode === 'analysis' && event && event.range) {
      setSelectedRegion(event.range);
      calculateRegionMeasurements(event.range);
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
        dataPoints: filteredData.length
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
    const csvContent = [
      'Time,Distance,Velocity,Acceleration,Kinetic Energy,Potential Energy,Total Energy',
      ...data.map(d => 
        `${d.time || d.timeDisplay},${d.distance || 0},${d.velocity || 0},${d.acceleration || 0},${d.kineticEnergy || 0},${d.potentialEnergy || 0},${d.totalEnergy || 0}`
      )
    ].join('\n');
    
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
        onClick={() => setMode('live')}
        className={`px-3 py-2 font-semibold transition-all rounded-md text-xs ${
          mode === 'live'
            ? 'bg-white text-purple-700 shadow-md'
            : 'text-slate-600 hover:text-slate-800'
        }`}
      >
        Live Mode
      </button>
      <button
        onClick={() => setMode('analysis')}
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

  const AnalysisTools = () => (
    <div className="flex flex-wrap gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
      <div className="flex items-center gap-1 text-xs font-semibold text-blue-700">
        <FiBarChart2 size={14} />
        Measurement Tools:
      </div>
      
      <button
        className="px-2 py-1 bg-white border border-blue-300 rounded text-xs flex items-center gap-1 hover:bg-blue-50"
        title="Select region to measure differences"
      >
        <FiTarget size={12} />
        Region Select
      </button>
      
      <button
        className="px-2 py-1 bg-white border border-blue-300 rounded text-xs flex items-center gap-1 hover:bg-blue-50"
        title="Calculate slope of selected region"
      >
        <FiTrendingUp size={12} />
        Slope Tool
      </button>
      
      <button
        className="px-2 py-1 bg-white border border-blue-300 rounded text-xs flex items-center gap-1 hover:bg-blue-50"
        title="Pan and move the plot"
      >
        <FiMove size={12} />
        Pan Tool
      </button>
    </div>
  );

  const TraceVisibilityControls = () => (
    <div className="flex flex-wrap gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
      <div className="flex items-center gap-1 text-xs font-semibold text-green-700">
        <FiEye size={14} />
        Show Traces:
      </div>
      
      {['s-t', 'v-t', 'a-t'].map(trace => (
        <label key={trace} className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={visibleTraces[trace]}
            onChange={(e) => setVisibleTraces(prev => ({ ...prev, [trace]: e.target.checked }))}
            className="rounded border-slate-300"
          />
          {{
            's-t': 'Displacement',
            'v-t': 'Velocity', 
            'a-t': 'Acceleration'
          }[trace]}
        </label>
      ))}
      
      {mode === 'analysis' && (
        <>
          <div className="border-l border-green-300 mx-2 h-4"></div>
          {['ke', 'pe', 'te'].map(trace => (
            <label key={trace} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={visibleTraces[trace]}
                onChange={(e) => setVisibleTraces(prev => ({ ...prev, [trace]: e.target.checked }))}
                className="rounded border-slate-300"
              />
              {{
                'ke': 'Kinetic Energy',
                'pe': 'Potential Energy',
                'te': 'Total Energy'
              }[trace]}
            </label>
          ))}
        </>
      )}
    </div>
  );

  const MeasurementDisplay = () => (
    selectedRegion && Object.keys(measurements).length > 0 && (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <h4 className="font-semibold text-yellow-800 text-sm mb-2 flex items-center gap-2">
          <FiDollarSign size={14} />
          Region Measurements
        </h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>ΔTime: <span className="font-semibold">{measurements.deltaTime?.toFixed(3)}s</span></div>
          <div>ΔDistance: <span className="font-semibold">{measurements.deltaDistance?.toFixed(3)}cm</span></div>
          <div>ΔVelocity: <span className="font-semibold">{measurements.deltaVelocity?.toFixed(3)}cm/s</span></div>
          <div>Data Points: <span className="font-semibold">{measurements.dataPoints}</span></div>
        </div>
      </div>
    )
  );

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
      <TraceVisibilityControls />

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
                title: 'Time (s)',
                showgrid: true,
                gridcolor: '#e2e8f0',
                zeroline: false
              },
              yaxis: {
                title: 'Value',
                showgrid: true,
                gridcolor: '#e2e8f0',
                zeroline: false
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
                dragmode: 'select',
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