const createWelcomeTemplate = (fullName, clientUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to Eventry</title>
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
          <strong>Email Confirmation, Before </strong
          ><span style="color: #FF6B35">We get started</span>
        </p>
        <p>
          Thank you for registering on Eventry, to finish your registration
          please confirm your email by clicking on the button below:
        </p>

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
            >CONFIRM YOUR EMAIL</a
          >
        </div>
        <p>Didn't sign up for Eventry? Let us know.</p>
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

// ============================================
// RESEND VERIFICATION EMAIL TEMPLATE
// ============================================
const createResendVerificationTemplate = (fullName, clientUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify Your Email - Eventry</title>
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
          <strong>Verify Your Email to </strong
          ><span style="color: #FF6B35">Access Eventry</span>
        </p>
        <p>
          Your verification link has expired or wasn't received. No problem!
          Here's a fresh verification link to complete your registration:
        </p>

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
            >VERIFY YOUR EMAIL</a
          >
        </div>

        <div
          style="
            background-color: #fff3cd;
            border-left: 4px solid #FF6B35;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          "
        >
          <p style="margin: 0; font-size: 14px">
            <strong>⏱️ This link expires in 24 hours</strong>
          </p>
        </div>

        <p>
          <strong>Troubleshooting:</strong>
          <br />
          • Check your spam or junk folder
          <br />
          • Make sure to click the link within 24 hours
          <br />
          • Still having issues? Contact our support team
        </p>

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

const createResetTemplate = (fullName, clientUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Eventry Reset Password</title>
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
        <p style="font-size: 22px; color: #000">
          Password Reset Confirmation: Please verify your email to proceed.
        </p>
        <p>Password Reset Confirmation: Please verify your email to proceed.</p>

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
            >RESET PASSWORD</a
          >
        </div>

        <div
          style="
            background-color: #f8d7da;
            border-left: 4px solid #FF6B35;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          "
        >
          <p style="margin: 0; font-size: 14px">
            <strong>⚠️ This link expires in 1 hour</strong>
          </p>
        </div>

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

module.exports = { 
  createResetTemplate, 
  createWelcomeTemplate, 
  createResendVerificationTemplate 
};