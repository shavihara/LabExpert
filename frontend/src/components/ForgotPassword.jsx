import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { checkEmailExists, updateUserPassword } from '../utils/localStorage'
import '../styles/ForgotPassword.css'

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step, setStep] = useState(1) // 1: Email, 2: OTP, 3: Password Reset
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [generatedOtp, setGeneratedOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [otpExpiry, setOtpExpiry] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(0) // New state for timer
  const navigate = useNavigate()

  // API base URL - adjust according to your backend
  const API_BASE_URL = 'http://localhost:5000/api'

  // Timer countdown effect
  useEffect(() => {
    let interval = null
    
    if (otpExpiry && step === 2) {
      interval = setInterval(() => {
        const now = new Date()
        const remaining = Math.max(0, Math.floor((otpExpiry - now) / 1000))
        setTimeRemaining(remaining)
        
        if (remaining === 0) {
          clearInterval(interval)
        }
      }, 1000)
    }
    
    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [otpExpiry, step])

  // Format time display
  const formatTime = (seconds) => {
    if (seconds === 0) return 'Expired'
    
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // Generate 6-digit OTP
  const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  // Send OTP via Gmail
  const sendOtpEmail = async (email, otpCode) => {
    try {
      setLoading(true)
      setError('')

      const response = await fetch(`${API_BASE_URL}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          otp: otpCode
        })
      })

      const data = await response.json()

      if (data.success) {
        console.log('OTP sent successfully:', data.messageId)
        setSuccess('OTP sent to your email!')
        
        // Set OTP expiry (10 minutes from now)
        const expiryTime = new Date()
        expiryTime.setMinutes(expiryTime.getMinutes() + 10)
        setOtpExpiry(expiryTime)
        
        return true
      } else {
        throw new Error(data.message || 'Failed to send OTP')
      }
    } catch (error) {
      console.error('Error sending OTP:', error)
      setError(`Failed to send OTP: ${error.message}`)
      return false
    } finally {
      setLoading(false)
    }
  }

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!email) {
      setError('Please enter your email')
      return
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    if (checkEmailExists(email)) {
      const otpCode = generateOtp()
      setGeneratedOtp(otpCode)
      
      const emailSent = await sendOtpEmail(email, otpCode)
      if (emailSent) {
        setStep(2)
      }
    } else {
      setError('Email not found in our records')
    }
  }

  const handleOtpSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!otp) {
      setError('Please enter the OTP')
      return
    }

    if (otp.length !== 6) {
      setError('Please enter all 6 digits')
      return
    }

    // Check if OTP has expired using timeRemaining
    if (timeRemaining === 0) {
      setError('OTP has expired. Please request a new one.')
      return
    }

    if (otp !== generatedOtp) {
      setError('Invalid OTP. Please try again.')
      return
    }

    setStep(3)
    setSuccess('OTP verified! Set your new password.')
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

    // Additional password validation
    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)/
    if (!passwordRegex.test(newPassword)) {
      setError('Password must contain at least one letter and one number')
      return
    }

    updateUserPassword(email, newPassword)
    setSuccess('Password reset successful! Redirecting to login...')
    setTimeout(() => {
      navigate('/login')
    }, 2000)
  }

  // Handle OTP input changes
  const handleOtpChange = (e, index) => {
    const value = e.target.value.replace(/\D/g, '') // Only allow digits
    if (value.length <= 1) {
      const newOtp = otp.split('')
      newOtp[index] = value
      setOtp(newOtp.join(''))
      
      // Auto-focus next input
      if (value && index < 5) {
        const nextInput = document.querySelector(`.otp-box:nth-child(${index + 2})`)
        if (nextInput) nextInput.focus()
      }
    }
  }

  // Handle backspace and arrow keys
  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // If current box is empty, go to previous box
        const prevInput = document.querySelector(`.otp-box:nth-child(${index})`)
        if (prevInput) prevInput.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      const prevInput = document.querySelector(`.otp-box:nth-child(${index})`)
      if (prevInput) prevInput.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      const nextInput = document.querySelector(`.otp-box:nth-child(${index + 2})`)
      if (nextInput) nextInput.focus()
    }
  }

  // Handle paste
  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    setOtp(pastedData)
    
    // Focus the next empty box or the last box
    const nextEmptyIndex = Math.min(pastedData.length, 5)
    const nextInput = document.querySelector(`.otp-box:nth-child(${nextEmptyIndex + 1})`)
    if (nextInput) nextInput.focus()
  }

  const resendOtp = async () => {
    const newOtpCode = generateOtp()
    setGeneratedOtp(newOtpCode)
    
    const emailSent = await sendOtpEmail(email, newOtpCode)
    if (emailSent) {
      setOtp('') // Clear current OTP
    }
  }

  return (
    <div className="forgot-container">
      <div className="forgot-card">
        <h1 className="forgot-title">Lab Expert</h1>
        <h2 className="forgot-subtitle">
          {step === 1 ? 'Reset Password' : 
           step === 2 ? 'Verify OTP' : 
           'Set New Password'}
        </h2>
        
        {step === 1 && (
          <form onSubmit={handleEmailSubmit} className="forgot-form">
            {error && <div className="error-message">{error}</div>}
            
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your registered email"
                className="form-input"
                disabled={loading}
              />
            </div>
            
            <button type="submit" className="forgot-button" disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleOtpSubmit} className="forgot-form">
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <p className="otp-info">
              We've sent a 6-digit verification code to <strong>{email}</strong>
            </p>
            
            {otpExpiry && (
              <p className="otp-timer">
                Time remaining: <strong style={{ color: timeRemaining <= 60 ? '#dc3545' : '#007bff' }}>
                  {formatTime(timeRemaining)}
                </strong>
              </p>
            )}
            
            <div className="form-group">
              <label htmlFor="otp">Enter 6-Digit OTP</label>
              <div className="otp-container1">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <input
                    key={index}
                    type="text"
                    className="otp-box"
                    value={otp[index] || ''}
                    onChange={(e) => handleOtpChange(e, index)}
                    onKeyDown={(e) => handleOtpKeyDown(e, index)}
                    onPaste={handleOtpPaste}
                    maxLength="1"
                    autoComplete="off"
                  />
                ))}
              </div>
            </div>
            
            <button type="submit" className="forgot-button">
              Verify OTP
            </button>
            
            <div className="otp-actions">
              <button 
                type="button" 
                onClick={resendOtp} 
                className="resend-button"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Resend OTP'}
              </button>
              <button type="button" onClick={() => setStep(1)} className="back-button">
                Change Email
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
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
                placeholder="Enter new password (min 6 chars)"
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