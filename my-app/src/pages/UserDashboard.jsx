import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import pendulumGif from '../assets/images/pendulum.gif';
import { useTheme } from '../context/ThemeContext';
import { logoutUser } from '../utils/api';
import {
  LayoutDashboard,
  FlaskConical,
  History,
  User,
  Settings,
  FileText,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  Search,
  Bell,
  ChevronRight,
  Activity,
  Thermometer,
  Ruler,
  Zap,
  Volume2,
  Download
} from 'lucide-react';

import { 
  ResponsiveButton, 
  LogoutLoading 
} from '../components/ui-system/ResponsiveUI';
import SensorProvisioning from './SensorProvisioning';

function UserDashboard() {
  const [activeSection, setActiveSection] = useState('experiments');
  const [sensorMode, setSensorMode] = useState('menu'); // 'menu', 'add', 'calibration'
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [experiments, setExperiments] = useState([]);
  const [recentExperiments, setRecentExperiments] = useState([]);
  const [userProfile, setUserProfile] = useState({});
  const [loading, setLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);
  
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // Get current user
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const userToken = localStorage.getItem('token');
  
  // Initialize WebSocket connection
  const { sendMessage, isConnected } = useWebSocket(userToken, true);

  // Available experiments
  const availableExperiments = [
    {
      id: 1,
      name: 'Motion Analysis',
      description: 'Analyze Displacement, Velocity, Acceleration',
      icon: <Ruler className="w-8 h-8" />,
      difficulty: 'Available',
      duration: '15+ min',
      category: 'Kinamatics',
      color: 'bg-indigo-500'
    },
    {
      id: 2,
      name: 'Oscillation Analysis',
      description: 'Analyze oscillation counts and measure frequency',
      icon: pendulumGif, // Keeping the GIF
      difficulty: 'Available',
      duration: '25+ min',
      category: 'Kinamatics',
      color: 'bg-emerald-500'
    },
    {
      id: 3,
      name: 'Temperature Monitoring',
      description: 'Monitor temperature changes over the time',
      icon: <Thermometer className="w-8 h-8" />,
      difficulty: 'Unavailable',
      duration: '20+ min',
      category: 'Environmental',
      color: 'bg-red-500'
    },
    {
      id: 4,
      name: 'Light Intensity Analysis',
      description: 'Analyze light intensity variations in various conditions',
      icon: <Zap className="w-8 h-8" />,
      difficulty: 'Available',
      duration: '18+ min',
      category: 'Optics',
      color: 'bg-amber-500'
    },
    {
      id: 5,
      name: 'Motion Analysis (AI)',
      description: 'Detect and track motion patterns using Video Analysis',
      icon: <Activity className="w-8 h-8" />,
      difficulty: 'Available',
      duration: '35+ min',
      category: 'Kinamatics',
      color: 'bg-purple-500'
    },
    {
      id: 6,
      name: 'Sound Wave Analysis',
      description: 'Analyze sound frequencies and amplitudes',
      icon: <Volume2 className="w-8 h-8" />,
      difficulty: 'Unavailable',
      duration: '30+ min',
      category: 'Waves',
      color: 'bg-cyan-500'
    }
  ];

  // Recent experiments (dummy data)
  const recentExperimentsData = [
    {
      id: 1,
      name: 'Distance Measure',
      date: '2024-06-18',
      status: 'Completed',
      result: 'Success',
      duration: '14 min'
    },
    {
      id: 2,
      name: 'Temperature Monitoring',
      date: '2024-06-17',
      status: 'Completed',
      result: 'Success',
      duration: '19 min'
    },
    {
      id: 3,
      name: 'Oscillation Counter',
      date: '2024-06-16',
      status: 'In Progress',
      result: 'Pending',
      duration: '12 min'
    }
  ];

  // Usage statistics (dummy data)
  const usageStats = {
    totalExperiments: 24,
    completedExperiments: 21,
    totalTime: '8h 45m',
    averageScore: 87,
    weeklyProgress: [65, 78, 82, 75, 89, 91, 87]
  };

  // Handle PWA install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      try { searchInputRef.current.focus(); } catch {}
    }
  }, [isSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchResults([]);
      setHighlightIndex(-1);
      return;
    }
    const idMatch = q.startsWith('id:') ? q.slice(3).trim() : q.startsWith('#') ? q.slice(1).trim() : (/^\d+$/.test(q) ? q : null);
    const results = experiments
      .map((e) => {
        const name = (e.name || '').toLowerCase();
        let score = 0;
        let matchStart = -1;
        if (idMatch && e.id.toString() === idMatch) {
          score = 100;
        } else if (name.startsWith(q)) {
          score = 80;
          matchStart = 0;
        } else if (name.includes(q)) {
          score = 60;
          matchStart = name.indexOf(q);
        } else if (e.id.toString().includes(q)) {
          score = 50;
        }
        return { e, score, matchStart };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
      .slice(0, 8);
    setSearchResults(results);
    setHighlightIndex(results.length ? 0 : -1);
  }, [searchQuery, experiments]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User ${outcome === 'accepted' ? 'accepted' : 'dismissed'} the install prompt`);
      setDeferredPrompt(null);
      setShowInstallButton(false);
    }
  };

  useEffect(() => {
    // Simulate loading user data
    setTimeout(() => {
      setExperiments(availableExperiments);
      setRecentExperiments(recentExperimentsData);
      setUserProfile(currentUser);
      setLoading(false);
    }, 1000);
  }, []);

  // Detect when user navigates back to dashboard and trigger device disconnection
  useEffect(() => {
    if (isConnected && currentUser.id) {
      console.log('User navigated back to dashboard - triggering device disconnection');
      sendMessage({
        action: 'dashboard_navigation',
        user_id: currentUser.id
      });
    }
  }, []);

  const startExperiment = (experiment) => {
    if (experiment.difficulty !== 'Available') {
      alert('This experiment is currently unavailable');
      return;
    }
    
    // Create a serializable copy of the experiment object (exclude React elements like icon)
    const { icon, ...serializableExperiment } = experiment;
    
    navigate(`/experiment/${experiment.id}`, {
      state: { experiment: serializableExperiment }
    });
  };

  const downloadReport = (type) => {
    console.log('Downloading', type, 'report');
    alert(`Downloading ${type} report...`);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    // Artificial delay for animation
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      await logoutUser();
    } finally {
      localStorage.removeItem('user');
      navigate('/login');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">Loading your lab dashboard...</p>
        </div>
      </div>
    );
  }

  const NavItem = ({ id, icon, label }) => (
    <button
      onClick={() => {
        setActiveSection(id);
        setIsSidebarOpen(false);
      }}
      className={`w-full flex items-center space-x-3 px-6 py-3 transition-colors duration-200 ${
        activeSection === id
          ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-r-4 border-indigo-600 dark:border-indigo-400'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      {isLoggingOut && <LogoutLoading />}
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Logo Area */}
          <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              LabExpert
            </h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-6 space-y-1 overflow-y-auto">
            <NavItem id="experiments" icon={<FlaskConical size={20} />} label="Experiments" />
            <NavItem id="recent" icon={<History size={20} />} label="Recent Activity" />
            <NavItem id="profile" icon={<User size={20} />} label="Profile" />
            <NavItem id="sensors" icon={<Settings size={20} />} label="Sensors" />
            <NavItem id="reports" icon={<FileText size={20} />} label="Reports" />
          </nav>

          {/* User Info & Logout */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {currentUser.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {currentUser.email || 'user@example.com'}
                </p>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white dark:bg-gray-800 shadow-sm z-10 flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 md:hidden"
            >
              <Menu size={24} />
            </button>
            <h2 className="ml-3 md:ml-0 text-xl font-semibold text-gray-800 dark:text-white capitalize">
              {activeSection.replace('-', ' ')}
            </h2>
          </div>

          <div className="flex items-center space-x-4">
            <div className="relative" ref={searchRef}>
              <button
                onClick={() => setIsSearchOpen((v) => !v)}
                className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Search size={20} />
              </button>
              {isSearchOpen && (
                <div className="absolute right-0 top-10 w-80 sm:w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3">
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightIndex((i) => Math.min(i + 1, searchResults.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightIndex((i) => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter') {
                        if (highlightIndex >= 0 && searchResults[highlightIndex]) {
                          startExperiment(searchResults[highlightIndex].e);
                          setIsSearchOpen(false);
                          setSearchQuery('');
                        }
                      } else if (e.key === 'Escape') {
                        setIsSearchOpen(false);
                        setSearchQuery('');
                      }
                    }}
                    placeholder="Search experiments by name or ID"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="mt-2 max-h-64 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No results</div>
                    ) : (
                      searchResults.map((r, idx) => (
                        <button
                          key={r.e.id}
                          onClick={() => {
                            startExperiment(r.e);
                            setIsSearchOpen(false);
                            setSearchQuery('');
                          }}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                            idx === highlightIndex
                              ? 'bg-indigo-50 dark:bg-indigo-900/30'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <div className="p-2 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
                            {typeof r.e.icon === 'string' && (r.e.icon.includes('.gif') || r.e.icon.includes('.png')) ? (
                              <img src={r.e.icon} alt={r.e.name} className="w-6 h-6 object-contain" />
                            ) : (
                              r.e.icon
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {(() => {
                                  const name = r.e.name || '';
                                  const lower = name.toLowerCase();
                                  const q = searchQuery.trim().toLowerCase();
                                  if (r.matchStart >= 0) {
                                    const pre = name.slice(0, r.matchStart);
                                    const mid = name.slice(r.matchStart, r.matchStart + q.length);
                                    const post = name.slice(r.matchStart + q.length);
                                    return (
                                      <span>
                                        <span>{pre}</span>
                                        <span className="text-indigo-600 dark:text-indigo-400">{mid}</span>
                                        <span>{post}</span>
                                      </span>
                                    );
                                  }
                                  return name;
                                })()}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">#{r.e.id}</span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {r.e.category} • {r.e.duration} • {r.e.difficulty}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        {/* Scrollable Main Area */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
          
          {/* Experiments Section */}
          {activeSection === 'experiments' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Available Experiments</h3>
                  <p className="text-gray-500 dark:text-gray-400">Choose an experiment to get started</p>
                </div>
                <div className="flex gap-2">
                  <select className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500">
                    <option>All Categories</option>
                    <option>Physics</option>
                    <option>Chemistry</option>
                    <option>Biology</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {experiments.map((experiment) => (
                  <div
                    key={experiment.id}
                    className="group bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-xl border border-gray-200 dark:border-gray-700 transition-all duration-300 overflow-hidden"
                  >
                    <div className={`h-2 w-full ${experiment.color}`}></div>
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
                          {typeof experiment.icon === 'string' && (experiment.icon.includes('.gif') || experiment.icon.includes('.png')) ? (
                            <img src={experiment.icon} alt={experiment.name} className="w-8 h-8 object-contain" />
                          ) : (
                            experiment.icon
                          )}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          experiment.difficulty === 'Available' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {experiment.difficulty}
                        </span>
                      </div>
                      
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {experiment.name}
                      </h4>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                        {experiment.description}
                      </p>
                      
                      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-6">
                        <span className="flex items-center gap-1">
                          <History size={14} />
                          {experiment.duration}
                        </span>
                        <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-xs font-medium">
                          {experiment.category}
                        </span>
                      </div>

                      <button
                        onClick={() => startExperiment(experiment)}
                        className={`w-full py-2.5 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                          experiment.difficulty === 'Available'
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                        disabled={experiment.difficulty !== 'Available'}
                      >
                        {experiment.difficulty === 'Available' ? 'Start Experiment' : 'Unavailable'}
                        {experiment.difficulty === 'Available' && <ChevronRight size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity Section */}
          {activeSection === 'recent' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Experiments', value: usageStats.totalExperiments, icon: <FlaskConical className="text-blue-500" />, color: 'bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Completed', value: usageStats.completedExperiments, icon: <Activity className="text-green-500" />, color: 'bg-green-50 dark:bg-green-900/20' },
                  { label: 'Total Time', value: usageStats.totalTime, icon: <History className="text-purple-500" />, color: 'bg-purple-50 dark:bg-purple-900/20' },
                  { label: 'Avg Score', value: `${usageStats.averageScore}%`, icon: <Zap className="text-amber-500" />, color: 'bg-amber-50 dark:bg-amber-900/20' },
                ].map((stat, index) => (
                  <div key={index} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-3 rounded-lg ${stat.color}`}>
                        {stat.icon}
                      </div>
                      <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">
                        +12%
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Recent History</h3>
                <div className="space-y-4">
                  {recentExperiments.map((experiment) => (
                    <div key={experiment.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                          <FlaskConical size={20} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">{experiment.name}</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {new Date(experiment.date).toLocaleDateString()} • {experiment.duration}
                          </p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        experiment.status === 'Completed'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {experiment.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Profile Section */}
          {activeSection === 'profile' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
                <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
                  <div className="w-24 h-24 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                    {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="text-center md:text-left">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{currentUser.name || 'User Name'}</h2>
                    <p className="text-gray-500 dark:text-gray-400">{currentUser.email || 'user@example.com'}</p>
                    <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-2">
                      <span className="px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-sm font-medium">
                        Student
                      </span>
                      <span className="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-sm font-medium">
                        Level 5
                      </span>
                    </div>
                  </div>
                  <button className="md:ml-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">
                    Edit Profile
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Personal Information</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                        <input 
                          type="text" 
                          value={currentUser.name || ''} 
                          readOnly 
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                        <input 
                          type="email" 
                          value={currentUser.email || ''} 
                          readOnly 
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Preferences</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                        <span className="text-gray-700 dark:text-gray-300">Email Notifications</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" defaultChecked />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                        <span className="text-gray-700 dark:text-gray-300">Dark Mode</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={theme === 'dark'}
                            onChange={toggleTheme}
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                      {showInstallButton && (
                         <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                         <span className="text-gray-700 dark:text-gray-300">Install App</span>
                         <button
                           onClick={handleInstallClick}
                           className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                         >
                           Install
                         </button>
                       </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sensors Section */}
          {/* Sensors Section */}
          {activeSection === 'sensors' && (
            <div className="space-y-6">
              {sensorMode === 'menu' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button 
                    onClick={() => setSensorMode('add')}
                    className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-indigo-500 dark:hover:border-indigo-500 transition-all duration-300 group"
                  >
                    <div className="p-4 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
                      <Settings size={48} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Add New Sensor Module</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-center">Configure and provision new sensor modules via Bluetooth</p>
                  </button>

                  <button 
                    onClick={() => setSensorMode('calibration')}
                    className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-indigo-500 dark:hover:border-indigo-500 transition-all duration-300 group"
                  >
                    <div className="p-4 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                      <Activity size={48} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sensor Calibration</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-center">View status and calibrate existing sensors</p>
                  </button>
                </div>
              )}

              {sensorMode === 'add' && (
                <div className="space-y-4">
                  <button 
                    onClick={() => setSensorMode('menu')}
                    className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <ChevronRight className="rotate-180" size={20} />
                    Back to Menu
                  </button>
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <SensorProvisioning token={userToken} />
                  </div>
                </div>
              )}

              {sensorMode === 'calibration' && (
                <div className="space-y-4">
                  <button 
                    onClick={() => setSensorMode('menu')}
                    className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <ChevronRight className="rotate-180" size={20} />
                    Back to Menu
                  </button>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[
                      { name: 'TOF Distance', icon: <Ruler />, status: 'Online', range: '5cm - 800cm', accuracy: '±3mm' },
                      { name: 'Ultrasonic', icon: <Activity />, status: 'Online', range: '5cm - 100cm', accuracy: '±4mm' },
                      { name: 'Temperature', icon: <Thermometer />, status: 'Online', range: '-40°C to 85°C', accuracy: '±0.5°C' },
                      { name: 'Light Sensor', icon: <Zap />, status: 'Offline', range: '0-65535 lux', accuracy: '±10%' },
                      { name: 'Sound Sensor', icon: <Volume2 />, status: 'Online', range: '30dB - 130dB', accuracy: '20Hz - 20kHz' },
                    ].map((sensor, index) => (
                      <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                            {sensor.icon}
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            sensor.status === 'Online'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {sensor.status}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{sensor.name}</h3>
                        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-6">
                          <p>Range: {sensor.range}</p>
                          <p>Accuracy: {sensor.accuracy}</p>
                        </div>
                        <button 
                          className={`w-full py-2 rounded-lg font-medium transition-colors ${
                            sensor.status === 'Online'
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                          }`}
                          disabled={sensor.status !== 'Online'}
                        >
                          Calibrate
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reports Section */}
          {activeSection === 'reports' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { title: 'Experiment Summary', desc: 'Comprehensive report of all your experiments', icon: <FileText /> },
                { title: 'Performance Analytics', desc: 'Detailed performance metrics and trends', icon: <Activity /> },
                { title: 'Raw Data Export', desc: 'Export raw sensor data in CSV format', icon: <LayoutDashboard /> },
                { title: 'Custom Report', desc: 'Generate custom reports with specific parameters', icon: <Settings /> },
              ].map((report, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col items-center text-center hover:shadow-md transition-shadow">
                  <div className="p-4 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 mb-4">
                    {React.cloneElement(report.icon, { size: 32 })}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{report.title}</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">{report.desc}</p>
                  <button 
                    onClick={() => downloadReport(report.title.toLowerCase().replace(' ', '-'))}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <Download size={18} />
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

export default UserDashboard;
