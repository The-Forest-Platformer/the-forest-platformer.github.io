// server.js
const express = require("express");
const http = require("http");
const socketio = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Serve static files from the "public" directory.
app.use(express.static("public"));

let players = {}; // Store active players in the lobby

// A simple threshold to check for unrealistic movement.
const MOVEMENT_THRESHOLD = 100;

// Basic filter for names (English only, prevents bad words)
const bannedWords = ["fuck", "shit", "bitch", "damn", "asshole"];
function isValidName(name) {
  if (!/^[A-Za-z\s]+$/.test(name.trim())) return false;
  let lower = name.trim().toLowerCase();
  for (let word of bannedWords) {
    if (lower.includes(word)) return false;
  }
  return name.trim().length > 0;
}

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // When a player joins the lobby, include their chosen name.
  socket.on("joinLobby", (data) => {
    const playerName = data.name && isValidName(data.name) ? data.name : "Player";
    
    socket.join("lobby");
    players[socket.id] = { 
      x: 50,
      y: 50,
      facing: "right",
      width: 40,
      height: 40,
      health: 100,
      isAlive: true,
      name: playerName
    };

    console.log(`Player '${playerName}' joined.`);

    socket.emit("currentPlayers", players);
    socket.to("lobby").emit("newPlayer", { id: socket.id, ...players[socket.id] });
  });

  socket.on("playerUpdate", (data) => {
    if (!players[socket.id]) return;

    const dx = data.x - players[socket.id].x;
    const dy = data.y - players[socket.id].y;

    if (Math.sqrt(dx * dx + dy * dy) > MOVEMENT_THRESHOLD) {
      console.warn(`Movement from ${socket.id} exceeded threshold. Ignoring update.`);
      return;
    }

    players[socket.id] = { ...players[socket.id], ...data };
    socket.to("lobby").emit("playerMoved", { id: socket.id, ...players[socket.id] });
  });

  // Handle both **bow and sword** hits from client combat
  socket.on("playerHit", (data) => {
    if (!players[data.target]) return;

    players[data.target].health -= data.damage;

    // Check if player needs to respawn
    if (players[data.target].health <= 0) {
      players[data.target].health = 0;
      players[data.target].isAlive = false;
      io.in("lobby").emit("playerDied", data.target);

      // Respawn after 3 seconds
      setTimeout(() => {
        if (players[data.target]) {
          players[data.target].health = 100;
          players[data.target].isAlive = true;
          players[data.target].x = 50;
          players[data.target].y = 50;
          io.in("lobby").emit("playerRespawned", {
            id: data.target,
            x: 50,
            y: 50,
            health: 100
          });
        }
      }, 3000);
    }

    io.in("lobby").emit("playerHealthUpdate", { id: data.target, health: players[data.target].health });
  });

  // Chat support with name display
  socket.on("chatMessage", (message) => {
    io.in("lobby").emit("chatMessage", { id: socket.id, name: players[socket.id]?.name || "", message });
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.in("lobby").emit("playerDisconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
