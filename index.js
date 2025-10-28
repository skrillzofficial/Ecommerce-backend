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

// Routes
const authRouter = require("./routes/userRoute");
const superAdminRoutes = require("./routes/superAdminRoute");
const eventRoutes = require("./routes/eventRoute");
const transactionRoutes = require("./routes/transactionRoutes");
const notificationRoutes = require('./routes/notificationRoute'); 
const ticketRoutes = require("./routes/ticketRoute"); 
const bookingRoutes = require("./routes/bookingRoute"); // Added booking routes

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

// SECURITY MIDDLEWARE
app.use(helmet());

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
// IMPORTANT: For Paystack webhook, use raw body BEFORE json parser
app.use('/api/v1/transactions/webhook', express.raw({ type: 'application/json' }));

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
  console.log(" Running scheduled cleanup of unverified users...");
  try {
    await deleteExpiredUnverifiedUsers();
  } catch (error) {
    console.error("Cleanup error:", error);
  }
});

// Run cleanup once on server startup
let cleanupOnStartup = true;

// API ROUTES
// Health check endpoint 
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    environment: process.env.NODE_ENV || "development",
    paystack: {
      configured: !!process.env.PAYSTACK_SECRET_KEY,
      mode: process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test'
    }
  });
});

// Test route
app.get("/api/v1/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is working!",
    environment: process.env.NODE_ENV || "development",
  });
});

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Eventry API Server",
    version: "1.0.0",
    endpoints: {
      health: "/api/v1/health",
      auth: "/api/v1/",
      events: "/api/v1/events",
      transactions: "/api/v1/transactions", 
      tickets: "/api/v1/tickets",
      bookings: "/api/v1/bookings",
      admin: "/api/v1/admin",
      notifications: "/api/v1/notifications",
    },
  });
});

// Main API routes
app.use("/api/v1", authRouter); // Fixed: added /auth to match your auth routes
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/transactions", transactionRoutes); 
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/tickets", ticketRoutes);
app.use("/api/v1/bookings", bookingRoutes); // Added booking routes
app.use("/api/v1/admin", superAdminRoutes);

// ERROR HANDLING
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Cleanup temp files on error
app.use(cleanupTempFiles);

// Global error handler
app.use(errorHandler);

// DATABASE CONNECTION & SERVER START
const startServer = async () => {
  try {
    // Validate required environment variables
    const requiredEnvVars = [
      'MONGODB_URL',
      'JWT_SECRET',
      'PAYSTACK_SECRET_KEY',
      'PAYSTACK_PUBLIC_KEY'
    ];

    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingEnvVars.length > 0) {
      console.warn(`  Warning: Missing environment variables: ${missingEnvVars.join(', ')}`);
      if (missingEnvVars.includes('PAYSTACK_SECRET_KEY')) {
        console.warn('  Payment functionality will not work without Paystack credentials');
      }
    }

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URL, {
      dbName: process.env.DB_NAME || "EventDB",
    });
    console.log(" MongoDB connected successfully");
    console.log(` Database: ${process.env.DB_NAME || "EventDB"}`);

    // Run cleanup once on startup after DB is connected
    if (cleanupOnStartup) {
      console.log(" Running initial cleanup on server startup...");
      await deleteExpiredUnverifiedUsers();
      cleanupOnStartup = false;
    }

    // Start the HTTP server 
    server.listen(PORT, () => {
      console.log(" Eventry API Server Started Successfully");
      console.log(`Server URL: http://localhost:${PORT}`);
      console.log(` API Base: http://localhost:${PORT}/api/v1`);
      console.log(`Environment: ${process.env.NODE_ENV || "production"}`);
      console.log(`Frontend URL: ${process.env.FRONTEND_URL || "Not set"}`);
      console.log(` Paystack Mode: ${process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live') ? '🔴 LIVE' : '🟢 TEST'}`);
      console.log(`Cleanup scheduled: Daily at 2:00 AM`);
      console.log(" Server ready to accept connections");
      
      // Log all available routes
      console.log("\n Available Routes:");
      console.log(" - Auth: /api/v1/auth");
      console.log(" - Events: /api/v1/events");
      console.log(" - Transactions: /api/v1/transactions");
      console.log(" - Tickets: /api/v1/tickets");
      console.log(" - Bookings: /api/v1/bookings");
      console.log(" - Notifications: /api/v1/notifications");
      console.log(" - Admin: /api/v1/admin");
    });
  } catch (error) {
    console.error("Error connecting to the database:", error);
    process.exit(1);
  }
};

// GRACEFUL SHUTDOWN
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  try {
    // Close server first to stop accepting new connections
    server.close(() => {
      console.log(" HTTP server closed");
    });

    // Close database connection
    await mongoose.connection.close();
    console.log(" Database connection closed");
    console.log(" Server shut down successfully\n");
    process.exit(0);
  } catch (error) {
    console.error(" Error during shutdown:", error);
    process.exit(1);
  }
});

// Handle SIGTERM (server termination)
process.on("SIGTERM", async () => {
  console.log(" Server termination signal received...");
  try {
    server.close(() => {
      console.log(" HTTP server closed");
    });

    await mongoose.connection.close();
    console.log(" Database connection closed");
    console.log(" Server terminated successfully\n");
    process.exit(0);
  } catch (error) {
    console.error(" Error during shutdown:", error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION! Shutting down...");
  console.error("Error Name:", error.name);
  console.error("Error Message:", error.message);
  console.error("Stack Trace:", error.stack);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error(" UNHANDLED REJECTION! Shutting down...");
  console.error("Error:", error);
  
  mongoose.connection.close().then(() => {
    console.log(" Database connection closed");
    process.exit(1);
  });
});

// Start the server
startServer();

module.exports = app;