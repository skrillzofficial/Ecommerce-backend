require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const fileUpload = require("express-fileupload");
const PORT = process.env.PORT || 4000;

// Routes and middleware
const authRouter = require("./routes/userRoute");
const superAdminRoutes = require("./routes/superAdminRoute");
const errorHandler = require("./middleware/errorHandler");

// EXPRESS SERVER
const app = express();

// MIDDLEWARE
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// CORS configuration
app.use(
  cors({
    origin: [
      "https://eventry-swart.vercel.app/",
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

//Public routes first, then protected routes
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

// DATABASE AND SERVER START
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      dbName: process.env.DB_NAME || "EventDB",
    });
    console.log("MongoDatabase connected successfully");

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
    });
  } catch (error) {
    console.error("Error connecting to the database", error);
    process.exit(1);
  }
};

// Handle shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await mongoose.connection.close();
  process.exit(0);
});

startServer();