import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { checkEmailExists, updateUserPassword } from '../utils/localStorage'
import '../styles/ForgotPassword.css'

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()

  const handleEmailSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('Please enter your email')
      return
    }

    if (checkEmailExists(email)) {
      setStep(2)
    } else {
      setError('Email not found')
    }
  }

  const handlePasswordReset = (e) => {
    e.preventDefault()
    setError('')

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    updateUserPassword(email, newPassword)
    setSuccess('Password reset successful!')
    setTimeout(() => {
      navigate('/login')
    }, 2000)
  }

  return (
    <div className="forgot-container">
      <div className="forgot-card">
        <h1 className="forgot-title">Lab Expert</h1>
        <h2 className="forgot-subtitle">Reset Password</h2>
        
        {step === 1 ? (
          <form onSubmit={handleEmailSubmit} className="forgot-form">
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
              />
            </div>
            
            <button type="submit" className="forgot-button">
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordReset} className="forgot-form">
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="form-input"
              />
            </div>
            
            <button type="submit" className="forgot-button">
              Reset Password
            </button>
          </form>
        )}
        
        <div className="forgot-links">
          <Link to="/login" className="link">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword