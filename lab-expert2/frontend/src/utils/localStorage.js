// Local storage functions for user management

export const saveUser = (userData) => {
  const users = getUsers();
  users.push(userData);
  localStorage.setItem('labExpertUsers', JSON.stringify(users));
};

export const getUsers = () => {
  const users = localStorage.getItem('labExpertUsers');
  return users ? JSON.parse(users) : [];
};

export const findUser = (email, password) => {
  const users = getUsers();
  return users.find(user => user.email === email && user.password === password);
};

export const checkEmailExists = (email) => {
  const users = getUsers();
  return users.some(user => user.email === email);
};

export const updateUserPassword = (email, newPassword) => {
  const users = getUsers();
  const updatedUsers = users.map(user => 
    user.email === email ? { ...user, password: newPassword } : user
  );
  localStorage.setItem('labExpertUsers', JSON.stringify(updatedUsers));
};

export const setCurrentUser = (user) => {
  localStorage.setItem('currentUser', JSON.stringify(user));
};

export const getCurrentUser = () => {
  const user = localStorage.getItem('currentUser');
  return user ? JSON.parse(user) : null;
};

export const logout = () => {
  localStorage.removeItem('currentUser');
};