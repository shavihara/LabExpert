import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminLogin, getCsrf, adminMe } from '../utils/adminApi'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const passwordPolicy = (pw) => /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && pw.length >= 8

function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { getCsrf().catch(() => {}) }, [])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!emailRegex.test(email)) { setError('Invalid email'); return }
    setLoading(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const res = await adminLogin(normalizedEmail, password)
      const me = await adminMe()
      if (res.must_change_password || me?.must_change_password) {
        navigate('/admin/change-password')
      } else {
        navigate('/admin/manage')
      }
    } catch (err) {
      setError('Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded shadow w-full max-w-sm">
        <h2 className="text-xl font-semibold mb-4">Admin Login</h2>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        <label className="block mb-2">Email</label>
        <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="border p-2 w-full mb-3" />
        <label className="block mb-2">Password</label>
        <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="border p-2 w-full mb-4" />
        <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded w-full">
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}

export default AdminLogin