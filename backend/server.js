import express from "express";
import { userRoute } from "./routes/userRoutes.js";
import { documentRoute } from "./routes/documentRoutes.js";
import { commentRoute } from "./routes/commentRoutes.js";
import { connect } from "mongoose";
import { config } from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { DocumentModel } from "./models/documentModel.js";
import { socketAuth } from "./middleware/socketAuth.js";
import * as Y from "yjs";

config();

const app = express();

const allowedOrigins = [
  "https://google-docs-collab-editor.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

/* ---------------- MIDDLEWARES ---------------- */
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Safe preflight OPTIONS request interceptor for Express 5 compatibility
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

/* ---------------- ROUTES ---------------- */
app.use("/api/users", userRoute);
app.use("/api/documents", documentRoute);
app.use("/api/comments", commentRoute);

/* ---------------- DEFAULT ROUTE ---------------- */
app.get("/", (req, res) => {
  res.send(
    "<h1>Backend is running successfully!</h1><p>Connected to MongoDB: ✅</p>"
  );
});

/* ---------------- SOCKET plus  SERVER SETUP ---------------- */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/* ---------------- SOCKET AUTH ---------------- */
io.use(socketAuth);

/* ---------------- SOCKET PRESENCE TRACKING ---------------- */
const activeUsers = {}; // documentId -> { socketId: { userId, firstName, lastName, email } }

/* ---------------- SOCKET EVENTS ---------------- */
io.on("connection", (socket) => {
  console.log("User connected:", socket.id, socket.user.userId);

  /* ---------------- JOIN DOCUMENT ---------------- */
  socket.on("join-document", async (documentId) => {
    try {
      const document = await DocumentModel.findById(documentId);

      if (!document) {
        return socket.emit("error", "Document not found");
      }

      const userId = socket.user.userId;

      const isOwner = document.owner.toString() === userId;

      const isCollaborator = document.collaborators.some(
        (c) => c.user.toString() === userId
      );

      if (!isOwner && !isCollaborator) {
        return socket.emit("error", "Access denied");
      }

      socket.join(documentId);
      
      // Track user details for presence
      if (!activeUsers[documentId]) {
        activeUsers[documentId] = {};
      }
      activeUsers[documentId][socket.id] = {
        userId: socket.user.userId,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName,
        email: socket.user.email,
        socketId: socket.id,
      };

      // Broadcast list of active users to the document room
      io.to(documentId).emit("presence-update", Object.values(activeUsers[documentId]));

      console.log(`User ${userId} joined document: ${documentId}`);
    } catch (err) {
      console.error("Join-document error:", err.message);
      socket.emit("error", "Server error while joining document");
    }
  });

  /* ---------------- REAL-TIME SYNC ---------------- */
  socket.on("send-changes", (data) => {
    socket.to(data.documentId).emit("receive-changes", data.content);
  });

  socket.on("new-comment", ({ documentId, comment }) => {
    socket.to(documentId).emit("receive-comment", comment);
  });

  socket.on("title-update", ({ documentId, title }) => {
    socket.to(documentId).emit("title-updated", title);
  });

  socket.on("typing-start", ({ documentId }) => {
    socket.to(documentId).emit("user-typing", {
      userId: socket.user.userId,
      name: `${socket.user.firstName} ${socket.user.lastName}`,
      typing: true,
    });
  });

  socket.on("typing-stop", ({ documentId }) => {
    socket.to(documentId).emit("user-typing", {
      userId: socket.user.userId,
      name: `${socket.user.firstName} ${socket.user.lastName}`,
      typing: false,
    });
  });

  socket.on("cursor-move", ({ documentId, range }) => {
    socket.to(documentId).emit("cursor-moved", {
      userId: socket.user.userId,
      name: `${socket.user.firstName} ${socket.user.lastName}`,
      range,
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    
    // Scan activeUsers to remove this socket and update other clients
    for (const documentId in activeUsers) {
      if (activeUsers[documentId][socket.id]) {
        delete activeUsers[documentId][socket.id];
        
        // Broadcast updated presence list
        io.to(documentId).emit("presence-update", Object.values(activeUsers[documentId]));
        
        // Clean up empty document room tracking
        if (Object.keys(activeUsers[documentId]).length === 0) {
          delete activeUsers[documentId];
        }
      }
    }
  });
});

/* ---------------- DATABASE + SERVER START ---------------- */
const connectDb = async () => {
  try {
    await connect(
      process.env.DB_URL ||
        "mongodb://127.0.0.1:27017/collaborative-document-editor"
    );

    console.log("Connected to Database");

    server.listen(process.env.PORT || 5000, () =>
      console.log("Server Started on port 5000")
    );
  } catch (err) {
    console.log("Error in Database Connection", err);
  }
};

connectDb();

/* ---------------- ERROR HANDLING ---------------- */
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.log("Error name:", err.name);
  console.log("Error code:", err.code);
  console.log("Full error:", err);

  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: "error occurred",
      error: err.message,
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      message: "error occurred",
      error: err.message,
    });
  }

  const errCode =
    err.code ?? err.cause?.code ?? err.errorResponse?.code;

  const keyValue =
    err.keyValue ?? err.cause?.keyValue ?? err.errorResponse?.keyValue;

  if (errCode === 11000) {
    const field = Object.keys(keyValue)[0];
    const value = keyValue[field];

    return res.status(409).json({
      message: "error occurred",
      error: `${field} "${value}" already exists`,
    });
  }

  if (err.status) {
    return res.status(err.status).json({
      message: "error occurred",
      error: err.message,
    });
  }

  res.status(500).json({
    message: "error occurred",
    error: "Server side error",
  });
});