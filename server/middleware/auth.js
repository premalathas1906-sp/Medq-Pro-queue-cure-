const jwt = require('jsonwebtoken');
const { dbQuery } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'medq_pro_jwt_secret_key_99';

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  // Check Authorization header or cookies
  let token = null;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch user from DB to verify status and role
    const user = await dbQuery.get(
      'SELECT id, email, role, name, phone, avatar_url FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'User session expired or user not found.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('JWT Verification Error:', err.message);
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
};

// Role Check Middlewares
const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden. Access requires one of these roles: ${roles.join(', ')}` });
    }
    
    next();
  };
};

const requireAdmin = requireRole(['Admin']);
const requireDoctor = requireRole(['Doctor']);
const requireReceptionist = requireRole(['Receptionist']);
const requireStaff = requireRole(['Admin', 'Doctor', 'Receptionist']);

module.exports = {
  verifyToken,
  requireRole,
  requireAdmin,
  requireDoctor,
  requireReceptionist,
  requireStaff,
  JWT_SECRET
};
