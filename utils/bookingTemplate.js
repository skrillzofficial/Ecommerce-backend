const createBookingTemplate = (fullName, eventName, eventDate, eventTime, eventVenue, eventAddress, bookingId, ticketDetails, totalAmount, clientUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Booking Confirmation - Eventry</title>
  </head>
  <body
    style="
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    "
  >
    <main style="border-radius: 10px">
      <div
        style="
          background-color: #FF6B35;
          padding: 30px;
          text-align: start;
          border-radius: 10px 10px 0 0;
        "
      >
        <h1 style="color: white; margin: 0; font-size: 28px">Eventry</h1>
      </div>
      <div
        style="
          background-color: #fafafb;
          padding: 30px;
          border-radius: 0 0 10px 10px;
        "
      >
        <p>Hi, ${fullName}</p>
        <p style="font-size: 18px; color: #000">
          <strong>Your booking for </strong
          ><span style="color: #FF6B35">${eventName}</span>
        </p>
        
        <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <h3 style="margin-top: 0; color: #FF6B35;">Booking Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; width: 30%;"><strong>Event:</strong></td>
              <td style="padding: 8px 0;">${eventName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Date & Time:</strong></td>
              <td style="padding: 8px 0;">${eventDate} at ${eventTime}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Venue:</strong></td>
              <td style="padding: 8px 0;">${eventVenue}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Address:</strong></td>
              <td style="padding: 8px 0;">${eventAddress}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Booking ID:</strong></td>
              <td style="padding: 8px 0;">${bookingId}</td>
            </tr>
          </table>
          
          <hr style="margin: 15px 0; border: none; border-top: 1px solid #e0e0e0;" />
          
          <h4 style="margin-bottom: 10px; color: #FF6B35;">Ticket Details</h4>
          ${ticketDetails}
          
          <hr style="margin: 15px 0; border: none; border-top: 1px solid #e0e0e0;" />
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; text-align: right;"><strong>Total Amount:</strong></td>
              <td style="padding: 8px 0; width: 30%; text-align: right;"><strong>${totalAmount}</strong></td>
            </tr>
          </table>
        </div>

        <p>Your booking has been confirmed! We're excited to have you join us.</p>
        
        <div style="text-align: start; margin: 30px 0">
          <a
            href="${clientUrl}"
            target="_blank"
            style="
              background-color: #FF6B35;
              color: white;
              padding: 14px 38px;
              text-decoration: none;
              border-radius: 2px;
              font-weight: bold;
              font-size: 16px;
              transition: background-color 0.3s;
              cursor: pointer;
            "
            >VIEW BOOKING DETAILS</a
          >
        </div>
        
        <div
          style="
            background-color: #d4edda;
            border-left: 4px solid #FF6B35;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          "
        >
          <p style="margin: 0; font-size: 14px;">
            <strong> Booking Confirmed</strong><br>
            See below for your tickets. Please bring along your ticket to the event venue.
          </p>
        </div>

        <p><strong>Need to make changes?</strong><br>
        You can manage your booking by clicking the button above or contact our support team if you have any questions.</p>

        <hr style="margin: 30px 0px" />
        <p>
          If you're having trouble with the button above, copy and paste the URL
          below into your web browser.
        </p>
        <a href="${clientUrl}" target="_blank" style="color: #FF6B35"
          >${clientUrl}</a
        >

        <p style="font-size: 13px">Email Sent by Eventry</p>
      </div>
    </main>
  </body>
</html>
`;
};

module.exports = { createBookingTemplate };