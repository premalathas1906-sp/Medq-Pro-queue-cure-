const { dbQuery } = require('../database/db');

// Compile clinic queue stats from SQLite database
const compileQueueReportData = async (range = 'daily') => {
  let timeFilter = "date(added_at) = date('now')"; // default daily
  
  if (range === 'weekly') {
    timeFilter = "date(added_at) >= date('now', '-7 days')";
  } else if (range === 'monthly') {
    timeFilter = "date(added_at) >= date('now', '-30 days')";
  }

  const stats = await dbQuery.get(`
    SELECT 
      COUNT(*) as total_registered,
      SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_count,
      SUM(CASE WHEN status = 'Waiting' THEN 1 ELSE 0 END) as waiting_count,
      SUM(CASE WHEN status = 'Skipped' THEN 1 ELSE 0 END) as skipped_count,
      SUM(CASE WHEN priority = 'Emergency' THEN 1 ELSE 0 END) as emergency_count
    FROM queue 
    WHERE ${timeFilter}
  `);

  const doctorPerformance = await dbQuery.all(`
    SELECT 
      u.name as doctor_name,
      d.specialization,
      d.room_number,
      COUNT(q.id) as total_seen,
      AVG(c.duration_seconds) as avg_duration_seconds
    FROM doctors d
    JOIN users u ON d.user_id = u.id
    LEFT JOIN queue q ON q.doctor_id = d.id AND q.status = 'Completed' AND ${timeFilter.replace('added_at', 'q.added_at')}
    LEFT JOIN consultations c ON c.queue_id = q.id
    GROUP BY d.id
  `);

  return {
    range,
    compiledAt: new Date().toLocaleString(),
    summary: stats,
    doctors: doctorPerformance
  };
};

// Generate CSV string from stats payload
const generateCSVReport = (data) => {
  let csv = '';
  
  // 1. Title & Header
  csv += `MEDQ PRO CLINIC REPORT,Range: ${data.range.toUpperCase()},Compiled At: ${data.compiledAt}\n\n`;
  
  // 2. Summary stats
  csv += `SUMMARY STATISTICS\n`;
  csv += `Metric,Value\n`;
  csv += `Total Patients Registered,${data.summary.total_registered || 0}\n`;
  csv += `Completed Consultations,${data.summary.completed_count || 0}\n`;
  csv += `Waiting in Queue,${data.summary.waiting_count || 0}\n`;
  csv += `Skipped/Missed,${data.summary.skipped_count || 0}\n`;
  csv += `Emergency Patients,${data.summary.emergency_count || 0}\n\n`;
  
  // 3. Doctor Performance
  csv += `DOCTOR PERFORMANCE METRICS\n`;
  csv += `Doctor Name,Specialization,Room,Total Consultations,Avg. Consultation Time\n`;
  data.doctors.forEach(doc => {
    const avgMin = doc.avg_duration_seconds ? Math.round(doc.avg_duration_seconds / 60) : 0;
    csv += `"${doc.doctor_name}","${doc.specialization}","${doc.room_number}",${doc.total_seen},"${avgMin} mins"\n`;
  });

  return csv;
};

// Generate HTML print template for PDF printing
const generateHTMLReport = (data) => {
  const doctorRows = data.doctors.map(doc => {
    const avgDuration = doc.avg_duration_seconds ? `${Math.round(doc.avg_duration_seconds / 60)}m ${Math.round(doc.avg_duration_seconds % 60)}s` : 'N/A';
    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: left;">${doc.doctor_name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: left;">${doc.specialization}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${doc.room_number}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${doc.total_seen}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">${avgDuration}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MedQ Pro - Queue Analytics Report</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; margin: 40px; }
        .header { border-bottom: 2px solid #06b6d4; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 0; color: #0f172a; font-size: 26px; }
        .header p { margin: 5px 0 0 0; color: #666; font-size: 14px; }
        .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; border-left: 4px solid #06b6d4; padding-left: 10px; color: #0f172a; }
        .grid { display: grid; grid-template-cols: repeat(4, 1fr); gap: 15px; margin-bottom: 40px; }
        .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; text-align: center; background-color: #f8fafc; }
        .card .value { font-size: 24px; font-weight: 800; color: #06b6d4; margin-top: 5px; }
        .card .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { background-color: #f1f5f9; padding: 12px 10px; font-weight: 700; text-align: left; font-size: 12px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
        .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        @media print {
          body { margin: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 20px; text-align: right;">
        <button onclick="window.print()" style="background-color: #06b6d4; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;">
          Print Report (PDF)
        </button>
      </div>

      <div class="header">
        <h1>MedQ Pro Clinic Analytics Report</h1>
        <p>Report Range: <strong>${data.range.toUpperCase()}</strong> | Generated At: <strong>${data.compiledAt}</strong></p>
      </div>

      <div class="section-title">Summary Statistics</div>
      <div class="grid">
        <div class="card">
          <div class="label">Registered Patients</div>
          <div class="value">${data.summary.total_registered || 0}</div>
        </div>
        <div class="card">
          <div class="label">Completed Consultations</div>
          <div class="value">${data.summary.completed_count || 0}</div>
        </div>
        <div class="card">
          <div class="label">Active / Waiting</div>
          <div class="value">${data.summary.waiting_count || 0}</div>
        </div>
        <div class="card">
          <div class="label">Emergencies Handled</div>
          <div class="value">${data.summary.emergency_count || 0}</div>
        </div>
      </div>

      <div class="section-title">Doctor Consultation Metrics</div>
      <table>
        <thead>
          <tr>
            <th>Doctor Name</th>
            <th>Specialization</th>
            <th style="text-align: center;">Room</th>
            <th style="text-align: center;">Total Consults</th>
            <th style="text-align: right;">Avg. Visit Duration</th>
          </tr>
        </thead>
        <tbody>
          ${doctorRows}
        </tbody>
      </table>

      <div class="footer">
        <p>© 2026 MedQ Pro Clinic System. All data gathered from secure local encrypted server registries.</p>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  compileQueueReportData,
  generateCSVReport,
  generateHTMLReport
};
