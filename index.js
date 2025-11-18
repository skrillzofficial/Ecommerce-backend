require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");
const cloudinary = require("cloudinary").v2;
const fileUpload = require("express-fileupload");
const cookieParser = require("cookie-parser");
const PORT = process.env.PORT || 4000;
const helmet = require("helmet");
const morgan = require("morgan");
const http = require("http");
const { Server } = require("socket.io");

// Routes
const authRouter = require("./routes/userRoute");
const superAdminRoutes = require("./routes/superAdminRoute");
const eventRoutes = require("./routes/eventRoute");
const transactionRoutes = require("./routes/transactionRoutes");
const notificationRoutes = require("./routes/notificationRoute");
const ticketRoutes = require("./routes/ticketRoute");
const bookingRoutes = require("./routes/bookingRoute");
const whatsappRoutes = require("./routes/whatsappRoute");

// Middleware
const errorHandler = require("./middleware/errorHandler");
const { sanitizeInput } = require("./middleware/validation");
const { cleanupTempFiles } = require("./middleware/fileUpload");

// Import cleanup function
const {
  deleteExpiredUnverifiedUsers,
} = require("./controllers/user.controller");

// EXPRESS SERVER
const app = express();

// CREATE HTTP SERVER
const server = http.createServer(app);

// ✅ SOCKET.IO SETUP
const io = new Server(server, {
  cors: {
    origin: [
      "https://www.joineventry.com",
      "https://joineventry.com",
      "https://eventry-swart.vercel.app",
      "http://localhost:5174",
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Make io accessible globally for controllers
global.io = io;

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-user", (userId) => {
    socket.join(`user-${userId}`);
  });

  socket.on("join-organizer", (organizerId) => {
    socket.join(`organizer-${organizerId}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// SECURITY MIDDLEWARE
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: [
      "https://www.joineventry.com",
      "https://joineventry.com",
      "https://eventry-swart.vercel.app",
      "http://localhost:5174",
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// CLOUDINARY CONFIGURATION
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cookie parser
app.use(cookieParser());

// FILE UPLOAD MIDDLEWARE
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
  })
);

// BODY PARSER MIDDLEWARE
app.use(
  "/api/v1/transactions/webhook",
  express.raw({ type: "application/json" })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// INPUT SANITIZATION
app.use(sanitizeInput);

// LOGGING MIDDLEWARE
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// SCHEDULED TASKS
cron.schedule("0 2 * * *", async () => {
  console.log("Running scheduled cleanup of unverified users...");
  try {
    await deleteExpiredUnverifiedUsers();
  } catch (error) {
    console.error("Cleanup error:", error);
  }
});

let cleanupOnStartup = true;

// API ROUTES
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/v1/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is working!",
  });
});

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Eventry API Server",
    version: "1.0.0",
  });
});

// Main API routes
app.use("/api/v1", authRouter);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/transactions", transactionRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/tickets", ticketRoutes);
app.use("/api/v1/bookings", bookingRoutes);
app.use("/api/v1/admin", superAdminRoutes);
app.use("/api/v1/whatsapp", whatsappRoutes);

// ERROR HANDLING
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

app.use(cleanupTempFiles);
app.use(errorHandler);

// DATABASE CONNECTION & SERVER START
const startServer = async () => {
  try {
    const requiredEnvVars = [
      "MONGODB_URL",
      "JWT_SECRET",
      "PAYSTACK_SECRET_KEY",
      "PAYSTACK_PUBLIC_KEY",
    ];

    const missingEnvVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );

    if (missingEnvVars.length > 0) {
      console.warn(
        `Warning: Missing environment variables: ${missingEnvVars.join(", ")}`
      );
    }

    await mongoose.connect(process.env.MONGODB_URL, {
      dbName: process.env.DB_NAME || "EventDB",
    });
    console.log("MongoDB connected successfully");

    if (cleanupOnStartup) {
      await deleteExpiredUnverifiedUsers();
      cleanupOnStartup = false;
    }

    server.listen(PORT, () => {
      console.log(`
 Eventry API Server Started
 Port: ${PORT}
 Environment: ${process.env.NODE_ENV || "production"}
 Database: ${process.env.DB_NAME || "EventDB"}
 Socket.IO: Enabled
 WhatsApp: ${process.env.TWILIO_ACCOUNT_SID ? "Enabled" : "Not configured"}
      `);
    });
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
};

// GRACEFUL SHUTDOWN
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  try {
    if (global.io) {
      global.io.close();
    }
    server.close(() => {
      mongoose.connection.close();
      console.log("Server shut down successfully");
      process.exit(0);
    });
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  console.log("Server termination signal received...");
  try {
    if (global.io) {
      global.io.close();
    }
    server.close(() => {
      mongoose.connection.close();
      console.log("Server terminated successfully");
      process.exit(0);
    });
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
});

process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION! Shutting down...");
  console.error(error.name, error.message);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("UNHANDLED REJECTION! Shutting down...");
  console.error(error);
  mongoose.connection.close().then(() => {
    process.exit(1);
  });
});

// Start the server
startServer();

module.exports = app;
