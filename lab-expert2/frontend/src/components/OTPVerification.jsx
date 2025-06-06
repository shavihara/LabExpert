import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/OTPVerification.css'

function OTPVerification() {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [resendTimer, setResendTimer] = useState(30)
  const [canResend, setCanResend] = useState(false)
  const inputRefs = useRef([])
  const navigate = useNavigate()

  // Timer for resend OTP
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanResend(true)
    }
  }, [resendTimer])

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const handleChange = (index, value) => {
    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value

    setOtp(newOtp)
    setError('')

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all digits are entered
    if (index === 5 && value) {
      const otpString = newOtp.join('')
      if (otpString.length === 6) {
        handleVerify(otpString)
      }
    }
  }

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text')
    const digits = pastedData.replace(/\D/g, '').slice(0, 6)
    
    if (digits.length > 0) {
      const newOtp = [...otp]
      digits.split('').forEach((digit, index) => {
        if (index < 6) {
          newOtp[index] = digit
        }
      })
      setOtp(newOtp)
      
      // Focus last filled input or last input
      const lastFilledIndex = Math.min(digits.length - 1, 5)
      inputRefs.current[lastFilledIndex]?.focus()
      
      // Auto-verify if 6 digits
      if (digits.length === 6) {
        handleVerify(digits)
      }
    }
  }

  const handleVerify = (otpString) => {
    // Mock verification - replace with actual verification logic
    if (otpString === '123456') {
      setSuccess('OTP verified successfully!')
      setTimeout(() => {
        // Navigate to next page or perform next action
        navigate('/home')
      }, 1500)
    } else {
      setError('Invalid OTP. Please try again.')
      // Clear OTP on error
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    }
  }

  const handleResendOTP = () => {
    if (!canResend) return
    
    // Reset timer
    setResendTimer(30)
    setCanResend(false)
    setError('')
    setSuccess('OTP resent successfully!')
    setTimeout(() => setSuccess(''), 3000)
    
    // Clear OTP fields
    setOtp(['', '', '', '', '', ''])
    inputRefs.current[0]?.focus()
    
    // Add your resend OTP logic here
    console.log('Resending OTP...')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const otpString = otp.join('')
    
    if (otpString.length !== 6) {
      setError('Please enter all 6 digits')
      return
    }
    
    handleVerify(otpString)
  }

  return (
    <div className="otp-container">
      <div className="otp-card">
        <div className="otp-icon">
          <span>🔐</span>
        </div>
        
        <h1 className="otp-title">Lab Expert</h1>
        <h2 className="otp-subtitle">Verify OTP</h2>
        <p className="otp-description">
          Enter the 6-digit code sent to your email
        </p>
        
        <form onSubmit={handleSubmit} className="otp-form">
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          
          <div className="otp-inputs">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength="1"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                className="otp-input"
                autoComplete="off"
              />
            ))}
          </div>
          
          <button type="submit" className="verify-button">
            Verify OTP
          </button>
        </form>
        
        <div className="otp-footer">
          <p className="resend-text">
            Didn't receive the code?
            {canResend ? (
              <button onClick={handleResendOTP} className="resend-link">
                Resend OTP
              </button>
            ) : (
              <span className="resend-timer">
                Resend in {resendTimer}s
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

export default OTPVerification