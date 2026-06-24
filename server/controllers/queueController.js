const { dbQuery } = require('../database/db');

// Helper to get average consultation duration for a doctor from last 5 entries (in seconds)
const getDocAverageDuration = async (doctorId, defaultMinutes = 10) => {
  try {
    const history = await dbQuery.all(
      `SELECT duration_seconds FROM consultations 
       WHERE doctor_id = ? 
       ORDER BY created_at DESC LIMIT 5`,
      [doctorId]
    );

    if (history && history.length > 0) {
      const sum = history.reduce((acc, curr) => acc + curr.duration_seconds, 0);
      return sum / history.length;
    }
  } catch (err) {
    console.error('Error fetching doctor avg duration:', err);
  }
  return defaultMinutes * 60; // Fallback
};

// Helper to calculate confidence percentage based on variance of consultation durations
const calculateConfidence = async (doctorId) => {
  try {
    const history = await dbQuery.all(
      `SELECT duration_seconds FROM consultations 
       WHERE doctor_id = ? 
       ORDER BY created_at DESC LIMIT 5`,
      [doctorId]
    );

    if (!history || history.length < 3) {
      return 80; // Default confidence with low historical data
    }

    const durations = history.map(h => h.duration_seconds);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    // Standard deviation as a percentage of mean
    const cv = (stdDev / mean) * 100;
    
    // Higher coefficient of variation = lower confidence
    // Cap confidence between 60% and 98%
    const confidence = Math.max(60, Math.min(98, 100 - Math.round(cv)));
    return confidence;
  } catch (err) {
    return 80;
  }
};

// Build queue line payload for clients
const buildQueuePayload = async (doctorIdFilter = null) => {
  // Fetch active patients
  let activeSql = 'SELECT q.*, u.name as doctor_name, d.room_number FROM queue q JOIN doctors d ON q.doctor_id = d.id JOIN users u ON d.user_id = u.id WHERE q.status = "Active"';
  let activeParams = [];
  if (doctorIdFilter) {
    activeSql += ' AND q.doctor_id = ?';
    activeParams.push(doctorIdFilter);
  }
  const activePatients = await dbQuery.all(activeSql, activeParams);

  // Fetch waiting patients
  let waitingSql = 'SELECT q.*, u.name as doctor_name, d.room_number, d.avg_duration_minutes FROM queue q JOIN doctors d ON q.doctor_id = d.id JOIN users u ON d.user_id = u.id WHERE q.status = "Waiting"';
  let waitingParams = [];
  if (doctorIdFilter) {
    waitingSql += ' AND q.doctor_id = ?';
    waitingParams.push(doctorIdFilter);
  }
  const waitingPatientsRaw = await dbQuery.all(waitingSql, waitingParams);

  // Sort queue by priority and time
  // Sorting: 1. Emergency (5), 2. Senior (4), 3. Pregnant (3), 4. Child (2), 5. Normal (1)
  const priorityMap = {
    'Emergency': 5,
    'Senior Citizen': 4,
    'Pregnant': 3,
    'Child': 2,
    'Normal': 1
  };

  // Group by doctor first
  const doctorsMap = {};
  waitingPatientsRaw.forEach(p => {
    if (!doctorsMap[p.doctor_id]) {
      doctorsMap[p.doctor_id] = [];
    }
    doctorsMap[p.doctor_id].push(p);
  });

  const waitingQueueFinal = [];

  // Sort individually for each doctor
  for (const docId of Object.keys(doctorsMap)) {
    const docQueue = doctorsMap[docId];
    docQueue.sort((a, b) => {
      const pA = priorityMap[a.priority] || 1;
      const pB = priorityMap[b.priority] || 1;
      if (pA !== pB) return pB - pA; // Higher priority first
      return new Date(a.added_at).getTime() - new Date(b.added_at).getTime(); // First in, first served
    });

    // Compute dynamic wait times using rolling average
    const avgSec = await getDocAverageDuration(docId, docQueue[0]?.avg_duration_minutes || 10);
    const confidence = await calculateConfidence(docId);
    
    // Find active patient for this doctor
    const activeForDoc = activePatients.find(ap => ap.doctor_id === docId);
    let currentRemainingSec = 0;
    if (activeForDoc && activeForDoc.called_at) {
      const elapsedSec = (Date.now() - new Date(activeForDoc.called_at).getTime()) / 1000;
      currentRemainingSec = Math.max(10, avgSec - elapsedSec);
    }

    docQueue.forEach((patient, index) => {
      // Priority safety buffer delays
      let bufferSec = 0;
      if (patient.priority === 'Emergency') bufferSec += 0; // Emergency called immediately, no extra delay
      
      const estimatedWaitSeconds = currentRemainingSec + (index * avgSec) + bufferSec;
      
      waitingQueueFinal.push({
        ...patient,
        tokensAhead: index,
        estimatedWaitSeconds: Math.round(estimatedWaitSeconds),
        confidence,
        avgConsultationSeconds: Math.round(avgSec)
      });
    });
  }

  // Sort final output globally by doctor or combined
  // If doctorIdFilter is active, sorting is already correct. Otherwise, combine
  waitingQueueFinal.sort((a, b) => {
    // Keep doctor groupings intact or sort by added_at. Let's sort by position in their respective queues
    return a.tokensAhead - b.tokensAhead;
  });

  const completedToday = await dbQuery.get(
    `SELECT COUNT(*) as count FROM queue 
     WHERE status = "Completed" AND date(added_at) = date('now')`
  );

  return {
    activePatients,
    waitingQueue: waitingQueueFinal,
    completedCount: completedToday.count,
    totalWaiting: waitingQueueFinal.length
  };
};

// Get Live Queue state
const getQueue = async (req, res, next) => {
  const { doctor_id } = req.query;
  try {
    const payload = await buildQueuePayload(doctor_id);
    res.json(payload);
  } catch (err) {
    next(err);
  }
};

// Add Patient to Queue (Receptionist)
const addPatient = async (req, res, next) => {
  const { patient_name, doctor_id, priority, patient_id, note } = req.body;

  if (!patient_name || !doctor_id) {
    return res.status(400).json({ error: 'Patient name and Doctor ID are required' });
  }

  try {
    // Generate sequential token number
    const countRow = await dbQuery.get("SELECT COUNT(*) as count FROM queue WHERE date(added_at) = date('now')");
    const tokenNum = 101 + (countRow.count || 0);
    const token = `P-${tokenNum}`;
    
    const queueId = `q-${Date.now()}`;
    const now = new Date().toISOString();

    await dbQuery.run(
      `INSERT INTO queue (id, token, patient_name, patient_id, doctor_id, priority, status, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [queueId, token, patient_name, patient_id || null, doctor_id, priority || 'Normal', 'Waiting', now]
    );

    // Save notes/metadata in setting checkup store or as setting log if walkin
    if (note) {
      await dbQuery.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
        [`note:${queueId}`, JSON.stringify(note)]
      );
    }

    const payload = await buildQueuePayload();
    
    // Broadcast live update
    if (global.io) {
      global.io.emit('queue_updated', payload);
      
      // If Emergency, emit direct alert to receptionist/doctor rooms
      if (priority === 'Emergency') {
        global.io.emit('emergency_alert', {
          token,
          patient_name,
          message: `🚨 EMERGENCY ALERT: Patient ${patient_name} (${token}) added with critical priority!`
        });
      }
    }

    // Log audit log
    await dbQuery.run(
      'INSERT INTO audit_logs (id, user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [`a-${Date.now()}`, req.user.id, 'ADD_QUEUE', `Token ${token} (${patient_name}) added for doctor ${doctor_id}`, req.ip, now]
    );

    res.status(201).json({ success: true, token, patient: { id: queueId, token, name: patient_name, type: priority } });
  } catch (err) {
    next(err);
  }
};

// Call Next Patient (Doctor / Receptionist)
const callNext = async (req, res, next) => {
  const { doctor_id } = req.body;
  const now = new Date().toISOString();

  if (!doctor_id) {
    return res.status(400).json({ error: 'Doctor ID is required' });
  }

  try {
    // 1. If there's an active patient for this doctor, complete their visit
    const active = await dbQuery.get(
      'SELECT id, called_at FROM queue WHERE doctor_id = ? AND status = "Active"',
      [doctor_id]
    );

    if (active) {
      const elapsedSec = Math.round((Date.now() - new Date(active.called_at).getTime()) / 1000);
      
      // Update queue row
      await dbQuery.run(
        'UPDATE queue SET status = "Completed", completed_at = ? WHERE id = ?',
        [now, active.id]
      );

      // Fetch patient_id for consultation log
      const qRow = await dbQuery.get('SELECT patient_id FROM queue WHERE id = ?', [active.id]);

      // Create a default consultation log
      const consultId = `c-${Date.now()}`;
      await dbQuery.run(
        `INSERT INTO consultations (id, queue_id, doctor_id, patient_id, diagnosis, symptoms, prescription, billing_amount, duration_seconds, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          consultId,
          active.id,
          doctor_id,
          qRow.patient_id || 'walkin-patient',
          'General Checkup Completed',
          'Checked',
          JSON.stringify([]),
          100.0,
          elapsedSec,
          now
        ]
      );
    }

    // 2. Fetch the next patient in line for this doctor (sorted by priority and added time)
    const waitingList = await dbQuery.all(
      'SELECT * FROM queue WHERE doctor_id = ? AND status = "Waiting"',
      [doctor_id]
    );

    const priorityMap = {
      'Emergency': 5,
      'Senior Citizen': 4,
      'Pregnant': 3,
      'Child': 2,
      'Normal': 1
    };

    waitingList.sort((a, b) => {
      const pA = priorityMap[a.priority] || 1;
      const pB = priorityMap[b.priority] || 1;
      if (pA !== pB) return pB - pA;
      return new Date(a.added_at).getTime() - new Date(b.added_at).getTime();
    });

    const nextPatient = waitingList[0];

    if (nextPatient) {
      await dbQuery.run(
        'UPDATE queue SET status = "Active", called_at = ? WHERE id = ?',
        [now, nextPatient.id]
      );
      
      // Update in-memory object properties to reflect the updated database state and prevent stale response payloads
      nextPatient.status = 'Active';
      nextPatient.called_at = now;

      // Fetch doctor room details
      const doc = await dbQuery.get(
        'SELECT room_number, d.avg_duration_minutes, u.name as doctor_name FROM doctors d JOIN users u ON d.user_id = u.id WHERE d.id = ?',
        [doctor_id]
      );

      const payload = await buildQueuePayload();

      if (global.io) {
        global.io.emit('queue_updated', payload);
        global.io.emit('patient_called', {
          token: nextPatient.token,
          name: nextPatient.patient_name,
          room: doc.room_number,
          doctorName: doc.doctor_name
        });
        global.io.emit('token_called', {
          token: nextPatient.token,
          name: nextPatient.patient_name,
          room: doc.room_number,
          doctorName: doc.doctor_name
        });
        global.io.emit('wait_time_updated', {
          doctor_id,
          avg_duration_minutes: doc.avg_duration_minutes || 10
        });
      }

      res.json({ success: true, activePatient: nextPatient });
    } else {
      // Queue is empty for this doctor
      const payload = await buildQueuePayload();
      if (global.io) {
        global.io.emit('queue_updated', payload);
      }
      res.json({ success: true, message: 'Queue is empty.', activePatient: null });
    }
  } catch (err) {
    next(err);
  }
};

// Complete Consultation Manually (Doctor Dashboard)
const completeConsultation = async (req, res, next) => {
  const { queue_id, diagnosis, symptoms, prescription, billing_amount } = req.body;
  const now = new Date().toISOString();

  if (!queue_id) {
    return res.status(400).json({ error: 'Queue ID is required' });
  }

  try {
    const qRow = await dbQuery.get('SELECT * FROM queue WHERE id = ?', [queue_id]);
    if (!qRow) {
      return res.status(404).json({ error: 'Queue token entry not found' });
    }

    const elapsedSec = qRow.called_at ? Math.round((Date.now() - new Date(qRow.called_at).getTime()) / 1000) : 300;

    // Complete queue row
    await dbQuery.run(
      'UPDATE queue SET status = "Completed", completed_at = ? WHERE id = ?',
      [now, queue_id]
    );

    // Insert rich consultation details
    const consultId = `c-${Date.now()}`;
    await dbQuery.run(
      `INSERT INTO consultations (id, queue_id, doctor_id, patient_id, diagnosis, symptoms, prescription, billing_amount, duration_seconds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        consultId,
        queue_id,
        qRow.doctor_id,
        qRow.patient_id || 'walkin-patient',
        diagnosis || 'Completed checkup',
        symptoms || '',
        JSON.stringify(prescription || []),
        parseFloat(billing_amount || 100.0),
        elapsedSec,
        now
      ]
    );

    const payload = await buildQueuePayload();
    if (global.io) {
      global.io.emit('queue_updated', payload);
      const doc = await dbQuery.get('SELECT avg_duration_minutes FROM doctors WHERE id = ?', [qRow.doctor_id]);
      global.io.emit('wait_time_updated', {
        doctor_id: qRow.doctor_id,
        avg_duration_minutes: doc ? doc.avg_duration_minutes : 10
      });
    }

    res.json({ success: true, message: 'Consultation recorded successfully' });
  } catch (err) {
    next(err);
  }
};

// Skip Patient (Receptionist/Doctor)
const skipPatient = async (req, res, next) => {
  const { queue_id } = req.body;

  if (!queue_id) return res.status(400).json({ error: 'Queue ID is required' });

  try {
    await dbQuery.run('UPDATE queue SET status = "Skipped" WHERE id = ?', [queue_id]);
    
    const payload = await buildQueuePayload();
    if (global.io) {
      global.io.emit('queue_updated', payload);
    }

    res.json({ success: true, message: 'Patient skipped' });
  } catch (err) {
    next(err);
  }
};

// Recall Skipped Patient
const recallPatient = async (req, res, next) => {
  const { queue_id } = req.body;

  if (!queue_id) return res.status(400).json({ error: 'Queue ID is required' });

  try {
    await dbQuery.run('UPDATE queue SET status = "Waiting" WHERE id = ?', [queue_id]);

    const payload = await buildQueuePayload();
    if (global.io) {
      global.io.emit('queue_updated', payload);
    }

    res.json({ success: true, message: 'Patient recalled to waiting status' });
  } catch (err) {
    next(err);
  }
};

// Daily Reset Queue
const resetQueue = async (req, res, next) => {
  try {
    // Delete waiting/active queue items
    await dbQuery.run('DELETE FROM queue WHERE status IN ("Waiting", "Active")');
    
    const payload = await buildQueuePayload();
    if (global.io) {
      global.io.emit('queue_updated', payload);
    }

    res.json({ success: true, message: 'Active daily queues have been reset.' });
  } catch (err) {
    next(err);
  }
};

const getSettings = async (req, res, next) => {
  try {
    const settings = await dbQuery.all('SELECT * FROM settings');
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
};

const updateSettings = async (req, res, next) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Key and value are required' });
  }
  try {
    await dbQuery.run(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, typeof value === 'string' ? value : JSON.stringify(value)]
    );

    // If the settings updated is defaultConsultationTime, we can broadcast
    if (key === 'defaultConsultationTime' && global.io) {
      global.io.emit('settings_updated', { key, value });
    }

    res.json({ success: true, message: 'Setting updated successfully' });
  } catch (err) {
    next(err);
  }
};

const joinQueue = async (req, res, next) => {
  const { doctor_id } = req.body;
  if (!doctor_id) {
    return res.status(400).json({ error: 'Doctor ID is required' });
  }

  try {
    // 1. Get patient profile
    const patientProfile = await dbQuery.get('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
    if (!patientProfile) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    // 2. Check if already in queue
    const active = await dbQuery.get(
      `SELECT id FROM queue 
       WHERE patient_id = ? AND status IN ('Waiting', 'Active')`,
      [patientProfile.id]
    );

    if (active) {
      return res.status(400).json({ error: 'You are already active in the queue' });
    }

    // 3. Generate sequential token
    const countRow = await dbQuery.get("SELECT COUNT(*) as count FROM queue WHERE date(added_at) = date('now')");
    const tokenNum = 101 + (countRow.count || 0);
    const token = `P-${tokenNum}`;

    const queueId = `q-${Date.now()}`;
    const now = new Date().toISOString();

    // 4. Insert into queue
    await dbQuery.run(
      `INSERT INTO queue (id, token, patient_name, patient_id, doctor_id, priority, status, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [queueId, token, req.user.name, patientProfile.id, doctor_id, 'Normal', 'Waiting', now]
    );

    const payload = await buildQueuePayload();

    // 5. Broadcast updates
    if (global.io) {
      global.io.emit('queue_updated', payload);
      global.io.emit('join_queue', { token, patient_name: req.user.name, doctor_id });
      
      const doc = await dbQuery.get('SELECT avg_duration_minutes FROM doctors WHERE id = ?', [doctor_id]);
      global.io.emit('wait_time_updated', { doctor_id, avg_duration_minutes: doc ? doc.avg_duration_minutes : 10 });
    }

    // 6. Log audit log
    await dbQuery.run(
      'INSERT INTO audit_logs (id, user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [`a-${Date.now()}`, req.user.id, 'JOIN_QUEUE', `Patient joined queue: ${token} for doctor ${doctor_id}`, req.ip, now]
    );

    res.status(201).json({ success: true, token, queueEntry: { id: queueId, token, status: 'Waiting', doctor_id } });
  } catch (err) {
    next(err);
  }
};

const getMyActiveQueue = async (req, res, next) => {
  if (req.user.role !== 'Patient') {
    return res.status(400).json({ error: 'Only patients can fetch their active queue token' });
  }

  try {
    const patientProfile = await dbQuery.get('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
    if (!patientProfile) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    const activeEntry = await dbQuery.get(
      `SELECT q.*, u.name as doctor_name, d.room_number 
       FROM queue q 
       JOIN doctors d ON q.doctor_id = d.id 
       JOIN users u ON d.user_id = u.id 
       WHERE q.patient_id = ? AND q.status IN ('Waiting', 'Active')`,
      [patientProfile.id]
    );

    if (activeEntry) {
      res.json({ hasActive: true, queueEntry: activeEntry });
    } else {
      res.json({ hasActive: false });
    }
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getQueue,
  addPatient,
  callNext,
  completeConsultation,
  skipPatient,
  recallPatient,
  resetQueue,
  getSettings,
  updateSettings,
  joinQueue,
  getMyActiveQueue
};
