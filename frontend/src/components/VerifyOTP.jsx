// Deprecated: Functionality moved to ForgotPassword.jsx
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/VerifyOTP.css';

function VerifyOTP() {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(600); // 10 minutes
  const navigate = useNavigate();

  useEffect(() => {
    let interval = null;
    if (timeRemaining > 0) {
      interval = setInterval(() => setTimeRemaining((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timeRemaining]);

  const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Simulate OTP verification
    if (otp === '123456') {
      setSuccess('OTP verified! Redirecting to reset password...');
      setTimeout(() => navigate('/reset-password'), 2000);
    } else {
      setError('Invalid OTP');
    }
    setLoading(false);
  };

  return (
    <div className="verify-otp-container">
      <div className="verify-otp-card">
        <h1 className="verify-otp-title">Lab Expert</h1>
        <h2 className="verify-otp-subtitle">Verify OTP</h2>
        <form onSubmit={handleSubmit} className="verify-otp-form">
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          <p className="otp-info">Enter the 6-digit code sent to your email</p>
          <div className="form-group">
            <label htmlFor="otp">OTP</label>
            <div className="otp-container">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <input
                  key={i}
                  type="text"
                  className="otp-box"
                  value={otp[i] || ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 1) {
                      const newOtp = otp.split('');
                      newOtp[i] = val;
                      setOtp(newOtp.join(''));
                      if (val && i < 5) document.querySelector(`.otp-box:nth-child(${i + 2})`).focus();
                    }
                  }}
                  maxLength="1"
                />
              ))}
            </div>
          </div>
          <p className="otp-timer">Time remaining: {formatTime(timeRemaining)}</p>
          <button type="submit" className="verify-otp-button" disabled={loading || timeRemaining === 0}>
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
          <div className="verify-otp-links">
            <Link to="/forgot-password" className="link">Resend OTP</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default VerifyOTP;