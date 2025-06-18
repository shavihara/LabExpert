import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminDashboard from '../components/AdminDashboard';
import { api, logoutUser } from '../utils/api';
import '../styles/AdminPage.css';

function AdminPage() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    // Client-side email check
    if (user.email !== 'labexpert.us@gmail.com') {
      navigate('/home');
      return;
    }

    fetchAdminData();
  }, [navigate, user.email]);

  const fetchAdminData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users')
      ]);
      
      setStats(statsRes.data.stats);
      setUsers(usersRes.data.users);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      if (error.response?.status === 403) {
        navigate('/home');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading admin dashboard...</p>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <nav className="admin-nav">
        <div className="nav-content">
          <h1 className="nav-logo">Lab Expert Admin</h1>
          <div className="nav-user">
            <span>👤 {user.name || 'Admin'}</span>
            <button onClick={handleLogout} className="logout-btn" aria-label="Logout">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <ul className="sidebar-menu">
            <li 
              className={activeTab === 'dashboard' ? 'active' : ''}
              onClick={() => setActiveTab('dashboard')}
              aria-label="Dashboard"
            >
              📊 Dashboard
            </li>
            <li 
              className={activeTab === 'users' ? 'active' : ''}
              onClick={() => setActiveTab('users')}
              aria-label="Users"
            >
              👥 Users
            </li>
            <li 
              className={activeTab === 'sessions' ? 'active' : ''}
              onClick={() => setActiveTab('sessions')}
              aria-label="Active Sessions"
            >
              🔐 Active Sessions
            </li>
            <li 
              className={activeTab === 'settings' ? 'active' : ''}
              onClick={() => setActiveTab('settings')}
              aria-label="Settings"
            >
              ⚙️ Settings
            </li>
          </ul>
        </aside>

        <main className="admin-content">
          {activeTab === 'dashboard' && (
            <AdminDashboard stats={stats} />
          )}
          
          {activeTab === 'users' && (
            <div className="users-section">
              <h2>All Users</h2>
              <div className="users-table-container">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Verified</th>
                      <th>Last Login</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>
                          <span className={`role-badge ${user.role}`}>
                            {user.role}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${user.is_email_verified ? 'verified' : 'unverified'}`}>
                            {user.is_email_verified ? '✓' : '✗'}
                          </span>
                        </td>
                        <td>{user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
                        <td>{new Date(user.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {activeTab === 'sessions' && (
            <div className="sessions-section">
              <h2>Active Sessions</h2>
              <div className="sessions-grid">
                {stats?.sessions?.map((session, index) => (
                  <div key={index} className="session-card">
                    <h4>{session.name}</h4>
                    <p>📧 {session.email}</p>
                    <p>🌐 {session.ip_address}</p>
                    <p>🕒 {new Date(session.last_activity).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === 'settings' && (
            <div className="settings-section">
              <h2>Admin Settings</h2>
              <div className="settings-card">
                <h3>System Information</h3>
                <p>Admin Email: {user.email}</p>
                <p>Database: SQLite</p>
                <p>Version: 1.0.0</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default AdminPage;