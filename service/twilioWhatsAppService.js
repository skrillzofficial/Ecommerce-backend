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

      if (normalizedMsg.includes('hi') || normalizedMsg.includes('hello') || normalizedMsg.includes('start')) {
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
          { 'venue.name': { $regex: searchTerm, $options: 'i' } }
        ],
        startDate: { $gte: new Date() },
        status: 'published'
      })
      .sort({ startDate: 1 })
      .limit(5)  // Changed to 5 events
      .select('title startDate venue price category');

      if (events.length === 0) {
        await this.sendMessage(phoneNumber, 
          `No events found for "${searchTerm}". Try different keywords or browse all events:\n\n` +
          `🌐 https://www.joineventry.com/discover`
        );
        return;
      }

      let response = `🎭 Found ${events.length} events:\n\n`;
      events.forEach((event, index) => {
        response += `${index + 1}. ${event.title}\n`;
        response += `   📅 ${event.startDate.toLocaleDateString()}\n`;
        response += `   📍 ${event.venue.name || event.venue}\n`;
        response += `   💰 ₦${event.price.toLocaleString()}\n\n`;  // Changed to Naira
      });

      response += `🔍 See more events: https://www.joineventry.com/discover\n\n` +
                 `Reply with event number for details or "more events" to see more.`;

      await this.sendMessage(phoneNumber, response);
    } catch (error) {
      console.error('Event search error:', error);
      await this.sendMessage(phoneNumber, 
        'Sorry, having trouble searching events. Browse all events here:\n\n' +
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
        response += `   📍 ${ticket.event.venue.name || ticket.event.venue}\n`;
        response += `   🎫 ${ticket.ticketType} x${ticket.quantity}\n\n`;
      });

      response += `📱 Manage tickets: https://www.joineventry.com/profile/tickets\n\n` +
                 `Reply with ticket number to get QR code.`;

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

• "Find events" - Discover events
• "My tickets" - View your bookings  
• "Help" - See all commands

📱 Full Features Available:
• Sign Up: https://www.joineventry.com/signup
• Discover Events: https://www.joineventry.com/discover
• My Tickets: https://www.joineventry.com/profile/tickets

For booking and full features, please use our website or mobile app.`;

    await this.sendMessage(phoneNumber, helpMsg);
  }

  async sendDefaultResponse(phoneNumber) {
    const defaultMsg = `I can help you find events and view tickets!

Try:
• "Find events" - Discover events
• "My tickets" - View your bookings
• "Help" - See all commands

📱 Get the full experience:
https://www.joineventry.com/signup`;

    await this.sendMessage(phoneNumber, defaultMsg);
  }
}

module.exports = new TwilioWhatsAppService();