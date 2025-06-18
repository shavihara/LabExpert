const { db, prepare } = require('../config/database');

const SessionService = {
  findByToken: async (token) => {
    try {
      if (!token || token === 'undefined') {
        console.error('Invalid token received in findByToken:', token);
        return null;
      }
      const stmt = prepare(`
        SELECT s.*, u.name, u.email, u.role 
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.is_active = 1 AND s.expires_at > CURRENT_TIMESTAMP
      `);
      const session = stmt.get(token);
      return session || null;
    } catch (error) {
      console.error('Error finding session by token:', error);
      throw error;
    }
  },

  create: async (userId, ipAddress) => {
    try {
      const token = require('crypto').randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const stmt = prepare(`
        INSERT INTO sessions (user_id, token, ip_address, expires_at, is_active, last_activity)
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      `);
      stmt.run(userId, token, ipAddress, expiresAt.toISOString());
      return token;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  },

  invalidate: async (token) => {
    try {
      const stmt = prepare('UPDATE sessions SET is_active = 0 WHERE token = ?');
      stmt.run(token);
    } catch (error) {
      console.error('Error invalidating session:', error);
      throw error;
    }
  },

  updateActivity: async (token) => {
    try {
      const stmt = prepare(`
        UPDATE sessions 
        SET last_activity = CURRENT_TIMESTAMP 
        WHERE token = ? AND is_active = 1
      `);
      const result = stmt.run(token);
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating session activity:', error);
      throw error;
    }
  },

  findByUserId: async (userId) => {
    try {
      const stmt = prepare(`
        SELECT * FROM sessions 
        WHERE user_id = ? AND is_active = 1 AND s.expires_at > CURRENT_TIMESTAMP
      `);
      return stmt.all(userId);
    } catch (error) {
      console.error('Error finding sessions by user ID:', error);
      throw error;
    }
  }
};

module.exports = SessionService;