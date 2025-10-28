const Event = require("../models/event");
const ErrorResponse = require("../utils/errorResponse");

// @desc    Like/Unlike event
// @route   POST /api/v1/events/:id/like
// @access  Private
const toggleLikeEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    await event.toggleLike(req.user.userId);

    const isLiked = event.likes.includes(req.user.userId);

    res.status(200).json({
      success: true,
      message: isLiked ? "Event liked" : "Event unliked",
      totalLikes: event.totalLikes,
      isLiked,
    });
  } catch (error) {
    console.error("Toggle like error:", error);
    next(new ErrorResponse("Failed to toggle like", 500));
  }
};

module.exports = {
  toggleLikeEvent,
};