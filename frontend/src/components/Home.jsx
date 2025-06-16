import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, logoutUser } from '../utils/api';
import ProfilePictureUpload from './ProfilePictureUpload';

function Home() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = await getCurrentUser();
      if (currentUser) setUser(currentUser);
      else navigate('/login');
    };
    fetchUser();
  }, [navigate]);

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login');
  };

  if (!user) return <div>Loading...</div>;

  return (
    <div className="home-container">
      <h1>Welcome, {user.name}</h1>
      <p>Email: {user.email}</p>
      <ProfilePictureUpload currentPictureId={user.profilePicture} onUploadSuccess={(file) => setUser({ ...user, profilePicture: file.id })} />
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}

export default Home;