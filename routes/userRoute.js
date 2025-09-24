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

// Google OAuth Client - FIXED INITIALIZATION
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verify configuration on startup
console.log('🔐 Google OAuth Configuration Check:', {
  clientId: process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing',
  frontendUrl: process.env.FRONTEND_URL ? '✅ Set' : '❌ Missing',
  backendUrl: process.env.BACKEND_URL ? '✅ Set' : '❌ Missing'
});

// GOOGLE OAUTH ROUTES
// Initiate Google OAuth
router.get("/auth/google", (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error('Google Client ID not configured');
    }

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["profile", "email", "openid"],
      prompt: "consent",
      state: req.query.redirect || "/",
      include_granted_scopes: true
    });
    
    console.log("🔗 Redirecting to Google OAuth");
    res.redirect(url);
  } catch (error) {
    console.error("❌ Error generating auth URL:", error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=config_error`);
  }
});

// Google OAuth callback - SIMPLIFIED AND FIXED
router.get("/auth/google/callback", async (req, res) => {
  try {
    console.log('🔄 Google OAuth callback received');
    const { code, error } = req.query;

    if (error) {
      console.error("❌ Google OAuth error:", error);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_denied`);
    }

    if (!code) {
      console.error("❌ No authorization code received");
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
    }

    console.log("🔄 Exchanging code for tokens...");

    // Exchange code for tokens
    const { tokens } = await client.getToken({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/v1/auth/google/callback`
    });
    
    console.log("✅ Tokens received:", {
      hasIdToken: !!tokens.id_token,
      idTokenLength: tokens.id_token?.length
    });

    if (!tokens.id_token) {
      throw new Error("No ID token received from Google");
    }

    // Create a proper mock request
    const mockReq = {
      body: { token: tokens.id_token },
      headers: {}
    };

    // Create a proper mock response that handles the redirect
    let responseSent = false;
    
    const mockRes = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: (data) => {
        if (responseSent) return;
        responseSent = true;
        
        console.log('📨 Controller response:', { statusCode: mockRes.statusCode, success: data.success });
        
        if (mockRes.statusCode === 200 && data.success) {
          // Successful login
          const redirectUrl = `${process.env.FRONTEND_URL}/auth/success?token=${encodeURIComponent(data.token)}&onboarding=${!data.user.onboardingCompleted}`;
          console.log("✅ Login successful, redirecting to:", redirectUrl);
          res.redirect(redirectUrl);
        } else {
          // Login failed
          const errorMessage = data.message || "authentication_failed";
          const redirectUrl = `${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(errorMessage)}`;
          console.log("❌ Login failed, redirecting to:", redirectUrl);
          res.redirect(redirectUrl);
        }
      }
    };

    // Add error handling to the mock response
    mockRes.status = mockRes.status.bind(mockRes);

    // Call the controller
    console.log('🔄 Calling handleGoogleLogin controller...');
    await handleGoogleLogin(mockReq, mockRes, (err) => {
      if (err && !responseSent) {
        responseSent = true;
        console.error('❌ Controller error:', err);
        res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
      }
    });

    // If no response was sent within a timeout, send an error
    setTimeout(() => {
      if (!responseSent) {
        responseSent = true;
        console.error('⏰ Controller timeout - no response sent');
        res.redirect(`${process.env.FRONTEND_URL}/login?error=timeout`);
      }
    }, 10000);

  } catch (error) {
    console.error("❌ Google OAuth callback error:", error);
    
    let errorMessage = "auth_failed";
    if (error.message.includes("invalid_grant")) errorMessage = "invalid_grant";
    else if (error.message.includes("token")) errorMessage = "invalid_token";
    else if (error.message.includes("client_id")) errorMessage = "invalid_client";
    
    res.redirect(`${process.env.FRONTEND_URL}/login?error=${errorMessage}`);
  }
});

// TEST ROUTE - Add this to debug
router.get("/auth/google/test", async (req, res) => {
  try {
    // Test the Google client configuration
    const testPayload = {
      clientId: process.env.GOOGLE_CLIENT_ID ? '✅ Configured' : '❌ Missing',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ? '✅ Configured' : '❌ Missing',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'Using default',
      frontendUrl: process.env.FRONTEND_URL || '❌ Missing'
    };
    
    res.json({
      success: true,
      message: 'Google OAuth Test',
      config: testPayload,
      endpoints: {
        initiate: '/api/v1/auth/google',
        callback: '/api/v1/auth/google/callback'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
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