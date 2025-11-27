import axios from 'axios'
import { API_URL } from './api'

const adminApi = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

export const getCsrf = async () => {
  const res = await adminApi.get('/api/admin/csrf')
  return res.data.csrf
}

export const adminLogin = async (email, password) => {
  const res = await adminApi.post('/api/admin/auth/login', { email, password })
  return res.data
}

export const adminMe = async () => {
  const res = await adminApi.get('/api/admin/auth/me')
  return res.data.admin
}

export const adminLogout = async () => {
  const csrf = document.cookie.split('; ').find(x => x.startsWith('admin_csrf_token='))?.split('=')[1]
  await adminApi.post('/api/admin/auth/logout', {}, { headers: { 'X-CSRF-Token': csrf || '' } })
}

export const changeAdminPassword = async (currentPassword, newPassword) => {
  const csrf = document.cookie.split('; ').find(x => x.startsWith('admin_csrf_token='))?.split('=')[1]
  const res = await adminApi.post('/api/admin/auth/change-password', { current_password: currentPassword, new_password: newPassword }, { headers: { 'X-CSRF-Token': csrf || '' } })
  return res.data
}

export const listAdmins = async () => {
  const res = await adminApi.get('/api/admin/users')
  return res.data.admins
}

export const createAdmin = async (email, password, role) => {
  const csrf = document.cookie.split('; ').find(x => x.startsWith('admin_csrf_token='))?.split('=')[1]
  const res = await adminApi.post('/api/admin/users', { email, password, role }, { headers: { 'X-CSRF-Token': csrf || '' } })
  return res.data.admin
}

export { adminApi }