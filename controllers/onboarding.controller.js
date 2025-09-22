const USER = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");

const completeOnboarding = async (req, res, next) => {
  try {
    // Check if req.body exists
    if (!req.body) {
      return res.status(400).json({
        success: false,
        error: "Request body is missing",
      });
    }

    const { answers } = req.body;

    // Check if answers exists
    if (!answers) {
      return res.status(400).json({
        success: false,
        error: "Answers are required in the request body",
      });
    }

    // Get user from request (assuming you have auth middleware)
    const userId = req.user._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
    }

    // FIX: Use USER (the imported variable) instead of User
    const user = await USER.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Update user with onboarding data
    user.onboardingCompleted = true;
    user.preferences = answers;
    user.onboardingCompletedAt = new Date();

    await user.save();

    res.status(200).json({
      success: true,
      message: "Onboarding completed successfully",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        onboardingCompleted: user.onboardingCompleted,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error("Onboarding completion error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to complete onboarding: " + error.message,
    });
  }
};

// Check onboarding status
const getOnboardingStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await USER.findById(userId).select("onboardingCompleted");

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "Onboarding status retrieved successfully",
      data: {
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error) {
    console.error("Onboarding status error:", error);
    next(new ErrorResponse("Failed to get onboarding status", 500));
  }
};

module.exports = {
  completeOnboarding,
  getOnboardingStatus,
};
