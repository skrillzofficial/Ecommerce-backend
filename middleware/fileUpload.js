const path = require("path");
const fs = require("fs");
const ErrorResponse = require("../utils/errorResponse");

// Validate image files for events
const validateImages = (req, res, next) => {
  // Images are optional, so continue if no files or no images
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
    // Check if image object is valid
    if (!image || !image.name || !image.size) {
      errors.push(`Image ${index + 1}: Invalid file upload`);
      return;
    }

    // Check file size (10MB max)
    if (image.size > 10 * 1024 * 1024) {
      errors.push(`Image ${index + 1}: File size exceeds 10MB`);
    }

    // Check MIME type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(image.mimetype)) {
      errors.push(
        `Image ${index + 1}: Only JPEG, PNG, WebP, and GIF images are allowed`
      );
    }

    // Check file extension
    const ext = path.extname(image.name).toLowerCase();
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    if (!allowedExtensions.includes(ext)) {
      errors.push(
        `Image ${index + 1}: Invalid file extension. Use .jpg, .jpeg, .png, .webp, or .gif`
      );
    }

    // Additional security: Check if MIME type matches extension
    const expectedMimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', 
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    };

    if (expectedMimeTypes[ext] && expectedMimeTypes[ext] !== image.mimetype) {
      errors.push(`Image ${index + 1}: File extension doesn't match file type`);
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

  // Validate image object
  if (!image.name || !image.size) {
    return next(new ErrorResponse("Invalid profile picture upload", 400));
  }

  // Check file size (5MB max for profile pictures)
  if (image.size > 5 * 1024 * 1024) {
    return next(
      new ErrorResponse("Profile picture must be less than 5MB", 400)
    );
  }

  // Check MIME type
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowedTypes.includes(image.mimetype)) {
    return next(
      new ErrorResponse("Only JPEG, PNG, and WebP images are allowed for profile pictures", 400)
    );
  }

  // Check file extension
  const ext = path.extname(image.name).toLowerCase();
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  if (!allowedExtensions.includes(ext)) {
    return next(
      new ErrorResponse(
        "Invalid file extension for profile picture. Use .jpg, .jpeg, .png, or .webp",
        400
      )
    );
  }

  // Security: Check if MIME type matches extension
  const expectedMimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  };

  if (expectedMimeTypes[ext] && expectedMimeTypes[ext] !== image.mimetype) {
    return next(new ErrorResponse("Profile picture file extension doesn't match file type", 400));
  }

  next();
};

// Validate event banner image
const validateBannerImage = (req, res, next) => {
  if (!req.files || !req.files.bannerImage) {
    return next();
  }

  const image = req.files.bannerImage;

  // Validate image object
  if (!image.name || !image.size) {
    return next(new ErrorResponse("Invalid banner image upload", 400));
  }

  // Check file size (15MB max for banner images - they can be larger)
  if (image.size > 15 * 1024 * 1024) {
    return next(
      new ErrorResponse("Banner image must be less than 15MB", 400)
    );
  }

  // Check MIME type
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowedTypes.includes(image.mimetype)) {
    return next(
      new ErrorResponse("Only JPEG, PNG, and WebP images are allowed for banner images", 400)
    );
  }

  // Check file extension
  const ext = path.extname(image.name).toLowerCase();
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  if (!allowedExtensions.includes(ext)) {
    return next(
      new ErrorResponse(
        "Invalid file extension for banner image. Use .jpg, .jpeg, .png, or .webp",
        400
      )
    );
  }

  // Recommended dimensions check (optional but helpful)
  console.log(`Banner image uploaded: ${image.name} (${(image.size / 1024 / 1024).toFixed(2)}MB)`);

  next();
};

// Validate document uploads (for organizer verification, etc.)
const validateDocuments = (req, res, next) => {
  if (!req.files || !req.files.documents) {
    return next();
  }

  const documents = Array.isArray(req.files.documents)
    ? req.files.documents
    : [req.files.documents];

  const errors = [];

  // Check number of documents
  if (documents.length > 5) {
    return next(new ErrorResponse("Maximum 5 documents allowed", 400));
  }

  // Validate each document
  documents.forEach((doc, index) => {
    // Validate document object
    if (!doc || !doc.name || !doc.size) {
      errors.push(`Document ${index + 1}: Invalid file upload`);
      return;
    }

    // Check file size (25MB max for documents)
    if (doc.size > 25 * 1024 * 1024) {
      errors.push(`Document ${index + 1}: File size exceeds 25MB`);
    }

    // Check MIME type
    const allowedTypes = [
      "application/pdf",
      "image/jpeg", 
      "image/jpg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    
    if (!allowedTypes.includes(doc.mimetype)) {
      errors.push(
        `Document ${index + 1}: Only PDF, Word, JPEG, and PNG files are allowed`
      );
    }

    // Check file extension
    const ext = path.extname(doc.name).toLowerCase();
    const allowedExtensions = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
    if (!allowedExtensions.includes(ext)) {
      errors.push(
        `Document ${index + 1}: Invalid file extension. Use .pdf, .doc, .docx, .jpg, .jpeg, or .png`
      );
    }
  });

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Clean up temp files on error
const cleanupTempFiles = (err, req, res, next) => {
  if (req.files) {
    const deleteFile = (file) => {
      if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
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

// Optional: Add file size logging for debugging (remove in production)
const logFileUploads = (req, res, next) => {
  if (req.files) {
    Object.keys(req.files).forEach((key) => {
      const files = Array.isArray(req.files[key])
        ? req.files[key]
        : [req.files[key]];
      
      files.forEach((file, index) => {
        console.log(`Uploaded ${key}[${index}]: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      });
    });
  }
  next();
};

module.exports = {
  validateImages,
  validateProfilePicture,
  validateBannerImage,
  validateDocuments,
  cleanupTempFiles,
  logFileUploads
};