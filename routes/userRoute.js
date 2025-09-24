const router = require("express").Router();
const { OAuth2Client } = require("google-auth-library");
const { protect } = require("../middleware/auth");
const {
  authorizeAdmin,
  authorizeUserOrAdmin,
} = require("../middleware/adminAuth");
const {
  handleRegister,
  handleLogin,
  handleGoogleLogin,
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
  closeAccount,
} = require("../controllers/user.controller");

// Google OAuth Client
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.BACKEND_URL}/api/v1/auth/google/callback`
);

//  GOOGLE OAUTH ROUTES
// Initiate Google OAuth
router.get("/auth/google", (req, res) => {
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["profile", "email"],
    prompt: "consent",
    state: req.query.redirect || "/",
  });
  console.log("Redirecting to Google OAuth:", url);
  res.redirect(url);
});

// Google OAuth callback
router.get("/auth/google/callback", async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    // Check for OAuth errors from Google
    if (error) {
      console.error("Google OAuth error:", error);
      return res.redirect(
        `${process.env.FRONTEND_URL}/login?error=oauth_denied`
      );
    }

    if (!code) {
      console.error("No authorization code received from Google");
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
    }

    console.log("Received Google OAuth code, exchanging for tokens...");

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    console.log("Tokens received from Google");

    if (!tokens.id_token) {
      throw new Error("No ID token received from Google");
    }

    // Create a mock request object for the controller
    const mockReq = {
      body: { token: tokens.id_token },
    };

    // Create a custom response handler that redirects to frontend
    const mockRes = {
      status: (statusCode) => ({
        json: (data) => {
          if (statusCode === 200 && data.success) {
            // Successful login - redirect to frontend with token
            const redirectUrl = `${
              process.env.FRONTEND_URL
            }/auth/success?token=${encodeURIComponent(
              data.token
            )}&onboarding=${!data.user.onboardingCompleted}`;
            console.log(
              "Google OAuth successful, redirecting to:",
              redirectUrl
            );
            res.redirect(redirectUrl);
          } else {
            // Login failed - redirect to frontend with error
            const errorMessage = data.message || "authentication_failed";
            const redirectUrl = `${
              process.env.FRONTEND_URL
            }/login?error=${encodeURIComponent(errorMessage)}`;
            console.log("Google OAuth failed, redirecting to:", redirectUrl);
            res.redirect(redirectUrl);
          }
        },
      }),
    };

    // Call the existing handleGoogleLogin controller
    await handleGoogleLogin(mockReq, mockRes, next);
  } catch (error) {
    console.error("Google OAuth callback error:", error);

    // Determine appropriate error message
    let errorMessage = "auth_failed";
    if (error.message.includes("invalid_grant")) {
      errorMessage = "invalid_grant";
    } else if (error.message.includes("token")) {
      errorMessage = "invalid_token";
    }

    res.redirect(`${process.env.FRONTEND_URL}/login?error=${errorMessage}`);
  }
});

// Public routes
router.post("/register", handleRegister);
router.post("/login", handleLogin);
router.post("/google-login", handleGoogleLogin);

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

// Admin routes
router.get("/", protect, authorizeAdmin, getAllUsers);
router.get("/:id", protect, authorizeAdmin, getUserById);
router.patch("/:id", protect, authorizeUserOrAdmin, handleUpdateUser);
router.delete("/:id", protect, authorizeAdmin, deleteUser);

module.exports = router;
