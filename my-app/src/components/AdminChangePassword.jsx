import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { changeAdminPassword } from '../utils/adminApi'

const policy = (pw) => /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && pw.length >= 8

function AdminChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (newPassword !== confirm) { setError('Passwords do not match'); return }
    if (!policy(newPassword)) { setError('Password must be 8+ chars, mixed case, number'); return }
    setLoading(true)
    try {
      await changeAdminPassword(currentPassword, newPassword)
      setSuccess('Password changed. Please login again.')
      navigate('/admin/login')
    } catch (err) {
      setError('Change password failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded shadow w-full max-w-sm">
        <h2 className="text-xl font-semibold mb-4">Change Admin Password</h2>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {success && <div className="text-green-600 mb-2">{success}</div>}
        <label className="block mb-2">Current Password</label>
        <input type="password" value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} className="border p-2 w-full mb-3" />
        <label className="block mb-2">New Password</label>
        <input type="password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} className="border p-2 w-full mb-3" />
        <label className="block mb-2">Confirm New Password</label>
        <input type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} className="border p-2 w-full mb-4" />
        <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded w-full">
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  )
}

export default AdminChangePassword