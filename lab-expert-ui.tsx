import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, Save, FolderOpen, Settings, Wifi, WifiOff, Download, Upload, BarChart3, LineChart, Trash2, Plus, Minus, RotateCcw, ZoomIn, ZoomOut, Grid, Home } from 'lucide-react';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const LabExpertUI = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [dataPoints, setDataPoints] = useState([]);
  const [selectedSensor, setSelectedSensor] = useState('temperature');
  const [sampleRate, setSampleRate] = useState(10);
  const [duration, setDuration] = useState(60);
  const [currentReading, setCurrentReading] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  // Simulate real-time data collection
  useEffect(() => {
    let interval;
    if (isRecording && isConnected) {
      interval = setInterval(() => {
        const newPoint = {
          x: dataPoints.length,
          y: 20 + Math.sin(dataPoints.length * 0.1) * 10 + Math.random() * 5,
          time: new Date().toLocaleTimeString()
        };
        setDataPoints(prev => [...prev, newPoint]);
        setCurrentReading(newPoint);
      }, 1000 / sampleRate * 100);
    }
    return () => clearInterval(interval);
  }, [isRecording, isConnected, dataPoints.length, sampleRate]);

  const handleStartStop = () => {
    if (!isConnected) return;
    setIsRecording(!isRecording);
  };

  const handleClear = () => {
    setDataPoints([]);
    setCurrentReading({ x: 0, y: 0 });
  };

  const sensors = [
    { id: 'temperature', name: 'Temperature (°C)', color: '#ef4444' },
    { id: 'pressure', name: 'Pressure (kPa)', color: '#3b82f6' },
    { id: 'ph', name: 'pH Level', color: '#10b981' },
    { id: 'voltage', name: 'Voltage (V)', color: '#f59e0b' },
    { id: 'current', name: 'Current (A)', color: '#8b5cf6' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Lab Expert</h1>
            <div className="flex items-center space-x-2">
              {isConnected ? (
                <Wifi className="w-5 h-5 text-green-500" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-500" />
              )}
              <span className={`text-sm font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                {isConnected ? 'LabPro Connected' : 'LabPro Disconnected'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsConnected(!isConnected)}
              className={`px-4 py-2 rounded-lg font-medium ${
                isConnected 
                  ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {isConnected ? 'Disconnect' : 'Connect'}
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-100">
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Data Controls */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Data Collection</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sensor Type
                </label>
                <select 
                  value={selectedSensor}
                  onChange={(e) => setSelectedSensor(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {sensors.map(sensor => (
                    <option key={sensor.id} value={sensor.id}>
                      {sensor.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sample Rate (Hz)
                  </label>
                  <input
                    type="number"
                    value={sampleRate}
                    onChange={(e) => setSampleRate(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (s)
                  </label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="1"
                  />
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={handleStartStop}
                  disabled={!isConnected}
                  className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium ${
                    isRecording
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300 disabled:text-gray-500'
                  }`}
                >
                  {isRecording ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isRecording ? 'Stop' : 'Start'}</span>
                </button>
                <button
                  onClick={handleClear}
                  className="px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Current Reading */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Current Reading</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {currentReading.y.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">
                  {sensors.find(s => s.id === selectedSensor)?.name}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Time: {currentReading.time || '--:--:--'}
                </div>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="flex-1 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Data Points</h3>
              <span className="text-sm text-gray-500">{dataPoints.length} points</span>
            </div>
            
            <div className="bg-gray-50 rounded-lg h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-600">Point</th>
                    <th className="px-3 py-2 text-left text-gray-600">Value</th>
                    <th className="px-3 py-2 text-left text-gray-600">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {dataPoints.slice(-50).map((point, index) => (
                    <tr key={index} className="border-b border-gray-200">
                      <td className="px-3 py-1 text-gray-900">{point.x + 1}</td>
                      <td className="px-3 py-1 text-gray-900">{point.y.toFixed(2)}</td>
                      <td className="px-3 py-1 text-gray-500 text-xs">{point.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* File Operations */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex space-x-2">
              <button className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm">
                <Save className="w-4 h-4" />
                <span>Save</span>
              </button>
              <button className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm">
                <FolderOpen className="w-4 h-4" />
                <span>Load</span>
              </button>
              <button className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {/* Chart Controls */}
          <div className="bg-white border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h2 className="font-semibold text-gray-900">
                  {sensors.find(s => s.id === selectedSensor)?.name} vs Time
                </h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`p-2 rounded-lg ${showGrid ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.25))}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(1)}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600"
                  >
                    <Home className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="text-sm text-gray-600">
                  Recording: <span className={isRecording ? 'text-red-600' : 'text-gray-400'}>
                    {isRecording ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Chart Area */}
          <div className="flex-1 p-4 bg-white">
            <div className="h-full border border-gray-200 rounded-lg bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={dataPoints} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
                  <XAxis 
                    dataKey="x" 
                    stroke="#6b7280"
                    label={{ value: 'Time (s)', position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    label={{ 
                      value: sensors.find(s => s.id === selectedSensor)?.name || 'Value', 
                      angle: -90, 
                      position: 'insideLeft' 
                    }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="y" 
                    stroke={sensors.find(s => s.id === selectedSensor)?.color || '#3b82f6'}
                    strokeWidth={2}
                    dot={{ fill: sensors.find(s => s.id === selectedSensor)?.color, strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, stroke: sensors.find(s => s.id === selectedSensor)?.color, strokeWidth: 2 }}
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </main>
      </div>

      {/* Status Bar */}
      <footer className="bg-white border-t border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center space-x-4">
            <span>Status: {isConnected ? 'Connected' : 'Disconnected'}</span>
            <span>Points: {dataPoints.length}</span>
            <span>Rate: {sampleRate} Hz</span>
          </div>
          <div className="flex items-center space-x-4">
            <span>Zoom: {(zoomLevel * 100).toFixed(0)}%</span>
            <span>Lab Expert v2.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LabExpertUI;