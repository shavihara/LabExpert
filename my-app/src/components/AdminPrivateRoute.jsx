import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { adminMe } from '../utils/adminApi'

function AdminPrivateRoute({ children }) {
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      try {
        const me = await adminMe()
        setAdmin(me)
      } catch (e) {
        setAdmin(null)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }
  if (!admin) {
    return <Navigate to="/admin/login" replace />
  }
  return children
}

export default AdminPrivateRoute