// pages/Home.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../utils/localStorage'
import Navbar from '../components/Navbar'
import Dashboard from '../components/Dashboard'
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

  if (!user) return null

  return (
    <div className="home-container">
      <Navbar user={user} />
      
      <main className="home-content">
        <Dashboard />
        {/* Add more components here as needed */}
      </main>
    </div>
  )
}

export default Home