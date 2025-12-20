import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../../../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { FiCamera, FiCheck, FiArrowRight, FiVideo, FiAlertTriangle, FiArrowLeft, FiCheckCircle } from 'react-icons/fi';
import { getExperimentConfig } from '../../../../experiments/experimentConfig';

const AIExperimentSetup = ({ subExperiments, onComplete }) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === 'dark';
  const [step, setStep] = useState(1);
  const [selectedExperiment, setSelectedExperiment] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraError, setCameraError] = useState('');
  const isLocalAccess = (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [lastWorkingCameraId, setLastWorkingCameraId] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [mainExp, setMainExp] = useState(null);

  useEffect(() => {
    // Cleanup stream on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    try {
      const cfg = getExperimentConfig('5', '5.1');
      if (cfg?.mainExperiment) setMainExp(cfg.mainExperiment);
    } catch {}
  }, []);

  useEffect(() => {
    if (step === 2) {
      loadCameras();
    }
  }, [step]);

  useEffect(() => {
    if (selectedCameraId) {
      startCamera(selectedCameraId);
    }
  }, [selectedCameraId]);
  
  useEffect(() => {
    const handler = () => loadCameras();
    const md = navigator.mediaDevices;
    if (md && md.addEventListener) {
      md.addEventListener('devicechange', handler);
      return () => md.removeEventListener('devicechange', handler);
    } else if (md) {
      md.ondevicechange = handler;
      return () => { try { md.ondevicechange = null } catch {} };
    }
  }, []);

  const loadCameras = async () => {
    try {
      setCameraError('');
      if (!isLocalAccess) {
        setCameras([]);
        setSelectedCameraId('');
        setCameraError('This experiment requires access to the main device camera. Remote users cannot access cameras.');
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !navigator.mediaDevices.enumerateDevices) {
        setCameraError('Camera API not supported in this browser or context');
        return;
      }
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      permissionStream.getTracks().forEach(track => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setCameras(videoDevices);
      if (videoDevices.length > 0) {
        setSelectedCameraId(videoDevices[0].deviceId);
      } else {
        setSelectedCameraId('');
        setCameraError('No cameras detected on this device');
      }
    } catch (err) {
      console.error("Error loading cameras:", err);
      const msg = err?.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow access to use this experiment.'
        : (err?.message || 'Failed to access cameras');
      setCameraError(msg);
    }
  };

  const startCamera = async (deviceId) => {
    const prev = streamRef.current;
    try {
      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId } }, audio: false }
        : { video: true, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (prev) prev.getTracks().forEach(track => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraError('');
      setLastWorkingCameraId(deviceId || '');
      return;
    } catch (errExact) {
      try {
        const fallbackConstraints = deviceId
          ? { video: { deviceId }, audio: false }
          : { video: true, audio: false };
        const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        if (prev) prev.getTracks().forEach(track => track.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraError('');
        setLastWorkingCameraId(deviceId || '');
        return;
      } catch (err) {
        setCameraError(err?.message || 'Failed to start camera preview');
        if (prev && videoRef.current) {
          videoRef.current.srcObject = prev;
        }
      }
    }
  };

  const handleExperimentSelect = (exp) => {
    setSelectedExperiment(exp);
    setStep(2);
  };

  const handleComplete = () => {
    // Stop the camera stream explicitly before proceeding to release the device for backend
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Find the index of the selected camera in the cameras array to pass to backend
    // Backend uses OpenCV which needs an integer index (0, 1, 2...)
    const selectedCameraIndex = cameras.findIndex(c => c.deviceId === selectedCameraId);
    
    onComplete({
      experimentType: selectedExperiment.id,
      cameraId: selectedCameraId,
      cameraIndex: selectedCameraIndex >= 0 ? selectedCameraIndex : 0
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex-none text-center py-4 border-b border-gray-200/50 mb-2">
        <div className="flex items-center justify-center mb-2">
          <span className="text-4xl mr-3 drop-shadow-md">{mainExp?.icon}</span>
          <div className="text-left">
            <h3 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>{mainExp?.name}</h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{mainExp?.description}</p>
          </div>
        </div>
        <div
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium shadow-sm"
          style={{ backgroundColor: `${(mainExp?.color || '#8B5CF6')}20`, color: mainExp?.color || '#8B5CF6' }}
        >
          {mainExp?.category}
        </div>
      </div>
      {step === 2 && (
        <div className="flex items-center justify-center space-x-4 mb-8">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
          <div className={`h-1 w-16 ${step >= 2 ? 'bg-purple-600' : 'bg-gray-200'}`}></div>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
        </div>
      )}

      {step === 1 && (
        <div className="animate-fade-in">
          <h3 className={`text-lg font-bold mb-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Select Experiment</h3>
          <div className={`${isDark ? 'border-slate-700' : 'border-gray-200'} border-t mb-4`} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
            {subExperiments.map((subExp) => (
              <div
                key={subExp.id}
                onClick={() => handleExperimentSelect(subExp)}
                className={`relative cursor-pointer p-4 md:p-6 rounded-2xl border transition-all duration-300 flex flex-col items-center text-center gap-3 group ${
                  selectedExperiment?.id === subExp.id
                    ? (isDark 
                        ? 'bg-slate-800 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)] ring-1 ring-purple-500' 
                        : 'bg-blue-50 border-blue-500 shadow-lg shadow-blue-500/20 ring-1 ring-blue-500')
                    : (isDark 
                        ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:shadow-lg hover:shadow-purple-500/10' 
                        : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-gray-50 hover:shadow-md')
                }`}
              >
                {selectedExperiment?.id === subExp.id && (
                  <div className="absolute top-3 right-3">
                    <FiCheckCircle className={`w-5 h-5 ${isDark ? 'text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]' : 'text-green-500'}`} />
                  </div>
                )}
                
                <div className={`p-4 rounded-full transition-colors duration-300 ${
                  selectedExperiment?.id === subExp.id
                    ? (isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/10 text-blue-600')
                    : (isDark ? 'bg-slate-700 text-slate-400 group-hover:text-purple-300' : 'bg-gray-100 text-gray-500 group-hover:text-blue-600')
                }`}>
                  {subExp.icon}
                </div>
                <div className="w-full">
                  <h5 className={`font-bold text-lg mb-1 ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{subExp.name}</h5>
                  <p className={`text-sm line-clamp-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{subExp.description}</p>
                </div>
              </div>
            ))}
          </div>
          
          {/* Back to Dashboard Button */}
          <div className="flex justify-center mt-8 pt-4 border-t border-gray-200/50">
            <button
              onClick={() => navigate('/dashboard')}
              className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm transition-colors ${
                isDark 
                  ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } shadow-sm hover:shadow-md`}
            >
              <FiArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-in space-y-6">
          <div>
            <h3 className={`text-xl font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Configure Camera</h3>
            
            {!isLocalAccess && (
              <div className={`flex items-start gap-2 p-3 rounded-lg border ${isDark ? 'bg-yellow-900/30 border-yellow-700 text-yellow-200' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                <FiAlertTriangle className="flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  This experiment can only access the camera on the main device running the backend.
                  Remote users are restricted and will see this warning instead of camera controls.
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Select Camera Device
              </label>
              <div className="relative">
                <select
                  value={selectedCameraId}
                  onChange={(e) => { setCameraError(''); setSelectedCameraId(e.target.value); }}
                  disabled={!isLocalAccess || cameras.length === 0}
                  className={`w-full p-3 rounded-lg border ${
                    isDark 
                      ? 'bg-slate-800 border-slate-600 text-slate-200 focus:border-purple-500' 
                      : 'bg-white border-slate-300 text-slate-800 focus:border-purple-500'
                  } outline-none appearance-none ${(!isLocalAccess || cameras.length === 0) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  <option value="" disabled>{cameras.length === 0 ? 'No cameras available' : 'Select a camera'}</option>
                  {cameras.map(camera => (
                    <option key={camera.deviceId || camera.groupId || Math.random()} value={camera.deviceId}>
                      {camera.label || `Camera ${String(camera.deviceId || '').slice(0, 5)}...`}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-500">
                  <FiCamera />
                </div>
              </div>
            </div>

            <div className={`rounded-lg overflow-hidden border-2 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-100'}`}>
              <div className="aspect-video relative flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <FiAlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{cameraError}</p>
                    </div>
                  </div>
                )}
                {!streamRef.current && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <FiVideo className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Camera Preview</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setStep(1)}
              className={`px-6 py-2 rounded-lg transition-colors ${
                isDark 
                  ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Back
            </button>
            <button
              onClick={handleComplete}
              disabled={!isLocalAccess || !selectedCameraId}
              className={`px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center shadow-lg shadow-purple-500/30 ${
                (!isLocalAccess || !selectedCameraId) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Go to Experiment
              <FiArrowRight className="ml-2" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIExperimentSetup;
