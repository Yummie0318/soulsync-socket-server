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
    origin: "*", // 🔒 later change this to your frontend URL
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // 🏠 Join private room (for a conversation between two users)
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    const roomId =
      senderId < receiverId
        ? `${senderId}-${receiverId}`
        : `${receiverId}-${senderId}`;
    socket.join(roomId);
    console.log(`🏠 ${socket.id} joined room: ${roomId}`);
  });

  // 📨 New message
  socket.on("message:new", (msg) => {
    const { sender_id, receiver_id } = msg;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;
    console.log("📩 New message:", msg);
    io.to(roomId).emit("message:new", msg); // ✅ only emit to this chat room
  });

  // ✏️ Message edited
  socket.on("message:update", (msg) => {
    const { sender_id, receiver_id } = msg;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;
    console.log("📝 Message updated:", msg);
    io.to(roomId).emit("message:update", msg);
  });

  // ❌ Message deleted
  socket.on("message:delete", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;
    console.log("🗑️ Message deleted:", data);
    io.to(roomId).emit("message:delete", data);
  });

  // 😍 Emoji reaction
  socket.on("message:reaction", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;
    console.log("😊 Emoji reaction added:", data);
    io.to(roomId).emit("message:reaction", data);
  });

  // 💬 Reply message
  socket.on("message:reply", (msg) => {
    const { sender_id, receiver_id } = msg;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;
    console.log("↩️ Reply message:", msg);
    io.to(roomId).emit("message:new", msg);
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Socket.IO server running on port ${PORT}`);
});
