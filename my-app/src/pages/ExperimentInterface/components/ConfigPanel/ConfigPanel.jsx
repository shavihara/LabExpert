import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';

const ConfigPanel = ({ config, onChange, onClose, selectedDevice, userToken, sharedExperimentManager }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  const {
    applyConfiguration,
    configStatus
  } = sharedExperimentManager;

  const handleApplyConfiguration = async () => {
    if (!selectedDevice) {
      setStatusMessage('❌ No device selected');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Applying configuration...');

    try {
      localStorage.setItem('experimentConfig', JSON.stringify(config));
      applyConfiguration(selectedDevice.id, config);
    } catch (err) {
      console.error(err);
      setStatusMessage(`❌ Error: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isSubmitting) return;
    if (!configStatus) return;
    if (configStatus.success === true) {
      setStatusMessage('✓ Configuration applied successfully');
      setIsSubmitting(false);
      setTimeout(() => {
        onClose();
      }, 1500);
    } else if (configStatus.success === false) {
      setStatusMessage(`❌ Error: ${configStatus.message}`);
      setIsSubmitting(false);
    }
  }, [configStatus, isSubmitting, onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-fade-in">
        
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">Configuration</h2>
            <p className="text-blue-100 text-sm mt-1">Adjust experiment parameters</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Sampling Frequency (Hz)
            </label>
            <input
              type="number"
              value={config.frequency_hz}
              onChange={(e) => onChange({ ...config, frequency_hz: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              min="1"
              max="100"
            />
            <p className="text-xs text-slate-500 mt-1">Recommended: 20-50 Hz</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Max Distance (cm)
            </label>
            <input
              type="number"
              value={config.max_distance_cm}
              onChange={(e) => onChange({ ...config, max_distance_cm: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              min="10"
              max="400"
            />
            <p className="text-xs text-slate-500 mt-1">Maximum measurable distance</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Duration (seconds)
            </label>
            <input
              type="number"
              value={config.duration_s}
              onChange={(e) => onChange({ ...config, duration_s: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              min="1"
              max="300"
            />
            <p className="text-xs text-slate-500 mt-1">Total experiment duration</p>
          </div>

          {statusMessage && (
            <div className={`p-3 rounded-lg text-sm font-medium text-center ${
              statusMessage.includes('✓') ? 'bg-green-100 text-green-700' : 
              statusMessage.includes('❌') ? 'bg-red-100 text-red-700' : 
              'bg-blue-100 text-blue-700'
            }`}>
              {statusMessage}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyConfiguration}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {isSubmitting ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigPanel;