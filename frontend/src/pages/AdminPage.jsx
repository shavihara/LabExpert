import React from 'react';
import '../styles/AdminDashboard.css';

function AdminDashboard({ stats }) {
  const statCards = [
    {
      title: 'Total Users',
      value: stats?.totalUsers || 0,
      icon: '👥',
      color: '#667eea',
      trend: '+12%',
      description: 'Active registered users'
    },
    {
      title: 'Verified Users',
      value: stats?.verifiedUsers || 0,
      icon: '✅',
      color: '#48bb78',
      trend: '+8%',
      description: 'Email verified accounts'
    },
    {
      title: 'Recent Signups',
      value: stats?.recentSignups || 0,
      icon: '📈',
      color: '#f59e0b',
      trend: '+25%',
      description: 'New users this month'
    },
    {
      title: 'Active Sessions',
      value: stats?.activeSessions || 0,
      icon: '🔐',
      color: '#ef4444',
      trend: 'Live',
      description: 'Currently online users'
    }
  ];

  const recentActivity = [
    { action: 'New user registered', user: 'john.doe@email.com', time: '2 minutes ago', type: 'signup' },
    { action: 'User logged in', user: 'jane.smith@email.com', time: '5 minutes ago', type: 'login' },
    { action: 'Password reset', user: 'bob.wilson@email.com', time: '10 minutes ago', type: 'reset' },
    { action: 'User verified email', user: 'alice.brown@email.com', time: '15 minutes ago', type: 'verify' }
  ];

  const getActivityIcon = (type) => {
    switch (type) {
      case 'signup': return '👤';
      case 'login': return '🔓';
      case 'reset': return '🔑';
      case 'verify': return '✅';
      default: return '📝';
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h2>Dashboard Overview</h2>
        <div className="dashboard-actions">
          <button className="refresh-btn">🔄 Refresh</button>
          <button className="export-btn">📊 Export Report</button>
        </div>
      </div>
      
      <div className="stats-grid">
        {statCards.map((stat, index) => (
          <div key={index} className="stat-card" style={{ '--accent-color': stat.color }}>
            <div className="stat-header">
              <div className="stat-icon">
                {stat.icon}
              </div>
              <div className="stat-trend" style={{ color: stat.color }}>
                {stat.trend}
              </div>
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{stat.value.toLocaleString()}</h3>
              <p className="stat-title">{stat.title}</p>
              <span className="stat-description">{stat.description}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card recent-activity-card">
          <h3>Recent Activity</h3>
          <div className="activity-list">
            {recentActivity.map((activity, index) => (
              <div key={index} className="activity-item">
                <div className="activity-icon">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="activity-content">
                  <p className="activity-action">{activity.action}</p>
                  <p className="activity-user">{activity.user}</p>
                </div>
                <div className="activity-time">
                  {activity.time}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-card system-health-card">
          <h3>System Health</h3>
          <div className="health-indicators">
            <div className="health-item">
              <div className="health-status">
                <span className="health-dot green"></span>
                <span className="health-label">Database</span>
              </div>
              <span className="health-value">99.9%</span>
            </div>
            <div className="health-item">
              <div className="health-status">
                <span className="health-dot green"></span>
                <span className="health-label">Email Service</span>
              </div>
              <span className="health-value">Active</span>
            </div>
            <div className="health-item">
              <div className="health-status">
                <span className="health-dot green"></span>
                <span className="health-label">Server</span>
              </div>
              <span className="health-value">Online</span>
            </div>
            <div className="health-item">
              <div className="health-status">
                <span className="health-dot orange"></span>
                <span className="health-label">Storage</span>
              </div>
              <span className="health-value">78%</span>
            </div>
          </div>
        </div>

        <div className="dashboard-card quick-actions-card">
          <h3>Quick Actions</h3>
          <div className="quick-actions">
            <button className="action-btn primary">
              👤 Add New User
            </button>
            <button className="action-btn secondary">
              📧 Send Announcement
            </button>
            <button className="action-btn secondary">
              🔧 System Settings
            </button>
            <button className="action-btn secondary">
              📊 Generate Report
            </button>
          </div>
        </div>

        <div className="dashboard-card usage-stats-card">
          <h3>Usage Statistics</h3>
          <div className="usage-stats">
            <div className="usage-item">
              <span className="usage-label">Daily Active Users</span>
              <div className="usage-bar">
                <div className="usage-fill" style={{ width: '85%' }}></div>
              </div>
              <span className="usage-value">850</span>
            </div>
            <div className="usage-item">
              <span className="usage-label">Weekly Signups</span>
              <div className="usage-bar">
                <div className="usage-fill" style={{ width: '65%' }}></div>
              </div>
              <span className="usage-value">156</span>
            </div>
            <div className="usage-item">
              <span className="usage-label">Support Tickets</span>
              <div className="usage-bar">
                <div className="usage-fill" style={{ width: '25%' }}></div>
              </div>
              <span className="usage-value">12</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;