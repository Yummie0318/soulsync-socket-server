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
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ======================================================
// 🌐 SOCKET CONNECTION HANDLING
// ======================================================
const activeRooms = {}; // { roomId: { sockets: Set() } }

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  socket.data.currentRoom = null;

  // ======================================================
  // 🏠 JOIN ROOM
  // ======================================================
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    if (!senderId || !receiverId) return;
    const roomId = senderId < receiverId ? `${senderId}-${receiverId}` : `${receiverId}-${senderId}`;

    socket.join(roomId);
    socket.data.currentRoom = roomId;

    if (!activeRooms[roomId]) activeRooms[roomId] = { sockets: new Set() };
    activeRooms[roomId].sockets.add(socket.id);

    console.log(`🏠 ${socket.id} joined room: ${roomId} (${activeRooms[roomId].sockets.size} users)`);

    socket.to(roomId).emit("room:joined", { roomId, socketId: socket.id });

    // Check if room is ready
    if (activeRooms[roomId].sockets.size >= 2) {
      io.to(roomId).emit("room:ready", { roomId });
    }
  });

  // ======================================================
  // 📞 CALL EVENTS
  // ======================================================
  const emitToRoom = (event, data) => {
    const sid = data?.sender_id ?? data?.caller_id;
    const rid = data?.receiver_id ?? data?.receiverId;
    if (sid && rid) {
      const roomId = sid < rid ? `${sid}-${rid}` : `${rid}-${sid}`;
      io.to(roomId).emit(event, { ...data, roomId });
    } else {
      io.emit(event, data);
    }
  };

  socket.on("call:start", (data) => {
    console.log("📞 [call:start]", data);
    emitToRoom("call:ringing", { ...data, status: "ringing" });
  });
  socket.on("call:accept", (data) => {
    console.log("✅ [call:accept]", data);
    emitToRoom("call:accepted", { ...data, status: "accepted" });
  });
  socket.on("call:reject", (data) => {
    console.log("❌ [call:reject]", data);
    emitToRoom("call:rejected", { ...data, status: "rejected" });
  });
  socket.on("call:cancel", (data) => {
    console.log("🚫 [call:cancel]", data);
    emitToRoom("call:cancelled", { ...data, status: "cancelled" });
  });
  socket.on("call:end", (data) => {
    console.log("🔚 [call:end]", data);
    emitToRoom("call:ended", { ...data, status: "ended" });
  });

  // ======================================================
  // 📡 WEBRTC SIGNAL EXCHANGE
  // ======================================================
  socket.on("webrtc:signal", (data) => {
    if (!data?.roomId) return;
    console.log(`📡 [webrtc:signal] type=${data.type} from ${socket.id} → room=${data.roomId}`);
    socket.to(data.roomId).emit("webrtc:signal", data);
  });

  // ======================================================
  // 🔌 DISCONNECTION (with cleanup)
  // ======================================================
  socket.on("disconnect", () => {
    const roomId = socket.data.currentRoom;
    if (roomId && activeRooms[roomId]) {
      activeRooms[roomId].sockets.delete(socket.id);
      const remaining = activeRooms[roomId].sockets.size;

      if (remaining === 0) {
        delete activeRooms[roomId];
        console.log(`🧹 [Cleanup] Room ${roomId} empty and removed`);
      } else {
        console.log(`👥 [Disconnect] Room ${roomId} now has ${remaining} users`);
        socket.to(roomId).emit("room:left", { roomId, socketId: socket.id });
      }
    }

    console.log("🔴 User disconnected:", socket.id);
  });
});

// ======================================================
// 🌍 EXTERNAL EMIT ENDPOINT (Next.js → Socket.io bridge)
// ======================================================
app.post("/emit", (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).send("Missing 'event' field");

  const sid = data?.sender_id ?? data?.caller_id;
  const rid = data?.receiver_id ?? data?.receiverId;

  if (sid && rid) {
    const roomId = sid < rid ? `${sid}-${rid}` : `${rid}-${sid}`;
    io.to(roomId).emit(event, { ...data, roomId });
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
