import React, { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { 
  Bluetooth, 
  Wifi, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Cpu, 
  Loader2,
  Signal,
  Lock,
  Search
} from 'lucide-react';

export default function SensorProvisioning({ token }) {
  const ws = useWebSocket(token, true);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [ssid, setSsid] = useState('');
  const [passw, setPassw] = useState('');
  const [status, setStatus] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);

  useEffect(() => {
    const unsub = ws.addMessageHandler((msg) => {
      if (msg.type === 'ble_scan_result') {
        setDevices(msg.devices || []);
        setEnabled(!!msg.enabled);
        setIsScanning(false);
      } else if (msg.type === 'ble_selected') {
        setStatus('device_selected');
      } else if (msg.type === 'ble_status') {
        setStatus(msg.status);
        if (msg.status === 'provisioned' || msg.status.includes('fail')) {
            setIsProvisioning(false);
        }
      } else if (msg.type === 'ble_result') {
        setStatus(msg.message);
        setIsProvisioning(false);
      }
    });
    return unsub;
  }, [ws]);

  const scan = () => {
    setIsScanning(true);
    setEnabled(true);
    setDevices([]);
    setSelected(null);
    setStatus('');
    ws.sendMessage({ action: 'ble_scan' });
  };

  const select = (address) => {
    setSelected(address);
    setStatus('connecting...');
    ws.sendMessage({ action: 'ble_select', address });
  };

  const provision = () => {
    if (!ssid || !passw || !selected) return;
    setIsProvisioning(true);
    ws.sendMessage({ action: 'ble_provision', ssid, pass: passw });
  };

  return (
    <div className="w-full h-full">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 h-full flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Bluetooth size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Connect New Sensor</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Provision LabExpert Sensor Modules via Bluetooth</p>
            </div>
          </div>
          {status && (
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              status.includes('success') || status === 'provisioned' || status === 'WIFI_OK' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
              status.includes('fail') || status.includes('error') ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
              'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            }`}>
              {status === 'WIFI_FAIL' ? "Press Reset Button & check Connection" : 
               status === 'WIFI_OK' ? "WiFi Connected" : 
               status}
            </div>
          )}
        </div>

        <div className="p-6 space-y-8 overflow-y-auto flex-1">
          {/* Bluetooth Status Alert */}
          {!enabled && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
              <AlertCircle className="flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-medium">Bluetooth is disabled</h3>
                <p className="text-sm mt-1 opacity-90">Please enable Bluetooth in your system settings to scan for devices.</p>
              </div>
            </div>
          )}

          {/* Pre-scan Instruction */}
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md text-blue-700 dark:text-blue-300">
            <AlertCircle className="flex-shrink-0" size={16} />
            <p className="text-xs font-medium">
              Press Bluetooth Discover Button in Your sensor Module for 3 seconds before Scan
            </p>
          </div>

          {/* Step 1: Scan for Devices */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                1. Select Device
              </h3>
              <button
                onClick={scan}
                disabled={isScanning}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isScanning 
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow'
                }`}
              >
                {isScanning ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    Scan for Devices
                  </>
                )}
              </button>
            </div>

            {devices.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl relative overflow-hidden bg-gray-50/50 dark:bg-gray-800/50 transition-all duration-500">
                <div className="relative inline-flex items-center justify-center mb-6">
                   {isScanning && (
                      <>
                        <span className="absolute w-full h-full rounded-full bg-indigo-500/20 animate-ping duration-1000"></span>
                        <span className="absolute w-[160%] h-[160%] rounded-full border border-indigo-500/20 animate-[pulse_2s_infinite]"></span>
                        <span className="absolute w-[220%] h-[220%] rounded-full border border-indigo-500/10 animate-[pulse_3s_infinite]"></span>
                      </>
                   )}
                   <div className={`relative p-5 rounded-full transition-all duration-500 ${isScanning ? 'bg-white dark:bg-gray-800 shadow-lg text-indigo-600 dark:text-indigo-400 scale-110 ring-4 ring-indigo-50 dark:ring-indigo-900/20' : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600'}`}>
                      <Bluetooth size={40} strokeWidth={1.5} className={isScanning ? 'animate-pulse' : ''} />
                   </div>
                </div>
                
                <div className="relative z-10 space-y-1.5">
                  <p className={`font-medium transition-colors duration-300 ${isScanning ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}>
                    {isScanning ? "Scanning for nearby devices..." : "No devices found"}
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    {isScanning ? "Looking for LabExpert Sensor Modules" : "Click scan to start searching"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                {devices.map((d) => (
                  <button
                    key={d.address}
                    onClick={() => select(d.address)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all duration-200 group ${
                      selected === d.address
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500'
                        : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        selected === d.address 
                          ? 'bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300' 
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400'
                      }`}>
                        <Cpu size={20} />
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-gray-900 dark:text-white">{d.name || 'Unknown Device'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{d.address}</div>
                      </div>
                    </div>
                    {selected === d.address && (
                      <div className="text-indigo-600 dark:text-indigo-400">
                        <Check size={20} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: WiFi Credentials */}
          <form 
            className={`space-y-4 transition-opacity duration-300 ${!selected ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
            onSubmit={(e) => {
              e.preventDefault();
              provision();
            }}
          >
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              2. Configure WiFi
            </h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Wifi size={18} />
                </div>
                <input
                  type="text"
                  name="wifi_ssid"
                  id="wifi_ssid"
                  autoComplete="section-wifi ssid"
                  value={ssid}
                  onChange={(e) => setSsid(e.target.value)}
                  placeholder="WiFi SSID"
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                />
              </div>
              
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  name="wifi_password"
                  id="wifi_password"
                  autoComplete="section-wifi current-password"
                  value={passw}
                  onChange={(e) => setPassw(e.target.value)}
                  placeholder="Password"
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isProvisioning || !ssid || !passw || !selected}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white transition-all duration-300 ${
                isProvisioning || !ssid || !passw || !selected
                  ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
              }`}
            >
              {isProvisioning ? (
                <>
                  <RefreshCw className="animate-spin" size={20} />
                  Provisioning Device...
                </>
              ) : (
                <>
                  <Wifi size={20} />
                  Connect Sensor
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}