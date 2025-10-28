const express = require("express");
const {
  getAllUsers,
  updateUserRole,
  suspendUser,
  deleteUser,
  updateUserStatus,
  getPlatformStats,
} = require("../controllers/superAdmin.controller");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// ============================================
// ALL ROUTES PROTECTED & SUPERADMIN ONLY
// ============================================

// Apply protection and authorization to ALL routes
router.use(protect);
router.use(authorize("superadmin"));

// ============================================
// USER MANAGEMENT ROUTES (SUPERADMIN ONLY)
// ============================================

// @desc    Get all users with pagination and filtering
// @route   GET /api/v1/admin/users
// @access  Private/Superadmin only
router.get("/users", getAllUsers);

// @desc    Update user role (Superadmin only)
// @route   PATCH /api/v1/admin/users/:id/role
// @access  Private/Superadmin only
router.patch("/users/:id/role", updateUserRole);

// @desc    Update user active/inactive status (Superadmin only)
// @route   PATCH /api/v1/admin/users/:id/status
// @access  Private/Superadmin only
router.patch("/users/:id/status", updateUserStatus);

// @desc    Suspend user temporarily (Superadmin only)
// @route   PATCH /api/v1/admin/users/:id/suspend
// @access  Private/Superadmin only
router.patch("/users/:id/suspend", suspendUser);

// @desc    Permanently delete user account (Superadmin only)
// @route   DELETE /api/v1/admin/users/:id
// @access  Private/Superadmin only
router.delete("/users/:id", deleteUser);

// ============================================
// PLATFORM MANAGEMENT ROUTES (SUPERADMIN ONLY)
// ============================================

// @desc    Get platform statistics and analytics
// @route   GET /api/v1/admin/stats
// @access  Private/Superadmin only
router.get("/stats", getPlatformStats);

module.exports = router;