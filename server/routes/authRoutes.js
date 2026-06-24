const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// Login Route with rate limiter
router.post('/login', authLimiter, authController.login);

// Google OAuth Route with rate limiter
router.post('/google', authLimiter, authController.googleLogin);

// Logout Route
router.post('/logout', authController.logout);

// Register Route (receptionist/admin registers others, patients can self-register if role is Patient)
router.post('/register', authController.register);

// Patient Self-Register Route
router.post('/register-patient', authLimiter, authController.registerPatient);


// Check Session / Profile Route
router.get('/session', verifyToken, authController.checkSession);

// Profile Updates
router.post('/profile', verifyToken, authController.updateProfile);
router.post('/change-password', verifyToken, authController.changePassword);

// Password Reset Routes
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

const { requireAdmin } = require('../middleware/auth');

// Admin User Management Routes
router.get('/users', verifyToken, requireAdmin, authController.getUsers);
router.delete('/users/:id', verifyToken, requireAdmin, authController.deleteUser);

module.exports = router;
