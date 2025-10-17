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

  // ======================================================
  // 👤 USER JOIN
  // ======================================================
  socket.on("joinUserRoom", (userId) => {
    if (!userId) return;
    socket.join(`user:${userId}`);
    if (!userSockets[userId]) userSockets[userId] = new Set();
    userSockets[userId].add(socket.id);
    log("👤 Joined user room", `user:${userId}`);
  });

  // ======================================================
  // 💬 MESSAGING ROOM
  // ======================================================
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    if (!senderId || !receiverId) return;
    const roomId = senderId < receiverId ? `${senderId}-${receiverId}` : `${receiverId}-${senderId}`;

    socket.join(roomId);
    socket.data.currentRoom = roomId;

    if (!activeRooms[roomId]) activeRooms[roomId] = { sockets: new Set() };
    activeRooms[roomId].sockets.add(socket.id);

    log("🏠 Room", `${socket.id} joined room ${roomId} (${activeRooms[roomId].sockets.size} users)`);

    socket.to(roomId).emit("room:joined", { roomId, socketId: socket.id });

    if (activeRooms[roomId].sockets.size >= 2) {
      io.to(roomId).emit("room:ready", { roomId });
      log("✅ RoomReady", roomId);
    }
  });

  // ======================================================
  // 📞 CALL HANDLING (Updated)
  // ======================================================
  const emitToRoom = (event, data) => {
    const sid = data?.sender_id ?? data?.caller_id;
    const rid = data?.receiver_id ?? data?.receiverId;

    if (sid && rid) {
      const roomId = sid < rid ? `${sid}-${rid}` : `${rid}-${sid}`;
      io.to(roomId).emit(event, { ...data, roomId });
      io.to(`user:${rid}`).emit(event, { ...data, roomId }); // ✅ ensure receiver always gets it
      log("📤 Event", event, `to ${roomId} & user:${rid}`);
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

  // ======================================================
  // 📡 WEBRTC SIGNALING
  // ======================================================
  socket.on("webrtc:offer", (data) => {
    if (!data?.roomId) return;
    socket.to(data.roomId).emit("webrtc:offer", data);
    log("📡 WebRTC Offer →", data.roomId);
  });

  socket.on("webrtc:answer", (data) => {
    if (!data?.roomId) return;
    socket.to(data.roomId).emit("webrtc:answer", data);
    log("📡 WebRTC Answer →", data.roomId);
  });

  socket.on("webrtc:candidate", (data) => {
    if (!data?.roomId) return;
    socket.to(data.roomId).emit("webrtc:candidate", data);
    log("🧊 ICE Candidate →", data.roomId);
  });

  // ======================================================
  // 🔌 DISCONNECT
  // ======================================================
  socket.on("disconnect", () => {
    const roomId = socket.data.currentRoom;
    if (roomId && activeRooms[roomId]) {
      activeRooms[roomId].sockets.delete(socket.id);
      const remaining = activeRooms[roomId].sockets.size;
      if (remaining === 0) delete activeRooms[roomId];
      else socket.to(roomId).emit("room:left", { roomId, socketId: socket.id });
      log("👥 Disconnect", `Room ${roomId} now has ${remaining} users`);
    }

    Object.keys(userSockets).forEach((uid) => {
      userSockets[uid].delete(socket.id);
      if (userSockets[uid].size === 0) delete userSockets[uid];
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
