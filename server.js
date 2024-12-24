// server.js

const express = require('express');
const app = express();
const { v4: uuidv4 } = require('uuid');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const pool = require('./config/db');
const { randomUsername, randomColor } = require('./utils/random');

const PORT = process.env.PORT || 3000;

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Root route: create a new session (room) and redirect
app.get('/', async (req, res) => {
  const roomId = uuidv4().split('-')[0]; // shortened
  // We'll set host_id = 'placeholder'; The real host is determined upon first socket connection.
  await pool.query(
    'INSERT INTO sessions (room_id, host_id) VALUES ($1, $2)',
    [roomId, 'placeholder']
  );
  return res.redirect(`/s/${roomId}`);
});

// Session route: serve the same index.html
app.get('/s/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Data structures to track in-memory (for real-time presence & ephemeral data)
const sessionSockets = {}; 
// Example: sessionSockets[roomId] = { hostId: <socket.id>, users: { [socket.id]: {...} }}

// Socket.IO logic
io.on('connection', (socket) => {
  socket.on('joinSession', async ({ roomId }) => {
    // If we don't have a record in memory, initialize
    if (!sessionSockets[roomId]) {
      sessionSockets[roomId] = {
        hostId: socket.id, 
        users: {}
      };

      // Update the DB record with real host_id (the first user in memory)
      await pool.query(
        'UPDATE sessions SET host_id = $1 WHERE room_id = $2',
        [socket.id, roomId]
      );
    }

    // Add user to room
    socket.join(roomId);

    // Assign random name/color
    const username = randomUsername();
    const color = randomColor();

    sessionSockets[roomId].users[socket.id] = {
      username,
      color,
      isDrawing: false,
      isTyping: false
    };

    // Load existing strokes & chat from DB
    try {
      const strokesRes = await pool.query(
        'SELECT stroke_data FROM strokes WHERE room_id=$1 ORDER BY created_at ASC',
        [roomId]
      );
      const chatRes = await pool.query(
        'SELECT user_name, color, message, created_at FROM chat_messages WHERE room_id=$1 ORDER BY created_at ASC',
        [roomId]
      );
      
      // Send existing data to the newly joined socket
      socket.emit('sessionData', {
        strokes: strokesRes.rows.map(row => row.stroke_data),
        chatHistory: chatRes.rows.map(row => ({
          user_name: row.user_name,
          color: row.color,
          message: row.message,
          created_at: row.created_at
        }))
      });
      console.log(`Loaded ${strokesRes.rows.length} strokes and ${chatRes.rows.length} messages for room ${roomId}`);
    } catch (err) {
      console.error('Error loading existing session data:', err);
    }

    // Announce new user to the room
    io.to(roomId).emit('userList', sessionSockets[roomId].users);

    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // User renames themselves
  socket.on('renameUser', ({ roomId, newName }) => {
    if (sessionSockets[roomId] && sessionSockets[roomId].users[socket.id]) {
      // Basic validation
      const finalName = newName.substring(0, 10);
      sessionSockets[roomId].users[socket.id].username = finalName;
      io.to(roomId).emit('userList', sessionSockets[roomId].users);
    }
  });

  // Handle color change (optional if you want user to pick custom color at runtime)
  socket.on('changeColor', ({ roomId, newColor }) => {
    if (sessionSockets[roomId] && sessionSockets[roomId].users[socket.id]) {
      sessionSockets[roomId].users[socket.id].color = newColor;
      io.to(roomId).emit('userList', sessionSockets[roomId].users);
    }
  });

  // Handle "is drawing" indicator
  socket.on('drawingStatus', ({ roomId, isDrawing }) => {
    if (sessionSockets[roomId] && sessionSockets[roomId].users[socket.id]) {
      sessionSockets[roomId].users[socket.id].isDrawing = isDrawing;
      io.to(roomId).emit('userList', sessionSockets[roomId].users);
    }
  });

  // Handle "is typing" indicator
  socket.on('typingStatus', ({ roomId, isTyping }) => {
    if (sessionSockets[roomId] && sessionSockets[roomId].users[socket.id]) {
      sessionSockets[roomId].users[socket.id].isTyping = isTyping;
      io.to(roomId).emit('userList', sessionSockets[roomId].users);
    }
  });

  // Receiving a new stroke
  socket.on('draw', async ({ roomId, stroke }) => {
    // broadcast to everyone else in the room
    socket.to(roomId).emit('draw', stroke);

    // also save to DB
    try {
      await pool.query(
        'INSERT INTO strokes (room_id, stroke_data) VALUES ($1, $2)',
        [roomId, stroke]
      );
    } catch (err) {
      console.error('Error saving stroke:', err);
    }
  });

  // Chat messages
  socket.on('chatMessage', async ({ roomId, message }) => {
    if (!sessionSockets[roomId]) return;
    const { username, color } = sessionSockets[roomId].users[socket.id] || {};
    // store in DB
    try {
      await pool.query(
        'INSERT INTO chat_messages (room_id, user_name, color, message) VALUES ($1, $2, $3, $4)',
        [roomId, username, color, message]
      );
    } catch (err) {
      console.error('Error saving chat message:', err);
    }

    const newMsg = {
      user_name: username,
      color: color,
      message,
      created_at: new Date() // or rely on DB timestamp
    };
    io.to(roomId).emit('chatMessage', newMsg);
  });

  // Clear canvas (host only)
  socket.on('clearCanvas', async (roomId) => {
    console.log('Clear canvas event received on server', roomId);
    try {
      // Clear from DB
      await pool.query('DELETE FROM strokes WHERE room_id = $1', [roomId]);
      
      // Notify all clients in the room
      io.to(roomId).emit('canvasCleared');
      
      console.log(`Canvas cleared for room ${roomId}`); // Success log
    } catch (err) {
      console.error('Error clearing strokes:', err);
    }
  });

  // On disconnect
  socket.on('disconnect', () => {
    for (const roomId in sessionSockets) {
      if (sessionSockets[roomId].users[socket.id]) {
        // remove user
        delete sessionSockets[roomId].users[socket.id];
        // if the user was host, pick a new host or set to 'placeholder'
        if (sessionSockets[roomId].hostId === socket.id) {
          const remaining = Object.keys(sessionSockets[roomId].users);
          sessionSockets[roomId].hostId = remaining[0] || 'placeholder';
        }
        // update the user list
        io.to(roomId).emit('userList', sessionSockets[roomId].users);
        break;
      }
    }
    console.log(`Socket ${socket.id} disconnected`);
  });

  // Handle emoji change
  socket.on('changeEmoji', ({ roomId, newEmoji }) => {
    if (sessionSockets[roomId] && sessionSockets[roomId].users[socket.id]) {
      sessionSockets[roomId].users[socket.id].emoji = newEmoji;
      io.to(roomId).emit('userList', sessionSockets[roomId].users);
    }
  });
});

// Start server
http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});