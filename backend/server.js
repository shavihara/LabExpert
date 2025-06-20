const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const { authenticate } = require('./middleware/auth');
const UserService = require('./services/userService');
const SessionService = require('./services/sessionService');
const FileService = require('./services/fileService');
const OTPService = require('./services/otpService');
const { db, prepare } = require('./config/database');// Make sure prepare is imported


dotenv.config();

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Enhanced Gmail SMTP configuration
const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // Fallback manual configuration
  /*
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
  */
});

// Test email configuration on startup
transport.verify(function(error, success) {
  if (error) {
    console.log('❌ Email configuration error:', error.message);
    console.log('📧 Please check your EMAIL_USER and EMAIL_PASS in .env file');
  } else {
    console.log('✅ Email server is ready to take our messages');
  }
});

// Replace your existing login endpoint in server.js with this:

app.post('/api/auth/login', async (req, res) => {
  console.log('📧 Login attempt for:', req.body.email);
  const { email, password } = req.body;
  
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const user = await UserService.findByEmail(email);
      if (!user) {
        console.log('❌ User not found for:', email);
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const isValidPassword = await UserService.validatePassword(password, user.password);
      if (!isValidPassword) {
        console.log('❌ Invalid password for:', email);
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      await UserService.updateLastLogin(user.id);
      const token = await SessionService.create(user.id, req.body.deviceInfo, req.ip);
      
      console.log('✅ Login successful for:', email);
      res.json({ 
        success: true, 
        token, 
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email,
          role: user.role 
        } 
      });
      return; // Exit successfully
      
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && attempt < maxRetries - 1) {
        attempt++;
        console.warn(`SQLITE_BUSY in login, retry ${attempt}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        continue;
      }
      
      console.error('Login error:', error);
      if (error.message.includes('database is locked')) {
        return res.status(503).json({ 
          success: false, 
          message: 'System is busy. Please try again in a few seconds.' 
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        message: 'Login failed' 
      });
    }
  }
});

app.post('/api/auth/signup', async (req, res) => {
  console.log('👤 Signup attempt for:', req.body.email);
  const { name, email, password } = req.body;
  try {
    const existingUser = await UserService.findByEmail(email);
    if (existingUser) {
      console.log('❌ Email already exists:', email);
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    const user = await UserService.create({ name, email, password });
    const { token } = await SessionService.create(user.id);
    console.log('✅ Signup successful for:', email);
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Signup failed' });
  }
});

app.get('/api/auth/check-email', async (req, res) => {
  const { email } = req.query;
  try {
    const user = await UserService.findByEmail(email);
    res.json({ exists: !!user });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ exists: false });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  console.log('🔐 Forgot password request for:', email);
  
  try {
    // Check if user exists
    const user = await UserService.findByEmail(email);
    if (!user) {
      console.log('❌ User not found for email:', email);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    console.log('✅ User found, generating OTP...');
    
    // Generate OTP
    const otp = await OTPService.createOTP(user.id);
    console.log('🔢 OTP generated:', otp);
    
    // Prepare email content
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset OTP - Lab Expert',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #667eea; margin: 0;">Lab Expert</h1>
            <p style="color: #666; margin: 5px 0;">Password Reset Request</p>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center;">
            <h2 style="color: #333; margin-bottom: 15px;">Your OTP Code</h2>
            <div style="background-color: #fff; padding: 20px; border-radius: 8px; border: 2px solid #667eea; display: inline-block;">
              <h1 style="font-size: 36px; color: #667eea; margin: 0; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</h1>
            </div>
            <p style="color: #666; margin-top: 20px; font-size: 14px;">
              ⏰ This OTP will expire in <strong>10 minutes</strong>
            </p>
          </div>
          
          <div style="margin-top: 30px; padding: 20px; background-color: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>Security Note:</strong> If you didn't request this password reset, please ignore this email and your password will remain unchanged.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              This email was sent from Lab Expert system<br>
              Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
      text: `Lab Expert - Password Reset\n\nYour OTP for password reset is: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you didn't request this password reset, please ignore this email.\n\n- Lab Expert Team`
    };
    
    console.log('📧 Attempting to send email to:', email);
    
    // Send email
    const info = await transport
  .sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    
    res.json({ 
      success: true, 
      message: 'OTP sent successfully to your email',
      messageId: info.messageId 
    });
    
  } catch (err) {
    console.error('❌ Forgot password error:', err);
    
    // Enhanced error handling with specific messages
    let errorMessage = 'Failed to send OTP';
    
    if (err.code === 'ECONNREFUSED') {
      errorMessage = 'Failed to connect to email server. Please try again later.';
      console.log('📧 Email server connection refused');
    } else if (err.message.includes('ENOTFOUND')) {
      errorMessage = 'Email host not found. Please check configuration.';
      console.log('📧 Email host not found');
    } else if (err.message.includes('Invalid login') || err.message.includes('Username and Password not accepted')) {
      errorMessage = 'Email authentication failed. Please contact support.';
      console.log('📧 Email authentication failed - check EMAIL_USER and EMAIL_PASS');
    } else if (err.code === 'ESOCKET') {
      errorMessage = 'Network error. Please check your internet connection.';
      console.log('📧 Network/socket error');
    } else {
      errorMessage = `Email sending failed: ${err.message}`;
      console.log('📧 Other email error:', err.message);
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Test endpoint for email configuration
app.get('/api/test-email', async (req, res) => {
  console.log('🧪 Testing email configuration...');
  
  try {
    const testEmail = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Send test email to yourself
      subject: 'Test Email - Lab Expert Configuration',
      html: `
        <h2>✅ Email Configuration Test</h2>
        <p>This is a test email to verify that your Lab Expert email configuration is working correctly.</p>
        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        <p>If you received this email, your SMTP settings are configured properly!</p>
      `,
      text: 'Lab Expert Email Configuration Test - If you received this, your email settings are working!'
    };
    
    const info = await transport
  .sendMail(testEmail);
    console.log('✅ Test email sent successfully:', info.messageId);
    
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: info.messageId,
      to: process.env.EMAIL_USER
    });
  } catch (error) {
    console.error('❌ Test email failed:', error);
    res.status(500).json({ 
      success: false, 
      message: `Test email failed: ${error.message}`,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Replace these endpoints in your server.js

app.post('/api/auth/verify-otp-only', async (req, res) => {
  const { email, otp } = req.body;
  
  console.log('🔐 OTP verification attempt for:', email);
  
  try {
    const user = await UserService.findByEmail(email);
    if (!user) {
      console.log('❌ User not found for email:', email);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Verify OTP without marking as used
    const { valid } = await OTPService.verifyOTP(user.id, otp, 'password_reset', false);
    if (!valid) {
      console.log('❌ Invalid OTP for user:', email);
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }
    
    // Mark OTP as verified (but not used)
    await OTPService.markOTPAsVerified(user.id, otp, 'password_reset');
    
    console.log('✅ OTP verified successfully for:', email);
    
    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ success: false, message: 'OTP verification failed' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  
  console.log('🔐 Password reset attempt for:', email);
  
  try {
    const user = await UserService.findByEmail(email);
    if (!user) {
      console.log('❌ User not found for email:', email);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check if OTP is verified and still valid
    const isVerified = await OTPService.isOTPVerified(user.id, otp, 'password_reset');
    if (!isVerified) {
      console.log('❌ OTP not verified or expired for user:', email);
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please verify OTP again.' });
    }
    
    // Update password
    await UserService.updatePassword(user.id, newPassword);
    
    // Now mark OTP as used
    await OTPService.verifyOTP(user.id, otp, 'password_reset', true);
    
    console.log('✅ Password updated successfully for:', email);
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ success: false, message: 'Password reset failed' });
  }
});


//admin

//admin.........................




app.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    await SessionService.invalidate(token);
    console.log('✅ User logged out successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

app.get('/api/user/me', authenticate, async (req, res) => {
  try {
    const user = await UserService.findById(req.user.id);
    res.json({ success: true, user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user' });
  }
});

app.post('/api/user/profile-picture', authenticate, upload.single('profilePicture'), async (req, res) => {
  try {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const { id } = await FileService.saveProfilePicture(file, req.user.id);
    await UserService.updateProfilePicture(req.user.id, id);
    
    console.log('✅ Profile picture uploaded for user:', req.user.id);
    res.json({ success: true, file: { id } });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload profile picture' });
  }
});

app.get('/api/files/:fileId', authenticate, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { data, file } = await FileService.getFileData(fileId);
    res.contentType(file.mimetype).send(data);
  } catch (error) {
    console.error('File retrieval error:', error);
    res.status(404).json({ success: false, message: 'File not found' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Lab Expert API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('🚀 Lab Expert Server started successfully!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 API URL: http://localhost:${PORT}/api`);
  console.log(`📧 Email configured: ${process.env.EMAIL_USER}`);
  console.log('💡 Test email endpoint: GET /api/test-email');
  console.log('💡 Health check: GET /api/health');
});



//admin dash board data
// Add these admin endpoints to your server.js BEFORE app.listen()

// Admin middleware
const requireAdmin = async (req, res, next) => {
  try {
    console.log('🔐 Admin check for:', req.user?.email);
    if (!req.user || req.user.email !== 'labexpert.us@gmail.com') {
      console.log('❌ Admin access denied for:', req.user?.email);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    console.log('✅ Admin access granted');
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Admin Dashboard Stats
app.get('/api/admin/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    console.log('📊 Fetching admin dashboard data...');
    
    // Get total users
    const totalUsersStmt = prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
    const totalUsers = totalUsersStmt.get().count;

    // Get verified users
    const verifiedUsersStmt = prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1 AND is_email_verified = 1');
    const verifiedUsers = verifiedUsersStmt.get().count;

    // Get recent signups (last 30 days)
    const recentSignupsStmt = prepare(`
      SELECT COUNT(*) as count FROM users 
      WHERE is_active = 1 AND created_at >= datetime('now', '-30 days')
    `);
    const recentSignups = recentSignupsStmt.get().count;

    // Get active sessions
    const activeSessionsStmt = prepare(`
      SELECT COUNT(*) as count FROM sessions 
      WHERE is_active = 1 AND expires_at > CURRENT_TIMESTAMP
    `);
    const activeSessions = activeSessionsStmt.get().count;

    // Get recent users
    const recentUsersStmt = prepare(`
      SELECT name, email, created_at 
      FROM users 
      WHERE is_active = 1 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    const recentUsers = recentUsersStmt.all();

    // Get active sessions with user details
    const sessionsStmt = prepare(`
      SELECT s.ip_address, s.last_activity, u.name, u.email 
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.is_active = 1 AND s.expires_at > CURRENT_TIMESTAMP
      ORDER BY s.last_activity DESC
      LIMIT 5
    `);
    const activeSessions_list = sessionsStmt.all();

    const dashboardData = {
      stats: {
        totalUsers,
        verifiedUsers,
        recentSignups,
        activeSessions
      },
      recentUsers,
      activeSessions_list
    };

    console.log('✅ Dashboard data:', dashboardData);
    res.json({ success: true, data: dashboardData });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
});

// Admin Users List
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    console.log('👥 Fetching users list...');
    
    const usersStmt = prepare(`
      SELECT id, name, email, role, is_email_verified, is_active, last_login, created_at
      FROM users 
      ORDER BY created_at DESC
    `);
    const users = usersStmt.all();

    console.log('✅ Users fetched:', users.length);
    res.json({ success: true, users });
  } catch (error) {
    console.error('❌ Users fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// Admin System Info
app.get('/api/admin/system', authenticate, requireAdmin, async (req, res) => {
  try {
    console.log('⚙️ Fetching system info...');
    
    const systemInfo = {
      database: 'SQLite',
      version: '1.0.0',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    };

    console.log('✅ System info fetched');
    res.json({ success: true, system: systemInfo });
  } catch (error) {
    console.error('❌ System info error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch system info' });
  }
});