const Event = require('../models/event');
const cloudinary = require('cloudinary').v2;

// Get all events
const getEvents = async (req, res, next) => {
  try {
    const events = await Event.find({ isActive: true })
      .populate('organizer', 'name email')
      .sort({ dateTime: 1 });
    
    res.status(200).json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

// Get single event
const getEventById = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('organizer', 'name email');
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: event
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

// Create a new event (Admin only)
const createEvent = async (req, res, next) => {
  try {
    const { title, description, category, date, time, location, capacity, price } = req.body;
    
    // Validate required fields
    if (!title || !category || !date || !time || !location || !price) {
      return res.status(400).json({
        success: false,
        message: 'title, category, date, time, location, and price are required fields'
      });
    }

    // Validate price is a positive number
    if (isNaN(price) || Number(price) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid positive number",
      });
    }

    // Validate date is in the future
    const eventDate = new Date(date);
    if (eventDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Event date must be in the future'
      });
    }

    // Validate capacity if provided
    if (capacity && capacity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Capacity must be at least 1'
      });
    }

    // Handle image upload
    let imageUrl = '';
    let imagePublicId = '';
    
    if (req.files && req.files.image) {
      try {
        // Upload image to Cloudinary
        const uploadedImage = await cloudinary.uploader.upload(req.files.image.tempFilePath, {
          folder: 'eventra_images'
        });
        
        imageUrl = uploadedImage.secure_url;
        imagePublicId = uploadedImage.public_id;
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Error uploading image'
        });
      }
    }

    // Create new event
    const newEvent = new Event({
      title: title.trim(),
      description: description?.trim() || '',
      category,
      date: eventDate,
      time: time.trim(),
      location,
      capacity: capacity || null,
      ticketsAvailable: capacity || 0,
      price: Number(price),
      image: imageUrl,
      imagePublicId: imagePublicId,
      organizer: req.user._id,
      isActive: true
    });

    // Save event to database
    const savedEvent = await newEvent.save();

    // Populate organizer details in response
    await savedEvent.populate('organizer', 'name email');

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: savedEvent
    });

  } catch (error) {
    console.error('Error creating event:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'An event with similar details already exists'
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

// Update an existing event
const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Handle price conversion if provided
    if (updates.price) {
      updates.price = parseFloat(updates.price);
      if (isNaN(updates.price) || updates.price < 0) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a valid positive number in Naira'
        });
      }
    }
    
    // Handle image upload if a new image is provided
    if (req.files && req.files.image) {
      try {
        // First, delete the old image if it exists
        const existingEvent = await Event.findById(id);
        if (existingEvent && existingEvent.imagePublicId) {
          await cloudinary.uploader.destroy(existingEvent.imagePublicId);
        }
        
        // Upload new image to Cloudinary
        const uploadedImage = await cloudinary.uploader.upload(req.files.image.tempFilePath, {
          folder: 'event_images'
        });
        
        updates.image = uploadedImage.secure_url;
        updates.imagePublicId = uploadedImage.public_id;
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Error uploading image'
        });
      }
    }
    
    // Update the event
    const updatedEvent = await Event.findByIdAndUpdate(
      id, 
      updates, 
      { new: true, runValidators: true }
    ).populate('organizer', 'name email');
    
    if (!updatedEvent) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      data: updatedEvent
    });
    
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

// Delete an event
const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find the event first to get the image public ID
    const event = await Event.findById(id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    
    // Delete the image from Cloudinary if it exists
    if (event.imagePublicId) {
      try {
        await cloudinary.uploader.destroy(event.imagePublicId);
      } catch (imageError) {
        console.error('Error deleting image from Cloudinary:', imageError);

      }
    }
    
    // Delete the event from the database
    await Event.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Event deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

module.exports = { 
  getEvents, 
  getEventById, 
  createEvent, 
  updateEvent, 
  deleteEvent 
};