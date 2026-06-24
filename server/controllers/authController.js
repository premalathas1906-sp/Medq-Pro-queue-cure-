const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('../database/db');
const { JWT_SECRET } = require('../middleware/auth');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '109283748291-mockclientid.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);


// Helpers
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '8h' });
};

const checkIfDefaultPassword = async (passwordHash) => {
  if (!passwordHash) return false;
  const defaults = ['Admin@123', 'Doctor@123', 'Receptionist@123', 'Patient@123'];
  for (const d of defaults) {
    if (await bcrypt.compare(d, passwordHash)) {
      return true;
    }
  }
  return false;
};

// Login User
const login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = generateToken(user.id);

    // Set JWT in HTTP-Only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });

    const isDefault = await checkIfDefaultPassword(user.password_hash);

    // Strip password hash
    delete user.password_hash;
    user.isDefaultPassword = isDefault;

    // Log login audit event
    await dbQuery.run(
      'INSERT INTO audit_logs (id, user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [`a-${Date.now()}`, user.id, 'LOGIN', `User ${user.email} logged in.`, req.ip, new Date().toISOString()]
    );

    if (global.io && user.role === 'Patient') {
      global.io.emit('patient_logged_in', { email: user.email, name: user.name });
    }

    res.json({ success: true, token, user });
  } catch (err) {
    next(err);
  }
};

// Logout User
const logout = async (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
};

// Register User (Receptionist/Admin only can register others, Patients can self-register too)
const register = async (req, res, next) => {
  const { email, password, name, phone, role, details } = req.body;
  // details can include: specialization, room_number, dob, gender, address, emergency_contact, etc.

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'Required fields: email, password, name, role' });
  }

  try {
    // Check if user already exists
    const existing = await dbQuery.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const userId = `u-${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    // Insert user row
    await dbQuery.run(
      `INSERT INTO users (id, email, password_hash, role, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, passwordHash, role, name, phone || '', now, now]
    );

    // Insert role-specific details
    if (role === 'Patient') {
      const patientId = `p-${Date.now()}`;
      await dbQuery.run(
        `INSERT INTO patients (id, user_id, dob, gender, address, emergency_contact, medical_history) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [patientId, userId, details?.dob || '', details?.gender || 'Other', details?.address || '', details?.emergency_contact || '', JSON.stringify(details?.medical_history || {})]
      );
    } else if (role === 'Doctor') {
      const doctorId = `d-${Date.now()}`;
      await dbQuery.run(
        `INSERT INTO doctors (id, user_id, specialization, room_number, status, consultation_fee, avg_duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [doctorId, userId, details?.specialization || 'General', details?.room_number || 'Room 1', 'Offline', parseFloat(details?.consultation_fee || 100.0), parseFloat(details?.avg_duration_minutes || 10)]
      );
    } else if (role === 'Receptionist') {
      const recepId = `r-${Date.now()}`;
      await dbQuery.run(
        `INSERT INTO receptionists (id, user_id, shift_hours) VALUES (?, ?, ?)`,
        [recepId, userId, details?.shift_hours || '08:00 - 16:00']
      );
    }

    // Log register audit event
    await dbQuery.run(
      'INSERT INTO audit_logs (id, user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [`a-${Date.now()}`, req.user ? req.user.id : userId, 'REGISTER_USER', `Registered ${role}: ${email}`, req.ip, now]
    );

    res.status(201).json({ success: true, message: `${role} registered successfully.`, userId });
  } catch (err) {
    next(err);
  }
};

// Check current session state (returns authenticated user profile info)
const checkSession = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No active session' });
  }

  try {
    let details = null;

    if (req.user.role === 'Patient') {
      details = await dbQuery.get('SELECT * FROM patients WHERE user_id = ?', [req.user.id]);
    } else if (req.user.role === 'Doctor') {
      details = await dbQuery.get('SELECT * FROM doctors WHERE user_id = ?', [req.user.id]);
    } else if (req.user.role === 'Receptionist') {
      details = await dbQuery.get('SELECT * FROM receptionists WHERE user_id = ?', [req.user.id]);
    }

    const userRow = await dbQuery.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const isDefault = await checkIfDefaultPassword(userRow ? userRow.password_hash : null);
    req.user.isDefaultPassword = isDefault;

    res.json({
      success: true,
      user: req.user,
      details
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch session details.' });
  }
};

// Forgot Password
const forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await dbQuery.get('SELECT id FROM users WHERE email = ?', [email]);
    if (!user) {
      // Avoid revealing user exists or not for security, but return success
      return res.json({ success: true, message: 'Password reset link sent if email exists' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Store in settings as temporary reset store (key = reset_token:hash, value = user_id)
    await dbQuery.run(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      [`reset:${tokenHash}`, JSON.stringify({ userId: user.id, expiry: Date.now() + 30 * 60 * 1000 })] // 30 mins expiry
    );

    const resetUrl = `http://localhost:5174/?view=reset-password&token=${resetToken}`;
    console.log(`[Email Simulation] Password Reset Link: ${resetUrl}`);

    res.json({ success: true, message: 'Password reset link simulated and logged in console.', resetUrl });
  } catch (err) {
    next(err);
  }
};

// Reset Password
const resetPassword = async (req, res, next) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetSetting = await dbQuery.get('SELECT value FROM settings WHERE key = ?', [`reset:${tokenHash}`]);
    
    if (!resetSetting) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const { userId, expiry } = JSON.parse(resetSetting.value);
    if (Date.now() > expiry) {
      await dbQuery.run('DELETE FROM settings WHERE key = ?', [`reset:${tokenHash}`]);
      return res.status(400).json({ error: 'Token expired' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await dbQuery.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [newHash, new Date().toISOString(), userId]
    );

    // Delete token after use
    await dbQuery.run('DELETE FROM settings WHERE key = ?', [`reset:${tokenHash}`]);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
};

// Update Profile
const updateProfile = async (req, res, next) => {
  const { name, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    await dbQuery.run(
      'UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?',
      [name, phone || '', new Date().toISOString(), req.user.id]
    );

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    next(err);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const users = await dbQuery.all(`
      SELECT id, email, role, name, phone, avatar_url, created_at, updated_at
      FROM users
      ORDER BY role ASC, name ASC
    `);
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
};

const deleteUser = async (req, res, next) => {
  const { id } = req.params;
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  try {
    const user = await dbQuery.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await dbQuery.run('DELETE FROM users WHERE id = ?', [id]);
    
    // Log audit log
    await dbQuery.run(
      'INSERT INTO audit_logs (id, user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [`a-${Date.now()}`, req.user.id, 'DELETE_USER', `Deleted user account ID: ${id}`, req.ip, new Date().toISOString()]
    );

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// Google OAuth Login
const googleLogin = async (req, res, next) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Google ID Token (credential) is required' });
  }

  try {
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
    } catch (verifyErr) {
      console.error('Google ID token verification failed:', verifyErr.message);
      // Fallback for mock local testing if the token is a mock/test credential
      if (process.env.NODE_ENV !== 'production' && credential.startsWith('mock_google_token_')) {
        const mockEmail = credential.replace('mock_google_token_', '');
        ticket = {
          getPayload: () => ({
            email: mockEmail,
            name: mockEmail.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
            picture: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
          })
        };
      } else {
        return res.status(401).json({ error: 'Invalid Google authentication token' });
      }
    }

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Google token payload is missing email address' });
    }

    // 1. Check if user already exists
    let user = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email]);
    const now = new Date().toISOString();

    if (!user) {
      // 2. Automatically create new user with default role = 'Patient'
      const userId = `u-google-${Date.now()}`;
      
      await dbQuery.run(
        `INSERT INTO users (id, email, password_hash, role, name, phone, avatar_url, auth_provider, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, email, null, 'Patient', name, '', picture || '', 'google', now, now]
      );

      // Create Patient profile entry
      const patientId = `p-${Date.now()}`;
      await dbQuery.run(
        `INSERT INTO patients (id, user_id, dob, gender, address, emergency_contact, medical_history)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [patientId, userId, '', 'Other', '', '', JSON.stringify({})]
      );

      // Log registration audit event
      await dbQuery.run(
        'INSERT INTO audit_logs (id, user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        [`a-${Date.now()}`, userId, 'REGISTER_USER', `Self-registered via Google: ${email}`, req.ip, now]
      );

      // Fetch user again
      user = await dbQuery.get('SELECT id, email, role, name, phone, avatar_url FROM users WHERE id = ?', [userId]);
    } else {
      // 3. User exists: Log them in and verify role. Ensure auth_provider is updated if local previously logging in with google (or maintain auth_provider)
      if (user.auth_provider !== 'google') {
        await dbQuery.run('UPDATE users SET auth_provider = ?, avatar_url = ?, updated_at = ? WHERE id = ?', ['google', picture || user.avatar_url, now, user.id]);
        user.auth_provider = 'google';
        user.avatar_url = picture || user.avatar_url;
      }
      delete user.password_hash;
    }

    // Generate JWT
    const token = generateToken(user.id);

    // Set JWT in HTTP-Only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });

    // Log login audit event
    await dbQuery.run(
      'INSERT INTO audit_logs (id, user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [`a-${Date.now()}`, user.id, 'LOGIN', `User ${user.email} logged in via Google OAuth.`, req.ip, now]
    );

    if (global.io && user.role === 'Patient') {
      global.io.emit('patient_logged_in', { email: user.email, name: user.name });
    }

    user.isDefaultPassword = false;
    res.json({ success: true, token, user });
  } catch (err) {
    next(err);
  }
};

const registerPatient = async (req, res, next) => {
  const { name, email, phone, password, dob, gender } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: 'Name, email, mobile number, and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  try {
    const existingEmail = await dbQuery.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail) {
      return res.status(400).json({ error: 'A user with this email address already exists' });
    }

    const existingPhone = await dbQuery.get('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existingPhone) {
      return res.status(400).json({ error: 'A user with this mobile number already exists' });
    }

    const userId = `u-patient-${Date.now()}`;
    const patientId = `p-${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    await dbQuery.run(
      `INSERT INTO users (id, email, password_hash, role, name, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, passwordHash, 'Patient', name, phone, now, now]
    );

    await dbQuery.run(
      `INSERT INTO patients (id, user_id, dob, gender, address, emergency_contact, medical_history)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [patientId, userId, dob || '', gender || 'Other', '', '', JSON.stringify({})]
    );

    const token = generateToken(userId);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });

    const user = { id: userId, email, role: 'Patient', name, phone };

    if (global.io) {
      global.io.emit('patient_registered', { email, name });
      global.io.emit('patient_logged_in', { email, name });
    }

    await dbQuery.run(
      'INSERT INTO audit_logs (id, user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [`a-${Date.now()}`, userId, 'REGISTER_PATIENT', `Patient self-registered: ${email}`, req.ip, now]
    );

    user.isDefaultPassword = false;
    res.status(201).json({ success: true, token, user });
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long' });
  }

  try {
    const user = await dbQuery.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user || !user.password_hash) {
      return res.status(404).json({ error: 'User not found or has no local password' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await dbQuery.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [newHash, new Date().toISOString(), req.user.id]
    );

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
  logout,
  register,
  checkSession,
  forgotPassword,
  resetPassword,
  updateProfile,
  getUsers,
  deleteUser,
  googleLogin,
  registerPatient,
  changePassword
};
