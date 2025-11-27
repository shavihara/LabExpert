import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { getCurrentUser } from '../utils/api';

function PrivateRoute({ children, requiredRole }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        console.log('🔍 PrivateRoute: Checking user authentication...');
        const currentUser = await getCurrentUser();
        console.log('✅ PrivateRoute: User data:', currentUser);
        setUser(currentUser);
      } catch (error) {
        console.error('❌ PrivateRoute error:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '1.2rem'
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    console.log('❌ No user found, redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  // Check admin role
  if (requiredRole === 'admin') {
    const role = (user.role || '').toLowerCase();
    const isAdmin = role === 'admin' || role === 'superadmin';
    if (!isAdmin) {
      console.log('❌ User is not admin, redirecting to /home');
      return <Navigate to="/home" replace />;
    }
  }

  console.log('✅ PrivateRoute: Rendering children');
  return children;
}

export default PrivateRoute;