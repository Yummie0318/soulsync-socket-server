import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Health check route
app.get("/", (req, res) => {
  res.send("✅ Socket.IO server running");
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 🔒 Restrict later to your actual Next.js domain
    methods: ["GET", "POST"],
  },
});

// ======================================================
// 🌐 SOCKET CONNECTION HANDLING
// ======================================================
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // ======================================================
  // 🏠 ROOM JOINING (shared for messages and calls)
  // ======================================================
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    if (!senderId || !receiverId) return;
    const roomId =
      senderId < receiverId
        ? `${senderId}-${receiverId}`
        : `${receiverId}-${senderId}`;

    socket.join(roomId);
    console.log(`🏠 ${socket.id} joined room: ${roomId}`);
  });

  // ======================================================
  // 💬 MESSAGE EVENTS
  // ======================================================
  const messageEvents = [
    "message:new",
    "message:update",
    "message:delete",
    "message:reaction",
    "message:reply",
  ];

  messageEvents.forEach((event) => {
    socket.on(event, (data) => {
      const { sender_id, receiver_id } = data || {};
      if (!sender_id || !receiver_id) return;

      const roomId =
        sender_id < receiver_id
          ? `${sender_id}-${receiver_id}`
          : `${receiver_id}-${sender_id}`;

      console.log(`💬 [${event}]`, data);
      io.to(roomId).emit(event, data);
    });
  });

  // ======================================================
  // 📞 CALL EVENTS
  // ======================================================

  // 🔔 Start a call (ringing)
  socket.on("call:start", (data) => {
    const { sender_id, receiver_id } = data || {};
    if (!sender_id || !receiver_id) return;

    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("📞 [call:start]", data);
    io.to(roomId).emit("call:ringing", { ...data, status: "ringing", roomId });
  });

  // ✅ Accept call
  socket.on("call:accept", (data) => {
    console.log("✅ [call:accept]", data);
    if (data?.roomId) io.to(data.roomId).emit("call:accepted", { ...data, status: "accepted" });
  });

  // ❌ Reject call
  socket.on("call:reject", (data) => {
    console.log("❌ [call:reject]", data);
    if (data?.roomId) io.to(data.roomId).emit("call:rejected", { ...data, status: "rejected" });
  });

  // 🚫 Cancel call (before answered)
  socket.on("call:cancel", (data) => {
    console.log("🚫 [call:cancel]", data);
    if (data?.roomId) io.to(data.roomId).emit("call:cancelled", { ...data, status: "cancelled" });
  });

  // 🔚 End ongoing call
  socket.on("call:end", (data) => {
    console.log("🔚 [call:end]", data);
    if (data?.roomId) io.to(data.roomId).emit("call:ended", { ...data, status: "ended" });
  });

  // ======================================================
  // 📡 WebRTC SIGNAL EXCHANGE
  // ======================================================
  socket.on("webrtc:signal", (data) => {
    if (!data?.roomId) return;
    console.log(`📡 [webrtc:signal] type=${data.type} → room=${data.roomId}`);
    io.to(data.roomId).emit("webrtc:signal", data);
  });

  // ======================================================
  // 🔌 DISCONNECTION
  // ======================================================
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// ======================================================
// 🌍 EXTERNAL EMIT ENDPOINT (Next.js → Socket.io bridge)
// ======================================================
app.post("/emit", (req, res) => {
  const { event, data } = req.body;

  if (!event) return res.status(400).send("Missing 'event' field");
  console.log("🧩 [API /emit] →", event, data);

  if (data?.sender_id && data?.receiver_id) {
    const roomId =
      data.sender_id < data.receiver_id
        ? `${data.sender_id}-${data.receiver_id}`
        : `${data.receiver_id}-${data.sender_id}`;

    io.to(roomId).emit(event, data);
    console.log(`📤 [${event}] sent to room: ${roomId}`);
  } else {
    io.emit(event, data);
    console.log(`🌐 [${event}] broadcasted globally`);
  }

  res.send("✅ Emit successful");
});

// ======================================================
// 🚀 START SERVER
// ======================================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Socket.IO server running on http://localhost:${PORT}`);
});
