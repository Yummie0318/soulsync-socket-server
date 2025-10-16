import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Health check
app.get("/", (_, res) => res.send("✅ Socket.IO server running"));

// ======================================================
// 🚀 HTTP & Socket.IO Server
// ======================================================
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ======================================================
// 🌐 CONNECTION MANAGEMENT
// ======================================================
const activeRooms = {}; // { roomId: { sockets: Set() } }
const userSockets = {}; // userId -> Set(socketId)
const log = (type, ...args) => console.log(`[${type}]`, ...args);

io.on("connection", (socket) => {
  log("🟢 Connected", socket.id);
  socket.data.currentRoom = null;

  // ================= Messaging & Rooms =================
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    if (!senderId || !receiverId) return;
    const roomId = senderId < receiverId ? `${senderId}-${receiverId}` : `${receiverId}-${senderId}`;

    socket.join(roomId);
    socket.data.currentRoom = roomId;

    if (!activeRooms[roomId]) activeRooms[roomId] = { sockets: new Set() };
    activeRooms[roomId].sockets.add(socket.id);

    log("🏠 Room", `${socket.id} joined room ${roomId} (${activeRooms[roomId].sockets.size} users)`);

    socket.to(roomId).emit("room:joined", { roomId, socketId: socket.id });

    // Ready if at least 2 participants
    if (activeRooms[roomId].sockets.size >= 2) {
      io.to(roomId).emit("room:ready", { roomId });
      log("✅ RoomReady", roomId);
    }
  });

  // ================= Call Handling =================
  const emitToRoom = (event, data) => {
    const sid = data?.sender_id ?? data?.caller_id;
    const rid = data?.receiver_id ?? data?.receiverId;

    if (sid && rid) {
      const roomId = sid < rid ? `${sid}-${rid}` : `${rid}-${sid}`;
      io.to(roomId).emit(event, { ...data, roomId });
      log("📤 Event", event, `to room ${roomId}`);
    } else {
      io.emit(event, data);
      log("🌐 Broadcast", event);
    }
  };

  socket.on("call:start", (data) => {
    log("📞 CallStart", data);
    emitToRoom("call:ringing", { ...data, status: "ringing" });
  });

  socket.on("call:accept", (data) => {
    log("✅ CallAccept", data);
    emitToRoom("call:accepted", { ...data, status: "accepted" });
  });

  socket.on("call:reject", (data) => {
    log("❌ CallReject", data);
    emitToRoom("call:rejected", { ...data, status: "rejected" });
  });

  socket.on("call:cancel", (data) => {
    log("🚫 CallCancel", data);
    emitToRoom("call:cancelled", { ...data, status: "cancelled" });
  });

  socket.on("call:end", (data) => {
    log("🔚 CallEnd", data);
    emitToRoom("call:ended", { ...data, status: "ended" });
  });

  // ================= WebRTC signaling =================
  socket.on("webrtc:signal", (data) => {
    if (!data?.roomId) return;
    socket.to(data.roomId).emit("webrtc:signal", data);
    log("📡 WebRTC Signal", data.type, `from ${socket.id} → room ${data.roomId}`);
  });

  // ================= Disconnect & cleanup =================
  socket.on("disconnect", () => {
    const roomId = socket.data.currentRoom;
    if (roomId && activeRooms[roomId]) {
      activeRooms[roomId].sockets.delete(socket.id);
      const remaining = activeRooms[roomId].sockets.size;
      if (remaining === 0) delete activeRooms[roomId];
      else socket.to(roomId).emit("room:left", { roomId, socketId: socket.id });
      log("👥 Disconnect", `Room ${roomId} now has ${remaining} users`);
    }

    // Remove socket from userSockets map
    Object.keys(userSockets).forEach((uid) => {
      userSockets[Number(uid)].delete(socket.id);
      if (userSockets[Number(uid)].size === 0) delete userSockets[Number(uid)];
    });

    log("🔴 Disconnected", socket.id);
  });
});

// ======================================================
// 🌍 External emit endpoint (Next.js → Socket.IO bridge)
// ======================================================
app.post("/emit", (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).send("Missing 'event' field");

  const sid = data?.sender_id ?? data?.caller_id;
  const rid = data?.receiver_id ?? data?.receiverId;

  if (sid && rid) {
    const roomId = sid < rid ? `${sid}-${rid}` : `${rid}-${sid}`;
    io.to(roomId).emit(event, { ...data, roomId });
    log("📤 ExternalEmit", event, `to room ${roomId}`);
  } else {
    io.emit(event, data);
    log("🌐 ExternalEmit Broadcast", event);
  }

  res.send("✅ Emit successful");
});

// ======================================================
// 🚀 START SERVER
// ======================================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => log("✅ Server Running", `http://localhost:${PORT}`));
