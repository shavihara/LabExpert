import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findUser } from '../utils/api';
import '../styles/Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  //const handleSubmit = async (e) => {
  const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);
  
  try {
    const response = await findUser(email, password);
    
    if (response) {
      // Store user data with role
      localStorage.setItem('user', JSON.stringify(response));
      
      // Navigate based on role
      if (response.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/home');
      }
    }
  } catch (error) {
    setError(error.response?.data?.message || 'Login failed');
  } finally {
    setLoading(false);
  }
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
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="form-input"
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="form-input"
              disabled={loading}
            />
          </div>
          
          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
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
}

export default Login;