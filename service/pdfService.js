const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const axios = require('axios');

class PDFService {
  static async generateTicketPDF(ticket) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          layout: 'portrait'
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Generate QR Code
        const qrCodeData = ticket.generateQRData();
        const qrCodeImage = await QRCode.toDataURL(qrCodeData);

        // Add styling
        await this.addHeader(doc, ticket);
        await this.addShareableBanner(doc, ticket);
        this.addEventDetails(doc, ticket);
        this.addTicketDetails(doc, ticket);
        this.addQRCode(doc, qrCodeImage);
        this.addFooter(doc, ticket);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  static async addHeader(doc, ticket) {
    // Title with gradient effect
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#2D3748')
       .text('EVENT TICKET', 50, 50, { align: 'center' });

    // Ticket Number
    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#718096')
       .text(`Ticket #: ${ticket.ticketNumber}`, 50, 85, { align: 'center' });

    // Status badge
    const statusColor = this.getStatusColor(ticket.status);
    doc.roundedRect(250, 80, 100, 20, 10)
       .fill(color);
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .text(ticket.status.toUpperCase(), 250, 85, { 
         width: 100, 
         align: 'center' 
       });

    doc.moveTo(50, 110)
       .lineTo(545, 110)
       .strokeColor('#E2E8F0')
       .lineWidth(1)
       .stroke();
  }

  static async addShareableBanner(doc, ticket) {
    // Check if shareable banner exists and is generated
    if (ticket.shareableBanner?.status === 'generated' && 
        ticket.shareableBanner.generatedBanner?.url) {
      
      try {
        // Download banner image
        const response = await axios({
          method: 'GET',
          url: ticket.shareableBanner.generatedBanner.url,
          responseType: 'arraybuffer'
        });

        const bannerBuffer = Buffer.from(response.data);
        
        // Add banner section header
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#2D3748')
           .text('Shareable Banner', 50, 130);

        // Add banner image
        const bannerWidth = 500;
        const bannerHeight = 263; // 1200x630 ratio
        const bannerY = 160;

        doc.image(bannerBuffer, 50, bannerY, {
          width: bannerWidth,
          height: bannerHeight,
          align: 'center'
        });

        // Add share instructions
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#718096')
           .text('Share this banner on social media to promote the event!', 
                 50, bannerY + bannerHeight + 10, {
                   align: 'center',
                   width: bannerWidth
                 });

        // Add separator after banner
        doc.moveTo(50, bannerY + bannerHeight + 35)
           .lineTo(545, bannerY + bannerHeight + 35)
           .strokeColor('#E2E8F0')
           .lineWidth(1)
           .stroke();

        return bannerY + bannerHeight + 50;
      } catch (error) {
        console.error('Failed to add shareable banner:', error);
        // Continue without banner if there's an error
        return 130;
      }
    }
    
    return 130;
  }

  static addEventDetails(doc, ticket) {
    let yPosition = 130;

    // If banner was added, adjust position
    if (ticket.shareableBanner?.status === 'generated') {
      yPosition = 480; // Position after banner
    }

    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#2D3748')
       .text(ticket.eventName, 50, yPosition);

    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#4A5568');

    let currentY = yPosition + 30;

    // Event Date
    const eventDate = new Date(ticket.eventStartDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.text(`📅 Date: ${eventDate}`, 50, currentY);
    
    // Event Time
    const startTime = ticket.eventTime || 'TBA';
    const endTime = ticket.eventEndTime || '';
    const timeText = endTime ? `${startTime} - ${endTime}` : startTime;
    doc.text(`⏰ Time: ${timeText}`, 300, currentY);
    currentY += 25;

    // Venue
    if (ticket.eventVenue) {
      doc.text(`🏛️ Venue: ${ticket.eventVenue}`, 50, currentY);
      currentY += 25;
    }

    // Address
    if (ticket.eventAddress) {
      const addressLines = this.splitTextToLines(doc, ticket.eventAddress, 400);
      doc.text(`📍 Address: ${addressLines[0]}`, 50, currentY);
      
      if (addressLines.length > 1) {
        for (let i = 1; i < addressLines.length; i++) {
          currentY += 15;
          doc.text(`           ${addressLines[i]}`, 50, currentY);
        }
      }
      currentY += 25;
    }

    // Event Type badge
    const eventTypeColor = this.getEventTypeColor(ticket.eventType);
    doc.roundedRect(50, currentY, 120, 20, 5)
       .fill(eventTypeColor);
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .text(ticket.eventType.toUpperCase(), 50, currentY + 5, { 
         width: 120, 
         align: 'center' 
       });

    currentY += 35;

    doc.moveTo(50, currentY)
       .lineTo(545, currentY)
       .strokeColor('#E2E8F0')
       .lineWidth(1)
       .stroke();

    return currentY + 20;
  }

  static addTicketDetails(doc, ticket) {
    let yPosition = 280;

    // Adjust position based on content
    if (ticket.shareableBanner?.status === 'generated') {
      yPosition = 630; // Position after banner and event details
    } else if (ticket.eventVenue && ticket.eventAddress) {
      yPosition = 380; // Position with full event details
    }

    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#2D3748')
       .text('Ticket Details', 50, yPosition);

    yPosition += 30;

    // Create ticket details box
    doc.roundedRect(50, yPosition, 500, 120, 10)
       .fill('#F7FAFC')
       .strokeColor('#E2E8F0')
       .lineWidth(1)
       .stroke();

    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#4A5568');

    const boxPadding = 15;
    let currentY = yPosition + boxPadding;

    // Ticket Type
    doc.text(`🎫 Ticket Type:`, 50 + boxPadding, currentY);
    doc.font('Helvetica-Bold')
       .text(ticket.ticketType, 150, currentY);
    doc.font('Helvetica')
       .text(`Quantity: ${ticket.quantity}`, 350, currentY);
    currentY += 25;

    // Price
    const priceText = ticket.ticketPrice === 0 ? 'FREE' : `₦${ticket.ticketPrice.toLocaleString()}`;
    doc.text(`💰 Price:`, 50 + boxPadding, currentY);
    doc.font('Helvetica-Bold')
       .fillColor(ticket.ticketPrice === 0 ? '#38A169' : '#2D3748')
       .text(priceText, 150, currentY);
    doc.font('Helvetica')
       .fillColor('#4A5568');
    currentY += 25;

    // Attendee
    doc.text(`👤 Attendee:`, 50 + boxPadding, currentY);
    doc.font('Helvetica-Bold')
       .text(ticket.userName, 150, currentY);
    doc.font('Helvetica')
       .text(ticket.userEmail, 350, currentY);
    currentY += 25;

    // Purchase Date
    const purchaseDate = new Date(ticket.purchaseDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.text(`📅 Purchase Date:`, 50 + boxPadding, currentY);
    doc.text(purchaseDate, 150, currentY);

    // Approval status if applicable
    if (ticket.approvalStatus && ticket.approvalStatus !== 'not-required') {
      currentY += 25;
      const approvalColor = this.getApprovalColor(ticket.approvalStatus);
      doc.text(`Approval Status:`, 50 + boxPadding, currentY);
      doc.font('Helvetica-Bold')
         .fillColor(approvalColor)
         .text(ticket.approvalStatus.toUpperCase(), 150, currentY);
    }
  }

  static addQRCode(doc, qrCodeImage) {
    const qrCodeX = 400;
    const qrCodeY = 430;
    const qrCodeSize = 120;

    // Adjust position based on content
    let adjustedY = qrCodeY;
    if (ticket.shareableBanner?.status === 'generated') {
      adjustedY = 650; // Position after banner and ticket details
    }

    // QR Code container
    doc.roundedRect(qrCodeX - 10, adjustedY - 10, qrCodeSize + 20, qrCodeSize + 40, 10)
       .fill('#FFFFFF')
       .strokeColor('#E2E8F0')
       .lineWidth(2)
       .stroke();

    doc.image(qrCodeImage, qrCodeX, adjustedY, {
      width: qrCodeSize,
      height: qrCodeSize
    });

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#2D3748')
       .text('SCAN AT ENTRANCE', qrCodeX, adjustedY + qrCodeSize + 5, {
         width: qrCodeSize,
         align: 'center'
       });

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#718096')
       .text('Present this QR code for check-in', qrCodeX, adjustedY + qrCodeSize + 20, {
         width: qrCodeSize,
         align: 'center'
       });
  }

  static addFooter(doc, ticket) {
    const footerY = 700;

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#2D3748')
       .text('Terms & Conditions', 50, footerY);

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#718096');

    const terms = [
      '• This ticket is non-transferable and valid only for the registered attendee',
      '• Please arrive 30 minutes before the event start time',
      '• Present this ticket or QR code at the entrance for verification',
      '• The organizer reserves the right to refuse entry',
      '• Tickets are non-refundable except as required by law',
      '• Keep this ticket secure - it contains personal information'
    ];

    let currentY = footerY + 15;
    terms.forEach(term => {
      doc.text(term, 50, currentY, {
        width: 500,
        indent: 10
      });
      currentY += 15;
    });

    // Security notice
    currentY += 10;
    doc.fontSize(8)
       .fillColor('#E53E3E')
       .text(`Security Code: ${ticket.securityCode} - Do not share publicly`, 
             50, currentY, { align: 'center' });

    // Organizer info
    currentY += 20;
    if (ticket.organizerName) {
      doc.fontSize(9)
         .fillColor('#4A5568')
         .text(`Organized by: ${ticket.organizerName}`, 50, currentY);
      
      if (ticket.organizerCompany) {
        doc.text(ticket.organizerCompany, 50, currentY + 12);
      }
    }

    // Generated timestamp
    doc.fontSize(8)
       .fillColor('#A0AEC0')
       .text(`Generated on: ${new Date().toLocaleString()}`, 
             50, currentY + 30, { align: 'right' });
  }

  // Helper methods
  static getStatusColor(status) {
    const colors = {
      'confirmed': '#38A169',
      'checked-in': '#3182CE',
      'pending-approval': '#D69E2E',
      'cancelled': '#E53E3E',
      'expired': '#718096',
      'rejected': '#E53E3E'
    };
    return colors[status] || '#718096';
  }

  static getEventTypeColor(eventType) {
    const colors = {
      'physical': '#3182CE',
      'virtual': '#805AD5',
      'hybrid': '#38A169'
    };
    return colors[eventType] || '#718096';
  }

  static getApprovalColor(approvalStatus) {
    const colors = {
      'approved': '#38A169',
      'pending': '#D69E2E',
      'rejected': '#E53E3E'
    };
    return colors[approvalStatus] || '#718096';
  }

  static splitTextToLines(doc, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = doc.widthOfString(currentLine + ' ' + word);
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  // NEW: Method to generate banner-only PDF for social media sharing
  static async generateBannerPDF(ticket) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!ticket.shareableBanner?.generatedBanner?.url) {
          throw new Error('No shareable banner available for this ticket');
        }

        const doc = new PDFDocument({
          size: [1200, 630], // Social media banner size
          margin: 0
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Download and add banner image
        const response = await axios({
          method: 'GET',
          url: ticket.shareableBanner.generatedBanner.url,
          responseType: 'arraybuffer'
        });

        const bannerBuffer = Buffer.from(response.data);
        
        doc.image(bannerBuffer, 0, 0, {
          width: 1200,
          height: 630
        });

        // Add share text overlay
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF')
           .text('I\'m attending!', 50, 50);

        doc.fontSize(18)
           .font('Helvetica')
           .text(`Scan QR code to get your ticket for ${ticket.eventName}`, 50, 580);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = PDFService;