const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { db, prepare } = require('../config/database');

class SessionService {
  static async create(userId, deviceInfo = {}, ipAddress = 'unknown') {
    const id = uuidv4();
    const token = jwt.sign({ userId, sessionId: id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const stmt = prepare(
      'INSERT INTO sessions (id, user_id, token, device_info, ip_address, expires_at) VALUES (@id, @userId, @token, @deviceInfo, @ipAddress, @expiresAt)'
    );
    stmt.run({ id, userId, token, deviceInfo: JSON.stringify(deviceInfo), ipAddress, expiresAt: expiresAt.toISOString() });
    return { token, sessionId: id };
  }

  static async findByToken(token) {
    const stmt = prepare(
      'SELECT s.*, u.name, u.email, u.role, u.is_email_verified FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = @token AND s.expires_at > datetime(\'now\') AND s.is_active = 1'
    );
    const session = stmt.get({ token });
    if (session && session.device_info) try { session.device_info = JSON.parse(session.device_info); } catch (e) { session.device_info = {}; }
    return session;
  }

  static async invalidate(token) {
    const stmt = prepare('UPDATE sessions SET is_active = 0 WHERE token = @token');
    stmt.run({ token });
  }

  static async updateActivity(token) {
    const stmt = prepare('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE token = @token');
    stmt.run({ token });
  }

  static async getActiveSessions() {
    const stmt = prepare(
      'SELECT s.*, u.name, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.expires_at > datetime(\'now\') AND s.is_active = 1 ORDER BY s.last_activity DESC'
    );
    const sessions = stmt.all();
    return sessions.map(session => ({ ...session, device_info: session.device_info ? JSON.parse(session.device_info) : {} }));
  }

  static async getUserSessions(userId) {
    const stmt = prepare(
      'SELECT * FROM sessions WHERE user_id = @userId AND expires_at > datetime(\'now\') AND is_active = 1 ORDER BY last_activity DESC'
    );
    return stmt.all({ userId });
  }

  static async cleanup() {
    const stmt = prepare('DELETE FROM sessions WHERE expires_at < datetime(\'now\')');
    const result = stmt.run();
    return result.changes;
  }
}

module.exports = SessionService;