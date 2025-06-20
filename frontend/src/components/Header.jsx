import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import '../styles/Header.css'

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const location = useLocation()

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false)
  }, [location])

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  // Check if user is logged in
  const isLoggedIn = localStorage.getItem('user') !== null

  // Check if current page is an auth page
  const isAuthPage = ['/login', '/signup', '/forgot-password'].includes(location.pathname)

  const handleLogout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  return (
    <header className={`header ${isScrolled ? 'scrolled' : ''} ${isAuthPage ? 'auth-header' : ''}`}>
      <div className="header-container">
        {/* Logo */}
        <div className="logo">
          <Link to="/" className="logo-link" aria-label="Lab Expert Home">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="logo-text">Lab Expert</span>
          </Link>
        </div>

        {/* Desktop Navigation - Hide on auth pages */}
        {!isAuthPage && (
          <nav className="desktop-nav">
            <ul className="nav-list">
              <li className="nav-item">
                <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                  Home
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/about" className={`nav-link ${location.pathname === '/about' ? 'active' : ''}`}>
                  About
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/services" className={`nav-link ${location.pathname === '/services' ? 'active' : ''}`}>
                  Services
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/contact" className={`nav-link ${location.pathname === '/contact' ? 'active' : ''}`}>
                  Contact
                </Link>
              </li>
            </ul>
          </nav>
        )}

        {/* Auth Buttons - Hide on auth pages */}
        {!isAuthPage && (
          <div className="auth-buttons">
            {!isLoggedIn ? (
              <>
                <Link to="/login" className="btn btn-outline">
                  Login
                </Link>
                <Link to="/signup" className="btn btn-primary">
                  Sign Up
                </Link>
              </>
            ) : (
              <div className="user-menu">
                <button className="btn btn-outline" onClick={handleLogout} aria-label="Logout">
                  Logout
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mobile Menu Button - Hide on auth pages */}
        {!isAuthPage && (
          <button 
            className={`mobile-menu-btn ${isMenuOpen ? 'active' : ''}`}
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        )}
      </div>

      {/* Mobile Navigation - Hide on auth pages */}
      {!isAuthPage && (
        <nav className={`mobile-nav ${isMenuOpen ? 'active' : ''}`}>
          <ul className="mobile-nav-list">
            <li className="mobile-nav-item">
              <Link to="/" className={`mobile-nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                Home
              </Link>
            </li>
            <li className="mobile-nav-item">
              <Link to="/about" className={`mobile-nav-link ${location.pathname === '/about' ? 'active' : ''}`}>
                About
              </Link>
            </li>
            <li className="mobile-nav-item">
              <Link to="/services" className={`mobile-nav-link ${location.pathname === '/services' ? 'active' : ''}`}>
                Services
              </Link>
            </li>
            <li className="mobile-nav-item">
              <Link to="/contact" className={`mobile-nav-link ${location.pathname === '/contact' ? 'active' : ''}`}>
                Contact
              </Link>
            </li>
            <li className="mobile-nav-divider"></li>
            {!isLoggedIn ? (
              <>
                <li className="mobile-nav-item">
                  <Link to="/login" className="mobile-nav-link">
                    Login
                  </Link>
                </li>
                <li className="mobile-nav-item">
                  <Link to="/signup" className="mobile-nav-link">
                    Sign Up
                  </Link>
                </li>
              </>
            ) : (
              <li className="mobile-nav-item">
                <button 
                  className="mobile-nav-link logout-btn"
                  onClick={handleLogout}
                  aria-label="Logout"
                >
                  Logout
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}

      {/* Mobile Menu Overlay - Hide on auth pages */}
      {!isAuthPage && isMenuOpen && (
        <div className="mobile-overlay" onClick={() => setIsMenuOpen(false)}></div>
      )}
    </header>
  )
}

export default Header