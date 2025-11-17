const sgMail = require('@sendgrid/mail');
const { 
  createResetTemplate, 
  createWelcomeTemplate, 
  createResendVerificationTemplate 
} = require("./emailTemplate");
const { createBookingTemplate } = require("./bookingTemplate");
const { createPaymentTemplate } = require("./paymentTemplate");
const PDFService = require('../service/pdfService'); 

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendMail = async ({ to, subject, html, attachments = [] }) => {
  console.log("📧 Attempting to send email via SendGrid to:", to);
  
  if (!process.env.SENDGRID_API_KEY) {
    console.error("❌ SENDGRID_API_KEY not set in environment");
    return false;
  }

  try {
    const msg = {
      to,
      from: process.env.EMAIL || 'noreply@eventry.com',
      subject,
      html,
      attachments
    };

    const response = await sgMail.send(msg);
    console.log("✅ Email sent successfully via SendGrid");
    return true;

  } catch (error) {
    console.error("❌ SendGrid error:", error.message);
    if (error.response?.body?.errors) {
      console.error("📋 Error details:", error.response.body.errors);
    }
    return false;
  }
};

// WELCOME EMAIL (Initial Registration)
const sendWelcomeEmail = async ({ fullName, clientUrl, email }) => {
  console.log("🔄 sendWelcomeEmail called for:", email);
  const subject = "Welcome to Eventry - Verify Your Email";
  const html = createWelcomeTemplate(fullName, clientUrl);
  return await sendMail({ to: email, subject, html });
};

// RESEND VERIFICATION EMAIL
const sendResendVerificationEmail = async ({ fullName, clientUrl, email }) => {
  console.log(" sendResendVerificationEmail called for:", email);
  const subject = "Verify Your Email - Eventry";
  const html = createResendVerificationTemplate(fullName, clientUrl);
  return await sendMail({ to: email, subject, html });
};

// PASSWORD RESET EMAIL
const sendResetEmail = async ({ fullName, clientUrl, email }) => {
  console.log(" sendResetEmail called for:", email);
  const subject = "Reset Your Password - Eventry";
  const html = createResetTemplate(fullName, clientUrl);
  return await sendMail({ to: email, subject, html });
};

// BOOKING CONFIRMATION EMAIL WITH PDF TICKETS
const sendBookingEmail = async ({ 
  fullName, 
  email, 
  eventName, 
  eventDate, 
  eventTime, 
  eventVenue, 
  eventAddress, 
  bookingId, 
  ticketDetails, // This should be array of ticket objects
  totalAmount, 
  clientUrl 
}) => {
  console.log("🎫 sendBookingEmail called for:", email);
  
  try {
    // Generate PDF attachments for each ticket
    const attachments = [];
    
    if (Array.isArray(ticketDetails) && ticketDetails.length > 0) {
      console.log(`📄 Generating ${ticketDetails.length} PDF ticket(s)`);
      
      for (const ticket of ticketDetails) {
        try {
          // Generate PDF for each ticket
          const pdfBuffer = await PDFService.generateTicketPDF(ticket);
          
          // Create clean filename using event name without "TKT"
          const cleanEventName = ticket.eventName
            .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .toLowerCase();
          
          const filename = `${cleanEventName}_ticket.pdf`;
          
          attachments.push({
            content: pdfBuffer.toString('base64'),
            filename: filename,
            type: 'application/pdf',
            disposition: 'attachment'
          });
          
          console.log(`✅ Generated PDF: ${filename}`);
        } catch (pdfError) {
          console.error(`❌ Failed to generate PDF for ticket:`, pdfError);
          // Continue with other tickets even if one fails
        }
      }
    } else {
      console.log("⚠️ No ticket details provided for PDF generation");
    }

    const subject = `Booking Confirmed - ${eventName}`;
    
    // Create email template - pass simple message since tickets are attached
    const html = createBookingTemplate(
      fullName, 
      eventName, 
      eventDate, 
      eventTime, 
      eventVenue, 
      eventAddress, 
      bookingId, 
      "Your tickets are attached as PDF files. Please download and save them for the event.", 
      totalAmount, 
      clientUrl
    );

    // Send email with PDF attachments
    const result = await sendMail({ 
      to: email, 
      subject, 
      html, 
      attachments 
    });

    if (result) {
      console.log(`✅ Booking email sent with ${attachments.length} PDF ticket(s) to ${email}`);
    } else {
      console.log(`❌ Failed to send booking email to ${email}`);
    }

    return result;

  } catch (error) {
    console.error("❌ Error in sendBookingEmail:", error);
    // Fallback: send email without attachments
    console.log("🔄 Attempting to send email without attachments...");
    
    const subject = `Booking Confirmed - ${eventName}`;
    const html = createBookingTemplate(
      fullName, 
      eventName, 
      eventDate, 
      eventTime, 
      eventVenue, 
      eventAddress, 
      bookingId, 
      "Your tickets are available in your account. Please check 'My Tickets' section.", 
      totalAmount, 
      clientUrl
    );
    
    return await sendMail({ to: email, subject, html });
  }
};

// PAYMENT CONFIRMATION EMAIL
const sendPaymentEmail = async ({ 
  fullName, 
  email, 
  eventName, 
  paymentId, 
  paymentDate, 
  amount, 
  paymentMethod, 
  bookingId, 
  clientUrl 
}) => {
  console.log(" sendPaymentEmail called for:", email);
  const subject = `Payment Confirmed - ${eventName}`;
  const html = createPaymentTemplate(
    fullName, 
    eventName, 
    paymentId, 
    paymentDate, 
    amount, 
    paymentMethod, 
    bookingId, 
    clientUrl
  );
  return await sendMail({ to: email, subject, html });
};

module.exports = { 
  sendWelcomeEmail, 
  sendResetEmail, 
  sendResendVerificationEmail,
  sendBookingEmail,
  sendPaymentEmail,
  sendMail 
};