import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getCurrentUser } from '../utils/api';

function PrivateRoute({ requiredRole }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        console.log('PrivateRoute getCurrentUser:', currentUser); // Debug log
        setUser(currentUser);
      } catch (error) {
        console.error('PrivateRoute error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    console.log('No user found, redirecting to /login'); // Debug log
    return <Navigate to="/login" />;
  }

  if (requiredRole && user.email !== 'labexpert.us@gmail.com') {
    console.log('Unauthorized access for:', user.email, 'redirecting to /home'); // Debug log
    return <Navigate to="/home" />;
  }

  return <Outlet />;
}

export default PrivateRoute;