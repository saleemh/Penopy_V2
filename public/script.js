/* globals io */

const socket = io();

let roomId = null;

// Parse the roomId from the current URL (e.g. /s/<roomId>)
const pathParts = window.location.pathname.split('/');
if (pathParts[1] === 's' && pathParts[2]) {
  roomId = pathParts[2];
} else {
  // If no valid roomId, the server might redirect on the root route
  // so this might never happen
}

// ----- Elements -----
const canvas = document.getElementById('draw-canvas');
const ctx = canvas.getContext('2d');
const userListEl = document.getElementById('user-list');
const chatMessagesEl = document.getElementById('chat-messages');
const chatInputEl = document.getElementById('chat-input');
const penToolBtn = document.getElementById('pen-tool');
const eraserToolBtn = document.getElementById('eraser-tool');
const colorPicker = document.getElementById('color-picker');
const clearBtn = document.getElementById('clear-btn');

let currentTool = 'pen';
let drawing = false;
let currentColor = '#000000';
let startX, startY;

// ----- Socket Events -----
// Join the session
socket.emit('joinSession', { roomId });

// Listen for existing session data
socket.on('sessionData', ({ strokes, chatHistory }) => {
  // Draw existing strokes
  strokes.forEach((stroke) => {
    drawStrokeOnCanvas(stroke, false);
  });
  // Populate chat
  chatHistory.forEach((msg) => {
    addChatMessage(msg);
  });
});

// Listen for user list updates
socket.on('userList', (users) => {
  renderUserList(users);
});

// Listen for new strokes from other users
socket.on('draw', (stroke) => {
  drawStrokeOnCanvas(stroke, false);
});

// Listen for chat messages
socket.on('chatMessage', (msg) => {
  addChatMessage(msg);
});

// Listen for canvas cleared
socket.on('canvasCleared', () => {
  console.log('Canvas cleared event received');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// ----- Drawing Functions -----
function startDrawing(e) {
  drawing = true;
  socket.emit('drawingStatus', { roomId, isDrawing: true });
  [startX, startY] = [e.offsetX, e.offsetY];
}

function doDrawing(e) {
  if (!drawing) return;
  const endX = e.offsetX;
  const endY = e.offsetY;

  // Construct stroke object
  const stroke = {
    tool: currentTool,
    color: currentColor,
    startX,
    startY,
    endX,
    endY
  };

  // Draw locally
  drawStrokeOnCanvas(stroke, true);

  // Emit to server
  socket.emit('draw', { roomId, stroke });

  [startX, startY] = [endX, endY];
}

function stopDrawing() {
  drawing = false;
  socket.emit('drawingStatus', { roomId, isDrawing: false });
}

function drawStrokeOnCanvas(stroke, shouldStroke) {
  const { tool, color, startX, startY, endX, endY } = stroke;
  ctx.beginPath();
  ctx.lineWidth = (tool === 'eraser') ? 20 : 2; // bigger lineWidth for eraser
  ctx.lineCap = 'round';

  if (tool === 'eraser') {
    ctx.strokeStyle = '#FFFFFF'; // or background color
  } else {
    ctx.strokeStyle = color;
  }

  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.closePath();
}

// ----- User List / Chat -----
function renderUserList(users) {
  userListEl.innerHTML = '';
  
  // Iterate through users and display them
  for (const [socketId, user] of Object.entries(users)) {
    const { username, color, isDrawing, isTyping } = user;
    const userDiv = document.createElement('div');
    userDiv.style.color = color;
    userDiv.textContent = username 
      + (isDrawing ? ' (drawing...)' : '') 
      + (isTyping ? ' (typing...)' : '');
    
    // Make my own name clickable to rename
    if (socketId === socket.id) {
      userDiv.style.fontWeight = 'bold';
      userDiv.style.cursor = 'pointer';
      userDiv.addEventListener('click', () => {
        const newName = prompt('Enter new username (max 10 chars):', username);
        if (newName && newName.trim() !== '') {
          socket.emit('renameUser', { roomId, newName });
        }
      });
    }

    userListEl.appendChild(userDiv);
  }
  // For MVP, we can assume the first user to join is host. 
  // Let’s do a quick check: If I'm the user in memory as host, show the clear button:
  // The server sets sessionSockets[roomId].hostId, but we haven't received that hostId directly.
  // As a simpler approach, we can always show the clear button for everyone and let the server check permission.
}

// Utility function to handle a "host check" if we had a direct message from server. Skipped in MVP for brevity.
function sessionSocketsHostId(roomId) {
  // In a real app, the server would send back who the host is.
  return ''; // placeholder
}

// ----- Chat -----
chatInputEl.addEventListener('focus', () => {
  socket.emit('typingStatus', { roomId, isTyping: true });
});
chatInputEl.addEventListener('blur', () => {
  socket.emit('typingStatus', { roomId, isTyping: false });
});
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInputEl.value.trim() !== '') {
    const msg = chatInputEl.value.trim();
    socket.emit('chatMessage', { roomId, message: msg });
    chatInputEl.value = '';
    socket.emit('typingStatus', { roomId, isTyping: false });
  }
});
function addChatMessage(msg) {
  const msgDiv = document.createElement('div');
  msgDiv.innerHTML = `<strong style="color:${msg.color};">${msg.user_name}</strong>: ${msg.message} <span style="font-size:12px; color:#888;">[${new Date(msg.created_at).toLocaleTimeString()}]</span>`;
  chatMessagesEl.appendChild(msgDiv);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// ----- Tools -----
// Set pen as active by default when page loads
penToolBtn.classList.add('active');

penToolBtn.addEventListener('click', () => {
  penToolBtn.classList.add('active');
  eraserToolBtn.classList.remove('active');
  currentTool = 'pen';
});

eraserToolBtn.addEventListener('click', () => {
  eraserToolBtn.classList.add('active');
  penToolBtn.classList.remove('active');
  currentTool = 'eraser';
});

colorPicker.addEventListener('input', (e) => {
  currentColor = e.target.value;
  socket.emit('changeColor', { roomId, newColor: currentColor });
});

// ----- Clear Button -----
clearBtn.addEventListener('click', () => {
  console.log('Clear button clicked', roomId);
  socket.emit('clearCanvas', roomId);
});

// ----- Canvas Event Listeners -----
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', doDrawing);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);