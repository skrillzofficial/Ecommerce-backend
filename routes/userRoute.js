const express = require("express");
const {
  handleRegister,
  handleLogin,
  handleGoogleAuth,
  verifyEmail,
  resendVerificationEmail,
  getCurrentUser,
  updateProfile,
  forgotPassword,
  resetPassword,
  changePassword,
  updatePreferences,
  logout,
  checkUsernameAvailability,
  checkEmailAvailability,
  deleteAccount,
  getUserProfile,
} = require("../controllers/user.controller");
const { validateProfilePicture, cleanupTempFiles } = require("../middleware/fileUpload");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.post("/register", handleRegister);
router.post("/login", handleLogin);
router.post("/auth/google", handleGoogleAuth);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationEmail);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/check-username", checkUsernameAvailability);
router.get("/check-email", checkEmailAvailability);
router.get("/profile/:userId", getUserProfile);

// Protected routes
router.get("/me", protect, getCurrentUser);
router.patch(
  "/profile",
  protect,
  validateProfilePicture, 
  updateProfile,
  cleanupTempFiles 
);
router.patch("/preferences", protect, updatePreferences);
router.patch("/change-password", protect, changePassword);
router.post("/logout", protect, logout);
router.delete("/account", protect, deleteAccount);

module.exports = router;
