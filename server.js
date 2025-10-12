import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Health check
app.get("/", (req, res) => {
  res.send("✅ WebRTC Socket Server is running");
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000", // local dev
      "https://soulsyncai.vercel.app" // ✅ update this to your deployed frontend domain
    ],
    methods: ["GET", "POST"],
  },
});

// ------------------------------------------------------
// 🔌 SOCKET CONNECTION HANDLER
// ------------------------------------------------------
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // 🏠 Join a private chat/call room
  socket.on("joinRoom", ({ senderId, receiverId }) => {
    const roomId =
      senderId < receiverId
        ? `${senderId}-${receiverId}`
        : `${receiverId}-${senderId}`;
    socket.join(roomId);
    console.log(`🏠 ${socket.id} joined room: ${roomId}`);
  });

  // ------------------------------------------------------
  // 💬 MESSAGE EVENTS
  // ------------------------------------------------------
  const messageEvents = [
    "message:new",
    "message:update",
    "message:delete",
    "message:reaction",
    "message:reply",
  ];

  messageEvents.forEach((event) => {
    socket.on(event, (data) => {
      const { sender_id, receiver_id } = data;
      const roomId =
        sender_id < receiver_id
          ? `${sender_id}-${receiver_id}`
          : `${receiver_id}-${sender_id}`;
      console.log(`💬 [${event}]`, data);
      io.to(roomId).emit(event, data);
    });
  });

  // ------------------------------------------------------
  // 📞 CALL EVENTS
  // ------------------------------------------------------

  // 🔔 Caller starts call (ringing)
  socket.on("call:start", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;
    console.log("📞 [call:start]", data);
    io.to(roomId).emit("call:ringing", { ...data, status: "ringing", roomId });
  });

  // ✅ Receiver accepts call
  socket.on("call:accept", (data) => {
    console.log("✅ [call:accept]", data);
    io.to(data.roomId).emit("call:accepted", { ...data, status: "accepted" });
  });

  // ❌ Receiver rejects call
  socket.on("call:reject", (data) => {
    console.log("❌ [call:reject]", data);
    io.to(data.roomId).emit("call:rejected", { ...data, status: "rejected" });
  });

  // 🚫 Caller cancels before answer
  socket.on("call:cancel", (data) => {
    console.log("🚫 [call:cancel]", data);
    io.to(data.roomId).emit("call:cancelled", { ...data, status: "cancelled" });
  });

  // 🔚 End ongoing call
  socket.on("call:end", (data) => {
    console.log("🔚 [call:end]", data);
    io.to(data.roomId).emit("call:ended", { ...data, status: "ended" });
  });

  // ------------------------------------------------------
  // 📡 WEBRTC SIGNALING EVENTS (updated)
  // ------------------------------------------------------

  // Both clients joined and ready → Caller can offer
  socket.on("call:join-room", ({ roomId, userId }) => {
    socket.join(roomId);
    console.log(`📡 [call:join-room] User ${userId} joined ${roomId}`);
    socket.to(roomId).emit("call:ready", { roomId });
  });

  // WebRTC offer from caller
  socket.on("webrtc:offer", ({ roomId, signalData }) => {
    console.log("📡 [webrtc:offer] relaying offer to room:", roomId);
    socket.to(roomId).emit("webrtc:offer", { signalData });
  });

  // WebRTC answer from callee
  socket.on("webrtc:answer", ({ roomId, signalData }) => {
    console.log("📡 [webrtc:answer] relaying answer to room:", roomId);
    socket.to(roomId).emit("webrtc:answer", { signalData });
  });

  // ICE candidate relay
  socket.on("webrtc:candidate", ({ roomId, candidate }) => {
    console.log("📡 [webrtc:candidate] relaying candidate to room:", roomId);
    socket.to(roomId).emit("webrtc:candidate", { candidate });
  });

  // Leave room
  socket.on("call:leave-room", ({ roomId }) => {
    socket.leave(roomId);
    console.log(`🚪 [call:leave-room] ${socket.id} left ${roomId}`);
    io.to(roomId).emit("call:ended", { roomId, status: "ended" });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// ------------------------------------------------------
// ✅ External emit endpoint (used by Next.js backend)
// ------------------------------------------------------
app.post("/emit", (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).send("Missing 'event' field");

  console.log("🧩 [API /emit]", event, data);

  if (data?.sender_id && data?.receiver_id) {
    const roomId =
      data.sender_id < data.receiver_id
        ? `${data.sender_id}-${data.receiver_id}`
        : `${data.receiver_id}-${data.sender_id}`;
    io.to(roomId).emit(event, data);
    console.log(`📤 [${event}] → room: ${roomId}`);
  } else {
    io.emit(event, data);
    console.log(`🌐 [${event}] broadcasted globally`);
  }

  res.send("✅ Emit successful");
});

// ------------------------------------------------------
// ✅ Start server
// ------------------------------------------------------
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Socket.IO server running on port ${PORT}`);
});
