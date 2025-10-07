// server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

// ✅ Health check route
app.get("/", (req, res) => {
  res.send("✅ SoulSync Socket Server is running!");
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // later restrict to your frontend URL
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // 📨 New message
  socket.on("message:new", (msg) => {
    console.log("📩 New message received:", msg);
    io.emit("message:new", msg);
  });

  // ✏️ Message edited
  socket.on("message:update", (msg) => {
    console.log("📝 Message updated:", msg);
    io.emit("message:update", msg);
  });

  // ❌ Message deleted
  socket.on("message:delete", (data) => {
    console.log("🗑️ Message deleted:", data);
    io.emit("message:delete", data);
  });

  // 😍 Emoji reaction
  socket.on("message:reaction", (data) => {
    console.log("😊 Emoji reaction added:", data);
    io.emit("message:reaction", data);
  });

  // 💬 Reply message
  socket.on("message:reply", (msg) => {
    console.log("↩️ Reply message:", msg);
    io.emit("message:new", msg); // replies are still new messages
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Socket.IO server running on port ${PORT}`);
});
