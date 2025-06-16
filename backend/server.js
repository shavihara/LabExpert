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
const { db } = require('./config/database');

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

app.post('/api/auth/login', async (req, res) => {
  console.log('📧 Login attempt for:', req.body.email);
  const { email, password } = req.body;
  try {
    const user = await UserService.findByEmail(email);
    if (!user || !await UserService.validatePassword(password, user.password)) {
      console.log('❌ Invalid credentials for:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    await UserService.updateLastLogin(user.id);
    const { token } = await SessionService.create(user.id, req.body.deviceInfo, req.ip);
    console.log('✅ Login successful for:', email);
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
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

app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  
  console.log('🔐 OTP verification attempt for:', email);
  
  try {
    const user = await UserService.findByEmail(email);
    if (!user) {
      console.log('❌ User not found for email:', email);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const { valid } = await OTPService.verifyOTP(user.id, otp);
    if (!valid) {
      console.log('❌ Invalid OTP for user:', email);
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }
    
    await UserService.updatePassword(user.id, newPassword);
    console.log('✅ Password updated successfully for:', email);
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ success: false, message: 'Password reset failed' });
  }
});

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