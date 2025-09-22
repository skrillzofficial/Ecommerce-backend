const express = require("express");
const router = express.Router();
const {
  completeOnboarding,
  getOnboardingStatus,
} = require("../controllers/onboarding.controller");
const { protect } = require("../middleware/auth");

// All routes protected
router.use(protect);

router.post("/complete", completeOnboarding);
router.get("/status", getOnboardingStatus);

module.exports = router;
