const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const { verifyToken, requireDoctor } = require('../middleware/auth');

// Get all doctors (public / receptionist use during checkout)
router.get('/', doctorController.getDoctors);

// Update status (doctors only)
router.post('/status', verifyToken, requireDoctor, doctorController.updateStatus);

// Update room number (doctors only)
router.post('/room', verifyToken, requireDoctor, doctorController.updateRoom);

module.exports = router;
