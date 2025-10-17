import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Health check
app.get("/", (req, res) => {
  res.status(200).send("✅ SoulSync WebRTC Socket Server is running");
});
app.get("/favicon.ico", (req, res) => res.status(204).end());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://soulsyncai.vercel.app",
    ],
    methods: ["GET", "POST"],
  },
});

// 🔹 Keep track of connected users (plain JS)
const userSockets = new Map(); // userId -> socketId

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // ✅ Register user
  socket.on("register", ({ userId }) => {
    userSockets.set(userId, socket.id);
    console.log(`🔹 Registered user ${userId} -> ${socket.id}`);
  });

  socket.on("disconnect", () => {
    for (const [id, sId] of userSockets.entries()) {
      if (sId === socket.id) userSockets.delete(id);
    }
    console.log("🔴 User disconnected:", socket.id);
  });

  // 🏠 Message rooms
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    const roomId = senderId < receiverId ? `${senderId}-${receiverId}` : `${receiverId}-${senderId}`;
    socket.join(roomId);
    console.log(`🏠 ${socket.id} joined room: ${roomId}`);
  });

  // 💬 Message events
  const messageEvents = ["message:new", "message:update", "message:delete", "message:reaction", "message:reply"];
  messageEvents.forEach((event) => {
    socket.on(event, (data) => {
      const { sender_id, receiver_id } = data;
      const roomId = sender_id < receiver_id ? `${sender_id}-${receiver_id}` : `${receiver_id}-${sender_id}`;
      io.to(roomId).emit(event, data);
    });
  });

  // 📞 Call events
  const callEvents = [
    ["call:start", "call:ringing", "ringing"],
    ["call:accept", "call:accepted", "accepted"],
    ["call:reject", "call:rejected", "rejected"],
    ["call:cancel", "call:cancelled", "cancelled"],
    ["call:end", "call:ended", "ended"],
  ];

  callEvents.forEach(([listenEvent, emitEvent, status]) => {
    socket.on(listenEvent, (data) => {
      const id1 = data.sender_id || data.caller_id;
      const id2 = data.receiver_id;
      const roomId = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
      console.log(`📞 [${listenEvent}] → room ${roomId}`);
      io.to(roomId).emit(emitEvent, { ...data, status, roomId });
    });
  });

  // 🔹 Forward call:ringing directly to receiver socket
  socket.on("call:ringing", (data) => {
    const callerId = data.callerId || data.sender_id;
    const receiverId = data.receiverId || data.receiver_id;
    const receiverSocketId = userSockets.get(Number(receiverId));

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("call:new", {
        id: Date.now(),
        caller_id: callerId,
        receiver_id: receiverId,
        call_type: data.callType || data.call_type || "video",
        call_status: "ringing",
      });
      console.log(`📞 call:ringing sent to user ${receiverId}`);
    } else {
      console.warn(`⚠️ Receiver ${receiverId} not connected`);
    }
  });

  // 📡 WebRTC signaling
  socket.on("call:join-room", ({ roomId, userId }) => {
    socket.join(roomId);
    socket.to(roomId).emit("call:ready", { roomId });
  });

  socket.on("webrtc:offer", ({ roomId, signalData }) =>
    socket.to(roomId).emit("webrtc:offer", { signalData })
  );
  socket.on("webrtc:answer", ({ roomId, signalData }) =>
    socket.to(roomId).emit("webrtc:answer", { signalData })
  );
  socket.on("webrtc:candidate", ({ roomId, candidate }) =>
    socket.to(roomId).emit("webrtc:candidate", { candidate })
  );

  socket.on("call:leave-room", ({ roomId }) => {
    socket.leave(roomId);
    io.to(roomId).emit("call:ended", { roomId, status: "ended" });
  });
});

// ✅ External emit endpoint
app.post("/emit", (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).send("Missing 'event' field");

  const { sender_id, receiver_id, caller_id, receiverId } = data || {};
  const id1 = sender_id || caller_id;
  const id2 = receiver_id || receiverId;

  if (id1 && id2) {
    const roomId = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
    io.to(roomId).emit(event, data);
    console.log(`📤 [${event}] → room: ${roomId}`);
  } else {
    io.emit(event, data);
  }

  res.send("✅ Emit successful");
});

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Socket.IO server running on port ${PORT}`);
});
