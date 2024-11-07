const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const socket = require("socket.io");
const cors = require("cors");

const rooms = {};

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

const io = socket(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Create Room
  socket.on("create room", (roomID) => {
    if (rooms[roomID]) {
      socket.emit("room exists", roomID); // Notify user that room already exists
    } else {
      rooms[roomID] = [socket.id];
      socket.join(roomID);
      socket.emit("room created", roomID); // Confirm room creation
      console.log(`Room created: ${roomID}`);
    }
  });

  // Join Room
  socket.on("join room", (roomID) => {
    if (rooms[roomID]) {
      rooms[roomID].push(socket.id);
      socket.join(roomID);
      const otherUser = rooms[roomID].find((id) => id !== socket.id);
      if (otherUser) {
        console.log(`User joined room: ${roomID}`);
        socket.emit("other user", otherUser);
        socket.to(otherUser).emit("user joined", socket.id);
      }
    } else {
      socket.emit("no such room", roomID); // Notify user that room doesn't exist
    }
  });

  // WebRTC Signaling Events
  socket.on("offer", (payload) => {
    io.to(payload.target).emit("offer", payload);
  });

  socket.on("answer", (payload) => {
    io.to(payload.target).emit("answer", payload);
  });

  socket.on("ice-candidate", (incoming) => {
    io.to(incoming.target).emit("ice-candidate", incoming.candidate);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    for (const room in rooms) {
      const index = rooms[room].indexOf(socket.id);
      if (index !== -1) {
        rooms[room].splice(index, 1);
        if (rooms[room].length === 0) {
          delete rooms[room]; // Remove empty rooms
          console.log(`Room ${room} deleted`);
        }
      }
    }
  });
});

server.listen(8000, () => console.log("Server is running on port 8000"));
