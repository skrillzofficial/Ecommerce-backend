// routes/userRoutes.js
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { authorizeAdmin, authorizeUserOrAdmin } = require("../middleware/adminAuth");
const {
  handleRegister,
  handleLogin,
  handleUpdateUser,
  getAllUsers,
  getCurrentUser,
  getUserById,
  deleteUser,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getLinkedAccounts,
  linkAccount,
  unlinkAccount,
  getCommunicationPrefs,
  updateCommunicationPrefs,
  closeAccount
} = require("../controllers/user.controller");

// Public routes
router.post("/register", handleRegister);
router.post("/login", handleLogin);

// Protected routes
router.get("/profile", protect, getCurrentUser);
router.patch("/profile", protect, handleUpdateUser);


// Payment methods
router.get("/payment-methods", protect, getPaymentMethods);
router.post("/payment-methods", protect, addPaymentMethod);
router.put("/payment-methods/:id", protect, updatePaymentMethod);
router.delete("/payment-methods/:id", protect, deletePaymentMethod);

// Linked accounts
router.get("/linked-accounts", protect, getLinkedAccounts);
router.post("/linked-accounts", protect, linkAccount);
router.delete("/linked-accounts/:provider", protect, unlinkAccount);

// Communication preferences
router.get("/communication-preferences", protect, getCommunicationPrefs);
router.patch("/communication-preferences", protect, updateCommunicationPrefs);

// Account management
router.delete("/account", protect, closeAccount);

// Admin routes (keep these separate)
router.get("/", protect, authorizeAdmin, getAllUsers);
router.get("/:id", protect, authorizeAdmin, getUserById);
router.patch("/:id", protect, authorizeUserOrAdmin, handleUpdateUser);
router.delete("/:id", protect, authorizeAdmin, deleteUser);

module.exports = router;