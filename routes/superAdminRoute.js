const express = require("express");
const {
  createSuperadmin,
  getAllUsers,
  updateUserRole,
  suspendUser,
  deleteUser,
  updateUserStatus,
  getPlatformStats,
} = require("../controllers/superAdmin.controller");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// All routes are protected and require superadmin role
router.use(protect);
router.use(authorize("superadmin"));

// Admin routes
router.post("/users/register", createSuperadmin);
router.get("/users", getAllUsers);
router.get("/stats", getPlatformStats);
router.patch("/users/:id/role", updateUserRole);
router.patch("/users/:id/status", updateUserStatus);
router.delete("/users/:id/delete", deleteUser);
router.patch("/users/:id/suspend", suspendUser);

module.exports = router;
