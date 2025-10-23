// components/DeviceScanner.jsx
// Device scanning and selection component
import React, { useState, useEffect } from 'react';
import { useDeviceManager } from '../hooks/useWebSocket';
import './DeviceScanner.css';

const DeviceScanner = ({ token, onDeviceSelected, selectedExperiment }) => {
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
  } = useDeviceManager(token);

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

  const getDeviceStatusColor = (status) => {
    switch (status) {
      case 'available':
        return '#27ae60';
      case 'busy':
        return '#f39c12';
      case 'error':
        return '#e74c3c';
      case 'offline':
        return '#95a5a6';
      default:
        return '#95a5a6';
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

        {devices.map((device) => {
          const isSelected = selectedDevice && selectedDevice.id === device.id;
          const isCompatible = isDeviceCompatible(device);
          
          return (
            <div 
              key={device.id}
              className={`device-card ${isSelected ? 'selected' : ''} ${!isCompatible ? 'incompatible' : ''}`}
              onClick={() => isCompatible && handleDeviceSelect(device.id)}
            >
              <div className="device-header">
                <div className="device-info">
                  <h4 className="device-name">{device.name || `Device ${device.id}`}</h4>
                  <p className="device-id">ID: {device.id}</p>
                </div>
                <div 
                  className="device-status"
                  style={{ backgroundColor: getDeviceStatusColor(device.status) }}
                >
                  {device.status}
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