// server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json()); // ✅ parse JSON bodies

// ✅ Health check route
app.get("/", (req, res) => {
  res.send("✅ SoulSync Socket Server is running!");
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 🔒 later restrict to your frontend URL
    methods: ["GET", "POST"],
  },
});

// ------------------------------------------------------
// ✅ SOCKET.IO CONNECTION HANDLING
// ------------------------------------------------------
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

  // ------------------------------------------------------
  // 📨 Message Events
  // ------------------------------------------------------

  // 🆕 New message
  socket.on("message:new", (msg) => {
    const { sender_id, receiver_id } = msg;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("📩 [message:new] Received from client:", msg);
    io.to(roomId).emit("message:new", msg);
    console.log(`📤 [message:new] Broadcasted to room: ${roomId}`);
  });

  // ✏️ Message updated
  socket.on("message:update", (msg) => {
    const { sender_id, receiver_id } = msg;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("📝 [message:update] Received:", msg);
    io.to(roomId).emit("message:update", msg);
    console.log(`📤 [message:update] Broadcasted to room: ${roomId}`);
  });

  // ❌ Message deleted
  socket.on("message:delete", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("🗑️ [message:delete] Received:", data);
    io.to(roomId).emit("message:delete", data);
    console.log(`📤 [message:delete] Broadcasted to room: ${roomId}`);
  });

  // 😍 Emoji reaction
  socket.on("message:reaction", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("😊 [message:reaction] Received:", data);
    io.to(roomId).emit("message:reaction", data);
    console.log(`📤 [message:reaction] Broadcasted to room: ${roomId}`);
  });

  // ↩️ Reply message
  socket.on("message:reply", (msg) => {
    const { sender_id, receiver_id } = msg;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("↩️ [message:reply] Received:", msg);
    io.to(roomId).emit("message:new", msg);
    console.log(`📤 [message:reply] Broadcasted as new message to room: ${roomId}`);
  });

  // 🔴 Disconnect
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// ------------------------------------------------------
// ✅ API Endpoint for External Emit (used by Next.js backend)
// ------------------------------------------------------
app.post("/emit", (req, res) => {
  const { event, data } = req.body;

  console.log("🧩 [API /emit] Trigger received → Event:", event);
  console.log("📦 Data:", data);

  if (!event) {
    console.warn("⚠️ Missing 'event' in /emit request");
    return res.status(400).send("Missing 'event' field");
  }

  // If message includes sender_id and receiver_id, send to that room only
  if (data?.sender_id && data?.receiver_id) {
    const roomId =
      data.sender_id < data.receiver_id
        ? `${data.sender_id}-${data.receiver_id}`
        : `${data.receiver_id}-${data.sender_id}`;
    io.to(roomId).emit(event, data);
    console.log(`📤 [${event}] Broadcasted to room: ${roomId}`);
  } else {
    // Otherwise, broadcast globally
    io.emit(event, data);
    console.log(`🌐 [${event}] Broadcasted globally`);
  }

  res.send("✅ Emit successful");
});

// ------------------------------------------------------
// ✅ SERVER START
// ------------------------------------------------------
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Socket.IO server running on port ${PORT}`);
});
