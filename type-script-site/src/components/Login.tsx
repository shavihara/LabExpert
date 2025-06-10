// src/components/Login.tsx

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findUser, setCurrentUser } from '../utils/LocalStorage';
import type { FormSubmitEvent, InputChangeEvent } from '../types';
import '../styles/Login.css';



interface LoginFormProps {
  onSubmit: (email: string, password: string) => void;
}

const Login: React.FC<LoginFormProps> = ({ onSubmit }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  const handleSubmit = (e: FormSubmitEvent): void => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    const user = findUser(email, password);
    if (user) {
      setCurrentUser(user);
      navigate('/home');
    } else {
      setError('Invalid email or password');
    }
  };

  const handleEmailChange = (e: InputChangeEvent): void => {
    setEmail(e.target.value);
  };

  const handlePasswordChange = (e: InputChangeEvent): void => {
    setPassword(e.target.value);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Lab Expert</h1>
        <h2 className="login-subtitle">Welcome Back</h2>
        
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="Enter your email"
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="Enter your password"
              className="form-input"
            />
          </div>
          
          <button type="submit" className="login-button">
            Login
          </button>
        </form>
        
        <div className="login-links">
          <Link to="/forgot-password" className="link">
            Forgot Password?
          </Link>
          <p className="signup-text">
            Don't have an account? 
            <Link to="/signup" className="link"> Sign Up</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;