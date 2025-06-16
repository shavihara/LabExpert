const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { db, prepare } = require('../config/database');

class OTPService {
  static generateOTP() { return crypto.randomInt(100000, 999999).toString(); }

  static async createOTP(userId, type = 'password_reset') {
    const stmt = prepare('UPDATE otps SET is_used = 1 WHERE user_id = @userId AND otp_type = @type AND is_used = 0');
    stmt.run({ userId, type });
    const id = uuidv4();
    const otpCode = this.generateOTP();
    const expiresAt = new Date(Date.now() + (process.env.OTP_EXPIRE_MINUTES || 10) * 60 * 1000);
    const insertStmt = prepare('INSERT INTO otps (id, user_id, otp_code, otp_type, expires_at) VALUES (@id, @userId, @otpCode, @type, @expiresAt)');
    insertStmt.run({ id, userId, otpCode, type, expiresAt: expiresAt.toISOString() });
    return otpCode;
  }

  static async verifyOTP(userId, otpCode, type = 'password_reset', markAsUsed = true) {
    const stmt = prepare(
      'SELECT * FROM otps WHERE user_id = @userId AND otp_code = @otpCode AND otp_type = @type AND is_used = 0 AND expires_at > datetime(\'now\') ORDER BY created_at DESC LIMIT 1'
    );
    const otp = stmt.get({ userId, otpCode, type });
    
    if (!otp) return { valid: false, message: 'Invalid or expired OTP' };
    
    if (markAsUsed) {
      const updateStmt = prepare('UPDATE otps SET is_used = 1 WHERE id = @id');
      updateStmt.run({ id: otp.id });
    }
    
    return { valid: true, otp };
  }

  // New method to mark OTP as verified but not used
  static async markOTPAsVerified(userId, otpCode, type = 'password_reset') {
    const stmt = prepare(
      'UPDATE otps SET is_verified = 1 WHERE user_id = @userId AND otp_code = @otpCode AND otp_type = @type AND is_used = 0 AND expires_at > datetime(\'now\')'
    );
    const result = stmt.run({ userId, otpCode, type });
    return result.changes > 0;
  }

  // New method to check if OTP is verified and valid
  static async isOTPVerified(userId, otpCode, type = 'password_reset') {
    const stmt = prepare(
      'SELECT * FROM otps WHERE user_id = @userId AND otp_code = @otpCode AND otp_type = @type AND is_verified = 1 AND is_used = 0 AND expires_at > datetime(\'now\') ORDER BY created_at DESC LIMIT 1'
    );
    const otp = stmt.get({ userId, otpCode, type });
    return !!otp;
  }

  static async cleanupExpiredOTPs() {
    const stmt = prepare('DELETE FROM otps WHERE expires_at < datetime(\'now\') OR is_used = 1');
    const result = stmt.run();
    return result.changes;
  }
}

module.exports = OTPService;