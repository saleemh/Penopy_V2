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

let currentTool = 'pen';
let drawing = false;
let currentColor = '#000000';
let startX, startY;
let currentWidth = 2;

// ----- Socket Events -----
// Join the session
socket.emit('joinSession', { roomId });

// Listen for existing session data
socket.on('sessionData', ({ strokes, chatHistory }) => {
  console.log(`Received ${strokes.length} strokes and ${chatHistory.length} messages`);
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
  const rect = canvas.getBoundingClientRect();
  [startX, startY] = [
    e.clientX - rect.left,
    e.clientY - rect.top
  ];
}

function doDrawing(e) {
  if (!drawing) return;
  const rect = canvas.getBoundingClientRect();
  const endX = e.clientX - rect.left;
  const endY = e.clientY - rect.top;

  // Construct stroke object
  const stroke = {
    tool: currentTool,
    color: currentColor,
    width: currentWidth,
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
  const { tool, color, width, startX, startY, endX, endY } = stroke;
  ctx.beginPath();
  ctx.lineWidth = (width || currentWidth) * (tool === 'eraser' ? 2.5 : 1);
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
  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Users';
  userListEl.appendChild(title);
  
  // Iterate through users and display them
  for (const [socketId, user] of Object.entries(users)) {
    const { username, color, emoji = '😊', isDrawing, isTyping } = user;
    const userDiv = document.createElement('div');
    userDiv.className = `user-item${socketId === socket.id ? ' is-me' : ''}`;
    
    // Emoji element
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'user-emoji';
    emojiSpan.textContent = emoji;
    
    // Username element
    const nameSpan = document.createElement('span');
    nameSpan.className = 'user-name';
    nameSpan.style.color = color;
    nameSpan.textContent = username;
    
    // Status element (if drawing or typing)
    const statusSpan = document.createElement('span');
    statusSpan.className = 'user-status';
    if (isDrawing) statusSpan.textContent = '✏️';
    if (isTyping) statusSpan.textContent = '💭';
    
    // Color picker element
    const colorDiv = document.createElement('div');
    colorDiv.className = 'user-color';
    colorDiv.style.backgroundColor = color;
    
    // Make my own name clickable to rename
    if (socketId === socket.id) {
      // Emoji click handler
      emojiSpan.addEventListener('click', () => {
        const newEmoji = prompt('Enter a new emoji:', emoji);
        if (newEmoji && newEmoji.trim() !== '') {
          socket.emit('changeEmoji', { roomId, newEmoji: newEmoji.trim() });
        }
      });
      
      // Name click handler
      nameSpan.addEventListener('click', () => {
        const newName = prompt('Enter new username (max 10 chars):', username);
        if (newName && newName.trim() !== '') {
          socket.emit('renameUser', { roomId, newName });
        }
      });
      
      // Color click handler
      colorDiv.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = color;
        input.click();
        input.addEventListener('change', (e) => {
          socket.emit('changeColor', { roomId, newColor: e.target.value });
        });
      });
      
      // Add tooltips
      emojiSpan.title = 'Click to change emoji';
      nameSpan.title = 'Click to change name';
      colorDiv.title = 'Click to change color';
    }

    userDiv.appendChild(emojiSpan);
    userDiv.appendChild(nameSpan);
    userDiv.appendChild(statusSpan);
    userDiv.appendChild(colorDiv);
    userListEl.appendChild(userDiv);
  }
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

// ----- Canvas Event Listeners -----
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', doDrawing);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);

// Add event listeners for the new tools
document.querySelectorAll('.tool-button').forEach(button => {
  button.addEventListener('click', (e) => {
    const tool = e.currentTarget.dataset.tool;
    if (tool !== 'clear') {
      currentTool = tool;
      // Update active state
      document.querySelectorAll('.tool-button').forEach(btn => 
        btn.classList.remove('active'));
      e.currentTarget.classList.add('active');
    } else {
      // Handle clear button click
      console.log('Clear button clicked', roomId);
      socket.emit('clearCanvas', roomId);
    }
  });
});

// Color picker handler
document.querySelector('.color-picker').addEventListener('input', (e) => {
  currentColor = e.target.value;
});

// Stroke width handler
document.querySelector('.stroke-width').addEventListener('input', (e) => {
  currentWidth = parseInt(e.target.value);
});

// Update the drawing function to use these values
function draw(e) {
  if (!isDrawing) return;
  
  const x = e.clientX || e.touches[0].clientX;
  const y = e.clientY || e.touches[0].clientY;
  
  ctx.lineWidth = currentWidth * (currentTool === 'eraser' ? 2.5 : 1);
  ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  ctx.lineTo(x - canvas.offsetLeft, y - canvas.offsetTop);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - canvas.offsetLeft, y - canvas.offsetTop);
}

// Function to resize canvas
function resizeCanvas() {
  const container = document.getElementById('canvas-container');
  const containerWidth = container.clientWidth - 40; // Account for padding
  const containerHeight = container.clientHeight - 40;
  
  // Save the current drawing
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  tempCtx.drawImage(canvas, 0, 0);
  
  // Resize canvas
  canvas.width = containerWidth;
  canvas.height = containerHeight;
  
  // Restore the drawing
  ctx.drawImage(tempCanvas, 0, 0, containerWidth, containerHeight);
  
  // Reset context properties after resize
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

// Initial resize
resizeCanvas();

// Handle window resize
window.addEventListener('resize', resizeCanvas);