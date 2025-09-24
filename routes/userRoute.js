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

// Google OAuth Client - PROPERLY CONFIGURED
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI 
);

const verifyClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verify configuration on startup
console.log("🔐 Google OAuth Configuration:", {
  clientId: process.env.GOOGLE_CLIENT_ID ? "✅ Set" : "❌ Missing",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ? "✅ Set" : "❌ Missing",
  redirectUri: process.env.GOOGLE_REDIRECT_URI ? "✅ Set" : "❌ Missing",
  frontendUrl: process.env.FRONTEND_URL ? "✅ Set" : "❌ Missing",
});

// GOOGLE OAUTH ROUTES
// Initiate Google OAuth - FIXED VERSION
router.get("/auth/google", (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) {
      throw new Error("Google OAuth not properly configured");
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    console.log("🔗 Using redirect URI:", redirectUri);

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["profile", "email", "openid"],
      prompt: "consent",
      state: req.query.redirect || "/",
      redirect_uri: redirectUri,
      include_granted_scopes: true,
    });

    console.log("🔗 Generated Google OAuth URL");
    res.redirect(url);
  } catch (error) {
    console.error("❌ Error generating auth URL:", error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=config_error`);
  }
});

// Google OAuth callback - ENHANCED DEBUG VERSION
router.get("/auth/google/callback", async (req, res) => {
  try {
    console.log("=== GOOGLE OAUTH CALLBACK START ===");
    const { code, error } = req.query;

    if (error) {
      console.error("❌ Google OAuth error:", error);
      return res.redirect(
        `${process.env.FRONTEND_URL}/login?error=oauth_denied`
      );
    }

    if (!code) {
      console.error("❌ No authorization code received");
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
    }

    console.log("🔄 Exchanging code for tokens...");

    // Exchange code for tokens
    const { tokens } = await client.getToken({
      code: code,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    });

    console.log("✅ Tokens received:", {
      hasIdToken: !!tokens.id_token,
      idTokenPreview: tokens.id_token
        ? tokens.id_token.substring(0, 50) + "..."
        : "none",
    });

    if (!tokens.id_token) {
      throw new Error("No ID token received from Google");
    }

    // TEST: Verify the token works before calling controller
    try {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      console.log("✅ Token verification successful:", {
        email: payload.email,
        name: payload.name,
      });
    } catch (verifyError) {
      console.error("❌ Token verification failed:", verifyError);
      throw verifyError;
    }

    // Create a SIMPLE mock response that definitely works
    const mockReq = {
      body: { token: tokens.id_token },
    };

    console.log("🔄 Calling handleGoogleLogin controller...");

    // Use a Promise to handle the controller call
    await new Promise((resolve, reject) => {
      let responseSent = false;
      let timeoutId;

      const mockRes = {
        status: function (code) {
          this.statusCode = code;
          return this;
        },
        json: (data) => {
          if (responseSent) return;
          responseSent = true;
          clearTimeout(timeoutId);

          console.log("📨 Controller responded with:", {
            statusCode: this.statusCode,
            success: data.success,
            hasToken: !!data.token,
            hasUser: !!data.user,
          });

          if (this.statusCode === 200 && data.success) {
            const redirectUrl = `${
              process.env.FRONTEND_URL
            }/auth/success?token=${encodeURIComponent(
              data.token
            )}&onboarding=${!data.user.onboardingCompleted}`;
            console.log("✅ Success - redirecting to frontend");
            res.redirect(redirectUrl);
          } else {
            const errorMessage = data.message || "authentication_failed";
            const redirectUrl = `${
              process.env.FRONTEND_URL
            }/login?error=${encodeURIComponent(errorMessage)}`;
            console.log("❌ Controller returned error");
            res.redirect(redirectUrl);
          }
          resolve();
        },
      };

      mockRes.status = mockRes.status.bind(mockRes);

      // Add error handling to mockRes
      mockRes.send = mockRes.json;
      mockRes.end = () => {};

      // Set timeout to prevent hanging
      timeoutId = setTimeout(() => {
        if (!responseSent) {
          responseSent = true;
          console.error("⏰ Controller timeout after 10 seconds");
          res.redirect(`${process.env.FRONTEND_URL}/login?error=timeout`);
          resolve();
        }
      }, 10000);

      // Call the controller
      handleGoogleLogin(mockReq, mockRes, (err) => {
        if (err && !responseSent) {
          responseSent = true;
          clearTimeout(timeoutId);
          console.error("❌ Controller middleware error:", err);
          res.redirect(
            `${process.env.FRONTEND_URL}/login?error=controller_error`
          );
          resolve();
        }
      });
    });

    console.log("=== GOOGLE OAUTH CALLBACK COMPLETE ===");
  } catch (error) {
    console.error("❌ Google OAuth callback error:", {
      message: error.message,
      stack: error.stack,
    });
    res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
  }
});
// TEST ROUTE - Check your configuration
router.get("/auth/google/debug", (req, res) => {
  const config = {
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
    frontendUrl: process.env.FRONTEND_URL,
    backendUrl: process.env.BACKEND_URL,
  };

  console.log("🔍 OAuth Debug Info:", config);

  res.json({
    success: true,
    config: config,
    required: {
      redirectUri: "Must match exactly in Google Cloud Console",
      clientId: "Must match exactly in Google Cloud Console",
    },
  });
});

// ... rest of your routes remain the same ...
router.post("/register", handleRegister);
router.post("/login", handleLogin);
router.post("/google-login", handleGoogleLogin);
// ... other routes ...
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
