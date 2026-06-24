const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');
const { verifyToken, requireReceptionist, requireStaff, requireDoctor, requireAdmin } = require('../middleware/auth');

// Get queue status (public/patient access)
router.get('/', queueController.getQueue);

// Get active patient token
router.get('/my-active', verifyToken, queueController.getMyActiveQueue);

// Patient self-join queue
router.post('/join', verifyToken, queueController.joinQueue);

// Register patient to queue (receptionists only)
router.post('/patients', verifyToken, requireReceptionist, queueController.addPatient);

// Call next patient (doctor or receptionist staff)
router.post('/next', verifyToken, requireStaff, queueController.callNext);

// Complete consultation (doctors only)
router.post('/complete', verifyToken, requireDoctor, queueController.completeConsultation);

// Skip patient (receptionist or doctor staff)
router.post('/skip', verifyToken, requireStaff, queueController.skipPatient);

// Recall patient back into waiting
router.post('/recall', verifyToken, requireStaff, queueController.recallPatient);

// Settings (Staff access)
router.get('/settings', verifyToken, requireStaff, queueController.getSettings);
router.post('/settings', verifyToken, requireStaff, queueController.updateSettings);

// Reset active queue line (admins only)
router.post('/reset', verifyToken, requireAdmin, queueController.resetQueue);

module.exports = router;
