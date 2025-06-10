// src/components/Home.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, logout } from '../utils/LocalStorage';
import type { LocalStorageUser, ButtonClickEvent } from '../types';
import '../styles/Home.css';

const Home: React.FC = () => {
  const [user, setUser] = useState<LocalStorageUser | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      navigate('/login');
    } else {
      setUser(currentUser);
    }
  }, [navigate]);

  const handleLogout = (e: ButtonClickEvent): void => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="home-container">
      <nav className="navbar">
        <h1 className="nav-title">Lab Expert</h1>
        <div className="nav-actions">
          <span className="welcome-text">Welcome, {user.name}!</span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </nav>
      
      <main className="home-content">
        <div className="empty-state">
          <h2>Welcome to Lab Expert</h2>
          <p>Your laboratory management system</p>
          <div className="placeholder-icon">🧪</div>
          <p className="placeholder-text">
            This is your dashboard. Future features will be added here.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Home;