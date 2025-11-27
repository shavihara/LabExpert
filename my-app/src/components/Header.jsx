import { useState, useEffect, useRef } from 'react'
import { FiChevronUp, FiChevronDown } from 'react-icons/fi'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../utils/api';

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)
  const location = useLocation()
  const isAuthPage = ['/login', '/signup', '/forgot-password'].includes(location.pathname)

  const lastScrollYRef = useRef(0)
  useEffect(() => {
    let ticking = false
    const handleScroll = () => {
      const currentY = window.scrollY || 0
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const isScrollingDown = currentY > lastScrollYRef.current
          lastScrollYRef.current = currentY
          if (!isAuthPage) {
            if (isScrollingDown && currentY > 10) {
              setIsHeaderCollapsed(true)
            } else if (currentY <= 10) {
              setIsHeaderCollapsed(false)
            }
          }
          ticking = false
        })
        ticking = true
      }
      setIsScrolled(currentY > 20)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isAuthPage])

  useEffect(() => {
    setIsMenuOpen(false)
  }, [location])

  useEffect(() => {
    const collapse = () => setIsHeaderCollapsed(true)
    const expand = () => setIsHeaderCollapsed(false)
    window.addEventListener('labex:header:collapse', collapse)
    window.addEventListener('labex:header:expand', expand)
    return () => {
      window.removeEventListener('labex:header:collapse', collapse)
      window.removeEventListener('labex:header:expand', expand)
    }
  }, [])

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const isLoggedIn = localStorage.getItem('user') !== null

  useEffect(() => {
    const hh = isAuthPage ? '80px' : '70px'
    try {
      document.documentElement.style.setProperty('--header-height', hh)
    } catch {}
  }, [isAuthPage])

  const handleLogout = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await api.post('/api/auth/logout');
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/login';
  }

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-[1000] transition-all duration-500 transform ${
        isScrolled ? 'shadow-2xl' : 'shadow-lg'
      } ${isAuthPage ? 'h-20' : 'h-[70px]'} ${isHeaderCollapsed ? '-translate-y-[calc(100%-12px)]' : 'translate-y-0'}`}
        style={{
          transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          '--header-height': isAuthPage ? '80px' : '70px'
        }}>
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 border-b border-black/10">
        {/* Enhanced Shimmer effect */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_6s_ease-in-out_infinite]" style={{
            animationDelay: '5s',
            filter: 'blur(1px)'
          }}></div>
          <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-purple-300/20 to-transparent animate-[shimmer_5s_ease-in-out_infinite]" style={{
            animationDelay: '2s'
          }}></div>
        </div>

        {/* Enhanced Floating shapes for auth pages */}
        {isAuthPage && (
          <div className="absolute inset-0 overflow-visible">
            {[
              { size: 80, top: '20%', left: '10%', delay: 0, opacity: 0.15 },
              { size: 120, top: '60%', left: '80%', delay: 1, opacity: 0.12 },
              { size: 60, top: '80%', left: '20%', delay: 2, opacity: 0.18 },
              { size: 100, top: '10%', left: '70%', delay: 3, opacity: 0.14 },
              { size: 40, top: '50%', left: '50%', delay: 4, opacity: 0.2 },
              { size: 90, top: '30%', left: '85%', delay: 2.5, opacity: 0.1 },
              { size: 70, top: '70%', left: '5%', delay: 1.5, opacity: 0.16 }
            ].map((shape, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-white/20 animate-[float_8s_ease-in-out_infinite] backdrop-blur-sm"
                style={{
                  width: shape.size,
                  height: shape.size,
                  top: shape.top,
                  left: shape.left,
                  animationDelay: `${shape.delay}s`,
                  opacity: shape.opacity,
                  filter: 'blur(0.5px)',
                  boxShadow: '0 4px 20px rgba(255,255,255,0.1)'
                }}
              ></div>
            ))}
          </div>
        )}
        </div>

      {/* Container */}
      <div className="relative max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 text-white no-underline transition-transform duration-300 hover:-translate-y-0.5 z-10">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl flex items-center justify-center border-2 border-white/20 shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-xl md:text-2xl font-extrabold leading-tight">Lab Expert</span>
            {isAuthPage && (
              <span className="text-xs md:text-sm opacity-90 font-medium tracking-wide hidden sm:block">
                Virtual Laboratory
              </span>
            )}
          </div>
        </Link>

        {!isAuthPage && (
          <nav className="hidden lg:flex flex-1 justify-center">
            <ul className="flex items-center gap-4 m-0 p-0 list-none">
              {[
                { path: '/home', label: 'Home' },
                { path: '/about', label: 'About' },
                { path: '/services', label: 'Services' },
                { path: '/contact', label: 'Contact' }
              ].map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`relative group px-6 py-2.5 text-white font-semibold no-underline rounded-lg transition-all duration-200 ${
                      location.pathname === item.path
                        ? 'bg-white/10 ring-1 ring-white/30'
                        : 'hover:bg-white/15 hover:ring-1 hover:ring-white/30 hover:-translate-y-0.5'
                    }`}
                  >
                    {item.label}
                    <span className={`absolute bottom-0 left-0 h-0.5 bg-white/60 transition-all duration-200 ${
                      location.pathname === item.path ? 'w-full' : 'w-0 group-hover:w-full'
                    }`}></span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Modern Auth Buttons - Hide on auth pages */}
        {!isAuthPage && (
          <div className="hidden lg:flex items-center gap-3">
            {!isLoggedIn ? (
              <>
                <Link
                  to="/login"
                  className="relative px-5 py-3 bg-white/20 text-white font-semibold rounded-xl border-2 border-white no-underline transition-all duration-300 hover:bg-purple-700 hover:-translate-y-0.5 hover:shadow-xl group overflow-hidden"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></span>
                  <span className="relative z-10">Login</span>
                </Link>
                <Link
                  to="/signup"
                  className="relative px-5 py-3 bg-gradient-to-br from-purple-600 to-purple-800 text-white font-semibold rounded-xl border-2 border-transparent no-underline transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl group overflow-hidden"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></span>
                  <span className="relative z-10">Sign Up</span>
                </Link>
              </>
            ) : (
              <button
                onClick={handleLogout}
                className="relative px-5 py-3 bg-white/20 text-white font-semibold rounded-xl border-2 border-white cursor-pointer transition-all duration-300 hover:bg-purple-700 hover:-translate-y-0.5 hover:shadow-xl group overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></span>
                <span className="relative z-10">Logout</span>
              </button>
            )}
            
          </div>
        )}

        {/* Modern Mobile Menu Button - Hide on auth pages */}
        {!isAuthPage && (
          <button
            className="lg:hidden relative w-8 h-8 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 cursor-pointer transition-all duration-300 hover:bg-white/20 hover:scale-110 z-10"
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-0.5 bg-white rounded transition-all duration-300 ${
              isMenuOpen ? 'rotate-45' : '-translate-y-1.5'
            }`}></span>
            <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-0.5 bg-white rounded transition-all duration-300 ${
              isMenuOpen ? 'opacity-0' : ''
            }`}></span>
            <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-0.5 bg-white rounded transition-all duration-300 ${
              isMenuOpen ? '-rotate-45' : 'translate-y-1.5'
            }`}></span>
          </button>
        )}
      </div>

      {!isAuthPage && !isHeaderCollapsed && (
        <button
          onClick={() => setIsHeaderCollapsed(true)}
          className="absolute right-0 -bottom-5 bg-white/0 backdrop-blur-md text-white rounded-full border-1 border-white/30 p-2 hover:bg-white/50 transition-all duration-300 shadow-lg"
          aria-label="Collapse header"
          style={{
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
          <FiChevronUp className="w-5 h-5 drop-shadow-md" style={{ animation: 'subtleBounce 1s ease-in-out infinite' }} />
        </button>
      )}

      {/* Modern Mobile Navigation - Hide on auth pages */}
      {!isAuthPage && (
        <>
          <nav className={`lg:hidden fixed top-[var(--header-height)] left-0 w-full h-[calc(100vh-var(--header-height))] bg-white/98 backdrop-blur-xl transition-all duration-500 z-[1100] overflow-y-auto ${
            isMenuOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
          }`}
            style={{
              transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}>
            <ul className="flex flex-col gap-3 p-8 m-0 list-none min-h-full">
              {[
                { path: '/', label: 'Home' },
                { path: '/about', label: 'About' },
                { path: '/services', label: 'Services' },
                { path: '/contact', label: 'Contact' }
              ].map((item, index) => (
                <li key={item.path} style={{
                  animationDelay: `${index * 0.1}s`
                }}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-4 px-6 py-4 font-semibold rounded-xl no-underline transition-all duration-300 group ${
                      location.pathname === item.path
                        ? 'bg-gradient-to-br from-purple-600 to-purple-800 text-white shadow-lg translate-x-2'
                        : 'text-white hover:bg-gradient-to-br hover:from-purple-600 hover:to-purple-800 hover:translate-x-2 hover:shadow-lg'
                    }`}
                  >
                    <span className="w-2 h-2 bg-current rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-300"></span>
                    {item.label}
                  </Link>
                </li>
              ))}

              <li className="h-px bg-gradient-to-r from-transparent via-purple-600 to-transparent my-4 opacity-50"></li>

              {!isLoggedIn ? (
                <>
                  <li style={{ animationDelay: '0.4s' }}>
                    <Link
                      to="/login"
                      className="flex items-center gap-4 px-6 py-4 text-white font-semibold rounded-xl no-underline transition-all duration-300 hover:bg-gradient-to-br hover:from-purple-600 hover:to-purple-800 hover:translate-x-2 hover:shadow-lg group"
                    >
                      <span className="w-2 h-2 bg-current rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-300"></span>
                      Login
                    </Link>
                  </li>
                  <li style={{ animationDelay: '0.5s' }}>
                    <Link
                      to="/signup"
                      className="flex items-center gap-4 px-6 py-4 text-white font-semibold rounded-xl no-underline transition-all duration-300 hover:bg-gradient-to-br hover:from-purple-600 hover:to-purple-800 hover:translate-x-2 hover:shadow-lg group"
                    >
                      <span className="w-2 h-2 bg-current rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-300"></span>
                      Sign Up
                    </Link>
                  </li>
                </>
              ) : (
                <li style={{ animationDelay: '0.4s' }}>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-4 px-6 py-4 text-white font-semibold rounded-xl bg-transparent border-0 cursor-pointer text-left transition-all duration-300 hover:bg-gradient-to-br hover:from-purple-600 hover:to-purple-800 hover:translate-x-2 hover:shadow-lg group"
                  >
                    <span className="w-2 h-2 bg-current rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-300"></span>
                    Logout
                  </button>
                </li>
              )}
            </ul>
          </nav>

          {/* Mobile Overlay */}
          {isMenuOpen && (
            <div
              className="lg:hidden fixed top-[var(--header-height)] left-0 w-full h-[calc(100vh-var(--header-height))] bg-black/50 z-[1099]"
              onClick={() => setIsMenuOpen(false)}
            ></div>
          )}
        </>
      )}

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0px) rotate(0deg) scale(1);
            opacity: 0.7;
          }
          33% {
            transform: translateY(-8px) rotate(120deg) scale(1.05);
            opacity: 0.85;
          }
          66% {
            transform: translateY(-4px) rotate(240deg) scale(0.95);
            opacity: 0.9;
          }
        }
        @keyframes swipeUp {
          0% { 
            transform: translateY(0); 
            opacity: 1;
          }
          100% { 
            transform: translateY(-100%); 
            opacity: 0.8;
          }
        }
        @keyframes swipeDown {
          0% { 
            transform: translateY(-100%); 
            opacity: 0.8;
          }
          100% { 
            transform: translateY(0); 
            opacity: 1;
          }
        }
        @keyframes pulseGlow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(147, 51, 234, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(147, 51, 234, 0.6), 0 0 40px rgba(147, 51, 234, 0.2);
          }
        }
        @keyframes subtleBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
      `}</style>
      </header>

      {/* Modern Collapsed Header Handle */}
      {!isAuthPage && isHeaderCollapsed && (
        <div className="fixed top-0 left-0 right-0 z-[1001] transition-all duration-500"
          style={{
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
          <div className="relative h-4 bg-gradient-to-r from-purple-600 via-purple-700 to-purple-800 border-b border-black/10 shadow-lg">
            {/* Enhanced bar pattern NO NEED THAT */}
            <div
              className="absolute inset-0 opacity-0"
              
            ></div>
            
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_12s_ease-in-out_infinite]"></div>
            
            {/* Modern expand button */}
            <button
              onClick={() => setIsHeaderCollapsed(false)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 bg-white/20 backdrop-blur-md text-white rounded-full border-2 border-white/30 p-2 hover:bg-white/30 hover:scale-110 transition-all duration-300 shadow-lg"
              aria-label="Expand header"
              style={{
                transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}>
              <FiChevronDown className="w-5 h-5 drop-shadow-md" style={{ animation: 'subtleBounce 4s ease-in-out infinite' }} />
            </button>
            
            {/* Subtle handle indicator */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1">
              <div className="w-1 h-1 bg-white/40 rounded-full"></div>
              <div className="w-1 h-1 bg-white/40 rounded-full"></div>
              <div className="w-1 h-1 bg-white/40 rounded-full"></div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Header
