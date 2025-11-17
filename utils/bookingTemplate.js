const createBookingTemplate = (fullName, eventName, eventDate, eventTime, eventVenue, eventAddress, bookingId, ticketDetails, totalAmount, clientUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Booking Confirmed - Eventry</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #f8fafc; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <!-- Header -->
      <div style="background-color: #FF6B35; padding: 32px 40px; text-align: center;">
        <div style="display: inline-block; background-color: #ffffff; padding: 16px; border-radius: 16px; margin-bottom: 20px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 5V7M15 11V13M15 17V19M5 5C3.89543 5 3 5.89543 3 7V10C4.10457 10 5 10.8954 5 12C5 13.1046 4.10457 14 3 14V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V14C19.8954 14 19 13.1046 19 12C19 10.8954 19.8954 10 21 10V7C21 5.89543 20.1046 5 19 5H5Z" stroke="#FF6B35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Eventry</h1>
        <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 16px; font-weight: 400; opacity: 0.9;">Booking Confirmation</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 48px 40px;">
        <!-- Greeting -->
        <div style="margin-bottom: 40px;">
          <h2 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 24px; font-weight: 600; letter-spacing: -0.25px;">
            Hello, ${fullName}!
          </h2>
          <p style="color: #64748b; margin: 0; font-size: 16px; font-weight: 400;">
            Your booking has been successfully confirmed. We're excited to have you join us!
          </p>
        </div>

        <!-- Event Card -->
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 32px; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="display: flex; align-items: center; margin-bottom: 24px;">
            <div style="background-color: #FF6B35; width: 4px; height: 32px; border-radius: 2px; margin-right: 16px;"></div>
            <h3 style="color: #1a1a1a; margin: 0; font-size: 20px; font-weight: 600;">Event Details</h3>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr; gap: 20px;">
            <div style="display: flex; align-items: flex-start;">
              <div style="background-color: #f1f5f9; padding: 12px; border-radius: 12px; margin-right: 16px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="#FF6B35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M16 2V6M8 2V6M3 10H21" stroke="#FF6B35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div>
                <p style="color: #64748b; margin: 0 0 4px 0; font-size: 14px; font-weight: 500;">Event</p>
                <p style="color: #1a1a1a; margin: 0; font-size: 16px; font-weight: 600;">${eventName}</p>
              </div>
            </div>

            <div style="display: flex; align-items: flex-start;">
              <div style="background-color: #f1f5f9; padding: 12px; border-radius: 12px; margin-right: 16px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#FF6B35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div>
                <p style="color: #64748b; margin: 0 0 4px 0; font-size: 14px; font-weight: 500;">Date & Time</p>
                <p style="color: #1a1a1a; margin: 0; font-size: 16px; font-weight: 600;">${eventDate} at ${eventTime}</p>
              </div>
            </div>

            <div style="display: flex; align-items: flex-start;">
              <div style="background-color: #f1f5f9; padding: 12px; border-radius: 12px; margin-right: 16px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.657 16.657L13.414 20.9C13.039 21.2746 12.5306 21.485 12.0005 21.485C11.4704 21.485 10.962 21.2746 10.587 20.9L6.343 16.657C5.22422 15.5381 4.46234 14.1127 4.15369 12.5608C3.84504 11.0089 4.00349 9.40047 4.60901 7.93868C5.21452 6.4769 6.2399 5.22749 7.55548 4.34846C8.87107 3.46943 10.4178 3.00024 12 3.00024C13.5822 3.00024 15.1289 3.46943 16.4445 4.34846C17.7601 5.22749 18.7855 6.4769 19.391 7.93868C19.9965 9.40047 20.155 11.0089 19.8463 12.5608C19.5377 14.1127 18.7758 15.5381 17.657 16.657Z" stroke="#FF6B35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M15 11C15 12.6569 13.6569 14 12 14C10.3431 14 9 12.6569 9 11C9 9.34315 10.3431 8 12 8C13.6569 8 15 9.34315 15 11Z" stroke="#FF6B35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div>
                <p style="color: #64748b; margin: 0 0 4px 0; font-size: 14px; font-weight: 500;">Venue</p>
                <p style="color: #1a1a1a; margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">${eventVenue}</p>
                <p style="color: #64748b; margin: 0; font-size: 14px; font-weight: 400;">${eventAddress}</p>
              </div>
            </div>

            <div style="display: flex; align-items: flex-start;">
              <div style="background-color: #f1f5f9; padding: 12px; border-radius: 12px; margin-right: 16px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#FF6B35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div>
                <p style="color: #64748b; margin: 0 0 4px 0; font-size: 14px; font-weight: 500;">Booking ID</p>
                <p style="color: #1a1a1a; margin: 0; font-size: 16px; font-weight: 600; font-family: 'Monaco', 'Menlo', monospace;">${bookingId}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Ticket Information -->
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 32px; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="display: flex; align-items: center; margin-bottom: 24px;">
            <div style="background-color: #FF6B35; width: 4px; height: 32px; border-radius: 2px; margin-right: 16px;"></div>
            <h3 style="color: #1a1a1a; margin: 0; font-size: 20px; font-weight: 600;">Ticket Information</h3>
          </div>
          
          <div style="background-color: #f8fafc; border-radius: 16px; padding: 24px;">
            <p style="color: #64748b; margin: 0 0 16px 0; font-size: 14px; font-weight: 500;">Your tickets have been attached as PDF files</p>
            <p style="color: #1a1a1a; margin: 0; font-size: 16px; font-weight: 400;">
              Please download and save your ticket PDFs. You'll need to present them at the venue for entry.
            </p>
          </div>

          <!-- Total Amount -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
            <span style="color: #64748b; font-size: 16px; font-weight: 500;">Total Amount</span>
            <span style="color: #FF6B35; font-size: 24px; font-weight: 700;">${totalAmount}</span>
          </div>
        </div>

        <!-- Status Badge -->
        <div style="background-color: #dcfce7; border: 1px solid #22c55e; border-radius: 16px; padding: 20px; margin-bottom: 32px; text-align: center;">
          <div style="display: inline-flex; align-items: center; background-color: #22c55e; color: #ffffff; padding: 8px 16px; border-radius: 20px; margin-bottom: 12px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;">
              <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span style="font-size: 14px; font-weight: 600;">Booking Confirmed</span>
          </div>
          <p style="color: #166534; margin: 0; font-size: 16px; font-weight: 500;">
            Your tickets are ready! Check your email attachments for the PDF tickets.
          </p>
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin-bottom: 40px;">
          <a href="${clientUrl}" target="_blank" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 600; transition: all 0.2s;">
            View Booking Details
          </a>
        </div>

        <!-- Help Section -->
        <div style="background-color: #f8fafc; border-radius: 16px; padding: 24px; text-align: center;">
          <h4 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Need Help?</h4>
          <p style="color: #64748b; margin: 0 0 16px 0; font-size: 14px; font-weight: 400;">
            Contact our support team if you have any questions about your booking.
          </p>
          <a href="mailto:support@eventry.com" style="color: #FF6B35; text-decoration: none; font-size: 14px; font-weight: 500;">
            support@eventry.com
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f1f5f9; padding: 32px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="color: #64748b; margin: 0 0 16px 0; font-size: 14px; font-weight: 400;">
          If you're having trouble with the button above, copy and paste this URL into your browser:
        </p>
        <a href="${clientUrl}" target="_blank" style="color: #FF6B35; text-decoration: none; font-size: 14px; font-weight: 500; word-break: break-all;">
          ${clientUrl}
        </a>
        <p style="color: #94a3b8; margin: 24px 0 0 0; font-size: 12px; font-weight: 400;">
          © 2025 Eventry. All rights reserved.
        </p>
      </div>
    </div>
  </body>
</html>
`;
};

module.exports = { createBookingTemplate };