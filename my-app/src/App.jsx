import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/Signup';
import ForgotPassword from './components/ForgotPassword';
import Home from './components/Home';
import Header from './components/Header';
import { ToastContainer } from './components/common/Toast';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import AdminChangePassword from './components/AdminChangePassword';
import AdminManage from './pages/AdminManage';
import AdminPrivateRoute from './components/AdminPrivateRoute';
import UserDashboard from './pages/UserDashboard';
import ExperimentInterface from './pages/ExperimentInterface';
import OSIInterface from './components/OSIInterface';
import ExperimentRouter from './ExperimentRouter';
import PrivateRoute from './components/PrivateRoute';
import { getCurrentUser, bootstrapDevAuth } from './utils/api';
import { ThemeProvider } from './context/ThemeContext';
import { FullscreenProvider } from './context/FullscreenContext';
import './App.css';
import SensorProvisioning from './pages/SensorProvisioning';
import ProgramSensor from './pages/ProgramSensor';
import About from './pages/About';

function AppContent() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // Define which routes are auth pages
  const isAuthPage = ['/login', '/signup', '/forgot-password'].includes(location.pathname);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // In development, bootstrap a dev token if none exists
        if (import.meta.env.DEV) {
          const token = localStorage.getItem('token');
          if (!token || token === 'undefined' || token === null) {
            console.log('🧪 Dev mode: bootstrapping auth...');
            await bootstrapDevAuth();
          }
        }

        console.log('🎯 App: Fetching current user...');
        const user = await getCurrentUser();
        console.log('🎯 App: Current user:', user);
        setCurrentUser(user);
      } catch (error) {
        console.error('❌ App: Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    const onCollapse = () => setIsHeaderCollapsed(true);
    const onExpand = () => setIsHeaderCollapsed(false);
    window.addEventListener('labex:header:collapse', onCollapse);
    window.addEventListener('labex:header:expand', onExpand);
    return () => {
      window.removeEventListener('labex:header:collapse', onCollapse);
      window.removeEventListener('labex:header:expand', onExpand);
    };
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '1.5rem'
      }}>
        Loading App...
      </div>
    );
  }

  const isDashboard = location.pathname === '/dashboard';

  return (
    <div className="app">
      <Header />
      {/* ADD MAIN WRAPPER HERE:
        This <main> tag adds padding-top to offset the fixed Header.
        It uses 'pt-20' (80px) for auth pages and 'pt-[70px]' (70px) for all other pages,
        matching the heights defined in your Header.jsx.
      */}
      <main className={`${isAuthPage ? 'pt-[var(--header-height)]' : 'pt-[var(--header-height)]'} transition-all duration-300`}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login setCurrentUser={setCurrentUser} />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/about" element={<About />} />
          <Route
            path="/home"
            element={
              <PrivateRoute>
                <Home />
              </PrivateRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <UserDashboard />
              </PrivateRoute>
            }
          />

          {/* Dynamic route for experiments - This handles /experiment/1, /experiment/2, etc. */}
          <Route
            path="/experiment/:id"
            element={
              <PrivateRoute>
                <ExperimentRouter />
              </PrivateRoute>
            }
          />

          {/* Keep the old /experiment route for backward compatibility */}
          <Route
            path="/experiment"
            element={
              <PrivateRoute>
                <ExperimentInterface />
              </PrivateRoute>
            }
          />

          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/change-password" element={<AdminChangePassword />} />
          <Route
            path="/admin/manage"
            element={
              <AdminPrivateRoute>
                <AdminManage />
              </AdminPrivateRoute>
            }
          />
          <Route
            path="/sensor"
            element={
              <PrivateRoute>
                <SensorProvisioning token={localStorage.getItem('token')} />
              </PrivateRoute>
            }
          />
          <Route
            path="/sensor/program"
            element={
              <PrivateRoute>
                <ProgramSensor token={localStorage.getItem('token')} />
              </PrivateRoute>
            }
          />
        </Routes>
      </main>
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <FullscreenProvider>
        <AppContent />
      </FullscreenProvider>
    </ThemeProvider>
  );
}

export default App;
