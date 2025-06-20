import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findUser, getCurrentUser } from '../utils/api';
import '../styles/Login.css';



function Login({ setCurrentUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await findUser(email, password);
      console.log('findUser user:', user); // Debug log
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
        console.log('Stored user:', user); // Debug log
        console.log('Stored token:', localStorage.getItem('token')); // Debug log

        // Update app state
        const currentUser = await getCurrentUser();
        console.log('getCurrentUser response:', currentUser); // Debug log
        if (currentUser) {
          setCurrentUser(currentUser);

          // Navigate based on email
          if (currentUser.email === 'labexpert.us@gmail.com') {
            console.log('Redirecting to /admin for:', currentUser.email);
            navigate('/admin', { replace: true });
          } else {
            console.log('Redirecting to /home for:', currentUser.email);
            navigate('/home', { replace: true });
          }
        } else {
          setError('Failed to fetch user data. Please try again.');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } else {
        setError('Invalid email or password');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error.message.includes('database is locked')) {
        setError('System is busy. Please try again in a few seconds.');
      } else {
        setError(error.response?.data?.message || 'Login failed. Please try again.');
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
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
              aria-label="Email"
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
              aria-label="Password"
            />
          </div>
          
          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
            aria-label="Login"
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