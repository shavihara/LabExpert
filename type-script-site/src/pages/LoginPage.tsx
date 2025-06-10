//  Page component that uses other components
import React, { useState } from 'react'
import LoginForm from '../components/Login'

//  Simple page component
const LoginPage: React.FC = () => {
  
  //  State for user feedback
  const [message, setMessage] = useState<string>('')
  const [isSuccess, setIsSuccess] = useState<boolean>(false)

  //  Function that handles form submission
  // This function receives the validated data from the LoginForm component
  const handleLogin = (email: string, password: string): void => {
    
    //  Console logging with type-safe parameters
    console.log('Login attempt with:', { email, password })
    
    //  Simulating different login scenarios
    if (email === 'admin@example.com' && password === 'password123') {
      setIsSuccess(true)
      setMessage(`✅ Welcome back! You've successfully logged in as ${email}`)
    } else if (email === 'user@example.com' && password === 'userpass') {
      setIsSuccess(true)
      setMessage(`🎉 Hello! Login successful for ${email}`)
    } else {
      setIsSuccess(false)
      setMessage('❌ Invalid email or password. Try admin@example.com / password123')
    }
    
    //  Clearing message after delay
    setTimeout(() => {
      setMessage('')
    }, 5000)
  }

  //  JSX with conditional styling
  return (
    <div className="page-container">
      <div className="auth-container">
        
        {/*  Passing function as prop */}
        <LoginForm onSubmit={handleLogin} />
        
        {/*  Conditional rendering with dynamic classes */}
        {message && (
          <div className={`message ${isSuccess ? 'success' : 'error'}`}>
            {message}
          </div>
        )}
        
        {/*  Static content for demo purposes */}
        <div className="demo-info">
          <h3>🧪 Demo Credentials</h3>
          <p><strong>Admin:</strong> admin@example.com / password123</p>
          <p><strong>User:</strong> user@example.com / userpass</p>
          <p><em>Try these credentials to see successful login!</em></p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage