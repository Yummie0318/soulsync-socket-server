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
const activeRooms = {}; // { roomId: { sockets: Set<socket.id> } }

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // Store which room the socket currently joined
  socket.data.currentRoom = null;

  // ======================================================
  // 🏠 JOIN ROOM
  // ======================================================
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    if (!senderId || !receiverId) return;
    const roomId =
      senderId < receiverId
        ? `${senderId}-${receiverId}`
        : `${receiverId}-${senderId}`;

    socket.join(roomId);
    socket.data.currentRoom = roomId;

    // Track active members
    if (!activeRooms[roomId]) activeRooms[roomId] = { sockets: new Set() };
    activeRooms[roomId].sockets.add(socket.id);

    const count = activeRooms[roomId].sockets.size;
    console.log(`🏠 ${socket.id} joined room: ${roomId} (${count} users)`);

    // Let peers know someone joined
    socket.to(roomId).emit("room:joined", { roomId, socketId: socket.id });
  });

  // ======================================================
  // 📞 CALL EVENTS
  // ======================================================
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

  socket.on("call:accept", (data) => {
    console.log("✅ [call:accept]", data);
    if (data?.roomId)
      io.to(data.roomId).emit("call:accepted", { ...data, status: "accepted" });
  });

  socket.on("call:reject", (data) => {
    console.log("❌ [call:reject]", data);
    if (data?.roomId)
      io.to(data.roomId).emit("call:rejected", { ...data, status: "rejected" });
  });

  socket.on("call:cancel", (data) => {
    console.log("🚫 [call:cancel]", data);
    if (data?.roomId)
      io.to(data.roomId).emit("call:cancelled", { ...data, status: "cancelled" });
  });

  socket.on("call:end", (data) => {
    console.log("🔚 [call:end]", data);
    if (data?.roomId)
      io.to(data.roomId).emit("call:ended", { ...data, status: "ended" });
  });

  // ======================================================
  // 📡 WEBRTC SIGNAL EXCHANGE
  // ======================================================
  socket.on("webrtc:signal", (data) => {
    if (!data?.roomId) return;
    const { roomId, type } = data;
    console.log(`📡 [webrtc:signal] type=${type} from ${socket.id} → room=${roomId}`);

    // ✅ Forward signal to everyone else in the same room
    socket.to(roomId).emit("webrtc:signal", data);
  });

  // ======================================================
  // 🔌 DISCONNECTION (GRACEFUL CLEANUP)
  // ======================================================
  socket.on("disconnect", () => {
    const roomId = socket.data.currentRoom;
    if (roomId && activeRooms[roomId]) {
      activeRooms[roomId].sockets.delete(socket.id);
      const count = activeRooms[roomId].sockets.size;

      if (count === 0) {
        delete activeRooms[roomId];
        console.log(`🧹 [Cleanup] Room ${roomId} empty and removed`);
      } else {
        console.log(`👥 [Disconnect] Room ${roomId} now has ${count} users`);
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
