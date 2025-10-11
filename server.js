import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Health check route
app.get("/", (req, res) => {
  res.send("✅ SoulSync Socket Server is running!");
});

// 🩵 Keep Render instance awake
setInterval(() => {
  console.log("💓 Keep-alive ping to prevent Render sleep");
}, 5 * 60 * 1000); // every 5 minutes

// ------------------------------------------------------
// 🌍 SERVER + SOCKET.IO CONFIG
// ------------------------------------------------------
const server = createServer(app);

// Allow both local and production origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://192.168.1.122:3000", // adjust your local IP if needed
  "https://www.soulsyncai.site",
  "https://soulsync-ugbm.vercel.app",
  "https://soulsync-ugbm-82qad5e31-arnolds-projects-e2695847.vercel.app",
];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("❌ Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
  },
});

// ------------------------------------------------------
// ⚡ SOCKET EVENTS
// ------------------------------------------------------
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // 🏠 Join private room for sender & receiver
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
  // 📞 CALL SIGNALING EVENTS
  // ------------------------------------------------------

  // 🔔 Start call (Ringing)
  socket.on("call:start", (data) => {
    const { sender_id, receiver_id } = data;
    const roomId =
      sender_id < receiver_id
        ? `${sender_id}-${receiver_id}`
        : `${receiver_id}-${sender_id}`;

    console.log("📞 [call:start]", data);
    io.to(roomId).emit("call:ringing", {
      ...data,
      status: "ringing",
      roomId,
    });
  });

  // ✅ Accept call
  socket.on("call:accept", (data) => {
    console.log("✅ [call:accept]", data);
    io.to(data.roomId).emit("call:accepted", {
      ...data,
      status: "accepted",
    });
  });

  // ❌ Reject call
  socket.on("call:reject", (data) => {
    console.log("❌ [call:reject]", data);
    io.to(data.roomId).emit("call:rejected", {
      ...data,
      status: "rejected",
    });
  });

  // 🚫 Caller cancels before answer
  socket.on("call:cancel", (data) => {
    console.log("🚫 [call:cancel]", data);
    io.to(data.roomId).emit("call:cancelled", {
      ...data,
      status: "cancelled",
    });
  });

  // 🔚 End ongoing call
  socket.on("call:end", (data) => {
    console.log("🔚 [call:end]", data);
    io.to(data.roomId).emit("call:ended", {
      ...data,
      status: "ended",
    });
  });

  // 📡 WebRTC offer/answer/ICE signaling
  socket.on("webrtc:signal", (data) => {
    console.log(`📡 [webrtc:signal] type=${data.type}`);
    io.to(data.roomId).emit("webrtc:signal", data);
  });

  // 🚪 Handle disconnect
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// ------------------------------------------------------
// 🌐 EXTERNAL EMIT ENDPOINT (for Next.js backend)
// ------------------------------------------------------
app.post("/emit", (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).send("Missing 'event' field");

  console.log("🧩 [API /emit] Event:", event);
  console.log("📦 Data:", data);

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

// ------------------------------------------------------
// 🚀 START SERVER
// ------------------------------------------------------
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Socket.IO server running on port ${PORT}`);
  console.log(`🌍 Allowed Origins:`, allowedOrigins);
});
