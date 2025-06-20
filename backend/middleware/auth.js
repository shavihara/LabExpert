const jwt = require('jsonwebtoken');
const { get } = require('../config/database');
const SessionService = require('../services/sessionService');

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

  try {
    const session = await SessionService.findByToken(token);
    if (!session) return res.status(401).json({ success: false, message: 'Invalid token' });

    req.user = { id: session.user_id, name: session.name, email: session.email, role: session.role };
    await SessionService.updateActivity(token);
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

module.exports = { authenticate };