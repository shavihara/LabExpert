import React, { useEffect, useState, useMemo } from 'react';
import { Wifi, Wrench, Search, AlertTriangle, CheckCircle2, Cpu, RefreshCw, ArrowRight } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

const SENSOR_TYPES = ['TOF', 'ULT', 'LUX', 'THR', 'WAV'];

export default function ProgramSensor({ token, isEmbedded = false }) {
  const ws = useWebSocket(token, true);
  const [devices, setDevices] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [sensorType, setSensorType] = useState('TOF');
  const [status, setStatus] = useState('');

  // Helper to identify devices that need repair
  const isRepairable = (type) => {
    if (!type) return true;
    const t = type.toUpperCase();
    return t === 'UNKNOWN' || t.length > 3 || /[^A-Z0-9]/.test(t);
  };

  useEffect(() => {
    const unsub = ws.addMessageHandler((msg) => {
      if (msg.type === 'device_list') {
        setDevices(msg.devices || []);
        setIsScanning(false);
      } else if (msg.type === 'scan_error') {
        setStatus(`Scan error: ${msg.error}`);
        setIsScanning(false);
      } else if (msg.type === 'repair_sensor_result') {
        setStatus(msg.success ? 'Sensor repaired successfully' : `Repair failed: ${msg.message || 'Unknown error'}`);
        // If successful, clear selection to force re-verification
        if (msg.success) {
            setTimeout(() => {
                scan(); // Auto re-scan to show updated state
                setSelectedDevice(null);
            }, 2000);
        }
      }
    });
    return unsub;
  }, [ws]);

  // Filter out devices with missing or "N/A" IP addresses
  const filteredDevices = useMemo(() => {
    return (devices || []).filter(d => {
      if (!d.ip_address) return false;
      const ip = String(d.ip_address).trim().toUpperCase();
      return ip !== 'N/A' && ip !== 'N\\A';
    });
  }, [devices]);

  const scan = () => {
    if (!ws.isConnected) {
      setStatus('WebSocket not connected');
      return;
    }
    setIsScanning(true);
    setDevices([]); // Clear list to show scanning animation
    ws.sendMessage({ action: 'scan_devices' });
  };

  const submitRepair = () => {
    if (!selectedDevice) {
      setStatus('Select a sensor to repair');
      return;
    }
    setStatus('Submitting repair...');
    ws.sendMessage({ action: 'repair_sensor', device_id: selectedDevice.device_id || selectedDevice.id, sensor_type: sensorType });
  };

  const StepCard = ({ number, title, icon: Icon, children, active }) => (
    <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
      active 
        ? 'bg-white dark:bg-gray-800 border-indigo-500/30 shadow-lg shadow-indigo-500/10' 
        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-75 hover:opacity-100'
    }`}>
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm transition-colors ${
            active ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
          }`}>
            {number}
          </div>
          <h3 className={`font-semibold flex items-center gap-2 ${
            active ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
          }`}>
            {Icon && <Icon size={18} />}
            {title}
          </h3>
        </div>
        {children}
      </div>
      {active && <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600" />}
    </div>
  );

  const content = (
    <div className={isEmbedded ? "p-6" : "max-w-6xl mx-auto"}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <Wrench size={24} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sensor Programmer</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 max-w-2xl">
          Diagnose and repair corrupted sensor EEPROMs. Follow the steps below to detect devices, verify their status, and re-program their identity.
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Step 1: Target Type */}
        <StepCard number="1" title="Target Configuration" icon={Cpu} active={true}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Select Sensor Type shown in Your Module
              </label>
              <div className="relative">
                <select
                  value={sensorType}
                  onChange={(e) => setSensorType(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer hover:bg-white dark:hover:bg-gray-800 hover:border-indigo-300"
                >
                  {SENSOR_TYPES.map((t) => (
                    <option key={t} value={t}>{t} Sensor</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <ArrowRight size={16} className="rotate-90" />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800/30">
              The selected type will be flashed to the EEPROM of the target device.
            </p>
          </div>
        </StepCard>

        {/* Step 2: Network Discovery */}
        <StepCard number="2" title="Network Discovery" icon={Search} active={true}>
          <div className="space-y-4">
              {/* Scan Control */}
              <div className="flex flex-wrap items-center justify-between bg-gray-50 dark:bg-gray-900/50 p-2 rounded-xl border border-gray-100 dark:border-gray-800 gap-2">
                  <div className="px-3 flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${isScanning ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`} />
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          {isScanning ? 'Scanning Network...' : `${filteredDevices.length} Devices Found`}
                      </span>
                  </div>
                  <button
                      onClick={scan}
                      disabled={isScanning}
                      className={`px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${
                          isScanning 
                          ? 'bg-white dark:bg-gray-800 text-indigo-600 cursor-wait shadow-sm border border-gray-100 dark:border-gray-700' 
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30'
                      }`}
                  >
                      <Search size={16} className={isScanning ? 'animate-spin' : ''} />
                      {isScanning ? 'Scanning' : 'Scan Network'}
                  </button>
              </div>

              {/* Device List - Professional List View */}
              <div className="min-h-[300px] max-h-[500px] overflow-y-auto pr-2 custom-scrollbar bg-gray-50/50 dark:bg-gray-900/20 rounded-xl border border-gray-100 dark:border-gray-800/50 p-2">
                  {isScanning ? (
                      // Skeleton Loading State
                      <div className="space-y-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                              <div key={i} className="h-16 rounded-lg bg-white dark:bg-gray-800 animate-pulse border border-gray-100 dark:border-gray-700 shadow-sm" />
                          ))}
                      </div>
                  ) : filteredDevices.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center py-12 text-gray-400">
                          <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100 dark:border-gray-700">
                              <Wifi size={28} className="opacity-50" />
                          </div>
                          <p className="font-medium">No devices found</p>
                          <button onClick={scan} className="mt-2 text-indigo-600 hover:underline text-sm font-medium">Refresh List</button>
                      </div>
                  ) : (
                      <div className="space-y-2">
                          {filteredDevices.map((d) => {
                              const canRepair = isRepairable(d.sensor_type);
                              const isSelected = selectedDevice && (selectedDevice.device_id === d.device_id || selectedDevice.id === d.id);
                              const matchesType = String(d.sensor_type || '').toUpperCase() === String(sensorType || '').toUpperCase();
                              const isClickable = matchesType;
                              return (
                                  <div 
                                      key={d.id || d.device_id}
                                      onClick={() => isClickable && setSelectedDevice(d)}
                                      className={`group relative flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${
                                          isSelected
                                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500 shadow-md z-10'
                                              : isClickable 
                                                  ? 'border-amber-200 dark:border-amber-800/50 bg-white dark:bg-gray-800 hover:border-amber-400 dark:hover:border-amber-700 hover:shadow-md cursor-pointer' 
                                                  : 'border-transparent bg-transparent opacity-60 hover:opacity-100 hover:bg-white dark:hover:bg-gray-800/50 cursor-not-allowed'
                                      }`}
                                  >
                                      {/* Left: Info */}
                                      <div className="flex items-center gap-4">
                                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                              canRepair 
                                                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' 
                                                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                          }`}>
                                              {canRepair ? <Wrench size={18} /> : <Wifi size={18} />}
                                          </div>
                                          <div>
                                              <div className="flex items-center gap-2">
                                                  <span className="font-mono font-bold text-gray-900 dark:text-white">
                                                      {d.device_id || d.id}
                                                  </span>
                                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wide border ${
                                                      canRepair 
                                                          ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
                                                          : 'bg-gray-50 text-gray-500 border-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                                                  }`}>
                                                      {d.sensor_type || 'UNK'}
                                                  </span>
                                              </div>
                                              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                  <span className="font-mono">{d.ip_address}</span>
                                              </div>
                                          </div>
                                      </div>

                                      {/* Right: Status & Action */}
                                      <div className="flex items-center gap-3">
                                          <div className="text-right hidden sm:block">
                                              <div className={`text-xs font-medium ${canRepair ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                  {canRepair ? 'Needs Repair' : 'Healthy'}
                                              </div>
                                          </div>
                                          
                                          {canRepair && (
                                              <div className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${
                                                  isSelected 
                                                      ? 'bg-indigo-600 border-indigo-600 text-white' 
                                                      : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 group-hover:border-indigo-500 group-hover:text-indigo-500'
                                              }`}>
                                                  <CheckCircle2 size={16} className={isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} />
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  )}
              </div>
          </div>
        </StepCard>

        {/* Step 3: Repair Action */}
        <StepCard number="3" title="Execute Repair" icon={Wrench} active={!!selectedDevice}>
           <div className="space-y-4">
              <div className={`p-4 rounded-xl border-2 border-dashed text-center transition-all ${
                  selectedDevice 
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' 
                  : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
              }`}>
                  {selectedDevice ? (
                      <div className="text-sm">
                          <span className="block text-gray-500 dark:text-gray-400 mb-1 text-xs uppercase tracking-wide">Target Device</span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xl">
                              {selectedDevice.device_id || selectedDevice.id}
                          </span>
                          <div className="mt-1 text-xs text-gray-400">
                            {selectedDevice.ip_address}
                          </div>
                      </div>
                  ) : (
                      <div className="py-2">
                          <span className="block text-gray-400 font-medium">No device selected</span>
                          <span className="text-xs text-gray-400/70">Select a repairable device from the list</span>
                      </div>
                  )}
              </div>

              <button
                  onClick={submitRepair}
                  disabled={!selectedDevice}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] ${
                  selectedDevice 
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-indigo-500/30' 
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed shadow-none border border-gray-200 dark:border-gray-700'
                  }`}
              >
                  <RefreshCw size={18} className={status.includes('Submitting') ? 'animate-spin' : ''} />
                  {status.includes('Submitting') ? 'Programming...' : 'Flash EEPROM'}
              </button>

              {status && (
                  <div className={`text-xs p-3 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-2 ${
                  status.includes('success') 
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-800'
                  }`}>
                  {status.includes('success') ? <CheckCircle2 size={16} className="shrink-0 mt-0.5"/> : <AlertTriangle size={16} className="shrink-0 mt-0.5"/>}
                  <span className="font-medium">{status}</span>
                  </div>
              )}
           </div>
        </StepCard>
      </div>
    </div>
  );

  if (isEmbedded) return content;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-800 p-6">
      {content}
    </div>
  );
}
