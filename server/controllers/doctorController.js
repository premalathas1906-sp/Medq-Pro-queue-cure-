const { dbQuery } = require('../database/db');

// Get all doctors with user info
const getDoctors = async (req, res, next) => {
  try {
    const doctors = await dbQuery.all(`
      SELECT 
        d.id as doctor_id,
        d.specialization,
        d.room_number,
        d.status,
        d.consultation_fee,
        d.avg_duration_minutes,
        u.id as user_id,
        u.email,
        u.name as doctor_name,
        u.phone
      FROM doctors d
      JOIN users u ON d.user_id = u.id
    `);
    res.json({ success: true, doctors });
  } catch (err) {
    next(err);
  }
};

// Update Doctor Status
const updateStatus = async (req, res, next) => {
  const { status } = req.body;
  const doctorUserId = req.user.id;

  if (!status) {
    return res.status(400).json({ error: 'Status value is required' });
  }

  const validStatuses = ['Available', 'Busy', 'Break', 'Offline'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    // Confirm the user is a doctor
    const doctor = await dbQuery.get('SELECT id FROM doctors WHERE user_id = ?', [doctorUserId]);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }

    await dbQuery.run(
      'UPDATE doctors SET status = ? WHERE user_id = ?',
      [status, doctorUserId]
    );

    // Fetch updated doctor info to broadcast
    const updatedDoctor = await dbQuery.get(`
      SELECT d.id, d.status, d.room_number, u.name as doctor_name 
      FROM doctors d 
      JOIN users u ON d.user_id = u.id 
      WHERE d.user_id = ?
    `, [doctorUserId]);

    // Broadcast status change via Socket.IO
    if (global.io) {
      global.io.emit('doctor_status_changed', updatedDoctor);
    }

    // Log audit event
    await dbQuery.run(
      'INSERT INTO audit_logs (id, user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [`a-${Date.now()}`, doctorUserId, 'UPDATE_DOCTOR_STATUS', `Doctor status set to ${status}`, req.ip, new Date().toISOString()]
    );

    res.json({ success: true, doctor: updatedDoctor });
  } catch (err) {
    next(err);
  }
};

// Update Doctor Room
const updateRoom = async (req, res, next) => {
  const { roomNumber } = req.body;
  const doctorUserId = req.user.id;

  if (!roomNumber) {
    return res.status(400).json({ error: 'Room number is required' });
  }

  try {
    const doctor = await dbQuery.get('SELECT id FROM doctors WHERE user_id = ?', [doctorUserId]);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }

    await dbQuery.run(
      'UPDATE doctors SET room_number = ? WHERE user_id = ?',
      [roomNumber, doctorUserId]
    );

    res.json({ success: true, message: 'Room number updated successfully', roomNumber });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDoctors,
  updateStatus,
  updateRoom
};
