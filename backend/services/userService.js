const { db, prepare } = require('../config/database');
const bcrypt = require('bcryptjs'); // Add this import

const UserService = {
  findByEmail: async (email) => {
    try {
      const stmt = prepare('SELECT * FROM users WHERE email = ? AND is_active = 1');
      return stmt.get(email);
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  },

  findById: async (id) => {
    try {
      const stmt = prepare('SELECT * FROM users WHERE id = ? AND is_active = 1');
      return stmt.get(id);
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  },

  // ADD THIS FUNCTION - This is what's missing!
  validatePassword: async (inputPassword, hashedPassword) => {
    try {
      return await bcrypt.compare(inputPassword, hashedPassword);
    } catch (error) {
      console.error('Error validating password:', error);
      return false;
    }
  },

  updateLastLogin: async (userId) => {
    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await db.transaction(() => {
          const stmt = prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
          stmt.run(userId);
        })();
        return true;
      } catch (error) {
        if (error.code === 'SQLITE_BUSY') {
          attempt++;
          console.warn(`SQLITE_BUSY in updateLastLogin, retry ${attempt}/${maxRetries}`);
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
          if (attempt === maxRetries) {
            console.error('Max retries reached in updateLastLogin:', error);
            throw error;
          }
        } else {
          console.error('Error updating last login:', error);
          throw error;
        }
      }
    }
  },

  create: async (userData) => {
    try {
      const { id, name, email, password, role = 'user', is_email_verified = 0, is_active = 1 } = userData;
      await db.transaction(() => {
        const stmt = prepare(`
          INSERT INTO users (id, name, email, password, role, is_email_verified, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, name, email, password, role, is_email_verified, is_active);
      })();
      return true;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  updatePassword: async (email, newPassword) => {
    try {
      await db.transaction(() => {
        const stmt = prepare('UPDATE users SET password = ? WHERE email = ?');
        stmt.run(newPassword, email);
      })();
      return true;
    } catch (error) {
      console.error('Error updating password:', error);
      throw error;
    }
  }
};

module.exports = UserService;