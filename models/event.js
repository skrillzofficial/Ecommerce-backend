const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
    maxLength: [100, 'Title cannot exceed 100 characters']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  description: {
    type: String,
    default: '',
    maxLength: [2000, 'Description cannot exceed 2000 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Business', 'Sports', 'Festivals', 'Food & Drinks', 'Dating', 'Hobbies', 'Other'] 
  },
  location: {
    address: {
      type: String,
      required: [true, 'Address is required']
    }
  },
  dateTime: {
    type: Date,
    required: [true, 'Event date and time is required'],
    validate: {
      validator: function(value) {
        return value > new Date(); 
      },
      message: 'Event date must be in the future'
    }
  },
  image: {
    type: String,
    default: ''
  },
   imagePublicId: {
    type: String,
    default: ''
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Organizer is required']
  },
  capacity: {
    type: Number,
    min: [1, 'Capacity must be at least 1'],
    default: null 
  },
  ticketsAvailable: {
    type: Number,
    min: [0, 'Tickets available cannot be negative'],
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
eventSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Event', eventSchema);