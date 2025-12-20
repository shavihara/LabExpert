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
  const messageQueueRef = useRef([]);
  const isActiveRef = useRef(isActive);
  const tokenRef = useRef(token);
  const pauseMessageProcessingRef = useRef(false);

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
    console.log('sendMessage called with:', message, 'WebSocket state:', websocketRef.current?.readyState);
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      console.log('Sending message via WebSocket:', JSON.stringify(message));
      websocketRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.log('Cannot send message - WebSocket not open. State:', websocketRef.current?.readyState);
      return false;
    }
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

  // Get and clear queued real-time data messages
  const getQueuedMessages = useCallback(() => {
    const messages = [...messageQueueRef.current];
    messageQueueRef.current = [];
    return messages;
  }, []);

  // Pause message processing (messages will be ignored)
  const pauseMessageProcessing = useCallback(() => {
    pauseMessageProcessingRef.current = true;
    console.log('Message processing paused');
  }, []);

  // Resume message processing
  const resumeMessageProcessing = useCallback(() => {
    pauseMessageProcessingRef.current = false;
    console.log('Message processing resumed');
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

    // Close any existing connection first
    if (websocketRef.current) {
      console.log('Closing existing WebSocket connection');
      websocketRef.current.close();
      websocketRef.current = null;
    }

    console.log('Connecting WebSocket with token:', tokenRef.current?.substring(0, 10) + '...', 'URL:', `${WS_URL}/ws/client?token=${tokenRef.current}`);
    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(`${WS_URL}/ws/client?token=${tokenRef.current}`);
      websocketRef.current = ws;
      console.log('WebSocket instance created:', ws);

      ws.onopen = () => {
        console.log('WebSocket connection opened successfully');
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
        setError(null);
        
        // Send a test ping message to verify connection
        setTimeout(() => {
          console.log('Sending test ping message');
          ws.send(JSON.stringify({ action: 'ping', message: 'test connection' }));
        }, 1000);
      };

      ws.onmessage = (event) => {
        try {
          let data = JSON.parse(event.data);
          if (typeof data === 'string') {
            data = JSON.parse(data);
          }
          
          // Skip processing if paused
          if (pauseMessageProcessingRef.current) {
            console.log('Message processing paused, ignoring message:', data.type);
            return;
          }
          // Directly deliver messages to handlers without queuing
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
        console.error('WebSocket error occurred:', err);
        setError('WebSocket connection error');
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason, event.wasClean);
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
                  
                  // Process any queued messages after successful reconnection
                  if (messageQueueRef.current.length > 0) {
                    console.log('Processing queued messages after reconnection:', messageQueueRef.current.length);
                    const queuedMessages = [...messageQueueRef.current];
                    messageQueueRef.current = [];
                    
                    queuedMessages.forEach((data, index) => {
                      console.log('Delivering queued message', index + 1, 'of', queuedMessages.length, ':', data.type);
                      setLastMessage(data);
                      messageHandlersRef.current.forEach(handler => {
                        try {
                          handler(data);
                        } catch (err) {
                          console.error('Error in message handler for queued message:', err);
                        }
                      });
                    });
                  }
                };

                ws.onmessage = (event) => {
                  try {
                    const data = JSON.parse(event.data);
                    console.log('WebSocket received message (reconnect):', data);
                    
                    // Queue real-time data messages to prevent loss
                    if (data.type === 'real_time_data' || data.type === 'sensor_data' || data.type === 'processed_data') {
                      messageQueueRef.current.push(data);
                      console.log('Queued data message (reconnect), queue size:', messageQueueRef.current.length, 'Message:', data);
                    }
                    
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
        } else {
          console.log('Not reconnecting - isActive:', isActiveRef.current, 'hasToken:', !!tokenRef.current, 'attempts:', reconnectAttemptsRef.current);
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
    console.log('useWebSocket effect triggered - token:', token ? token.substring(0, 10) + '...' : 'null', 'isActive:', isActive);
    
    if (isActive && token) {
      console.log('Attempting to connect WebSocket...');
      connect();
    } else {
      console.log('Disconnecting WebSocket - token:', !!token, 'isActive:', isActive);
      disconnect();
    }
    
    // Cleanup on unmount or when isActive/token changes
    return () => {
      console.log('useWebSocket cleanup');
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
    getQueuedMessages,
    pauseMessageProcessing,
    resumeMessageProcessing,
    connect,
    disconnect
  };
};

// Hook for device management
export const useDeviceManager = (webSocketInstance) => {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);

  const { sendMessage, addMessageHandler, isConnected } = webSocketInstance;

  // Handle device-related messages
  useEffect(() => {
    const handleMessage = (data) => {
      console.log('useDeviceManager received message:', data);
      switch (data.type) {
        case 'device_list':
          console.log('Processing device_list message with devices:', data.devices);
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
        case 'error':
          console.log('Received error message in device manager:', data);
          // Handle device allocation errors
          if (data.message && data.message.includes('device allocated')) {
            setScanError(data.message);
            setIsScanning(false);
          }
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
    console.log('scanDevices called - isConnected:', isConnected);
    if (!isConnected) {
      console.log('Cannot scan: WebSocket not connected');
      setScanError('WebSocket not connected');
      return;
    }

    console.log('Starting device scan...');
    setIsScanning(true);
    setScanError(null);
    // Backend expects 'action' field instead of 'type'
    const message = { action: 'scan_devices' };
    console.log('Sending scan message:', message);
    const sent = sendMessage(message);
    console.log('Message sent successfully:', sent);
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
export const useExperimentManager = (webSocketInstance, externalExperimentData = null, externalSetExperimentData = null) => {
  const [experimentData, setExperimentData] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [experimentError, setExperimentError] = useState(null);
  const [firmwareStatus, setFirmwareStatus] = useState(null);
  const [configStatus, setConfigStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  
  // Use ref to track whether we should use external state
  const useExternalStateRef = useRef(externalSetExperimentData !== null);

  const { sendMessage, addMessageHandler, isConnected } = webSocketInstance;

  // Handle experiment-related messages
  useEffect(() => {
    const handleMessage = (data) => {
      console.log('useExperimentManager received message:', data);
      switch (data.type) {
        case 'experiment_data':
        case 'processed_data':
          console.log('Adding processed_data to experimentData:', data.data);
          if (useExternalStateRef.current && externalSetExperimentData) {
            // Use external state if provided
            externalSetExperimentData(prev => [...prev, data.data]);
          } else {
            // Use local state
            setExperimentData(prev => [...prev, data.data]);
          }
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
          console.log('Received firmware_flash_result:', data);
          console.log('Setting firmwareStatus to:', {
            success: data.success,
            message: data.message || data.detail || 'Firmware operation completed',
            progress: data.progress || null
          });
          setFirmwareStatus({
            success: data.success,
            message: data.message || data.detail || 'Firmware operation completed',
            progress: data.progress || null
          });
          break;
        case 'firmware_flash_progress':
          console.log('Received firmware_flash_progress:', data);
          setFirmwareStatus({
            success: null,
            message: data.message || 'Flashing firmware...',
            progress: data.progress || 0
          });
          break;
        case 'log_message':
          console.log('Received log message:', data);
          // Handle backend log messages for firmware progress
          if (data.message && data.message.includes('Firmware upload successful')) {
            console.log('Detected firmware upload success log message');
            setFirmwareStatus({
              success: true,
              message: 'Firmware upload successful',
              progress: 99 // Set to 99% when upload is successful
            });
          } else if (data.message && data.message.includes('Firmware upload')) {
            // Generic firmware upload progress
            setFirmwareStatus({
              success: null,
              message: data.message,
              progress: 50 // Set to 50% for generic upload messages
            });
          }
          break;
        case 'experiment_configured':
          console.log('Received experiment_configured:', data);
          setConfigStatus({
            success: true,
            message: data.message || 'Configuration applied successfully'
          });
          break;
        case 'configuration_result':
          setConfigStatus({
            success: data.success,
            message: data.message || data.detail || 'Configuration applied'
          });
          break;
        case 'error':
          console.log('Received error message:', data);
          // Check if this error is related to configuration by checking the message content
          if (data.message && (data.message.includes('configure') || data.message.includes('Configuration'))) {
            console.log('Setting configStatus to error:', data.message);
            setConfigStatus({
              success: false,
              message: data.message
            });
          } else {
            // Handle other types of errors
            setExperimentError(data.message);
          }
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

  const flashFirmware = useCallback((deviceId, experimentType, firmwareFile = null) => {
    if (!isConnected) {
      setFirmwareStatus({ success: false, message: 'WebSocket not connected' });
      return;
    }

    setFirmwareStatus({ success: null, message: 'Flashing firmware...' });
    sendMessage({ 
      action: 'flash_firmware', 
      device_id: deviceId, 
      experiment_type: experimentType,
      firmware_file: firmwareFile
    });
  }, [isConnected, sendMessage]);

  const applyConfiguration = useCallback((deviceId, config, experimentType = null) => {
    if (!isConnected) {
      setConfigStatus({ success: false, message: 'WebSocket not connected' });
      return;
    }

    setConfigStatus({ success: null, message: 'Applying configuration...' });
    
    // Build configuration payload based on experiment type
    // If pendulum/OSI-style fields are present, send ONLY those to device
    let backendConfig;
    const hasPendulumFields = (
      config.max_count != null ||
      config.pendulum_length_cm != null ||
      config.pivot_to_com_distance_cm != null
    );
    if (hasPendulumFields) {
      backendConfig = {};
      if (config.max_count != null) {
        backendConfig.max_count = parseInt(config.max_count);
        backendConfig.maxCount = parseInt(config.max_count);
      }
      if (config.pendulum_length_cm != null) {
        backendConfig.pendulum_length_cm = Number(config.pendulum_length_cm);
        backendConfig.pendulumLengthCm = Number(config.pendulum_length_cm);
      }
      if (config.pivot_to_com_distance_cm != null) {
        backendConfig.pivot_to_com_distance_cm = Number(config.pivot_to_com_distance_cm);
        backendConfig.pivotToComDistanceCm = Number(config.pivot_to_com_distance_cm);
      }
      // AI Pendulum (Video Oscillation) Fields
      if (config.h_range) backendConfig.h_range = config.h_range;
      if (config.s_range) backendConfig.s_range = config.s_range;
      if (config.v_range) backendConfig.v_range = config.v_range;
      if (config.adaptive_color !== undefined) backendConfig.adaptive_color = config.adaptive_color;
      if (config.reset_tracking !== undefined) backendConfig.reset_tracking = config.reset_tracking;
      
      // Avoid sending frequency/duration/mode for OSI pendulum firmware
    } else {
      // Default distance/time-of-flight style configuration
      backendConfig = {
        frequency: config.frequency_hz || config.frequency || 50,
        mode: config.mode || 'distance'
      };
      if (!(config.run_indefinite === true)) {
        backendConfig.duration = config.duration_s || config.duration || 60;
      } else {
        backendConfig.run_indefinite = true;
      }
      if (config.max_distance_cm != null && !Number.isNaN(config.max_distance_cm)) {
        backendConfig.maxRange = Math.round(config.max_distance_cm * 10);
      }
      if (config.resolution != null) {
        backendConfig.resolution = parseInt(config.resolution);
      }
      // Inclined plane custom parameters
      if (config.surconference_cm != null) {
        backendConfig.circumference_cm = Number(config.surconference_cm);
      } else if (config.circumference_cm != null) {
        backendConfig.circumference_cm = Number(config.circumference_cm);
      }
      if (config.angle_deg != null) {
        backendConfig.angle_deg = Number(config.angle_deg);
      }
      if (config.gravity != null) {
        backendConfig.gravity = Number(config.gravity);
      }
    }
    const analysis = {};
    if (config.mass !== undefined && !Number.isNaN(config.mass)) {
      analysis.mass = Number(config.mass);
    }

    sendMessage({
      action: 'configure_experiment',
      device_id: deviceId,
      config: backendConfig,
      experiment_type: experimentType,
      analysis
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

  // Always use the current externalExperimentData when external state is enabled
  const currentExperimentData = useExternalStateRef.current 
    ? (externalExperimentData || []) 
    : experimentData;

  return {
    experimentData: currentExperimentData,
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
