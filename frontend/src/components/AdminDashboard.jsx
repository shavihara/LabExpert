import React from 'react';
import '../styles/AdminDashboard.css';

function AdminDashboard({ stats }) {
  const statCards = [
    {
      title: 'Total Users',
      value: stats?.totalUsers || 0,
      icon: '👥',
      color: '#667eea'
    },
    {
      title: 'Verified Users',
      value: stats?.verifiedUsers || 0,
      icon: '✅',
      color: '#48bb78'
    },
    {
      title: 'Recent Signups',
      value: stats?.recentSignups || 0,
      icon: '📈',
      color: '#f59e0b'
    },
    {
      title: 'Active Sessions',
      value: stats?.activeSessions || 0,
      icon: '🔐',
      color: '#ef4444'
    }
  ];

  return (
    <div className="admin-dashboard">
      <h2>Dashboard Overview</h2>
      
      <div className="stats-grid">
        {statCards.map((stat, index) => (
          <div key={index} className="stat-card" style={{ borderColor: stat.color }}>
            <div className="stat-icon" style={{ backgroundColor: `${stat.color}20` }}>
              {stat.icon}
            </div>
            <div className="stat-content">
              <h3>{stat.value}</h3>
              <p>{stat.title}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="recent-activity">
        <h3>System Health</h3>
        <div className="health-indicators">
          <div className="health-item">
            <span className="health-dot green"></span>
            Database Connected
          </div>
          <div className="health-item">
            <span className="health-dot green"></span>
            Email Service Active
          </div>
          <div className="health-item">
            <span className="health-dot green"></span>
            All Systems Operational
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;