import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, logout } from '../utils/localStorage'
import '../styles/Home.css'

function Home() {
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const currentUser = getCurrentUser()
    if (!currentUser) {
      navigate('/login')
    } else {
      setUser(currentUser)
    }
  }, [navigate])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (!user) return null

  return (
    <div className="home-container">
      <nav className="navbar">
        <h1 className="nav-title">Lab Expert</h1>
        <div className="nav-actions">
          <span className="welcome-text">Welcome, {user.name}!</span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </nav>
      
      <main className="home-content">
        <div className="empty-state">
          <h2>Welcome to Lab Expert</h2>
          <p>Your laboratory management system</p>
          <div className="placeholder-icon">🧪</div>
          <p className="placeholder-text">
            This is your dashboard. Future features will be added here.
          </p>
        </div>
      </main>
    </div>
  )
}

export default Home