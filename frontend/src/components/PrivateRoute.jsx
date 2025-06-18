import { Navigate } from 'react-router-dom';

function PrivateRoute({ children, requiredRole = null }) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/home'} replace />;
  }
  
  return children;
}

export default PrivateRoute;