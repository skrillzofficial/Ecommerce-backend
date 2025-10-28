const ErrorResponse = require("../utils/errorResponse");

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details (more structured logging)
  console.log("=== ERROR HANDLER ===");
  console.log("Error Name:", err.name);
  console.log("Error Code:", err.code);
  console.log("Error Message:", err.message);
  console.log("Stack:", err.stack);
  console.log("URL:", req.originalUrl);
  console.log("Method:", req.method);
  console.log("IP:", req.ip);

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    const message = "Resource not found";
    error = new ErrorResponse(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    
    let message = `${field} '${value}' already exists. Please use a different ${field}.`;
    
    // More user-friendly messages for common fields
    if (field === 'email') {
      message = "An account with this email already exists. Please use a different email address.";
    } else if (field === 'userName') {
      message = "This username is already taken. Please choose a different username.";
    } else if (field === 'phone') {
      message = "This phone number is already registered. Please use a different phone number.";
    }
    
    error = new ErrorResponse(message, 400);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    error = new ErrorResponse(message, 400);
  }

  // Mongoose timeout error
  if (err.name === "MongoTimeoutError" || err.code === 50) {
    const message = "Database operation timed out. Please try again.";
    error = new ErrorResponse(message, 408);
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    const message = "Invalid authentication token";
    error = new ErrorResponse(message, 401);
  }

  if (err.name === "TokenExpiredError") {
    const message = "Authentication token has expired";
    error = new ErrorResponse(message, 401);
  }

  // File upload errors
  if (err.code === "LIMIT_FILE_SIZE") {
    const message = "File size too large. Please upload a smaller file.";
    error = new ErrorResponse(message, 413);
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    const message = "Unexpected file field. Please check your file upload.";
    error = new ErrorResponse(message, 400);
  }

  // Rate limiting errors
  if (err.statusCode === 429) {
    const message = "Too many requests. Please try again later.";
    error = new ErrorResponse(message, 429);
  }

  // Network/timeout errors
  if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
    const message = "Service temporarily unavailable. Please try again later.";
    error = new ErrorResponse(message, 503);
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    message: error.message || "Internal Server Error",
    statusCode: error.statusCode || 500,
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === "development") {
    errorResponse.stack = err.stack;
    errorResponse.details = {
      name: err.name,
      code: err.code,
      path: err.path,
      value: err.value
    };
  }

  // Add request ID for tracking (if you have request ID middleware)
  if (req.requestId) {
    errorResponse.requestId = req.requestId;
  }

  // Log the final error response (for monitoring)
  console.log("Final Error Response:", {
    statusCode: errorResponse.statusCode,
    message: errorResponse.message,
    url: req.originalUrl,
    method: req.method
  });

  res.status(errorResponse.statusCode).json(errorResponse);
};

module.exports = errorHandler;