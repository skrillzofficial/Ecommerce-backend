const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

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
        this.addHeader(doc, ticket);
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

  static addHeader(doc, ticket) {
    // Title
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#2D3748')
       .text('EVENT TICKET', 50, 50, { align: 'center' });

    // Ticket Number
    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#718096')
       .text(`Ticket #: ${ticket.ticketNumber}`, 50, 85, { align: 'center' });

    doc.moveTo(50, 110)
       .lineTo(545, 110)
       .strokeColor('#E2E8F0')
       .lineWidth(1)
       .stroke();
  }

  static addEventDetails(doc, ticket) {
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#2D3748')
       .text(ticket.eventId.title, 50, 130);

    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#4A5568');

    let yPosition = 160;

    // Event Date
    const eventDate = new Date(ticket.eventId.startDate).toLocaleDateString();
    doc.text(`Date: ${eventDate}`, 50, yPosition);
    
    // Event Time
    doc.text(`Time: ${ticket.eventId.time}`, 250, yPosition);
    yPosition += 25;

    // Venue
    if (ticket.eventId.venue) {
      doc.text(`Venue: ${ticket.eventId.venue}`, 50, yPosition);
      yPosition += 25;
    }

    // Address
    if (ticket.eventId.address) {
      doc.text(`Address: ${ticket.eventId.address}`, 50, yPosition);
      yPosition += 25;
    }

    doc.moveTo(50, yPosition)
       .lineTo(545, yPosition)
       .strokeColor('#E2E8F0')
       .lineWidth(1)
       .stroke();

    return yPosition + 20;
  }

  static addTicketDetails(doc, ticket) {
    let yPosition = 280;

    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#2D3748')
       .text('Ticket Details', 50, yPosition);

    yPosition += 30;

    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#4A5568');

    // Ticket Type
    doc.text(`Ticket Type: ${ticket.ticketType}`, 50, yPosition);
    doc.text(`Quantity: ${ticket.quantity}`, 300, yPosition);
    yPosition += 20;

    // Price
    const priceText = ticket.ticketPrice === 0 ? 'FREE' : `₦${ticket.ticketPrice.toLocaleString()}`;
    doc.text(`Price: ${priceText}`, 50, yPosition);
    yPosition += 20;

    // Attendee
    doc.text(`Attendee: ${ticket.userName}`, 50, yPosition);
    yPosition += 20;

    // Purchase Date
    const purchaseDate = new Date(ticket.purchaseDate).toLocaleDateString();
    doc.text(`Purchase Date: ${purchaseDate}`, 50, yPosition);
  }

  static addQRCode(doc, qrCodeImage) {
    const qrCodeX = 400;
    const qrCodeY = 280;
    const qrCodeSize = 120;

    doc.image(qrCodeImage, qrCodeX, qrCodeY, {
      width: qrCodeSize,
      height: qrCodeSize
    });

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#718096')
       .text('Scan QR Code at entrance', qrCodeX, qrCodeY + qrCodeSize + 10, {
         width: qrCodeSize,
         align: 'center'
       });
  }

  static addFooter(doc, ticket) {
    const footerY = 700;

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#718096')
       .text('Terms & Conditions:', 50, footerY)
       .text('- This ticket is non-transferable', 50, footerY + 15)
       .text('- Please arrive 30 minutes before the event', 50, footerY + 30)
       .text('- Present this ticket or QR code at entrance', 50, footerY + 45)
       .text(`- Valid for ${ticket.eventId.title} only`, 50, footerY + 60);

    // Organizer info
    if (ticket.organizerId?.companyName) {
      doc.text(`Organizer: ${ticket.organizerId.companyName}`, 50, footerY + 85);
    }
  }
}

module.exports = PDFService;