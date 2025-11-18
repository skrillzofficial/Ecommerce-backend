const twilio = require('twilio');

class TwilioWhatsAppService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  // Lazy load your existing models
  get userModel() {
    return require('../models/user');
  }

  get eventModel() {
    return require('../models/event');
  }

  get ticketModel() {
    return require('../models/ticket');
  }

  async sendMessage(to, body) {
    try {
      const message = await this.client.messages.create({
        body: body,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: to
      });
      console.log(`WhatsApp message sent: ${message.sid}`);
      return message;
    } catch (error) {
      console.error('WhatsApp send error:', error);
      throw error;
    }
  }

  async handleIncomingMessage(phoneNumber, message) {
    try {
      const User = this.userModel;
      
      // Use your existing user lookup logic
      let user = await User.findOne({ phone: phoneNumber });
      
      const normalizedMsg = message.toLowerCase().trim();

      // Handle event number selection (e.g., "1", "2", "3")
      if (/^\d+$/.test(normalizedMsg)) {
        return await this.handleEventSelection(phoneNumber, normalizedMsg);
      } else if (normalizedMsg.includes('hi') || normalizedMsg.includes('hello') || normalizedMsg.includes('start')) {
        return await this.sendWelcomeMessage(phoneNumber, user);
      } else if (normalizedMsg.includes('find event') || normalizedMsg.includes('search event')) {
        return await this.handleEventSearch(phoneNumber, message);
      } else if (normalizedMsg.includes('my ticket') || normalizedMsg.includes('my booking')) {
        return await this.handleUserTickets(phoneNumber, user);
      } else if (normalizedMsg.includes('help')) {
        return await this.sendHelpMessage(phoneNumber);
      } else {
        return await this.sendDefaultResponse(phoneNumber);
      }
    } catch (error) {
      console.error('Error handling WhatsApp message:', error);
      await this.sendMessage(phoneNumber, 'Sorry, I encountered an error. Please try again.');
    }
  }

  async sendWelcomeMessage(phoneNumber, user) {
    const welcomeMsg = `🎪 Welcome to Eventry WhatsApp Bot! 🎪

I can help you with:
• 🎫 Find and book event tickets
• 🔍 Discover upcoming events  
• 🎟️ View your tickets & QR codes
• 📋 Get event details

Try these commands:
- "Find events" - Discover events
- "My tickets" - View your bookings
- "Help" - See all commands

📱 Get started: https://www.joineventry.com/signup`;

    await this.sendMessage(phoneNumber, welcomeMsg);
  }

  async handleEventSearch(phoneNumber, message) {
    try {
      const Event = this.eventModel;
      
      const searchTerm = message.replace(/find|search|events?\s*/gi, '').trim();
      
      const events = await Event.find({
        $or: [
          { title: { $regex: searchTerm, $options: 'i' } },
          { category: { $regex: searchTerm, $options: 'i' } },
          { venue: { $regex: searchTerm, $options: 'i' } },
          { city: { $regex: searchTerm, $options: 'i' } }
        ],
        startDate: { $gte: new Date() },
        status: 'published'
      })
      .sort({ startDate: 1 })
      .limit(5)
      .select('title startDate venue city address ticketTypes price');

      if (events.length === 0) {
        await this.sendMessage(phoneNumber, 
          `No events found for "${searchTerm}". Try different keywords or browse all events:\n\n` +
          `🌐 https://www.joineventry.com/discover`
        );
        return;
      }

      // Store events in temporary session for number selection
      this.lastSearchResults = this.lastSearchResults || {};
      this.lastSearchResults[phoneNumber] = events;

      let response = `🎭 Found ${events.length} events:\n\n`;
      
      for (let i = 0; i < events.length; i++) {
        const event = events[i];

        let priceRange = 'Free';
        let ticketNames = 'No tickets';

        // Handle ticket types from embedded array
        if (event.ticketTypes && event.ticketTypes.length > 0) {
          const prices = event.ticketTypes.map(t => t.price || 0).filter(p => p > 0);
          if (prices.length > 0) {
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            
            if (prices.length === 1) {
              priceRange = `₦${minPrice.toLocaleString()}`;
            } else {
              priceRange = `₦${minPrice.toLocaleString()} - ₦${maxPrice.toLocaleString()}`;
            }
          }
          
          ticketNames = event.ticketTypes.map(t => t.name || 'Standard').join(', ');
        } else if (event.price > 0) {
          // Fallback to event price if no ticket types
          priceRange = `₦${event.price.toLocaleString()}`;
          ticketNames = 'Standard';
        }

        response += `${i + 1}. 🎪 ${event.title}\n`;
        response += `   📅 ${event.startDate.toLocaleDateString()}\n`;
        response += `   📍 ${event.venue}${event.city ? `, ${event.city}` : ''}\n`;
        response += `   💰 ${priceRange}\n`;
        response += `   🎫 ${ticketNames}\n\n`;
      }

      response += `🔍 *Reply with the event number (1-${events.length}) to view details*\n\n` +
                 `🌐 See all events: https://www.joineventry.com/discover`;

      await this.sendMessage(phoneNumber, response);
    } catch (error) {
      console.error('Event search error:', error);
      await this.sendMessage(phoneNumber, 
        'Sorry, having trouble searching events. Browse all events here:\n\n' +
        '🌐 https://www.joineventry.com/discover'
      );
    }
  }

  async handleEventSelection(phoneNumber, selectedNumber) {
    try {
      const Event = this.eventModel;

      // Get stored search results
      const events = this.lastSearchResults?.[phoneNumber];
      if (!events || events.length === 0) {
        await this.sendMessage(phoneNumber, 
          'Please search for events first using "Find events" command.'
        );
        return;
      }

      const eventIndex = parseInt(selectedNumber) - 1;
      if (eventIndex < 0 || eventIndex >= events.length) {
        await this.sendMessage(phoneNumber, 
          `Please select a valid event number (1-${events.length}).`
        );
        return;
      }

      const event = await Event.findById(events[eventIndex]._id)
        .populate('organizer', 'name')
        .select('title startDate endDate venue address city state description category organizer ticketTypes price');

      if (!event) {
        await this.sendMessage(phoneNumber, 'Event not found. Please search again.');
        return;
      }

      let response = `🎪 *${event.title}*\n\n`;
      
      // Event details
      response += `📅 *Date:* ${event.startDate.toLocaleDateString()}\n`;
      if (event.endDate) {
        response += `⏰ *Ends:* ${event.endDate.toLocaleDateString()}\n`;
      }
      response += `📍 *Venue:* ${event.venue}\n`;
      if (event.address) {
        response += `🏠 *Address:* ${event.address}\n`;
      }
      if (event.city || event.state) {
        response += `🌍 *Location:* ${event.city}${event.state ? `, ${event.state}` : ''}\n`;
      }
      response += `🏷️ *Category:* ${event.category}\n`;
      if (event.organizer) {
        response += `👤 *Organizer:* ${event.organizer.name}\n`;
      }
      
      // Event description (truncated if too long)
      if (event.description) {
        const shortDesc = event.description.length > 200 
          ? event.description.substring(0, 200) + '...' 
          : event.description;
        response += `\n📝 *Description:* ${shortDesc}\n`;
      }

      // Ticket types with details
      if (event.ticketTypes && event.ticketTypes.length > 0) {
        response += `\n🎫 *Available Tickets:*\n\n`;
        event.ticketTypes.forEach((ticket, index) => {
          const ticketPrice = ticket.price > 0 ? `₦${ticket.price.toLocaleString()}` : 'Free';
          const capacity = ticket.capacity || 'Unlimited';
          
          response += `${index + 1}. *${ticket.name || 'Standard'}* - ${ticketPrice}\n`;
          response += `   Available: ${capacity} tickets\n`;
          if (ticket.description) {
            const shortDesc = ticket.description.length > 80 
              ? ticket.description.substring(0, 80) + '...' 
              : ticket.description;
            response += `   ${shortDesc}\n`;
          }
          response += `\n`;
        });
      } else {
        const eventPrice = event.price > 0 ? `₦${event.price.toLocaleString()}` : 'Free';
        response += `\n🎫 *Ticket:* ${eventPrice}\n`;
      }

      // Web link and call to action
      response += `🔗 *View Full Details & Book Tickets:*\n`;
      response += `🌐 https://www.joineventry.com/event/${event._id}\n\n`;
      
      response += `💡 *Get the full experience on our website:*\n`;
      response += `• View event photos & full description\n`;
      response += `• See seating arrangements\n`;
      response += `• Book tickets securely\n`;
      response += `• Get instant QR codes\n\n`;
      
      response += `📱 *Quick Links:*\n`;
      response += `• Discover Events: https://www.joineventry.com/discover\n`;
      response += `• Sign Up: https://www.joineventry.com/signup`;

      await this.sendMessage(phoneNumber, response);
    } catch (error) {
      console.error('Event details error:', error);
      await this.sendMessage(phoneNumber, 
        'Sorry, having trouble loading event details. Browse events here:\n\n' +
        '🌐 https://www.joineventry.com/discover'
      );
    }
  }

  async handleUserTickets(phoneNumber, user) {
    try {
      if (!user) {
        await this.sendMessage(phoneNumber, 
          `Please create an account first to view your tickets:\n\n` +
          `📱 https://www.joineventry.com/signup\n\n` +
          `After signing up, you can link your phone number in your account settings.`
        );
        return;
      }

      const Ticket = this.ticketModel;
      
      const tickets = await Ticket.find({ user: user._id })
        .populate('event', 'title startDate venue')
        .populate('ticketType', 'name')
        .limit(5);

      if (!tickets || tickets.length === 0) {
        await this.sendMessage(phoneNumber, 
          `You don't have any tickets yet. Discover amazing events to book:\n\n` +
          `🎪 https://www.joineventry.com/discover`
        );
        return;
      }

      let response = "🎟️ Your Recent Tickets:\n\n";
      tickets.forEach((ticket, index) => {
        response += `${index + 1}. ${ticket.event.title}\n`;
        response += `   📅 ${ticket.event.startDate.toLocaleDateString()}\n`;
        response += `   📍 ${ticket.event.venue}\n`;
        response += `   🎫 ${ticket.ticketType?.name || 'Standard'} - ${ticket.quantity} ticket(s)\n\n`;
      });

      response += `📱 *Manage tickets:* https://www.joineventry.com/profile/tickets\n\n` +
                 `🔗 *View event details:* Reply with ticket number\n` +
                 `🌐 *Full experience:* https://www.joineventry.com`;

      await this.sendMessage(phoneNumber, response);
    } catch (error) {
      console.error('Ticket lookup error:', error);
      await this.sendMessage(phoneNumber, 
        'Sorry, having trouble fetching your tickets. Visit:\n\n' +
        '📱 https://www.joineventry.com/profile/tickets'
      );
    }
  }

  async sendHelpMessage(phoneNumber) {
    const helpMsg = `🆘 Eventry WhatsApp Help

• "Find events" - Discover events with multiple ticket options
• *Reply with event number* - View detailed event information
• "My tickets" - View your bookings  
• "Help" - See all commands

🎫 Available Features:
• Event search and discovery
• Detailed event information
• Multiple ticket types (Regular, VIP, VVIP)
• Price ranges and availability
• Direct links to event pages

📱 Full Features Available:
• Sign Up: https://www.joineventry.com/signup
• Discover Events: https://www.joineventry.com/discover
• My Tickets: https://www.joineventry.com/profile/tickets

*Get the complete experience on our website!*`;

    await this.sendMessage(phoneNumber, helpMsg);
  }

  async sendDefaultResponse(phoneNumber) {
    const defaultMsg = `I can help you find events and view tickets!

Try:
• "Find events" - Discover events with Regular/VIP/VVIP tickets
• *Reply with number* - View event details after searching
• "My tickets" - View your bookings
• "Help" - See all commands

📱 Get the full experience:
https://www.joineventry.com/signup

🎪 Discover amazing events:
https://www.joineventry.com/discover`;

    await this.sendMessage(phoneNumber, defaultMsg);
  }
}

module.exports = new TwilioWhatsAppService();