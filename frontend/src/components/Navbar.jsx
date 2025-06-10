import { getCurrentUser, logout } from '../utils/localStorage';
import { useNavigate } from 'react-router-dom';
import '../styles/Navbar.css';
import { useState } from 'react';

function Navbar({ user }) {
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      {/* Logo Section */}
      <div className="navbar-brand">
        <div className="navbar-logo">
          <img 
            src="/assets/image/logo.png" 
            alt="Lab Expert Logo" 
            className="navbar-logo-image"
          />
        </div>
        <h1 className="navbar-title">Lab Expert</h1>
      </div>
      
      {/* Navigation Links */}
      <div>
        <ul className="navbar-links">
          {/* File Dropdown (Hover-based) */}
          <li 
            className="navbar-item"
            onMouseEnter={() => setActiveDropdown('file')}
            onMouseLeave={() => setActiveDropdown(null)}
          >
            <button className="navbar-link">File</button>
            {activeDropdown === 'file' && (
              <ul className="dropdown-menu">
                <li><button>Save</button></li>
                <li><button>Save As</button></li>
                <li><button>Open</button></li>
                <li><button>Settings</button></li>
              </ul>
            )}
          </li>

          {/* Insert Dropdown (Hover-based) */}
          <li 
            className="navbar-item"
            onMouseEnter={() => setActiveDropdown('insert')}
            onMouseLeave={() => setActiveDropdown(null)}
          >
            <button className="navbar-link">Insert</button>
            {activeDropdown === 'insert' && (
              <ul className="dropdown-menu">
                <li><button>Graph</button></li>
                <li><button>Camera</button></li>
                <li><button>Table</button></li>
              </ul>
            )}
          </li>

          {/* About (Static Link) */}
          <li className="navbar-item">
            <a href="/about" className="navbar-link">About</a>
          </li>

          {/* Our Team (Static Link) */}
          <li className="navbar-item">
            <a href="/our-team" className="navbar-link">Our Team</a>
          </li>
        </ul>
      </div>

      {/* User Actions */}
      <div className="navbar-actions">
        <div className="welcome-container">
          <span className="welcome-text">Welcome,<br /> {user.name}!</span>
        </div>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>
    </nav>
  );
}

export default Navbar;