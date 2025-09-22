const USER = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");

// Complete onboarding 
const completeOnboarding = async (req, res, next) => {
  try {
    const { answers } = req.body;
    const userId = req.user.userId; 

    // Validate request body
    if (!answers || typeof answers !== 'object') {
      return next(new ErrorResponse("Onboarding answers are required", 400));
    }

    // Validate required fields 
    if (!answers.eventTypes || !Array.isArray(answers.eventTypes) || answers.eventTypes.length === 0) {
      return next(new ErrorResponse("Event types are required", 400));
    }

    if (!answers.interests || !Array.isArray(answers.interests) || answers.interests.length === 0) {
      return next(new ErrorResponse("Interests are required", 400));
    }

    // Validate other fields if provided
    if (answers.budgetRange) {
      if (typeof answers.budgetRange !== 'object' || 
          typeof answers.budgetRange.min !== 'number' || 
          typeof answers.budgetRange.max !== 'number') {
        return next(new ErrorResponse("Invalid budget range format", 400));
      }
    }

    if (answers.groupSize && (typeof answers.groupSize !== 'number' || answers.groupSize < 1 || answers.groupSize > 50)) {
      return next(new ErrorResponse("Group size must be between 1 and 50", 400));
    }

    // Update user with onboarding data
    const user = await USER.findByIdAndUpdate(
      userId,
      {
        onboardingCompleted: true,
        preferences: answers
      },
      { 
        new: true, 
        runValidators: true 
      }
    ).select("-password");

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "Onboarding completed successfully",
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        userName: user.userName,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
        preferences: user.preferences
      }
    });
  } catch (error) {
    console.error("Onboarding completion error:", error);
    
    // Handle specific errors
    if (error.name === 'CastError') {
      return next(new ErrorResponse("Invalid user ID", 400));
    }
    if (error.name === 'ValidationError') {
      return next(new ErrorResponse(error.message, 400));
    }
    
    next(new ErrorResponse("Failed to complete onboarding", 500));
  }
};

// Check onboarding status 
const getOnboardingStatus = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const user = await USER.findById(userId).select("onboardingCompleted");

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    res.status(200).json({
      success: true,
      data: {
        onboardingCompleted: user.onboardingCompleted
      }
    });
  } catch (error) {
    console.error("Onboarding status error:", error);
    next(new ErrorResponse("Failed to get onboarding status", 500));
  }
};

module.exports = {
  completeOnboarding,
  getOnboardingStatus
};