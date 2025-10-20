const Event = require("../models/event");
const Ticket = require("../models/ticket");

const initializeTicketHandlers = (io, socket) => {
  
  // Real-time ticket validation at event entrance
  const validateTicketRealtime = async (data) => {
    try {
      const { ticketId, eventId, validatorId, scannerLocation } = data;
      
      // Input validation
      if (!ticketId || !eventId || !validatorId) {
        socket.emit('validation-error', { 
          message: 'Missing required fields: ticketId, eventId, validatorId' 
        });
        return;
      }

      // Verify validator is event organizer
      const event = await Event.findOne({ 
        _id: eventId, 
        organizer: validatorId 
      });

      if (!event) {
        socket.emit('validation-error', { 
          message: 'Not authorized to validate tickets for this event' 
        });
        return;
      }

      // Find and validate ticket
      const ticket = await Ticket.findOne({
        _id: ticketId,
        eventId: eventId
      }).populate('userId', 'name email phone').populate('eventId', 'title');

      if (!ticket) {
        socket.emit('validation-error', { 
          message: 'Ticket not found' 
        });
        return;
      }

      if (ticket.status !== 'valid') {
        socket.emit('validation-error', { 
          message: `Ticket has already been ${ticket.status}`,
          currentStatus: ticket.status,
          usedAt: ticket.usedAt
        });
        return;
      }

      // Update ticket status
      ticket.status = 'used';
      ticket.usedAt = new Date();
      ticket.validatedBy = validatorId;
      
      if (scannerLocation) {
        ticket.validationLocation = {
          latitude: scannerLocation.latitude,
          longitude: scannerLocation.longitude,
          accuracy: scannerLocation.accuracy
        };
      }

      await ticket.save();

      // Update event attendee status
      await event.checkInAttendee(ticketId);

      // Emit validation success to scanner
      socket.emit('validation-success', {
        ticketId: ticket._id,
        userName: ticket.userId.name,
        userEmail: ticket.userId.email,
        eventName: ticket.eventId.title,
        ticketType: ticket.ticketType,
        validatedAt: ticket.usedAt,
        message: 'Ticket validated successfully'
      });

      // Notify ticket owner about validation (if they're connected)
      io.emit(`ticket-${ticketId}-validated`, {
        ticketId: ticket._id,
        eventName: ticket.eventId.title,
        validatedAt: ticket.usedAt,
        status: 'used'
      });

      // Broadcast to all organizers for real-time dashboard updates
      io.emit('ticket-validation-update', {
        ticketId: ticket._id,
        eventId: event._id,
        eventName: event.title,
        userId: ticket.userId._id,
        userName: ticket.userId.name,
        userEmail: ticket.userId.email,
        ticketType: ticket.ticketType,
        status: 'used',
        validatedAt: ticket.usedAt,
        validatorId: validatorId,
        scannerLocation: scannerLocation
      });

      console.log(` Ticket ${ticketId} validated for event: "${event.title}"`);

    } catch (error) {
      console.error('Error validating ticket:', error);
      socket.emit('validation-error', { 
        message: error.message || 'Failed to validate ticket' 
      });
    }
  };

  // Check ticket status and details
  const checkTicketStatus = async (data) => {
    try {
      const { ticketId, eventId, userId } = data;
      
      if (!ticketId) {
        socket.emit('ticket-error', { 
          message: 'Ticket ID is required' 
        });
        return;
      }

      const ticket = await Ticket.findOne({
        _id: ticketId,
        ...(eventId && { eventId: eventId }),
        ...(userId && { userId: userId })
      })
      .populate('userId', 'name email phone')
      .populate('eventId', 'title date time venue address city')
      .populate('validatedBy', 'name email');

      if (!ticket) {
        socket.emit('ticket-status', {
          isValid: false,
          message: 'Ticket not found'
        });
        return;
      }

      const response = {
        ticketId: ticket._id,
        isValid: ticket.status === 'valid',
        status: ticket.status,
        userName: ticket.userId.name,
        userEmail: ticket.userId.email,
        eventName: ticket.eventId.title,
        eventDate: ticket.eventId.date,
        eventTime: ticket.eventId.time,
        eventVenue: ticket.eventId.venue,
        eventAddress: ticket.eventId.address,
        ticketType: ticket.ticketType,
        quantity: ticket.quantity,
        totalPrice: ticket.totalPrice,
        purchaseDate: ticket.purchaseDate,
        usedAt: ticket.usedAt,
        validatedBy: ticket.validatedBy?.name
      };

      socket.emit('ticket-status', response);

    } catch (error) {
      console.error('Error checking ticket status:', error);
      socket.emit('ticket-error', { 
        message: error.message || 'Failed to check ticket status' 
      });
    }
  };

  // Get all tickets for an event (organizer only)
  const getEventTickets = async (data) => {
    try {
      const { eventId, organizerId, status } = data;
      
      if (!eventId || !organizerId) {
        socket.emit('ticket-error', { 
          message: 'Event ID and organizer ID are required' 
        });
        return;
      }

      // Verify organizer owns the event
      const event = await Event.findOne({
        _id: eventId,
        organizer: organizerId
      });

      if (!event) {
        socket.emit('ticket-error', { 
          message: 'Not authorized to view tickets for this event' 
        });
        return;
      }

      const query = { eventId: eventId };
      if (status && status !== 'all') {
        query.status = status;
      }

      const tickets = await Ticket.find(query)
        .populate('userId', 'name email phone')
        .populate('validatedBy', 'name')
        .sort({ purchaseDate: -1 });

      socket.emit('event-tickets', {
        eventId,
        eventName: event.title,
        totalTickets: tickets.length,
        tickets: tickets.map(ticket => ({
          ticketId: ticket._id,
          userName: ticket.userId.name,
          userEmail: ticket.userId.email,
          ticketType: ticket.ticketType,
          quantity: ticket.quantity,
          totalPrice: ticket.totalPrice,
          status: ticket.status,
          purchaseDate: ticket.purchaseDate,
          usedAt: ticket.usedAt,
          validatedBy: ticket.validatedBy?.name
        }))
      });

    } catch (error) {
      console.error('Error fetching event tickets:', error);
      socket.emit('ticket-error', { 
        message: error.message || 'Failed to fetch event tickets' 
      });
    }
  };

  // Subscribe to ticket updates for an event (organizer)
  const subscribeToTicketUpdates = async (data) => {
    try {
      const { eventId, organizerId } = data;
      
      if (!eventId || !organizerId) {
        socket.emit('subscription-error', { 
          message: 'Event ID and organizer ID are required' 
        });
        return;
      }

      // Verify organizer authorization
      const event = await Event.findOne({
        _id: eventId,
        organizer: organizerId
      });

      if (!event) {
        socket.emit('subscription-error', { 
          message: 'Not authorized to subscribe to ticket updates' 
        });
        return;
      }

      socket.join(`event-tickets-${eventId}`);
      
      console.log(` Organizer ${organizerId} subscribed to ticket updates for event ${eventId}`);

      socket.emit('ticket-subscription-success', {
        eventId,
        eventName: event.title,
        message: 'Subscribed to real-time ticket updates'
      });

    } catch (error) {
      console.error('Error subscribing to ticket updates:', error);
      socket.emit('subscription-error', { 
        message: error.message || 'Failed to subscribe to ticket updates' 
      });
    }
  };

  // Register event handlers
  socket.on('validate-ticket-realtime', validateTicketRealtime);
  socket.on('check-ticket-status', checkTicketStatus);
  socket.on('get-event-tickets', getEventTickets);
  socket.on('subscribe-to-ticket-updates', subscribeToTicketUpdates);
  socket.on('unsubscribe-from-ticket-updates', (data) => {
    const { eventId } = data;
    socket.leave(`event-tickets-${eventId}`);
    socket.emit('unsubscribed', { eventId, message: 'Unsubscribed from ticket updates' });
  });
};

module.exports = { initializeTicketHandlers };