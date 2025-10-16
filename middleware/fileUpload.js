const path = require("path");
const fs = require("fs");
const ErrorResponse = require("../utils/errorResponse");

// Validate image files
const validateImages = (req, res, next) => {
  if (!req.files || !req.files.images) {
    return next();
  }

  const images = Array.isArray(req.files.images)
    ? req.files.images
    : [req.files.images];

  const errors = [];

  // Check number of images
  if (images.length > 3) {
    return next(new ErrorResponse("Maximum 3 images allowed", 400));
  }

  // Validate each image
  images.forEach((image, index) => {
    // Check file size (10MB max)
    if (image.size > 10 * 1024 * 1024) {
      errors.push(`Image ${index + 1}: File size exceeds 10MB`);
    }

    // Check MIME type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(image.mimetype)) {
      errors.push(
        `Image ${index + 1}: Only JPEG, PNG, and WebP images are allowed`
      );
    }

    // Check file extension
    const ext = path.extname(image.name).toLowerCase();
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    if (!allowedExtensions.includes(ext)) {
      errors.push(
        `Image ${index + 1}: Invalid file extension. Use .jpg, .jpeg, .png, or .webp`
      );
    }
  });

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate profile picture
const validateProfilePicture = (req, res, next) => {
  if (!req.files || !req.files.profilePicture) {
    return next();
  }

  const image = req.files.profilePicture;

  // Check file size (5MB max for profile pictures)
  if (image.size > 5 * 1024 * 1024) {
    return next(new ErrorResponse("Profile picture must be less than 5MB", 400));
  }

  // Check MIME type
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowedTypes.includes(image.mimetype)) {
    return next(
      new ErrorResponse("Only JPEG, PNG, and WebP images are allowed", 400)
    );
  }

  // Check file extension
  const ext = path.extname(image.name).toLowerCase();
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  if (!allowedExtensions.includes(ext)) {
    return next(
      new ErrorResponse(
        "Invalid file extension. Use .jpg, .jpeg, .png, or .webp",
        400
      )
    );
  }

  next();
};

// Clean up temp files on error
const cleanupTempFiles = (err, req, res, next) => {
  if (req.files) {
    const deleteFile = (file) => {
      if (file.tempFilePath) {
        fs.unlink(file.tempFilePath, (unlinkErr) => {
          if (unlinkErr) {
            console.error("Failed to delete temp file:", unlinkErr);
          }
        });
      }
    };

    // Delete all uploaded files
    Object.keys(req.files).forEach((key) => {
      const files = Array.isArray(req.files[key])
        ? req.files[key]
        : [req.files[key]];
      files.forEach(deleteFile);
    });
  }

  next(err);
};

module.exports = {
  validateImages,
  validateProfilePicture,
  cleanupTempFiles
};