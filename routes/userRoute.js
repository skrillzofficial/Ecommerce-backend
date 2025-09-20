const router = require("express").Router();
const {
  handleRegister,
  handleLogin,
  getAllUsers,
  deleteUser,
  HandleUpdateUser,
} = require("../controllers/user.controller");
const { protect, authenticate } = require("../middleware/auth");
const { authorizeAdmin } = require("../middleware/adminAuth");

// Public routes
router.post("/register", handleRegister);
router.post("/login", handleLogin);
router.patch('/user/:id', authenticate, HandleUpdateUser);

// Admin-protected routes
router.get("/user", protect, authorizeAdmin, getAllUsers);
// Admin-protected routes that involves use of Id
router.delete("/user/:id", protect, authorizeAdmin, deleteUser);

module.exports = router;
