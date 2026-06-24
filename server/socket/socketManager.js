const socketIo = require('socket.io');

const initSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Assign to global variable so controllers can emit events easily
  global.io = io;

  io.on('connection', (socket) => {
    console.log(`[Socket] New client connected: ${socket.id}`);

    // Join doctor-specific channel for isolated tracking if requested
    socket.on('join_doctor_queue', (doctorId) => {
      if (doctorId) {
        socket.join(`doctor:${doctorId}`);
        console.log(`[Socket] Client ${socket.id} joined room doctor:${doctorId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[Socket] Socket.IO server initialized.');
  return io;
};

module.exports = {
  initSocket
};
