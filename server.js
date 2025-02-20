// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from a "public" folder (place index.html there)
app.use(express.static(__dirname + '/public'));

// Global game state (shared among all players)
let gameState = {
  gameTime: 0, // in hours
  resources: {
    electricity: 100,
    heat: 100,
    water: 100,
    garbage: 0
  },
  players: {} // key: socket.id, value: player data
};

// Function to update each player's status conditions based on their attributes
function updatePlayerConditions() {
  for (const id in gameState.players) {
    const player = gameState.players[id];
    // Update physical condition based on health
    if (player.health >= 90) {
      player.conditions.physical = "Healthy";
    } else if (player.health >= 70) {
      player.conditions.physical = "Slightly Wounded";
    } else if (player.health >= 50) {
      player.conditions.physical = "Wounded";
    } else if (player.health >= 30) {
      player.conditions.physical = "Gravely Wounded";
    } else if (player.health >= 10) {
      player.conditions.physical = "Sick";
    } else if (player.health > 0) {
      player.conditions.physical = "Very Sick";
    } else {
      player.conditions.physical = "Dead";
    }
    // Update mental condition based on mood
    if (player.mood >= 80) {
      player.conditions.mental = "Hopeful";
    } else if (player.mood >= 60) {
      player.conditions.mental = "Content";
    } else if (player.mood >= 40) {
      player.conditions.mental = "Worried";
    } else if (player.mood >= 20) {
      player.conditions.mental = "Depressed";
    } else {
      player.conditions.mental = "Broken";
    }
    // Activity remains unchanged unless updated by a player action (e.g., Sleeping, Looting, etc.)
  }
}

// Game loop: update game time and resources every hour (adjust for testing if needed)
setInterval(() => {
  gameState.gameTime++;
  // Increase garbage by 10 units per hour (max 100)
  gameState.resources.garbage = Math.min(100, gameState.resources.garbage + 10);

  // Trigger a random power event every hour:
  const powerEvents = [
    () => { gameState.resources.electricity = Math.max(0, gameState.resources.electricity - 10); },
    () => { gameState.resources.heat = Math.max(0, gameState.resources.heat - 10); },
    () => { gameState.resources.water = Math.max(0, gameState.resources.water - 10); }
  ];
  const randomEvent = powerEvents[Math.floor(Math.random() * powerEvents.length)];
  randomEvent();

  // If garbage is piled up, negatively affect player statuses
  if (gameState.resources.garbage >= 100) {
    for (const id in gameState.players) {
      gameState.players[id].health = Math.max(0, gameState.players[id].health - 10);
      gameState.players[id].mood = Math.max(0, gameState.players[id].mood - 10);
    }
  }
  
  // Update each player's conditions based on new values
  updatePlayerConditions();

  // Broadcast updated game state to all players
  io.emit('gameStateUpdate', gameState);
  console.log(`Game time: ${gameState.gameTime}h, Resources:`, gameState.resources);
}, 3600000); // 1 hour in milliseconds

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // When a player joins, add them to the global state
  socket.on('playerJoin', (playerData) => {
    gameState.players[socket.id] = playerData;
    console.log('Player joined:', playerData);
    socket.emit('gameStateUpdate', gameState);
    io.emit('gameStateUpdate', gameState);
  });

  // Player disposes garbage
  socket.on('disposeGarbage', () => {
    gameState.resources.garbage = 0;
    io.emit('gameStateUpdate', gameState);
    console.log('Garbage disposed by', socket.id);
  });

  // Player checks power (could reset a timer, etc.)
  socket.on('checkPower', () => {
    io.emit('gameStateUpdate', gameState);
    console.log('Power checked by', socket.id);
  });

  // Handle chat using rooms
  socket.on('joinRoom', (room) => {
    socket.join(room);
    socket.to(room).emit('chatMessage', { sender: 'System', room, message: `A new player has joined ${room}.` });
    console.log(`Socket ${socket.id} joined room ${room}`);
  });
  socket.on('leaveRoom', (room) => {
    socket.leave(room);
    socket.to(room).emit('chatMessage', { sender: 'System', room, message: `A player has left ${room}.` });
    console.log(`Socket ${socket.id} left room ${room}`);
  });
  socket.on('chatMessage', (data) => {
    data.sender = gameState.players[socket.id] ? gameState.players[socket.id].name : 'Unknown';
    io.to(data.room).emit('chatMessage', data);
    console.log(`Chat in ${data.room} from ${data.sender}: ${data.message}`);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete gameState.players[socket.id];
    io.emit('gameStateUpdate', gameState);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
