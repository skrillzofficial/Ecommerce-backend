require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");
const cloudinary = require("cloudinary").v2;
const fileUpload = require("express-fileupload");

const PORT = process.env.PORT || 4000;

// Routes and middleware
const authRouter = require("./routes/userRoute");
const superAdminRoutes = require("./routes/superAdminRoute");
const errorHandler = require("./middleware/errorHandler");

// Import cleanup function
const { deleteExpiredUnverifiedUsers } = require("./controllers/user.controller");

// EXPRESS SERVER
const app = express();

// MIDDLEWARE - Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// CORS configuration
app.use(
  cors({
    origin: [
      "https://eventry-swart.vercel.app",
      "http://localhost:5174",
      "http://localhost:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  fileUpload({
    useTempFiles: true,
    limits: { fileSize: 10 * 1024 * 1024 },
  })
);

// ============================================
// SCHEDULE DAILY CLEANUP
// ============================================
// Runs every day at 2:00 AM
cron.schedule("0 2 * * *", async () => {
  console.log("🔄 Running scheduled cleanup of unverified users...");
  await deleteExpiredUnverifiedUsers();
});

// Optional: Run cleanup once on server startup (after DB connection)
let cleanupOnStartup = true;

// Public routes first, then protected routes
app.use("/api/v1/", authRouter);
app.use("/api/v1/", superAdminRoutes);

// Test routes
app.get("/", (req, res) => {
  res.send("Server is running. Use Postman to test endpoints.");
});

app.get("/api/v1/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is working!",
    environment: process.env.NODE_ENV || "development",
  });
});

// Health check endpoint
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Error handler middleware
app.use(errorHandler);

// ============================================
// DATABASE AND SERVER START
// ============================================
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      dbName: process.env.DB_NAME || "EventDB",
    });
    console.log("✅ MongoDatabase connected successfully");

    // Run cleanup once on startup after DB is connected
    if (cleanupOnStartup) {
      console.log("🧹 Running initial cleanup on server startup...");
      await deleteExpiredUnverifiedUsers();
      cleanupOnStartup = false;
    }

    app.listen(PORT, () => {
      console.log(`✅ Server is running on port ${PORT}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log(`📅 Cleanup scheduled for daily at 2:00 AM`);
    });
  } catch (error) {
    console.error("❌ Error connecting to the database:", error);
    process.exit(1);
  }
};

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on("SIGINT", async () => {
  console.log("\n⏹️  Shutting down gracefully...");
  try {
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  console.log("\n⏹️  Server termination signal received...");
  try {
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
});

startServer();