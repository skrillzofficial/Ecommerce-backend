const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const axios = require('axios');

class PDFService {
  static async generateTicketPDF(ticket) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 0,
          layout: 'portrait'
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Generate QR Code using the actual qrCode field from your ticket
        const qrCodeData = ticket.qrCode || ticket.ticketNumber;
        const qrCodeImage = await QRCode.toDataURL(qrCodeData, {
          width: 300,
          margin: 0,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        // Modern 2025 design - Clean, minimal, tech-focused
        this.addModernBackground(doc);
        this.addModernHeader(doc, ticket);
        this.addEventSection(doc, ticket);
        this.addTicketDetailsSection(doc, ticket);
        this.addQRSection(doc, qrCodeImage, ticket);
        this.addSecurityFooter(doc, ticket);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  static addModernBackground(doc) {
    // Black background
    doc.rect(0, 0, 595, 842).fill('#000000');

    // Subtle grid pattern (optional - for tech feel)
    doc.strokeColor('#0a0a0a').lineWidth(0.5);
    for (let i = 0; i < 842; i += 30) {
      doc.moveTo(0, i).lineTo(595, i).stroke();
    }
    for (let i = 0; i < 595; i += 30) {
      doc.moveTo(i, 0).lineTo(i, 842).stroke();
    }

    // Main content container with border
    doc.rect(40, 40, 515, 762)
       .strokeColor('#1a1a1a')
       .lineWidth(1)
       .stroke();
  }

  static addModernHeader(doc, ticket) {
    // Status indicator dot
    const statusColor = this.getModernStatusColor(ticket.status);
    doc.circle(70, 70, 4).fill(statusColor);

    // Status text
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#666666')
       .text(ticket.status.toUpperCase(), 80, 67);

    // Ticket number - top right
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#333333')
       .text(ticket.ticketNumber, 70, 67, { align: 'right', width: 445 });

    // Main title
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#666666')
       .text('EVENT TICKET', 70, 110);

    doc.fontSize(32)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .text(ticket.eventName, 70, 125, { width: 455, lineGap: 5 });

    // Accent line under title
    const titleHeight = doc.heightOfString(ticket.eventName, { width: 455, fontSize: 32 });
    doc.moveTo(70, 135 + titleHeight)
       .lineTo(150, 135 + titleHeight)
       .strokeColor('#ff6b00')
       .lineWidth(3)
       .stroke();
  }

  static addEventSection(doc, ticket) {
    let yPos = 220;

    // Date & Time section
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('DATE & TIME', 70, yPos);

    yPos += 15;

    const eventDate = new Date(ticket.eventStartDate).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .text(eventDate, 70, yPos);

    const startTime = ticket.eventTime || 'TBA';
    const endTime = ticket.eventEndTime || '';
    const timeText = endTime ? `${startTime} - ${endTime}` : startTime;

    doc.fontSize(14)
       .font('Helvetica')
       .fillColor('#999999')
       .text(timeText, 70, yPos + 22);

    yPos += 60;

    // Location section
    if (ticket.eventVenue) {
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#666666')
         .text('LOCATION', 70, yPos);

      yPos += 15;

      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#FFFFFF')
         .text(ticket.eventVenue, 70, yPos, { width: 300 });

      if (ticket.eventAddress) {
        yPos += 20;
        doc.fontSize(12)
           .font('Helvetica')
           .fillColor('#999999')
           .text(ticket.eventAddress, 70, yPos, { width: 300 });
      }

      if (ticket.eventCity) {
        yPos += 18;
        doc.fontSize(12)
           .fillColor('#999999')
           .text(ticket.eventCity, 70, yPos);
      }

      yPos += 40;
    }

    // Event type badge
    const eventTypeBg = this.getEventTypeBg(ticket.eventType);
    doc.roundedRect(70, yPos, 90, 24, 6)
       .fill(eventTypeBg);

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .text(ticket.eventType.toUpperCase(), 70, yPos + 7, { 
         width: 90, 
         align: 'center' 
       });

    // Divider line
    doc.moveTo(70, yPos + 50)
       .lineTo(525, yPos + 50)
       .strokeColor('#1a1a1a')
       .lineWidth(1)
       .stroke();
  }

  static addTicketDetailsSection(doc, ticket) {
    let yPos = 480;

    // Section title
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('TICKET DETAILS', 70, yPos);

    yPos += 25;

    // Details grid - UPDATED to match your ticket fields
    const details = [
      { label: 'TYPE', value: ticket.ticketType },
      { label: 'QUANTITY', value: ticket.quantity.toString() },
      { label: 'ATTENDEE', value: ticket.userName },
      { label: 'EMAIL', value: ticket.userEmail },
    ];

    details.forEach((detail, index) => {
      const xPos = 70 + (index % 2) * 227.5;
      const yOffset = Math.floor(index / 2) * 55;

      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#666666')
         .text(detail.label, xPos, yPos + yOffset);

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#FFFFFF')
         .text(detail.value, xPos, yPos + yOffset + 12, { width: 210 });
    });

    yPos += 120;

    // Price section
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('PRICE', 70, yPos);

    const priceText = ticket.ticketPrice === 0 ? 'FREE' : `₦${ticket.ticketPrice.toLocaleString()}`;
    const priceColor = ticket.ticketPrice === 0 ? '#00ff88' : '#ff6b00';

    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor(priceColor)
       .text(priceText, 70, yPos + 12);

    // Purchase date - UPDATED to use purchaseDate field
    const purchaseDate = new Date(ticket.purchaseDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#666666')
       .text(`Purchased on ${purchaseDate}`, 70, yPos + 42);
  }

  static addQRSection(doc, qrCodeImage, ticket) {
    const qrSize = 140;
    const qrX = 385;
    const qrY = 480;

    // QR background container
    doc.roundedRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 70, 12)
       .fill('#0a0a0a');

    // QR border
    doc.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 8)
       .strokeColor('#1a1a1a')
       .lineWidth(1)
       .stroke();

    // QR code
    doc.image(qrCodeImage, qrX, qrY, {
      width: qrSize,
      height: qrSize
    });

    // Instructions
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .text('SCAN TO VERIFY', qrX - 15, qrY + qrSize + 15, {
         width: qrSize + 30,
         align: 'center'
       });

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Present at entrance', qrX - 15, qrY + qrSize + 30, {
         width: qrSize + 30,
         align: 'center'
       });
  }

  static addSecurityFooter(doc, ticket) {
    const footerY = 720;

    // Security bar
    doc.rect(40, footerY, 515, 1)
       .fill('#1a1a1a');

    // Security code - UPDATED to use securityCode field
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('SECURITY CODE', 70, footerY + 15);

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor('#ff6b00')
       .text(ticket.securityCode, 70, footerY + 27);

    // Terms
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor('#333333')
       .text(
         'Non-transferable • Valid ID required • Subject to event terms & conditions',
         70,
         footerY + 45,
         { width: 455, align: 'center' }
       );

    // Organizer info - bottom right - UPDATED to use organizerName field
    if (ticket.organizerName) {
      doc.fontSize(7)
         .fillColor('#666666')
         .text(
           `Organized by ${ticket.organizerName}${ticket.organizerCompany ? ' · ' + ticket.organizerCompany : ''}`,
           70,
           footerY + 60,
           { width: 455, align: 'right' }
         );
    }

    // Watermark - very subtle
    doc.fontSize(6)
       .fillColor('#0a0a0a')
       .text(`Generated ${new Date().toISOString()}`, 70, 790, {
         width: 455,
         align: 'center'
       });
  }

  // Helper methods
  static getModernStatusColor(status) {
    const colors = {
      'confirmed': '#00ff88',
      'checked-in': '#00aaff',
      'pending-approval': '#ffaa00',
      'cancelled': '#ff3366',
      'expired': '#666666',
      'rejected': '#ff3366'
    };
    return colors[status] || '#666666';
  }

  static getEventTypeBg(eventType) {
    const colors = {
      'physical': '#1a4d80',
      'virtual': '#6b2d80',
      'hybrid': '#1a805d'
    };
    return colors[eventType] || '#333333';
  }

  // Banner-only PDF for social sharing
  static async generateBannerPDF(ticket) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!ticket.shareableBanner?.generatedBanner?.url) {
          throw new Error('No shareable banner available for this ticket');
        }

        const doc = new PDFDocument({
          size: [1200, 630],
          margin: 0
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

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

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = PDFService;