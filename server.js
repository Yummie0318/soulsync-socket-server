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
  // 📨 MESSAGE EVENTS
  // ------------------------------------------------------

  socket.on("message:new", (msg) => {
    const { sender_id, receiver_id } = msg;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("📩 [message:new] Received:", msg);
    io.to(roomId).emit("message:new", msg);
  });

  socket.on("message:update", (msg) => {
    const { sender_id, receiver_id } = msg;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("📝 [message:update] Received:", msg);
    io.to(roomId).emit("message:update", msg);
  });

  socket.on("message:delete", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("🗑️ [message:delete] Received:", data);
    io.to(roomId).emit("message:delete", data);
  });

  socket.on("message:reaction", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("😊 [message:reaction] Received:", data);
    io.to(roomId).emit("message:reaction", data);
  });

  socket.on("message:reply", (msg) => {
    const { sender_id, receiver_id } = msg;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("↩️ [message:reply] Received:", msg);
    io.to(roomId).emit("message:new", msg);
  });

  // ------------------------------------------------------
  // 📞 CALL EVENTS (NEW)
  // ------------------------------------------------------

  // 🔔 Start a call (ringing)
  socket.on("call:start", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("📞 [call:start] →", data);
    io.to(roomId).emit("call:ringing", data); // receiver gets ringing signal
  });

  // ✅ Accept call
  socket.on("call:accept", (data) => {
    console.log("✅ [call:accept] →", data);
    io.to(data.roomId).emit("call:accepted", data);
  });

  // ❌ Reject call
  socket.on("call:reject", (data) => {
    console.log("❌ [call:reject] →", data);
    io.to(data.roomId).emit("call:rejected", data);
  });

  // 🔚 End call
  socket.on("call:end", (data) => {
    console.log("🔚 [call:end] →", data);
    io.to(data.roomId).emit("call:ended", data);
  });

  // 📡 WebRTC signal exchange (for offer/answer/ICE)
  socket.on("webrtc:signal", (data) => {
    console.log("📡 [webrtc:signal] →", data.type);
    io.to(data.roomId).emit("webrtc:signal", data);
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
    return res.status(400).send("Missing 'event' field");
  }

  if (data?.sender_id && data?.receiver_id) {
    const roomId =
      data.sender_id < data.receiver_id
        ? `${data.sender_id}-${data.receiver_id}`
        : `${data.receiver_id}-${data.sender_id}`;
    io.to(roomId).emit(event, data);
    console.log(`📤 [${event}] Broadcasted to room: ${roomId}`);
  } else {
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
