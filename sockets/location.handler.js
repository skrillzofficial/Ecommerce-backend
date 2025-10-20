const Event = require("../models/event");
const Ticket = require("../models/ticket");

const initializeLocationHandlers = (io, socket) => {
  
  // Organizer starts sharing live event location
  const shareEventLocation = async (data) => {
    try {
      const { eventId, userId, latitude, longitude, address, accuracy } = data;
      
      // Input validation
      if (!eventId || !userId || !latitude || !longitude) {
        socket.emit('location-error', { 
          message: 'Missing required fields: eventId, userId, latitude, longitude' 
        });
        return;
      }

      const event = await Event.findById(eventId);
      if (!event) {
        socket.emit('location-error', { 
          message: 'Event not found' 
        });
        return;
      }

      // Use the model method to start location sharing
      const locationData = await event.startLocationSharing(userId, {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address || event.address,
        accuracy: accuracy || 50
      });

      // Broadcast to all connected clients
      io.emit('event-location-update', {
        eventId: event._id,
        eventName: event.title,
        latitude: locationData.currentLocation.latitude,
        longitude: locationData.currentLocation.longitude,
        address: locationData.currentLocation.address,
        accuracy: locationData.currentLocation.accuracy,
        lastUpdated: locationData.lastUpdated,
        isActive: true,
        organizerId: userId
      });
      
      console.log(`Live location sharing started for event: "${event.title}"`);

      socket.emit('location-sharing-started', {
        eventId: event._id,
        eventName: event.title,
        message: 'Live location sharing started successfully'
      });

    } catch (error) {
      console.error('Error sharing event location:', error);
      socket.emit('location-error', { 
        message: error.message || 'Failed to share event location' 
      });
    }
  };

  // Organizer updates live event location
  const updateEventLocation = async (data) => {
    try {
      const { eventId, userId, latitude, longitude, address, accuracy } = data;
      
      if (!eventId || !userId || !latitude || !longitude) {
        socket.emit('location-error', { 
          message: 'Missing required fields' 
        });
        return;
      }

      const event = await Event.findById(eventId);
      if (!event) {
        socket.emit('location-error', { 
          message: 'Event not found' 
        });
        return;
      }

      // Use model method to update location
      const updatedLocation = await event.updateLiveLocation(userId, {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address || event.liveLocation?.currentLocation?.address,
        accuracy: accuracy || 50
      });

      // Broadcast update to all clients
      io.emit('event-location-update', {
        eventId: event._id,
        eventName: event.title,
        latitude: updatedLocation.currentLocation.latitude,
        longitude: updatedLocation.currentLocation.longitude,
        address: updatedLocation.currentLocation.address,
        accuracy: updatedLocation.currentLocation.accuracy,
        lastUpdated: updatedLocation.lastUpdated,
        isActive: true,
        organizerId: userId
      });

      console.log(` Event location updated: "${event.title}"`);

    } catch (error) {
      console.error('Error updating event location:', error);
      socket.emit('location-error', { 
        message: error.message || 'Failed to update event location' 
      });
    }
  };

  // Organizer stops sharing live location
  const stopSharingEventLocation = async (data) => {
    try {
      const { eventId, userId } = data;
      
      if (!eventId || !userId) {
        socket.emit('location-error', { 
          message: 'Missing eventId or userId' 
        });
        return;
      }

      const event = await Event.findById(eventId);
      if (!event) {
        socket.emit('location-error', { 
          message: 'Event not found' 
        });
        return;
      }

      // Use model method to stop sharing
      await event.stopLocationSharing(userId);

      // Notify all clients
      io.emit('event-location-ended', {
        eventId: event._id,
        eventName: event.title,
        message: 'Live location sharing has ended',
        timestamp: new Date(),
        organizerId: userId
      });

      console.log(` Live location sharing stopped for event: "${event.title}"`);

      socket.emit('location-sharing-stopped', {
        eventId: event._id,
        message: 'Location sharing stopped successfully'
      });

    } catch (error) {
      console.error('Error stopping location sharing:', error);
      socket.emit('location-error', { 
        message: error.message || 'Failed to stop location sharing' 
      });
    }
  };

  // User requests current event location (requires valid ticket)
  const getEventLocation = async (data) => {
    try {
      const { eventId, ticketId, userId } = data;
      
      if (!eventId || !ticketId) {
        socket.emit('location-error', { 
          message: 'Missing eventId or ticketId' 
        });
        return;
      }

      // Verify user has valid ticket for this event
      const ticket = await Ticket.findOne({
        _id: ticketId,
        eventId: eventId,
        userId: userId,
        status: 'valid'
      }).populate('eventId');

      if (!ticket) {
        socket.emit('location-error', { 
          message: 'Valid ticket required to view event location' 
        });
        return;
      }

      const event = await Event.findById(eventId);
      if (!event) {
        socket.emit('location-error', { 
          message: 'Event not found' 
        });
        return;
      }

      // Get live location using model method
      const liveLocation = event.getLiveLocation();
      
      if (liveLocation) {
        socket.emit('current-event-location', {
          ...liveLocation,
          eventName: event.title
        });
      } else {
        socket.emit('location-not-available', { 
          eventId,
          eventName: event.title,
          message: 'Event location is not currently being shared',
          staticLocation: {
            venue: event.venue,
            address: event.address,
            city: event.city,
            coordinates: event.coordinates
          }
        });
      }

    } catch (error) {
      console.error('Error getting event location:', error);
      socket.emit('location-error', { 
        message: error.message || 'Failed to get event location' 
      });
    }
  };

  // Subscribe to location updates for an event
  const subscribeToLocation = async (data) => {
    try {
      const { eventId, ticketId, userId } = data;
      
      if (!eventId || !ticketId) {
        socket.emit('subscription-error', { 
          message: 'Missing eventId or ticketId' 
        });
        return;
      }

      // Verify ticket validity
      const ticket = await Ticket.findOne({
        _id: ticketId,
        eventId: eventId,
        userId: userId,
        status: 'valid'
      });

      if (!ticket) {
        socket.emit('subscription-error', { 
          message: 'Valid ticket required to subscribe to location updates' 
        });
        return;
      }

      // Join room for this event's location updates
      socket.join(`event-location-${eventId}`);
      
      console.log(` User ${userId} subscribed to location updates for event ${eventId}`);

      socket.emit('subscription-success', {
        eventId,
        message: 'Subscribed to location updates'
      });

    } catch (error) {
      console.error('Error subscribing to location:', error);
      socket.emit('subscription-error', { 
        message: error.message || 'Failed to subscribe to location updates' 
      });
    }
  };

  // Unsubscribe from location updates
  const unsubscribeFromLocation = (data) => {
    const { eventId } = data;
    socket.leave(`event-location-${eventId}`);
    
    console.log(` User unsubscribed from location updates for event ${eventId}`);
    
    socket.emit('unsubscribed', {
      eventId,
      message: 'Unsubscribed from location updates'
    });
  };

  // Register event handlers
  socket.on('share-event-location', shareEventLocation);
  socket.on('update-event-location', updateEventLocation);
  socket.on('stop-sharing-event-location', stopSharingEventLocation);
  socket.on('get-event-location', getEventLocation);
  socket.on('subscribe-to-location', subscribeToLocation);
  socket.on('unsubscribe-from-location', unsubscribeFromLocation);
};

module.exports = { initializeLocationHandlers };