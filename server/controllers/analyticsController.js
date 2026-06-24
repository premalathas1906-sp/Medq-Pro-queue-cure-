const { dbQuery } = require('../database/db');
const { compileQueueReportData, generateCSVReport, generateHTMLReport } = require('../services/reportService');

// Get live analytics data for dashboard charts
const getAnalytics = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Today's summary counts
    const todayCounts = await dbQuery.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'Waiting' THEN 1 ELSE 0 END) as waiting,
        SUM(CASE WHEN status = 'Skipped' THEN 1 ELSE 0 END) as skipped,
        SUM(CASE WHEN priority = 'Emergency' THEN 1 ELSE 0 END) as emergency
      FROM queue 
      WHERE date(added_at) = date('now')
    `);

    // Doctor performance metrics (average duration and count seen today)
    const doctorStats = await dbQuery.all(`
      SELECT 
        u.name as doctor_name,
        d.specialization,
        COUNT(q.id) as total_seen,
        AVG(c.duration_seconds) as avg_duration_seconds
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN queue q ON q.doctor_id = d.id AND q.status = 'Completed' AND date(q.added_at) = date('now')
      LEFT JOIN consultations c ON c.queue_id = q.id
      GROUP BY d.id
    `);

    // Registrations by hour (Busiest Hours chart data)
    const hourlyData = await dbQuery.all(`
      SELECT 
        strftime('%H', added_at) as hour, 
        COUNT(*) as count 
      FROM queue 
      WHERE date(added_at) = date('now')
      GROUP BY hour
      ORDER BY hour ASC
    `);

    // Map hourly data to a complete 9 AM to 6 PM format for frontend charts
    const chartHourly = [];
    for (let h = 9; h <= 18; h++) {
      const hStr = h.toString().padStart(2, '0');
      const record = hourlyData.find(d => d.hour === hStr);
      const label = h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`;
      chartHourly.push({
        hour: label,
        count: record ? record.count : 0
      });
    }

    res.json({
      success: true,
      summary: {
        total: todayCounts.total || 0,
        completed: todayCounts.completed || 0,
        waiting: todayCounts.waiting || 0,
        skipped: todayCounts.skipped || 0,
        emergency: todayCounts.emergency || 0
      },
      doctors: doctorStats.map(d => ({
        name: d.doctor_name,
        specialization: d.specialization,
        totalSeen: d.total_seen,
        avgDurationMinutes: d.avg_duration_seconds ? Math.round(d.avg_duration_seconds / 60) : 0
      })),
      hourly: chartHourly
    });
  } catch (err) {
    next(err);
  }
};

// Export CSV Report
const exportCSV = async (req, res, next) => {
  const { range } = req.query; // daily, weekly, monthly
  try {
    const reportData = await compileQueueReportData(range || 'daily');
    const csvContent = generateCSVReport(reportData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=medq-report-${range || 'daily'}-${Date.now()}.csv`);
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
};

// Export HTML/Printable PDF Report
const exportPDF = async (req, res, next) => {
  const { range } = req.query;
  try {
    const reportData = await compileQueueReportData(range || 'daily');
    const htmlContent = generateHTMLReport(reportData);

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlContent);
  } catch (err) {
    next(err);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const logs = await dbQuery.all(`
      SELECT a.*, u.name as user_name, u.email as user_email
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.timestamp DESC LIMIT 100
    `);
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAnalytics,
  exportCSV,
  exportPDF,
  getAuditLogs
};
