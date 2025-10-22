const createPaymentTemplate = (fullName, eventName, paymentId, paymentDate, amount, paymentMethod, bookingId, clientUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Payment Confirmation - Eventry</title>
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
          <strong>Payment Confirmed for </strong
          ><span style="color: #FF6B35">${eventName}</span>
        </p>
        
        <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <h3 style="margin-top: 0; color: #FF6B35;">Payment Receipt</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; width: 40%;"><strong>Payment ID:</strong></td>
              <td style="padding: 8px 0;">${paymentId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Booking ID:</strong></td>
              <td style="padding: 8px 0;">${bookingId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Event:</strong></td>
              <td style="padding: 8px 0;">${eventName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Payment Date:</strong></td>
              <td style="padding: 8px 0;">${paymentDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Payment Method:</strong></td>
              <td style="padding: 8px 0;">${paymentMethod}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Amount Paid:</strong></td>
              <td style="padding: 8px 0; font-weight: bold; color: #FF6B35;">${amount}</td>
            </tr>
          </table>
        </div>

        <p>Thank you for your payment! Your booking is now confirmed.</p>
        
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
            background-color: #d1ecf1;
            border-left: 4px solid #17a2b8;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          "
        >
          <p style="margin: 0; font-size: 14px;">
            <strong>📧 What's Next?</strong><br>
            You'll receive your e-tickets separately within 24 hours. Please keep this payment confirmation for your records.
          </p>
        </div>

        <p><strong>Need assistance?</strong><br>
        If you have any questions about your payment or booking, please contact our support team.</p>

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

module.exports = { createPaymentTemplate };