import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findUser, getCurrentUser } from '../utils/api';

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
      const response = await findUser(email, password);
      console.log('findUser response:', response);
      if (response && response.success) {
        const user = response.user;
        localStorage.setItem('user', JSON.stringify(user));
        console.log('Stored user:', user);
        console.log('Stored token:', localStorage.getItem('token'));

        const currentUser = await getCurrentUser();
        console.log('getCurrentUser response:', currentUser);
        if (currentUser) {
          setCurrentUser(currentUser);

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
    <div className="auth-container min-h-[calc(100vh-var(--header-height))] pt-[var(--header-height)] px-8 sm:px-12 lg:px-20 xl:px-28 flex items-center justify-center bg-gradient-to-br from-purple-500 via-purple-600 to-purple-800 relative overflow-auto">

      <div className="auth-card bg-white/95 backdrop-blur-xl p-6 md:p-10 rounded-3xl shadow-2xl border border-white/20 w-full max-w-lg mx-4 animate-[fadeSlideUp_1s_ease-out_0.1s_forwards] opacity-0">
        <h1 className="auth-heading text-center text-purple-600 text-3xl md:text-4xl mb-1 md:mb-2 font-extrabold">
          Lab Expert
        </h1>
        <h2 className="auth-subheading text-center text-gray-600 text-base md:text-xl mb-6 md:mb-8 font-normal">
          Welcome Back
        </h2>

        <form onSubmit={handleSubmit} className="auth-form flex flex-col gap-4 md:gap-6">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg border border-red-200 text-sm text-center">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-gray-700 font-semibold text-sm">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="auth-input w-full px-4 py-3 md:py-3.5 border-2 border-gray-200 rounded-lg text-base transition-all duration-300 bg-white focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
              aria-label="Email"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-gray-700 font-semibold text-sm">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="auth-input w-full px-4 py-3 md:py-3.5 border-2 border-gray-200 rounded-lg text-base transition-all duration-300 bg-white focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
              aria-label="Password"
            />
          </div>

          <button
            type="submit"
            className="auth-button bg-gradient-to-br from-purple-600 to-purple-800 text-white px-4 py-3 md:py-4 rounded-xl text-base font-bold cursor-pointer transition-all duration-300 mt-2 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-purple-500/30 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            disabled={loading}
            aria-label="Login"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 text-center pt-4 border-t border-gray-200">
          <Link
            to="/forgot-password"
            className="text-purple-600 no-underline font-semibold transition-all duration-300 hover:text-purple-700 hover:underline"
          >
            Forgot Password?
          </Link>
          <p className="text-gray-500 mt-4">
            Don't have an account?
            <Link
              to="/signup"
              className="text-purple-600 no-underline font-semibold transition-all duration-300 hover:text-purple-700 hover:underline ml-1"
            >
              Sign Up
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (max-height: 740px) {
          .auth-card { padding: 18px; }
          .auth-card { max-width: 24rem; border-radius: 18px; }
          .auth-heading { font-size: 1.75rem; }
          .auth-subheading { font-size: 1rem; margin-bottom: 1rem; }
          .auth-form { gap: 14px; }
          .auth-input { padding: 10px 14px; font-size: 0.95rem; }
          .auth-button { padding: 10px 14px; }
        }
        @media (max-height: 620px) {
          .auth-card { padding: 14px; max-width: 22rem; border-radius: 16px; }
          .auth-heading { font-size: 1.5rem; }
          .auth-subheading { font-size: 0.95rem; margin-bottom: 0.75rem; }
          .auth-form { gap: 12px; }
          .auth-input { padding: 8px 12px; font-size: 0.9rem; }
          .auth-button { padding: 9px 12px; }
        }
      `}</style>
    </div>
  );
}

export default Login;
