import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { saveUser, checkEmailExists } from '../utils/api';

function Signup() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { name, email, password, confirmPassword } = formData;

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const emailExists = await checkEmailExists(email);
      if (emailExists) {
        setError('Email already exists');
        setLoading(false);
        return;
      }

      await saveUser({ name, email, password });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container min-h-[calc(100vh-var(--header-height))] pt-[var(--header-height)] px-8 sm:px-12 lg:px-20 xl:px-28 flex items-center justify-center bg-gradient-to-br from-purple-500 via-purple-600 to-purple-800 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 relative overflow-auto">
      <div className="auth-card bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl p-6 md:p-10 rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700 w-full max-w-lg mx-4 animate-[fadeSlideUp_1s_ease-out_0.1s_forwards] opacity-0">
        <h1 className="auth-heading text-center text-purple-600 dark:text-purple-400 text-3xl md:text-4xl mb-0 font-extrabold">
          Lab Expert
        </h1>
        <h2 className="auth-subheading text-center text-gray-600 dark:text-gray-300 text-base md:text-xl mb-1 font-normal">
          Create Account
        </h2>

        <form onSubmit={handleSubmit} className="auth-form flex flex-col gap-3 md:gap-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg border border-red-200 dark:border-red-800 text-sm text-center">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-gray-700 dark:text-gray-300 font-semibold text-sm">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter your full name"
              className="auth-input w-full px-4 py-3 md:py-3.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base transition-all duration-300 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-600 dark:focus:border-purple-400 focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900/30 placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-gray-700 dark:text-gray-300 font-semibold text-sm">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              className="auth-input w-full px-4 py-3 md:py-3.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base transition-all duration-300 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-600 dark:focus:border-purple-400 focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900/30 placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-gray-700 dark:text-gray-300 font-semibold text-sm">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Create a password"
              className="auth-input w-full px-4 py-3 md:py-3.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base transition-all duration-300 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-600 dark:focus:border-purple-400 focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900/30 placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="confirmPassword" className="text-gray-700 dark:text-gray-300 font-semibold text-sm">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              className="auth-input w-full px-4 py-3 md:py-3.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base transition-all duration-300 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-600 dark:focus:border-purple-400 focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900/30 placeholder:text-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="auth-button bg-gradient-to-br from-purple-600 to-purple-800 text-white px-4 py-3 md:py-4 rounded-xl text-base font-bold cursor-pointer transition-all duration-300 mt-2 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-purple-500/30 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">
            Already have an account?
            <Link
              to="/login"
              className="text-purple-600 dark:text-purple-400 no-underline font-semibold transition-all duration-300 hover:text-purple-700 dark:hover:text-purple-300 hover:underline ml-1"
            >
              Login
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
          .auth-card { padding: 18px; max-width: 24rem; border-radius: 18px; }
          .auth-heading { font-size: 1.75rem; }
          .auth-subheading { font-size: 1rem; }
          .auth-form { gap: 14px; }
          .auth-input { padding: 10px 14px; font-size: 0.95rem; }
          .auth-button { padding: 10px 14px; }
        }
        @media (max-height: 620px) {
          .auth-card { padding: 14px; max-width: 22rem; border-radius: 16px; }
          .auth-heading { font-size: 1.5rem; }
          .auth-subheading { font-size: 0.95rem; }
          .auth-form { gap: 12px; }
          .auth-input { padding: 8px 12px; font-size: 0.9rem; }
          .auth-button { padding: 9px 12px; }
        }
      `}</style>
    </div>
  );
}

export default Signup;
