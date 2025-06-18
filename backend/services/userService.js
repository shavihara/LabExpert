const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, prepare } = require('../config/database');

class UserService {
  static async create(userData) {
    const { name, email, password } = userData;
    const id = uuidv4();
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const stmt = prepare(
        `INSERT INTO users (id, name, email, password) VALUES (@id, @name, @email, @password)`
      );
      const result = stmt.run({ id, name, email, password: hashedPassword });
      return this.findById(id);
    } catch (error) {
      console.error('Database error in create:', error);
      throw new Error('Failed to create user');
    }
  }

  static async findByEmail(email) {
    const stmt = prepare('SELECT * FROM users WHERE email = @email');
    return stmt.get({ email });
  }

  static async findById(id) {
    const stmt = prepare('SELECT id, name, email, role, profile_picture, is_email_verified, is_active, last_login, created_at FROM users WHERE id = @id');
    return stmt.get({ id });
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async updatePassword(userId, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const stmt = prepare('UPDATE users SET password = @password, updated_at = CURRENT_TIMESTAMP WHERE id = @id');
    stmt.run({ id: userId, password: hashedPassword });
  }

  static async updateLastLogin(userId) {
    const stmt = prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = @id');
    stmt.run({ id: userId });
  }

  static async verifyEmail(userId) {
    const stmt = prepare('UPDATE users SET is_email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = @id');
    stmt.run({ id: userId });
  }

  static async updateProfile(userId, updates) {
    const { name, email } = updates;
    const params = { id: userId };
    const fields = [];
    if (name) { fields.push('name = @name'); params.name = name; }
    if (email) { fields.push('email = @email, is_email_verified = 0'); params.email = email; }
    if (fields.length > 0) { fields.push('updated_at = CURRENT_TIMESTAMP'); const stmt = prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = @id`); stmt.run(params); }
    return this.findById(userId);
  }

  static async updateProfilePicture(userId, fileId) {
    const stmt = prepare('UPDATE users SET profile_picture = @fileId, updated_at = CURRENT_TIMESTAMP WHERE id = @id');
    stmt.run({ id: userId, fileId });
  }

  static async getAllUsers() {
    const stmt = prepare('SELECT id, name, email, role, is_email_verified, is_active, last_login, created_at FROM users ORDER BY created_at DESC');
    return stmt.all();
  }

  static async getStats() {
    const stmt = prepare('SELECT COUNT(*) as total_users, SUM(CASE WHEN is_email_verified = 1 THEN 1 ELSE 0 END) as verified_users, SUM(CASE WHEN created_at > datetime(\'now\', \'-7 days\') THEN 1 ELSE 0 END) as recent_signups FROM users');
    return stmt.get();
  }
}

module.exports = UserService;