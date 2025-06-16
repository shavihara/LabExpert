import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

export const findUser = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.success) localStorage.setItem('token', response.data.token);
    return response.data.user || null;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

export const saveUser = async (userData) => {
  try {
    const response = await api.post('/auth/signup', userData);
    if (response.data.success) localStorage.setItem('token', response.data.token);
    return response.data.user || null;
  } catch (error) {
    console.error('Signup error:', error);
    throw error;
  }
};

export const checkEmailExists = async (email) => {
  try {
    const response = await api.get('/auth/check-email', { params: { email } });
    return response.data.exists;
  } catch (error) {
    console.error('Check email error:', error);
    return false;
  }
};

export const getCurrentUser = async () => {
  try {
    const response = await api.get('/user/me');
    return response.data.user;
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
};

export const updateUserPassword = async (email, newPassword, otp) => {
  try {
    const response = await api.post('/auth/verify-otp', { email, otp, newPassword });
    return response.data.success;
  } catch (error) {
    console.error('Update password error:', error);
    throw error;
  }
};

export const logoutUser = async () => {
  try {
    await api.post('/auth/logout');
    localStorage.removeItem('token');
    return true;
  } catch (error) {
    console.error('Logout error:', error);
    return false;
  }
};

// Fixed: Send forgot password request
export const sendForgotPasswordOTP = async (email) => {
  try {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  } catch (error) {
    console.error('Forgot password error:', error);
    throw error;
  }
};

export const userAPI = {
  uploadProfilePicture: async (formData) =>
    api.post('/user/profile-picture', formData, { 
      headers: { 'Content-Type': 'multipart/form-data' } 
    }),
};

export const fileAPI = {
  getFile: (fileId) => `${API_URL}/files/${fileId}`,
};

// Export the main api instance for direct use
export { api };