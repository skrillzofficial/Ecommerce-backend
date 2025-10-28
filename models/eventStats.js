const mongoose = require("mongoose");

const eventStatsSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  // Daily increments (not totals)
  views: {
    type: Number,
    default: 0,
    min: 0,
  },
  likes: {
    type: Number,
    default: 0,
    min: 0,
  },
  shares: {
    type: Number,
    default: 0,
    min: 0,
  },
  ticketSales: {
    type: Number,
    default: 0,
    min: 0,
  },
  revenue: {
    type: Number,
    default: 0,
    min: 0,
  },
  checkIns: {
    type: Number,
    default: 0,
    min: 0,
  },
  // NEW: Only add ONE essential derived metric
  conversionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  }
}, {
  timestamps: true,
});

// Index for time-series queries
eventStatsSchema.index({ event: 1, date: 1 });

// Simple pre-save to calculate conversion rate
eventStatsSchema.pre("save", function(next) {
  // Only calculate if we have views and ticket sales
  if (this.views > 0 && this.ticketSales > 0) {
    this.conversionRate = (this.ticketSales / this.views) * 100;
  }
  next();
});

// Add ONE useful static method for common analytics
eventStatsSchema.statics.getEventTrend = async function(eventId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    event: eventId,
    date: { $gte: startDate }
  }).sort({ date: 1 });
};

module.exports = mongoose.model("EventStats", eventStatsSchema);