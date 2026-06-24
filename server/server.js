const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const { initSocket } = require('./socket/socketManager');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Import Route Handlers
const authRoutes = require('./routes/authRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const queueRoutes = require('./routes/queueRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const aiRoutes = require('./routes/aiRoutes');

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initSocket(server);

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Turn off CSP for dev convenience with external scripts/images
}));

// Cross-Origin Requests
app.use(cors({
  origin: true, // Allow all origins for dev
  credentials: true
}));

// Logging
app.use(morgan('dev'));

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate Limiter
app.use('/api/', apiLimiter);

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);

// Serve static uploads if profile pics are added
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend dist assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('MedQ Pro Clinic API is running in development mode.');
  });
}

// Global Error Handler Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` MedQ Pro Clinic Management Server running on port ${PORT}`);
  console.log(`====================================================`);
});
