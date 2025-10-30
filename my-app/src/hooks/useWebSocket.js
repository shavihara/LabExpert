// hooks/useWebSocket.js
// Custom hook for WebSocket connection management
import { useState, useEffect, useRef, useCallback } from 'react';

// Determine WS URL based on current hostname (default to backend port 5000)
const getWsUrl = () => {
  const host = window.location.hostname.replace(':3000', '');
  const port = 5000;
  return import.meta.env.VITE_WS_URL || `ws://${host}:${port}`;
};
const WS_URL = getWsUrl();
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export const useWebSocket = (token, isActive = true) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);
  
  const websocketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const messageHandlersRef = useRef(new Set());
  const isActiveRef = useRef(isActive);
  const tokenRef = useRef(token);

  // Update refs when props change
  useEffect(() => {
    isActiveRef.current = isActive;
    tokenRef.current = token;
  }, [isActive, token]);

  // Add message handler
  const addMessageHandler = useCallback((handler) => {
    messageHandlersRef.current.add(handler);
    return () => messageHandlersRef.current.delete(handler);
  }, []);

  // Send message through WebSocket
  const sendMessage = useCallback((message) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (websocketRef.current) {
      websocketRef.current.close(1000, 'Manual disconnect');
      websocketRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    reconnectAttemptsRef.current = 0;
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    if (websocketRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already connecting');
      return;
    }

    // Don't connect if not active or no token
    if (!isActiveRef.current || !tokenRef.current) {
      console.log('Not connecting - isActive:', isActiveRef.current, 'hasToken:', !!tokenRef.current);
      return;
    }

    console.log('Connecting WebSocket with token:', tokenRef.current?.substring(0, 10) + '...');
    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(`${WS_URL}/ws/client?token=${tokenRef.current}`);
      websocketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          
          // Notify all message handlers
          messageHandlersRef.current.forEach(handler => {
            try {
              handler(data);
            } catch (err) {
              console.error('Error in message handler:', err);
            }
          });
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('WebSocket connection error');
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        websocketRef.current = null;
        setIsConnected(false);
        setIsConnecting(false);

        // Only attempt to reconnect if still active and not manually closed
        if (isActiveRef.current && tokenRef.current && event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          setError(`Connection lost. Reconnecting... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current && tokenRef.current) {
              // Use a new connection function to avoid recursion
              const attemptReconnect = () => {
                console.log('Attempting to reconnect...');
                const ws = new WebSocket(`${WS_URL}/ws/client?token=${tokenRef.current}`);
                websocketRef.current = ws;

                ws.onopen = () => {
                  console.log('WebSocket reconnected successfully');
                  setIsConnected(true);
                  setIsConnecting(false);
                  setError(null);
                  reconnectAttemptsRef.current = 0;
                };

                ws.onmessage = (event) => {
                  try {
                    const data = JSON.parse(event.data);
                    setLastMessage(data);
                    
                    messageHandlersRef.current.forEach(handler => {
                      try {
                        handler(data);
                      } catch (err) {
                        console.error('Error in message handler:', err);
                      }
                    });
                  } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                  }
                };

                ws.onerror = (err) => {
                  console.error('WebSocket error during reconnect:', err);
                  setError('WebSocket reconnection error');
                  setIsConnecting(false);
                };

                ws.onclose = (event) => {
                  console.log('WebSocket reconnection closed:', event.code, event.reason);
                  websocketRef.current = null;
                  setIsConnected(false);
                  setIsConnecting(false);

                  if (isActiveRef.current && tokenRef.current && event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttemptsRef.current++;
                    setError(`Reconnection failed. Retrying... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
                    
                    reconnectTimeoutRef.current = setTimeout(attemptReconnect, RECONNECT_DELAY);
                  }
                };
              };
              
              attemptReconnect();
            }
          }, RECONNECT_DELAY);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError('Connection failed after multiple attempts');
        }
      };

    } catch (err) {
      console.error('Error creating WebSocket:', err);
      setError('Failed to create WebSocket connection');
      setIsConnecting(false);
    }
  }, [WS_URL, MAX_RECONNECT_ATTEMPTS, RECONNECT_DELAY]);

  // Effect to manage connection based on isActive and token
  useEffect(() => {
    if (isActive && token) {
      connect();
    } else {
      disconnect();
    }
    
    // Cleanup on unmount or when isActive/token changes
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isActive, token, connect, disconnect]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    error,
    lastMessage,
    sendMessage,
    addMessageHandler,
    connect,
    disconnect
  };
};

// Hook for device management
export const useDeviceManager = (token) => {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);

  const { sendMessage, addMessageHandler, isConnected } = useWebSocket(token, true);

  // Handle device-related messages
  useEffect(() => {
    const handleMessage = (data) => {
      switch (data.type) {
        case 'device_list':
          setDevices(data.devices || []);
          setIsScanning(false);
          setScanError(null);
          break;
        case 'device_selected':
          setSelectedDevice(data.device || null);
          break;
        case 'device_disconnected':
          setSelectedDevice(null);
          break;
        case 'scan_error':
          setScanError(data.error || 'Unknown error');
          setIsScanning(false);
          break;
        default:
          break;
      }
    };

    const unsubscribe = addMessageHandler(handleMessage);
    return unsubscribe;
  }, [addMessageHandler]);

  // Initiate a device scan
  const scanDevices = useCallback(() => {
    if (!isConnected) {
      setScanError('WebSocket not connected');
      return;
    }

    setIsScanning(true);
    setScanError(null);
    // Backend expects 'action' field instead of 'type'
    sendMessage({ action: 'scan_devices' });
  }, [isConnected, sendMessage]);

  // Select a device by ID
  const selectDevice = useCallback((deviceId) => {
    if (!isConnected) {
      return;
    }

    sendMessage({ action: 'select_device', device_id: deviceId });
  }, [isConnected, sendMessage]);

  // Release currently selected device
  const releaseDevice = useCallback(() => {
    if (!isConnected) {
      return;
    }

    sendMessage({ action: 'release_device' });
  }, [isConnected, sendMessage]);

  return {
    devices,
    selectedDevice,
    isScanning,
    scanError,
    scanDevices,
    selectDevice,
    releaseDevice,
    isConnected
  };
};

// Hook for experiment management
export const useExperimentManager = (token) => {
  const [experimentData, setExperimentData] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [experimentError, setExperimentError] = useState(null);
  const [firmwareStatus, setFirmwareStatus] = useState(null);
  const [configStatus, setConfigStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);

  const { sendMessage, addMessageHandler, isConnected } = useWebSocket(token, true);

  // Handle experiment-related messages
  useEffect(() => {
    const handleMessage = (data) => {
      switch (data.type) {
        case 'experiment_data':
          setExperimentData(prev => [...prev, data.data]);
          break;
        case 'experiment_started':
          setIsRunning(true);
          setExperimentError(null);
          break;
        case 'experiment_stopped':
          setIsRunning(false);
          break;
        case 'experiment_error':
          setExperimentError(data.error);
          setIsRunning(false);
          break;
        case 'firmware_flash_result':
          setFirmwareStatus({
            success: data.success,
            message: data.message || data.detail || 'Firmware operation completed'
          });
          break;
        case 'configuration_result':
          setConfigStatus({
            success: data.success,
            message: data.message || data.detail || 'Configuration applied'
          });
          break;
        case 'save_experiment_result':
          setSaveStatus({
            success: data.success,
            message: data.message || data.detail || 'Experiment data saved'
          });
          break;
        default:
          break;
      }
    };

    const unsubscribe = addMessageHandler(handleMessage);
    return unsubscribe;
  }, [addMessageHandler]);

  const startExperiment = useCallback((config, experimentType) => {
    if (!isConnected) {
      setExperimentError('WebSocket not connected');
      return;
    }

    setExperimentData([]);
    setExperimentError(null);
    // Align with backend: use 'action' instead of 'type'
    const message = { action: 'start_experiment', config, experiment_type: experimentType };
    console.log('Sending start_experiment message:', JSON.stringify(message, null, 2));
    sendMessage(message);
  }, [isConnected, sendMessage]);

  const stopExperiment = useCallback(() => {
    if (!isConnected) {
      return;
    }

    sendMessage({ action: 'stop_experiment' });
  }, [isConnected, sendMessage]);

  const flashFirmware = useCallback((deviceId, experimentType) => {
    if (!isConnected) {
      setFirmwareStatus({ success: false, message: 'WebSocket not connected' });
      return;
    }

    setFirmwareStatus({ success: null, message: 'Flashing firmware...' });
    sendMessage({ 
      action: 'flash_firmware', 
      device_id: deviceId, 
      experiment_type: experimentType 
    });
  }, [isConnected, sendMessage]);

  const applyConfiguration = useCallback((deviceId, config) => {
    if (!isConnected) {
      setConfigStatus({ success: false, message: 'WebSocket not connected' });
      return;
    }

    setConfigStatus({ success: null, message: 'Applying configuration...' });
    sendMessage({ 
      action: 'configure_experiment', 
      device_id: deviceId, 
      config: config 
    });
  }, [isConnected, sendMessage]);

  const saveExperimentData = useCallback((experimentType, graphType, data) => {
    if (!isConnected) {
      setSaveStatus({ success: false, message: 'WebSocket not connected' });
      return;
    }

    setSaveStatus({ success: null, message: 'Saving experiment data...' });
    sendMessage({ 
      action: 'save_experiment_data', 
      experiment_type: experimentType,
      graph_type: graphType,
      data: data,
      timestamp: new Date().toISOString()
    });
  }, [isConnected, sendMessage]);

  const clearData = useCallback(() => {
    setExperimentData([]);
    setExperimentError(null);
    setFirmwareStatus(null);
    setConfigStatus(null);
    setSaveStatus(null);
  }, []);

  return {
    experimentData,
    isRunning,
    experimentError,
    firmwareStatus,
    configStatus,
    saveStatus,
    startExperiment,
    stopExperiment,
    flashFirmware,
    applyConfiguration,
    saveExperimentData,
    clearData,
    isConnected
  };
};