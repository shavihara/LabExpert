import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';

const ConfigPanel = ({ config, onChange, onClose, selectedDevice, userToken, sharedExperimentManager, selectedSubExperiment }) => {
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
      applyConfiguration(selectedDevice.id, config, selectedSubExperiment?.firmwareType);
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

  const isPendulumExperiment = selectedSubExperiment?.id === '2.1' || selectedSubExperiment?.id === '2.2' || selectedSubExperiment?.id === '5.1';
  const isTemperatureExperiment = selectedSubExperiment?.id === 'temperature_live';
  const isInclinedPlane = selectedSubExperiment?.id === 'inclined_plane' || selectedSubExperiment?.firmwareType === 'inclined_plane';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-fade-in">
        
        <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-purple-800 p-6 flex justify-between items-center modal-header-gradient">
          <div>
            <h2 className="text-2xl font-bold text-white">Configuration</h2>
            <p className="text-white/80 text-sm mt-1">Adjust experiment parameters</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Sub-experiment 2.1 Specific Configs */}
          {selectedSubExperiment?.id === '2.1' ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Max Count
                </label>
                <input
                  type="number"
                  value={config.max_count || 50}
                  onChange={(e) => onChange({ ...config, max_count: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                  min="1"
                />
                <p className="text-xs text-slate-500 mt-1">Number of oscillations to count</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Length of String (cm)
                </label>
                <input
                  type="number"
                  value={config.pendulum_length_cm || 100}
                  onChange={(e) => onChange({ ...config, pendulum_length_cm: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                  min="1"
                />
                <p className="text-xs text-slate-500 mt-1">Length of the pendulum string</p>
              </div>
            </>
          ) : null}

              {/* Sub-experiment 5.1 (AI Pendulum) Specific Configs */}
              {selectedSubExperiment?.id === '5.1' ? (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Max Count
                    </label>
                    <input
                      type="number"
                      value={config.max_count || 50}
                      onChange={(e) => onChange({ ...config, max_count: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                      min="1"
                    />
                    <p className="text-xs text-slate-500 mt-1">Number of oscillations to count</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Length of String (cm)
                    </label>
                    <input
                      type="number"
                      value={config.pendulum_length_cm || 100}
                      onChange={(e) => onChange({ ...config, pendulum_length_cm: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                      min="1"
                    />
                    <p className="text-xs text-slate-500 mt-1">Length of the pendulum string</p>
                  </div>
                </>
              ) : null}

          {/* Sub-experiment 2.2 Specific Configs */}
          {selectedSubExperiment?.id === '2.2' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Max Count
                </label>
                <input
                  type="number"
                  value={config.max_count || 50}
                  onChange={(e) => onChange({ ...config, max_count: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                  min="1"
                />
                <p className="text-xs text-slate-500 mt-1">Number of oscillations to count</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Pivot to Center of Mass (cm)
                </label>
                <input
                  type="number"
                  value={config.pivot_to_com_distance_cm || 50}
                  onChange={(e) => onChange({ ...config, pivot_to_com_distance_cm: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                  min="1"
                />
                <p className="text-xs text-slate-500 mt-1">Distance between pivot and center of mass</p>
              </div>
            </>
          )}

          {/* Temperature Experiment Specific Configs */}
          {isTemperatureExperiment && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Resolution
              </label>
              <select
                value={config.resolution || 10}
                onChange={(e) => onChange({ ...config, resolution: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value={9}>0.5°C (94ms)</option>
                <option value={10}>0.25°C (188ms)</option>
                <option value={11}>0.125°C (375ms)</option>
                <option value={12}>0.0625°C (750ms)</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">Select temperature resolution</p>
            </div>
          )}

          {!isPendulumExperiment && !isTemperatureExperiment && (
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
          )}

          {config.max_intensity_lux !== undefined ? (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Max Intensity (lux)
              </label>
              <input
                type="number"
                value={config.max_intensity_lux}
                onChange={(e) => onChange({ ...config, max_intensity_lux: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                min="1"
                max="100000"
              />
              <p className="text-xs text-slate-500 mt-1">Maximum expected ambient intensity</p>
            </div>
          ) : (!isPendulumExperiment && !isTemperatureExperiment && !isInclinedPlane && (
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
          ))}

          {isInclinedPlane && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Surconference (cm)
                </label>
                <input
                  type="number"
                  value={config.surconference_cm || ''}
                  onChange={(e) => onChange({ ...config, surconference_cm: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-slate-500 mt-1">Circumference of rolling object</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Angle (degree)
                </label>
                <input
                  type="number"
                  value={config.angle_deg || ''}
                  onChange={(e) => onChange({ ...config, angle_deg: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                  min="0"
                  max="90"
                  step="0.1"
                />
                <p className="text-xs text-slate-500 mt-1">Incline angle of the plane</p>
              </div>
            </>
          )}

          {!isPendulumExperiment && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700">
                Set Custom duration
              </label>
              <input
                type="checkbox"
                checked={config.run_indefinite === false}
                onChange={(e) => onChange({ ...config, run_indefinite: !e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
            </div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Duration (seconds)
            </label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              step="1"
              value={config.duration_s}
              onChange={(e) => {
                const raw = String(e.target.value || '').replace(/[^0-9]/g, '');
                const num = Math.max(1, Math.min(300, parseInt(raw || '0')));
                onChange({ ...config, duration_s: num });
              }}
              onKeyDown={(e) => {
                const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab'];
                if (allowed.includes(e.key)) return;
                if (!/^[0-9]$/.test(e.key)) e.preventDefault();
              }}
              onBlur={(e) => {
                const v = parseInt(e.target.value || '0');
                const num = Math.max(1, Math.min(300, Number.isFinite(v) ? v : 1));
                if (num !== config.duration_s) onChange({ ...config, duration_s: num });
              }}
              disabled={config.run_indefinite === true}
              className={`w-full px-4 py-2 border-2 rounded-lg focus:border-blue-500 focus:outline-none transition-all ${
                config.run_indefinite === true ? 'border-slate-200 bg-slate-100 cursor-not-allowed opacity-70' : 'border-slate-200'
              }`}
              min="1"
              max="300"
            />
            <p className="text-xs text-slate-500 mt-1">Total experiment duration</p>
          </div>
          )}

          {config.mass !== undefined && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Mass of object (kg)
              </label>
              <input
                type="number"
                value={config.mass}
                onChange={(e) => onChange({ ...config, mass: parseFloat(e.target.value || 0) })}
                className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                min="0"
                step="0.01"
                placeholder="0"
              />
              <p className="text-xs text-slate-500 mt-1">Used for KE/PE/TE energy calculations</p>
            </div>
          )}

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
