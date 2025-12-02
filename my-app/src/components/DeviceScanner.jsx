// components/DeviceScanner.jsx
// Device scanning and selection component
import React, { useState, useEffect } from 'react';
import { useDeviceManager } from '../hooks/useWebSocket';
import './DeviceScanner.css';

const DeviceScanner = ({ webSocketInstance, onDeviceSelected, selectedExperiment }) => {
  const [autoScan, setAutoScan] = useState(false);
  const [scanInterval, setScanInterval] = useState(null);

  const {
    devices,
    selectedDevice,
    isScanning,
    scanError,
    scanDevices,
    selectDevice,
    releaseDevice,
    isConnected
  } = webSocketInstance ? useDeviceManager(webSocketInstance) : {
    devices: [],
    selectedDevice: null,
    isScanning: false,
    scanError: null,
    scanDevices: () => {},
    selectDevice: () => {},
    releaseDevice: () => {},
    isConnected: false
  };

  // Auto-scan functionality
  useEffect(() => {
    if (autoScan && isConnected) {
      const interval = setInterval(() => {
        if (!isScanning) {
          scanDevices();
        }
      }, 5000); // Scan every 5 seconds
      
      setScanInterval(interval);
      
      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    } else if (scanInterval) {
      clearInterval(scanInterval);
      setScanInterval(null);
    }
  }, [autoScan, isConnected, isScanning, scanDevices]);

  // Notify parent when device is selected
  useEffect(() => {
    if (onDeviceSelected) {
      onDeviceSelected(selectedDevice);
    }
  }, [selectedDevice, onDeviceSelected]);

  // Initial scan when connected
  useEffect(() => {
    if (isConnected && devices.length === 0) {
      scanDevices();
    }
  }, [isConnected, devices.length, scanDevices]);

  const handleDeviceSelect = (deviceId) => {
    if (selectedDevice && selectedDevice.id === deviceId) {
      // Deselect current device
      releaseDevice();
    } else {
      // Select new device
      selectDevice(deviceId);
    }
  };

  const handleManualScan = () => {
    if (!isScanning) {
      scanDevices();
    }
  };

  const getDeviceStatusInfo = (device) => {
    const online = device.online_status === 1;
    const available = device.availability === 1;

    if (online) {
      return { label: 'Online', color: '#27ae60' };
    } else if (!online && !available) {
      return { label: 'In Use', color: '#f39c12' };
    } else {
      return { label: 'Offline', color: '#e74c3c' };
    }
  };

  const getExperimentTypeIcon = (type) => {
    switch (type) {
      case 'tof':
        return '📏';
      case 'oscillation':
        return '〰️';
      case 'displacement_angle':
        return '🔄';
      default:
        return '🔬';
    }
  };

  const isDeviceCompatible = (device) => {
    if (!selectedExperiment || !device.supported_experiments) {
      return true; // Assume compatible if no info available
    }
    return device.supported_experiments.includes(selectedExperiment);
  };

  return (
    <div className="device-scanner">
      <div className="scanner-header">
        <h3>Device Scanner</h3>
        <div className="scanner-status">
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
      </div>

      <div className="scanner-controls">
        <button 
          onClick={handleManualScan}
          disabled={!isConnected || isScanning}
          className="scan-button"
        >
          {isScanning ? '🔄 Scanning...' : '🔍 Scan Devices'}
        </button>
        
        <label className="auto-scan-toggle">
          <input
            type="checkbox"
            checked={autoScan}
            onChange={(e) => setAutoScan(e.target.checked)}
            disabled={!isConnected}
          />
          Auto-scan every 5s
        </label>
      </div>

      {scanError && (
        <div className="scan-error">
          ⚠️ Scan Error: {scanError}
        </div>
      )}

      {selectedExperiment && (
        <div className="experiment-filter">
          <span className="filter-label">
            {getExperimentTypeIcon(selectedExperiment)} 
            Filtering for: <strong>{selectedExperiment.toUpperCase()}</strong> compatible devices
          </span>
        </div>
      )}

      <div className="device-list">
        {devices.length === 0 && !isScanning && (
          <div className="no-devices">
            <p>No devices found</p>
            <p className="hint">Make sure your ESP32 devices are powered on and connected to the network</p>
          </div>
        )}

        {devices
          .slice()
          .sort((a, b) => {
            const getRank = (d) => {
              const s = getDeviceStatusInfo(d);
              if (s.label === 'Online') return 0;
              if (s.label === 'In Use') return 1;
              return 2; // Offline
            };
            return getRank(a) - getRank(b);
          })
          .map((device) => {
          const isSelected = selectedDevice && selectedDevice.id === device.id;
          const isCompatible = isDeviceCompatible(device);
          const statusInfo = getDeviceStatusInfo(device);
          // Disable if Offline OR In Use (since In Use means offline-busy now)
          // User asked to disable Offline sensors. Did not specify In Use.
          // Usually In Use is not selectable.
          const isDisabled = statusInfo.label === 'Offline' || statusInfo.label === 'In Use';
          
          return (
            <div 
              key={device.id}
              className={`device-card ${isSelected ? 'selected' : ''} ${!isCompatible ? 'incompatible' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => !isDisabled && isCompatible && handleDeviceSelect(device.id)}
            >
              {device.sensor_type && (
                <div className="sensor-banner">Sensor: {device.sensor_type}</div>
              )}
              <div className="device-header">
                <div className="device-info">
                  <h4 className="device-name">{device.name || `Device ${device.id}`}</h4>
                  <p className="device-id">ID: {device.id}</p>
                </div>
                <div 
                  className="device-status"
                  style={{ backgroundColor: statusInfo.color }}
                >
                  {statusInfo.label}
                </div>
              </div>

              <div className="device-details">
                <div className="detail-row">
                  <span>IP Address:</span>
                  <span>{device.ip_address}</span>
                </div>
                <div className="detail-row">
                  <span>Firmware:</span>
                  <span>{device.firmware_version || 'Unknown'}</span>
                </div>
                <div className="detail-row">
                  <span>Last Seen:</span>
                  <span>{new Date(device.last_seen).toLocaleTimeString()}</span>
                </div>
                {device.battery_level !== undefined && (
                  <div className="detail-row">
                    <span>Battery:</span>
                    <span className={`battery-level ${device.battery_level < 20 ? 'low' : ''}`}>
                      {device.battery_level}%
                    </span>
                  </div>
                )}
              </div>

              {device.supported_experiments && (
                <div className="supported-experiments">
                  <span className="experiments-label">Supports:</span>
                  <div className="experiments-list">
                    {device.supported_experiments.map((exp) => (
                      <span 
                        key={exp}
                        className={`experiment-tag ${selectedExperiment === exp ? 'highlighted' : ''}`}
                      >
                        {getExperimentTypeIcon(exp)} {exp.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!isCompatible && (
                <div className="incompatible-notice">
                  ⚠️ Not compatible with selected experiment
                </div>
              )}

              {isSelected && (
                <div className="selected-indicator">
                  ✅ Selected
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedDevice && (
        <div className="selected-device-info">
          <h4>Selected Device</h4>
          <div className="selected-details">
            <p><strong>Name:</strong> {selectedDevice.name || `Device ${selectedDevice.id}`}</p>
            <p><strong>IP:</strong> {selectedDevice.ip_address}</p>
            <p><strong>Status:</strong> {selectedDevice.status}</p>
            <button 
              onClick={releaseDevice}
              className="release-button"
            >
              Release Device
            </button>
          </div>
        </div>
      )}

      <div className="scanner-info">
        <p className="device-count">
          Found {devices.length} device{devices.length !== 1 ? 's' : ''}
          {selectedExperiment && (
            <span className="compatible-count">
              {' '}({devices.filter(isDeviceCompatible).length} compatible)
            </span>
          )}
        </p>
        {isScanning && (
          <p className="scanning-indicator">
            🔄 Scanning for devices...
          </p>
        )}
      </div>
    </div>
  );
};

export default DeviceScanner;
