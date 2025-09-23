const router = require("express").Router();
const {
  handleRegister,
  handleLogin,
  getAllUsers,
  getCurrentUser,
  deleteUser,
  HandleUpdateUser,
} = require("../controllers/user.controller");
const { protect } = require("../middleware/auth");
const {
  authorizeAdmin,
  authorizeUserOrAdmin,
} = require("../middleware/adminAuth");

// Public routes
router.post("/register", handleRegister);
router.post("/login", handleLogin);

// Protected routes
router.get("/me", protect, getCurrentUser);

// User can update their own profile, admin can update any profile
router.patch("/:id", protect, authorizeUserOrAdmin, HandleUpdateUser);

// Admin-only routes
router.get("/", protect, authorizeAdmin, getAllUsers);
router.get("/:id", protect, authorizeAdmin);
router.delete("/:id", protect, authorizeAdmin, deleteUser);

module.exports = router;
