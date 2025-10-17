/**
 * SoulSync Socket.IO Server (Pro Logging Edition)
 * -----------------------------------------------
 * Handles real-time chat, call signaling, and user presence.
 * Enhanced with professional, color-coded logging for full trace visibility.
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import chalk from "chalk"; // ✅ Optional (add via npm i chalk)

// ======================================================
// ⚙️ Express Setup
// ======================================================
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_, res) => res.send("✅ SoulSync Socket.IO server running"));

// ======================================================
// 🚀 HTTP + Socket.IO Server
// ======================================================
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ======================================================
// 🧠 State Management
// ======================================================
const activeRooms = {}; // { roomId: { sockets: Set() } }
const userSockets = {}; // userId -> Set(socketId)

// ======================================================
// 🪵 Pro Logger
// ======================================================
const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const log = {
  info: (tag, msg, data) =>
    console.log(`${timestamp()} ${chalk.cyan(tag)} ${chalk.white(msg)}`, data ?? ""),
  success: (tag, msg, data) =>
    console.log(`${timestamp()} ${chalk.green(tag)} ${chalk.white(msg)}`, data ?? ""),
  warn: (tag, msg, data) =>
    console.log(`${timestamp()} ${chalk.yellow(tag)} ${chalk.white(msg)}`, data ?? ""),
  error: (tag, msg, data) =>
    console.log(`${timestamp()} ${chalk.red(tag)} ${chalk.white(msg)}`, data ?? ""),
  trace: (tag, msg, data) =>
    console.log(`${timestamp()} ${chalk.magenta(tag)} ${chalk.white(msg)}`, data ?? ""),
};

// ======================================================
// 🧩 Helper: Emit to Room + Receiver User Channel
// ======================================================
const emitToRoom = (event, data) => {
  const sid = data?.sender_id ?? data?.caller_id;
  const rid = data?.receiver_id ?? data?.receiverId;

  if (sid && rid) {
    const roomId = sid < rid ? `${sid}-${rid}` : `${rid}-${sid}`;
    io.to(roomId).emit(event, { ...data, roomId });
    io.to(`user:${rid}`).emit(event, { ...data, roomId });

    log.success("📤 EMIT", `${event} → room ${roomId} & user:${rid}`, {
      sender: sid,
      receiver: rid,
      payload: data,
    });
  } else {
    io.emit(event, data);
    log.warn("🌐 BROADCAST", event, data);
  }
};

// ======================================================
// 🔌 Socket Connection
// ======================================================
io.on("connection", (socket) => {
  log.success("🟢 CONNECT", `Socket connected`, { socketId: socket.id });
  socket.data.currentRoom = null;

  // ======================================================
  // 👤 Join personal user room
  // ======================================================
  socket.on("joinUserRoom", (userId) => {
    if (!userId) return;
    const room = `user:${userId}`;
    socket.join(room);
    if (!userSockets[userId]) userSockets[userId] = new Set();
    userSockets[userId].add(socket.id);

    log.info("👤 USER ROOM", `${socket.id} joined ${room}`);
  });

  // ======================================================
  // 💬 Join private room
  // ======================================================
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    if (!senderId || !receiverId) return;

    const roomId =
      senderId < receiverId ? `${senderId}-${receiverId}` : `${receiverId}-${senderId}`;
    socket.join(roomId);
    socket.data.currentRoom = roomId;

    if (!activeRooms[roomId]) activeRooms[roomId] = { sockets: new Set() };
    activeRooms[roomId].sockets.add(socket.id);

    log.info("🏠 ROOM JOIN", `${socket.id} joined ${roomId}`, {
      totalUsers: activeRooms[roomId].sockets.size,
    });

    socket.to(roomId).emit("room:joined", { roomId, socketId: socket.id });

    if (activeRooms[roomId].sockets.size >= 2) {
      io.to(roomId).emit("room:ready", { roomId });
      log.success("✅ ROOM READY", roomId);
    }
  });

  // ======================================================
  // 📞 Call Handling
  // ======================================================
  socket.on("call:start", (data) => {
    log.info("📞 CALL START", "Initiating call", data);
    emitToRoom("call:ringing", { ...data, status: "ringing" });
  });

  socket.on("call:accept", (data) => {
    log.success("✅ CALL ACCEPT", "Call accepted", data);
    emitToRoom("call:accepted", { ...data, status: "accepted" });
  });

  socket.on("call:reject", (data) => {
    log.warn("❌ CALL REJECT", "Call rejected", data);
    emitToRoom("call:rejected", { ...data, status: "rejected" });
  });

  socket.on("call:cancel", (data) => {
    log.warn("🚫 CALL CANCEL", "Call cancelled", data);
    emitToRoom("call:cancelled", { ...data, status: "cancelled" });
  });

  socket.on("call:end", (data) => {
    log.info("🔚 CALL END", "Call ended", data);
    emitToRoom("call:ended", { ...data, status: "ended" });
  });

  // ======================================================
  // 📡 WebRTC Signaling
  // ======================================================
  socket.on("webrtc:offer", (data) => {
    if (!data?.roomId) return;
    socket.to(data.roomId).emit("webrtc:offer", data);
    log.trace("📡 OFFER", `Sent offer → ${data.roomId}`);
  });

  socket.on("webrtc:answer", (data) => {
    if (!data?.roomId) return;
    socket.to(data.roomId).emit("webrtc:answer", data);
    log.trace("📡 ANSWER", `Sent answer → ${data.roomId}`);
  });

  socket.on("webrtc:candidate", (data) => {
    if (!data?.roomId) return;
    socket.to(data.roomId).emit("webrtc:candidate", data);
    log.trace("🧊 CANDIDATE", `Sent ICE → ${data.roomId}`);
  });

  // ======================================================
  // 🔌 Disconnect Cleanup
  // ======================================================
  socket.on("disconnect", (reason) => {
    const roomId = socket.data.currentRoom;
    if (roomId && activeRooms[roomId]) {
      activeRooms[roomId].sockets.delete(socket.id);
      const remaining = activeRooms[roomId].sockets.size;
      if (remaining === 0) delete activeRooms[roomId];
      else socket.to(roomId).emit("room:left", { roomId, socketId: socket.id });

      log.warn("👥 DISCONNECT", `Room ${roomId} now has ${remaining} users`);
    }

    Object.keys(userSockets).forEach((uid) => {
      userSockets[uid].delete(socket.id);
      if (userSockets[uid].size === 0) delete userSockets[uid];
    });

    log.error("🔴 SOCKET DISCONNECT", `Socket ${socket.id} disconnected`, { reason });
  });
});

// ======================================================
// 🌍 REST → Socket.IO Bridge (External Emit)
// ======================================================
app.post("/emit", (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).send("Missing 'event' field");
  log.info("🌍 EXTERNAL EMIT", event, data);
  emitToRoom(event, data);
  res.send("✅ Emit successful");
});

// ======================================================
// 🚀 Start Server
// ======================================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  log.success("🚀 SERVER RUNNING", `Listening on http://localhost:${PORT}`);
});
