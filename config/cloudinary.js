const cloudinary = require('cloudinary').v2;

// Use the same configuration as in your index.js
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Simple upload function using Cloudinary's uploader
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: 'eventry',
      resource_type: 'auto',
      ...options
    };

    cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    }).end(buffer);
  });
};

// Upload user photo specifically
const uploadUserPhoto = async (buffer, userId, filename = 'user-photo') => {
  return uploadToCloudinary(buffer, {
    folder: `eventry/users/${userId}`,
    public_id: `${filename}-${Date.now()}`,
    transformation: [
      { width: 300, height: 300, crop: 'fill', gravity: 'face' },
      { quality: 'auto' },
      { format: 'jpg' }
    ]
  });
};

// Upload banner specifically
const uploadBanner = async (buffer, userId, filename = 'banner') => {
  return uploadToCloudinary(buffer, {
    folder: `eventry/banners/${userId}`,
    public_id: `${filename}-${Date.now()}`,
    transformation: [
      { width: 1200, height: 630, crop: 'fill' },
      { quality: 'auto' },
      { format: 'jpg' }
    ]
  });
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  uploadUserPhoto,
  uploadBanner
};