import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './components/Login'
import Signup from './components/Signup'
import ForgotPassword from './components/ForgotPassword'
import Home from './components/Home'
import './App.css'
import OTPVerification from './components/OTPVerification'

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/otp-verify" element={<OTPVerification />} />
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/home" element={<Home />} />
      </Routes>
    </div>
  )
}

export default App