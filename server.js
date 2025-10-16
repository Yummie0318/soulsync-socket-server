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
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ======================================================
// 🌐 CONNECTION MANAGEMENT
// ======================================================
const activeRooms: Record<string, Set<string>> = {}; // { roomId: Set(socketId) }
const userRooms: Record<number, Set<string>> = {}; // userId -> Set(socketId)

const log = (type: string, ...args: any[]) => console.log(`[${type}]`, ...args);

io.on("connection", (socket) => {
  log("🟢 Connected", socket.id);
  socket.data.currentRoom = null;

  // --------------------------
  // Join global user room
  // --------------------------
  socket.on("joinUserRoom", (userId: number) => {
    if (!userId) return;
    socket.join(`user-${userId}`);
    if (!userRooms[userId]) userRooms[userId] = new Set();
    userRooms[userId].add(socket.id);
    log("👤 UserRoom", `User ${userId} joined their global room`);
  });

  // --------------------------
  // Join active call room
  // --------------------------
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    if (!senderId || !receiverId) return;
    const roomId = senderId < receiverId ? `${senderId}-${receiverId}` : `${receiverId}-${senderId}`;
    socket.join(roomId);
    socket.data.currentRoom = roomId;

    if (!activeRooms[roomId]) activeRooms[roomId] = new Set();
    activeRooms[roomId].add(socket.id);

    log("🏠 Room", `${socket.id} joined room ${roomId} (${activeRooms[roomId].size} users)`);
    socket.to(roomId).emit("room:joined", { roomId, socketId: socket.id });

    if (activeRooms[roomId].size >= 2) {
      io.to(roomId).emit("room:ready", { roomId });
      log("✅ RoomReady", roomId);
    }
  });

  // --------------------------
  // Unified emitter helper
  // --------------------------
  const emitToRoom = (event: string, data: any) => {
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

  // --------------------------
  // Call events
  // --------------------------
  socket.on("call:start", (data) => {
    log("📞 CallStart", data);
    if (data.receiver_id) {
      io.to(`user-${data.receiver_id}`).emit("call:ringing", { ...data, status: "ringing" });
      log("🔔 Notification sent to user", data.receiver_id);
    }
    emitToRoom("call:ringing", { ...data, status: "ringing" });
  });

  socket.on("call:accept", (data) => {
    log("✅ CallAccept", data);
    if (data.receiver_id) io.to(`user-${data.receiver_id}`).emit("call:accepted", { ...data, status: "accepted" });
    if (data.sender_id) io.to(`user-${data.sender_id}`).emit("call:accepted", { ...data, status: "accepted" });
    emitToRoom("call:accepted", { ...data, status: "accepted" });
  });

  socket.on("call:reject", (data) => {
    log("❌ CallReject", data);
    if (data.receiver_id) io.to(`user-${data.receiver_id}`).emit("call:rejected", { ...data, status: "rejected" });
    if (data.sender_id) io.to(`user-${data.sender_id}`).emit("call:rejected", { ...data, status: "rejected" });
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

  // --------------------------
  // WebRTC signaling
  // --------------------------
  socket.on("webrtc:signal", (data) => {
    if (!data?.roomId) return;
    socket.to(data.roomId).emit("webrtc:signal", data);
    log("📡 WebRTC Signal", data.type, `from ${socket.id} → room ${data.roomId}`);
  });

  // --------------------------
  // Disconnect / cleanup
  // --------------------------
  socket.on("disconnect", () => {
    // Remove from activeRooms
    const roomId = socket.data.currentRoom;
    if (roomId && activeRooms[roomId]) {
      activeRooms[roomId].delete(socket.id);
      const remaining = activeRooms[roomId].size;
      if (remaining === 0) {
        delete activeRooms[roomId];
        log("🧹 Cleanup", `Room ${roomId} removed`);
      } else {
        socket.to(roomId).emit("room:left", { roomId, socketId: socket.id });
        log("👥 Disconnect", `Room ${roomId} now has ${remaining} users`);
      }
    }

    // Remove from userRooms
    Object.keys(userRooms).forEach((uid) => {
      userRooms[Number(uid)].delete(socket.id);
      if (userRooms[Number(uid)].size === 0) delete userRooms[Number(uid)];
    });

    log("🔴 Disconnected", socket.id);
  });
});

// ======================================================
// 🌍 External emit endpoint
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
server.listen(PORT, "0.0.0.0", () => {
  log("✅ Server Running", `http://localhost:${PORT}`);
});
