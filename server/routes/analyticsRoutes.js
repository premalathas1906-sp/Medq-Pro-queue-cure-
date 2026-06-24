const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { verifyToken, requireStaff } = require('../middleware/auth');

// Get live analytics stats (staff only)
router.get('/', verifyToken, requireStaff, analyticsController.getAnalytics);

// Export CSV report (staff only)
router.get('/reports/csv', verifyToken, requireStaff, analyticsController.exportCSV);

// Export HTML/Printable PDF report (staff only)
const { requireAdmin } = require('../middleware/auth');

router.get('/reports/pdf', verifyToken, requireStaff, analyticsController.exportPDF);
router.get('/audit-logs', verifyToken, requireAdmin, analyticsController.getAuditLogs);

module.exports = router;
