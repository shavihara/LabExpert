/**
 * Responsive UI System Components
 * Standardized responsive design system for experiment interface
 */

import React from 'react';
import { FiSettings, FiBarChart2, FiPlay, FiPause, FiStopCircle, FiRefreshCw, FiSave, FiX } from 'react-icons/fi';

/**
 * Responsive design constants
 */
export const responsive = {
  // Container layouts
  container: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
  containerSm: "max-w-4xl mx-auto px-4 sm:px-6 lg:px-8",
  containerLg: "max-w-full mx-auto px-4 sm:px-6 lg:px-8",
  
  // Card styles
  card: "bg-white rounded-xl shadow-lg border border-slate-200",
  cardSm: "bg-white rounded-lg shadow-md border border-slate-200",
  cardHover: "bg-white rounded-xl shadow-lg border border-slate-200 hover:shadow-xl transition-shadow duration-300",
  
  // Button styles
  button: "inline-flex items-center whitespace-nowrap px-4 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2",
  buttonPrimary: "px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
  buttonSecondary: "px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-gray-600 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2",
  buttonSuccess: "px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2",
  buttonDanger: "px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2",
  buttonWarning: "px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-yellow-600 text-white hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2",
  
  // Grid layouts
  grid: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
  gridSm: "grid grid-cols-1 sm:grid-cols-2 gap-4",
  gridResponsive: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6",
  
  // Flex layouts
  flexCenter: "flex items-center justify-center",
  flexBetween: "flex items-center justify-between",
  flexStart: "flex items-center justify-start",
  flexEnd: "flex items-center justify-end",
  flexCol: "flex flex-col",
  flexRow: "flex flex-row",
  
  // Text styles
  textXs: "text-xs",
  textSm: "text-sm",
  textBase: "text-base",
  textLg: "text-lg",
  textXl: "text-xl",
  text2Xl: "text-2xl",
  text3Xl: "text-3xl",
  
  // Color themes
  theme: {
    primary: "text-blue-600",
    secondary: "text-gray-600",
    success: "text-green-600",
    danger: "text-red-600",
    warning: "text-yellow-600",
    info: "text-cyan-600"
  },
  
  // Spacing
  spacing: {
    xs: "p-2",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
    xl: "p-12"
  },
  
  // Animation
  transition: "transition-all duration-300 ease-in-out",
  hoverScale: "hover:scale-105 transition-transform duration-200",
  fadeIn: "animate-fade-in"
};

/**
 * Dynamic UI Generator Component
 * Automatically generates UI based on experiment configuration
 */
export const DynamicUIGenerator = ({ experimentId, subExperimentId, children }) => {
  // For now, just render children - config loading can be added later
  return (
    <div className={`${responsive.container} py-8`}>
      {children}
    </div>
  );
};

/**
 * Experiment Header Component
 */
export const ExperimentHeader = ({ config }) => {
  // Handle missing config gracefully
  if (!config) {
    return (
      <div className={`${responsive.card} ${responsive.spacing.md} mb-8`}>
        <div className={responsive.flexBetween}>
          <div>
            <h1 className={`${responsive.text3Xl} font-bold text-gray-800`}>
              Experiment Not Found
            </h1>
            <p className={`${responsive.textBase} text-gray-600`}>
              Invalid experiment configuration
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  const { mainExperiment, subExperiment } = config;
  
  return (
    <div className={`${responsive.card} ${responsive.spacing.md} mb-8`}>
      <div className={responsive.flexBetween}>
        <div>
          <div className="flex items-center mb-2">
            <span className="text-3xl mr-3">{mainExperiment?.icon || '🔬'}</span>
            <div>
              <h1 className={`${responsive.text3Xl} font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent`}>
                {mainExperiment?.name || 'Unknown Experiment'}
              </h1>
              <p className={`${responsive.textBase} text-gray-600`}>
                {mainExperiment?.description || 'No description available'}
              </p>
            </div>
          </div>
          {subExperiment && (
            <div className="flex items-center mt-4">
              <span className="text-2xl mr-2">{subExperiment.icon || '⚗️'}</span>
              <div>
                <h2 className={`${responsive.textXl} font-semibold text-gray-800`}>
                  {subExperiment.name || 'Unknown Sub-Experiment'}
                </h2>
                <p className={`${responsive.textSm} text-gray-600`}>
                  {subExperiment.description || 'No description available'}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${mainExperiment?.color || 'bg-gray-100 text-gray-800'} bg-opacity-10`}>
            <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: mainExperiment?.color || '#6B7280' }}></span>
            {mainExperiment?.category || 'Unknown Category'}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Responsive Grid Layout
 */
export const ResponsiveGrid = ({ children, cols = 'responsive', gap = 'md', className = '' }) => {
  const gridClass = {
    'responsive': responsive.gridResponsive,
    'default': responsive.grid,
    'small': responsive.gridSm
  }[cols] || responsive.grid;
  
  const gapClass = {
    'xs': 'gap-2',
    'sm': 'gap-4',
    'md': 'gap-6',
    'lg': 'gap-8'
  }[gap] || 'gap-6';
  
  return (
    <div className={`${gridClass} ${gapClass} ${className}`}>
      {children}
    </div>
  );
};

/**
 * Responsive Card Component
 */
export const ResponsiveCard = ({ 
  children, 
  variant = 'default', 
  padding = 'md', 
  className = '',
  onClick,
  hover = false 
}) => {
  const cardClass = hover ? responsive.cardHover : 
                   variant === 'sm' ? responsive.cardSm : 
                   responsive.card;
  
  const paddingClass = {
    'xs': responsive.spacing.xs,
    'sm': responsive.spacing.sm,
    'md': responsive.spacing.md,
    'lg': responsive.spacing.lg,
    'xl': responsive.spacing.xl
  }[padding] || responsive.spacing.md;
  
  const Component = onClick ? 'button' : 'div';
  
  return (
    <Component 
      className={`${cardClass} ${paddingClass} ${className}`}
      onClick={onClick}
      {...(onClick && { type: 'button' })}
    >
      {children}
    </Component>
  );
};

/**
 * Responsive Button Component
 */
export const ResponsiveButton = ({ 
  children, 
  variant = 'primary', 
  size = 'md',
  icon = null,
  loading = false,
  disabled = false,
  className = '',
  ...props 
}) => {
  const baseClasses = responsive.button;
  const variantClasses = {
    'primary': responsive.buttonPrimary,
    'secondary': responsive.buttonSecondary,
    'success': responsive.buttonSuccess,
    'danger': responsive.buttonDanger,
    'warning': responsive.buttonWarning
  }[variant] || responsive.buttonPrimary;
  
  const sizeClasses = {
    'sm': 'px-3 py-1.5 text-sm',
    'md': 'px-4 py-2 text-base',
    'lg': 'px-6 py-3 text-lg'
  }[size] || 'px-4 py-2 text-base';
  
  const stateClasses = (loading || disabled) ? 'opacity-50 cursor-not-allowed' : '';
  
  return (
    <button 
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${stateClasses} ${className}`}
      disabled={loading || disabled}
      {...props}
    >
      {loading && <FiRefreshCw className="animate-spin mr-2" />}
      {icon && !loading && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};

/**
 * Status Indicator Component
 */
export const StatusIndicator = ({ status, message, className = '' }) => {
  const statusConfig = {
    'running': { color: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
    'paused': { color: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    'stopped': { color: 'bg-gray-500', text: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' },
    'error': { color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
    'connected': { color: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
    'disconnected': { color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
    'idle': { color: 'bg-gray-500', text: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' }
  }[status] || {
    color: 'bg-gray-500',
    text: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200'
  };
  
  return (
    <div className={`flex items-center p-3 rounded-lg border ${statusConfig.bg} ${statusConfig.border} ${className}`}>
      <div className={`w-3 h-3 rounded-full ${statusConfig.color} mr-3 ${status === 'running' || status === 'connected' ? 'animate-pulse' : ''}`}></div>
      <span className={`font-medium ${statusConfig.text}`}>
        {message || status}
      </span>
    </div>
  );
};

/**
 * Loading Spinner Component
 */
export const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    'sm': 'w-4 h-4',
    'md': 'w-8 h-8',
    'lg': 'w-12 h-12'
  }[size] || 'w-8 h-8';
  
  return (
    <div className={`${responsive.flexCenter} ${className}`}>
      <div className={`${sizeClasses} animate-spin rounded-full border-4 border-gray-200 border-t-blue-600`}></div>
    </div>
  );
};

/**
 * Empty State Component
 */
export const EmptyState = ({ icon, title, description, action, className = '' }) => {
  return (
    <div className={`${responsive.flexCenter} ${responsive.container} h-96 ${className}`}>
      <div className="text-center">
        {icon && <div className="text-6xl mb-4">{icon}</div>}
        {title && (
          <h3 className={`${responsive.textXl} font-bold text-gray-800 mb-2`}>
            {title}
          </h3>
        )}
        {description && (
          <p className={`${responsive.textBase} text-gray-600 mb-6`}>
            {description}
          </p>
        )}
        {action && (
          <div>
            {action}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Error Fallback Component
 */
export const ErrorFallback = ({ error, resetError, className = '' }) => {
  return (
    <div className={`${responsive.flexCenter} ${responsive.container} h-96 ${className}`}>
      <div className="text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h3 className={`${responsive.textXl} font-bold text-red-800 mb-2`}>
          Something went wrong
        </h3>
        <p className={`${responsive.textBase} text-red-600 mb-4`}>
          {error?.message || 'An unexpected error occurred'}
        </p>
        {resetError && (
          <ResponsiveButton variant="danger" onClick={resetError}>
            Try Again
          </ResponsiveButton>
        )}
      </div>
    </div>
  );
};

/**
 * Responsive Modal Component
 */
export const ResponsiveModal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  
  const sizeClasses = {
    'sm': 'max-w-md',
    'md': 'max-w-lg',
    'lg': 'max-w-3xl',
    'xl': 'max-w-5xl',
    'full': 'max-w-[95vw]'
  }[size] || 'max-w-lg';
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${sizeClasses} max-h-[90vh] overflow-hidden`}>
        <div className="relative flex items-center justify-between p-6 border-b border-black/10 bg-gradient-to-r from-purple-600 via-purple-700 to-purple-800 modal-header-gradient">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={() => onClose && onClose()}
            className="text-white/80 hover:text-white transition-colors"
          >
            <FiX size={24} />
          </button>
          <span className="absolute inset-0 pointer-events-none">
            <span className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_8s_ease-in-out_infinite]"></span>
          </span>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {children}
        </div>
      </div>
    </div>
  );
};
