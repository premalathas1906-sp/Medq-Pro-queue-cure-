const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'medq.db');

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', DB_PATH);
    db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
      if (pragmaErr) console.error('Pragma error:', pragmaErr);
    });
  }
});

// Wrap sqlite3 operations in Promises for async/await support
const dbQuery = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Helper for running transactions or sequential statements
  exec(sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

// Initialize tables
async function initDatabase() {
  try {
    // Check columns of users table to verify if we need to migrate it
    let tableInfo = [];
    try {
      tableInfo = await dbQuery.all("PRAGMA table_info(users)");
    } catch (e) {
      // Table doesn't exist yet
    }

    if (tableInfo.length > 0) {
      const hasAuthProvider = tableInfo.some(c => c.name === 'auth_provider');
      const isPasswordHashNullable = tableInfo.some(c => c.name === 'password_hash' && c.notnull === 0);

      if (!hasAuthProvider || !isPasswordHashNullable) {
        console.log('Migrating users table schema for Google Sign-In...');
        // 1. Rename existing users table
        await dbQuery.exec("ALTER TABLE users RENAME TO users_old");
        
        // 2. Create new users table
        await dbQuery.exec(`
          CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT, -- Nullable for Google OAuth users
            role TEXT NOT NULL CHECK(role IN ('Admin', 'Doctor', 'Receptionist', 'Patient')),
            name TEXT NOT NULL,
            phone TEXT,
            avatar_url TEXT,
            auth_provider TEXT NOT NULL DEFAULT 'local' CHECK(auth_provider IN ('local', 'google')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

        // 3. Copy data
        await dbQuery.exec(`
          INSERT INTO users (id, email, password_hash, role, name, phone, avatar_url, auth_provider, created_at, updated_at)
          SELECT id, email, password_hash, role, name, phone, avatar_url, 'local', created_at, updated_at
          FROM users_old
        `);

        // 4. Drop old table
        await dbQuery.exec("DROP TABLE users_old");
        console.log('Users table migrated successfully.');
      }
    }

    // 1. Users Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT, -- Nullable for Google OAuth users
        role TEXT NOT NULL CHECK(role IN ('Admin', 'Doctor', 'Receptionist', 'Patient')),
        name TEXT NOT NULL,
        phone TEXT,
        avatar_url TEXT,
        auth_provider TEXT NOT NULL DEFAULT 'local' CHECK(auth_provider IN ('local', 'google')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // 2. Patients Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        dob TEXT,
        gender TEXT,
        address TEXT,
        emergency_contact TEXT,
        medical_history TEXT, -- JSON format
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // 3. Doctors Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS doctors (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        specialization TEXT NOT NULL,
        room_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Offline' CHECK(status IN ('Available', 'Busy', 'Break', 'Offline')),
        consultation_fee REAL NOT NULL DEFAULT 0.0,
        avg_duration_minutes REAL NOT NULL DEFAULT 10.0,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // 4. Receptionists Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS receptionists (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        shift_hours TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // 5. Appointments Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        doctor_id TEXT NOT NULL,
        appointment_date TEXT NOT NULL,
        time_slot TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled', 'Completed', 'Cancelled', 'NoShow')),
        created_at TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE
      );
    `);

    // 6. Queue Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        id TEXT PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        patient_name TEXT NOT NULL,
        patient_id TEXT, -- Nullable for walk-ins without accounts
        doctor_id TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Emergency', 'Senior Citizen', 'Pregnant', 'Child', 'Normal')),
        status TEXT NOT NULL DEFAULT 'Waiting' CHECK(status IN ('Waiting', 'Active', 'Completed', 'Skipped')),
        added_at TEXT NOT NULL,
        called_at TEXT,
        completed_at TEXT,
        FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL,
        FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE
      );
    `);

    // 7. Consultations Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS consultations (
        id TEXT PRIMARY KEY,
        appointment_id TEXT,
        queue_id TEXT NOT NULL,
        doctor_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        diagnosis TEXT,
        symptoms TEXT,
        prescription TEXT, -- JSON string
        billing_amount REAL NOT NULL DEFAULT 0.0,
        duration_seconds INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE SET NULL,
        FOREIGN KEY (queue_id) REFERENCES queue (id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
      );
    `);

    // 8. Notifications Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // 9. Settings Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // 10. Audit Logs Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      );
    `);

    // 11. Health Tips Table
    await dbQuery.exec(`
      CREATE TABLE IF NOT EXISTS health_tips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'English'
      );
    `);

    console.log('All database tables initialized successfully.');

    // Ensure the dummy walk-in patient exists to satisfy foreign key constraints for walk-in consultations
    await dbQuery.run(`
      INSERT OR IGNORE INTO users (id, email, role, name, phone, created_at, updated_at)
      VALUES ('u-walkin', 'walkin@medq.com', 'Patient', 'Walk-in Patient', '0000000000', datetime('now'), datetime('now'))
    `);
    await dbQuery.run(`
      INSERT OR IGNORE INTO patients (id, user_id, dob, gender)
      VALUES ('walkin-patient', 'u-walkin', '', 'Other')
    `);
    
    // Seed default data
    await seedDatabase();

  } catch (err) {
    console.error('Error during database initialization:', err);
  }
}

// Seed admin, doctor, receptionist and patient accounts if table is empty
async function seedDatabase() {
  try {
    const userCount = await dbQuery.get('SELECT COUNT(*) as count FROM users');
    if (userCount.count > 0) {
      console.log('Database already has users. Skipping seed.');
      return;
    }

    console.log('Seeding database with default accounts...');
    
    const now = new Date().toISOString();
    const adminId = 'u-admin-01';
    const doctor1Id = 'u-doc-01';
    const doctor2Id = 'u-doc-02';
    const doctor3Id = 'u-doc-03';
    const receptionistId = 'u-recep-01';
    const patientId = 'u-patient-01';

    const pHashes = {
      admin: await bcrypt.hash('Admin@123', 10),
      doctor: await bcrypt.hash('Doctor@123', 10),
      receptionist: await bcrypt.hash('Receptionist@123', 10),
      patient: await bcrypt.hash('Patient@123', 10)
    };

    // Insert Users
    await dbQuery.run(
      `INSERT INTO users (id, email, password_hash, role, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminId, 'admin@medq.com', pHashes.admin, 'Admin', 'Admin Manager', '9876543210', now, now]
    );

    await dbQuery.run(
      `INSERT INTO users (id, email, password_hash, role, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [doctor1Id, 'doctor1@medq.com', pHashes.doctor, 'Doctor', 'Dr. Stephen Strange', '9876543211', now, now]
    );
    await dbQuery.run(
      `INSERT INTO users (id, email, password_hash, role, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [doctor2Id, 'doctor2@medq.com', pHashes.doctor, 'Doctor', 'Dr. Charles Xavier', '9876543212', now, now]
    );
    await dbQuery.run(
      `INSERT INTO users (id, email, password_hash, role, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [doctor3Id, 'doctor3@medq.com', pHashes.doctor, 'Doctor', 'Dr. Bruce Banner', '9876543213', now, now]
    );

    await dbQuery.run(
      `INSERT INTO users (id, email, password_hash, role, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [receptionistId, 'receptionist@medq.com', pHashes.receptionist, 'Receptionist', 'Clara Oswald', '9876543214', now, now]
    );

    await dbQuery.run(
      `INSERT INTO users (id, email, password_hash, role, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [patientId, 'patient@medq.com', pHashes.patient, 'Patient', 'Peter Parker', '9876543215', now, now]
    );

    // Insert Doctors Info
    await dbQuery.run(
      `INSERT INTO doctors (id, user_id, specialization, room_number, status, consultation_fee, avg_duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['d-01', doctor1Id, 'Cardiology', 'Room 1', 'Available', 150.0, 7.0]
    );
    await dbQuery.run(
      `INSERT INTO doctors (id, user_id, specialization, room_number, status, consultation_fee, avg_duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['d-02', doctor2Id, 'Pediatrics', 'Room 2', 'Available', 120.0, 6.0]
    );
    await dbQuery.run(
      `INSERT INTO doctors (id, user_id, specialization, room_number, status, consultation_fee, avg_duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['d-03', doctor3Id, 'General Medicine', 'Room 3', 'Available', 100.0, 5.0]
    );

    // Insert Receptionist Info
    await dbQuery.run(
      `INSERT INTO receptionists (id, user_id, shift_hours) VALUES (?, ?, ?)`,
      ['r-01', receptionistId, '08:00 - 16:00']
    );

    // Insert Patient Info
    await dbQuery.run(
      `INSERT INTO patients (id, user_id, dob, gender, address, emergency_contact, medical_history) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['p-01', patientId, '2001-08-10', 'Male', 'Queens, New York', '9876543210', JSON.stringify({ allergies: ['penicillin'], conditions: [] })]
    );

    // Insert default Settings
    await dbQuery.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['clinic_name', JSON.stringify('MedQ Smart Clinic')]);
    await dbQuery.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['operating_hours', JSON.stringify({ open: '08:00', close: '20:00' })]);

    // Insert default Health Tips
    const healthTipsSeed = [
      { category: 'Hydration', title: 'Drink water', description: 'Aim for 8 glasses of water a day to stay energized.', language: 'English' },
      { category: 'Hygiene', title: 'Wash hands', description: 'Wash hands thoroughly with soap for 20 seconds.', language: 'English' },
      { category: 'Hydration', title: 'நீர் அருந்துங்கள்', description: 'உடலை உற்சாகமாக வைத்திருக்க ஒரு நாளைக்கு 8 தம்ளர் தண்ணீர் குடிக்கவும்.', language: 'Tamil' },
      { category: 'Hydration', title: 'पानी पिएं', description: 'शरीर को ऊर्जावान रखने के लिए दिन में 8 गिलास पानी पिएं।', language: 'Hindi' }
    ];
    for (const tip of healthTipsSeed) {
      await dbQuery.run(
        `INSERT INTO health_tips (category, title, description, language) VALUES (?, ?, ?, ?)`,
        [tip.category, tip.title, tip.description, tip.language]
      );
    }

    console.log('Database seeding completed successfully.');
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}

// Automatically compile/initialize on startup
initDatabase();

module.exports = {
  db,
  dbQuery
};
