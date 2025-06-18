//  Page component with more complex state management
import { useState } from 'react'
import type { JSX } from 'react'
import SignupForm from '../components/Signup'

//  Interface for user data (same as in SignupForm)
// We could also import this from a shared types file, but keeping it simple
interface UserData {
  name: string;
  email: string;
  password: string;
}

function SignupPage(): JSX.Element {
  
  //  State for user feedback and user data
  const [message, setMessage] = useState<string>('')
  const [isSuccess, setIsSuccess] = useState<boolean>(false)
  const [registeredUser, setRegisteredUser] = useState<UserData | null>(null)

  //  Function that handles the signup form submission
  // Parameter type matches the interface we defined
  const handleSignup = (userData: UserData): void => {
    
    //  Destructuring with proper types
    const { name, email, password } = userData
    
    console.log('Signup attempt with:', { name, email, password })
    
    //  Simulating email validation
    if (email.includes('taken@')) {
      setIsSuccess(false)
      setMessage('❌ This email is already taken. Please use a different email.')
      return
    }
    
    //  Simulating successful registration
    setRegisteredUser(userData)
    setIsSuccess(true)
    setMessage(`🎉 Account created successfully! Welcome, ${name}!`)
    
    //  Clearing message after delay
    setTimeout(() => {
      setMessage('')
    }, 5000)
  }

  //  JSX with more complex conditional rendering
  return (
    <div className="page-container">
      <div className="auth-container">
        
        {/* Conditional rendering based on registration status */}
        {!registeredUser ? (
          <SignupForm onSubmit={handleSignup} />
        ) : (
          <div className="success-container">
            <h2>✅ Registration Complete!</h2>
            <p>Welcome to our platform, <strong>{registeredUser.name}</strong>!</p>
            <p>Your account has been created with email: <strong>{registeredUser.email}</strong></p>
            <a href="/login" className="link">🔑 Go to Login</a>
          </div>
        )}
        
        {/* Message display with conditional styling */}
        {message && (
          <div className={`message ${isSuccess ? 'success' : 'error'}`}>
            {message}
          </div>
        )}
        
        {/*  Demo information */}
        <div className="demo-info">
          <h3>💡 Demo Tips</h3>
          <p><strong>Test email validation:</strong> Use "taken@example.com" to see error handling</p>
          <p><strong>Password requirements:</strong> At least 6 characters</p>
          <p><strong>All fields are required</strong> and validated in real-time</p>
        </div>
      </div>
    </div>
  )
}

export default SignupPage