import { useEffect, useState } from 'react'
import { listAdmins, createAdmin, adminLogout } from '../utils/adminApi'
import { useNavigate } from 'react-router-dom'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const policy = (pw) => /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && pw.length >= 8

function AdminManage() {
  const [admins, setAdmins] = useState([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('admin')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    listAdmins().then(setAdmins).catch(()=>{})
  }, [])

  const onAdd = async (e) => {
    e.preventDefault(); setError(''); setMessage('')
    if (!emailRegex.test(email)) { setError('Invalid email'); return }
    if (!policy(password)) { setError('Password must be 8+ chars, mixed case, number'); return }
    try {
      const admin = await createAdmin(email, password, role)
      setAdmins([admin, ...admins])
      setEmail(''); setPassword(''); setRole('admin')
      setMessage('Admin created')
    } catch (err) {
      setError('Create admin failed')
    }
  }

  const onLogout = async () => {
    await adminLogout()
    navigate('/admin/login')
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">Manage Admin Accounts</h2>
        <button className="bg-gray-200 px-3 py-2 rounded" onClick={onLogout}>Logout</button>
      </div>
      <form onSubmit={onAdd} className="bg-white p-4 rounded shadow mb-6">
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {message && <div className="text-green-600 mb-2">{message}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block mb-1">Email</label>
            <input className="border p-2 w-full" value={email} onChange={(e)=>setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block mb-1">Password</label>
            <input type="password" className="border p-2 w-full" value={password} onChange={(e)=>setPassword(e.target.value)} />
          </div>
          <div>
            <label className="block mb-1">Role</label>
            <select className="border p-2 w-full" value={role} onChange={(e)=>setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Add Admin</button>
        </div>
      </form>

      <div className="bg-white p-4 rounded shadow">
        <h3 className="text-lg font-semibold mb-2">Existing Admins</h3>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="p-2">Email</th>
              <th className="p-2">Role</th>
              <th className="p-2">Active</th>
              <th className="p-2">Last Login</th>
            </tr>
          </thead>
          <tbody>
            {admins.map(a => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.email}</td>
                <td className="p-2">{a.role}</td>
                <td className="p-2">{a.is_active ? 'Yes' : 'No'}</td>
                <td className="p-2">{a.last_login || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AdminManage