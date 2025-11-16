import React, { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import ErrorBoundary from '../components/common/ErrorBoundary';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { ToastContainer } from '../components/common/Toast';
import { useAuthStore } from '../stores/authStore';

// Lazy load main components for better performance
const AppRoutes = React.lazy(() => import('./AppRoutes'));
const Navigation = React.lazy(() => import('./Navigation'));

const AppWrapper = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          {/* Global loading indicator */}
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center">
                <LoadingSpinner size="large" />
                <span className="ml-3 text-gray-600">Loading application...</span>
              </div>
            }
          >
            {/* Navigation - only show if authenticated */}
            {isAuthenticated && <Navigation />}
            
            {/* Main application routes */}
            <main className={isAuthenticated ? 'pt-16' : ''}>
              <AppRoutes />
            </main>
          </Suspense>
          
          {/* Global toast notifications */}
          <ToastContainer />
          
          {/* Performance monitoring (development only) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="fixed bottom-4 right-4 z-50">
              <PerformanceMonitor />
            </div>
          )}
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

// Simple performance monitor component
const PerformanceMonitor = () => {
  const [metrics, setMetrics] = React.useState({
    memory: 0,
    fps: 0,
    renderTime: 0
  });

  React.useEffect(() => {
    const updateMetrics = () => {
      if (performance.memory) {
        setMetrics(prev => ({
          ...prev,
          memory: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
        }));
      }
    };

    const interval = setInterval(updateMetrics, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gray-800 text-white text-xs p-2 rounded shadow-lg opacity-75">
      <div>Memory: {metrics.memory}MB</div>
      <div>FPS: {metrics.fps}</div>
      <div>Render: {metrics.renderTime}ms</div>
    </div>
  );
};

export default AppWrapper;