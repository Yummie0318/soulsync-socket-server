import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Health check
app.get("/", (req, res) => {
  res.send("✅ SoulSync Socket Server is running!");
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // TODO: restrict to your frontend domain
    methods: ["GET", "POST"],
  },
});

// 🧠 Track users in rooms for debugging
const activeRooms = new Map();

// ------------------------------------------------------
// ✅ SOCKET.IO HANDLING
// ------------------------------------------------------
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // ------------------------------------------------------
  // 🏠 ROOM JOIN / LEAVE
  // ------------------------------------------------------
  socket.on("join_room", ({ roomId, senderId }) => {
    socket.join(roomId);
    console.log(`👥 User ${senderId} (${socket.id}) joined room ${roomId}`);

    if (!activeRooms.has(roomId)) activeRooms.set(roomId, []);
    activeRooms.get(roomId).push({ socketId: socket.id, userId: senderId });

    console.log("📋 Active Rooms:", JSON.stringify([...activeRooms.entries()], null, 2));
  });

  socket.on("leave_room", ({ roomId, senderId }) => {
    socket.leave(roomId);
    console.log(`🚪 User ${senderId} left room ${roomId}`);

    if (activeRooms.has(roomId)) {
      const filtered = activeRooms
        .get(roomId)
        .filter((entry) => entry.socketId !== socket.id);
      if (filtered.length > 0) activeRooms.set(roomId, filtered);
      else activeRooms.delete(roomId);
    }
  });

  // ------------------------------------------------------
  // 💬 MESSAGE EVENTS
  // ------------------------------------------------------
  const msgEvents = [
    "message:new",
    "message:update",
    "message:delete",
    "message:reaction",
    "message:reply",
  ];

  msgEvents.forEach((event) => {
    socket.on(event, (data) => {
      const { sender_id, receiver_id } = data;
      const roomId =
        sender_id < receiver_id
          ? `${sender_id}-${receiver_id}`
          : `${receiver_id}-${sender_id}`;

      console.log(`💬 [${event}]`, data);
      socket.to(roomId).emit(event, data);
    });
  });

  // ------------------------------------------------------
  // 📞 CALL EVENTS
  // ------------------------------------------------------
  socket.on("call:start", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("📞 [call:start]", data);
    io.to(roomId).emit("call:ringing", { ...data, status: "ringing", roomId });
  });

  socket.on("call:accept", (data) => {
    console.log("✅ [call:accept]", data);
    io.to(data.roomId).emit("call:accepted", { ...data, status: "accepted" });
  });

  socket.on("call:reject", (data) => {
    console.log("❌ [call:reject]", data);
    io.to(data.roomId).emit("call:rejected", { ...data, status: "rejected" });
  });

  socket.on("call:cancel", (data) => {
    console.log("🚫 [call:cancel]", data);
    io.to(data.roomId).emit("call:cancelled", { ...data, status: "cancelled" });
  });

  socket.on("call:end", (data) => {
    console.log("🔚 [call:end]", data);
    io.to(data.roomId).emit("call:ended", { ...data, status: "ended" });
  });

  // ------------------------------------------------------
  // 📡 WEBRTC SIGNALING (offer / answer / candidate)
  // ------------------------------------------------------
  socket.on("webrtc:signal", (data) => {
    const { roomId, type } = data;
    console.log(`📡 [webrtc:signal] ${type} from ${socket.id} → ${roomId}`);
    // Use socket.to() to send only to the other peer
    socket.to(roomId).emit("webrtc:signal", data);
  });

  // ------------------------------------------------------
  // 🔌 DISCONNECT HANDLING
  // ------------------------------------------------------
  socket.on("disconnect", (reason) => {
    console.log(`🔴 Disconnected: ${socket.id} (${reason})`);

    for (const [roomId, users] of activeRooms.entries()) {
      const remaining = users.filter((u) => u.socketId !== socket.id);
      if (remaining.length > 0) activeRooms.set(roomId, remaining);
      else activeRooms.delete(roomId);
    }

    console.log("📋 Rooms after disconnect:", JSON.stringify([...activeRooms.entries()], null, 2));
  });
});

// ------------------------------------------------------
// ✅ EXTERNAL EMIT ENDPOINT (for backend → socket bridge)
// ------------------------------------------------------
app.post("/emit", (req, res) => {
  const { event, data } = req.body;

  if (!event) return res.status(400).send("Missing 'event'");

  console.log("🧩 [API /emit] Event:", event);
  console.log("📦 Data:", data);

  if (data?.sender_id && data?.receiver_id) {
    const roomId =
      data.sender_id < data.receiver_id
        ? `${data.sender_id}-${data.receiver_id}`
        : `${data.receiver_id}-${data.sender_id}`;
    io.to(roomId).emit(event, data);
    console.log(`📤 [${event}] sent to room ${roomId}`);
  } else {
    io.emit(event, data);
    console.log(`🌐 [${event}] broadcasted globally`);
  }

  res.send("✅ Emit successful");
});

// ------------------------------------------------------
// 🚀 START SERVER
// ------------------------------------------------------
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ SoulSync Socket Server running on port ${PORT}`);
});
