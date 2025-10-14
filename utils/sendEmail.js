const sgMail = require('@sendgrid/mail');
const { 
  createResetTemplate, 
  createWelcomeTemplate, 
  createResendVerificationTemplate 
} = require("./emailTemplate");

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendMail = async ({ to, subject, html }) => {
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
    };

    const response = await sgMail.send(msg);
    console.log("✅ Email sent successfully via SendGrid");
    console.log("   Response code:", response[0].statusCode);
    return true;

  } catch (error) {
    console.error("❌ SendGrid error:");
    console.error("   Message:", error.message);
    if (error.response?.body?.errors) {
      console.error("   Details:", error.response.body.errors);
    }
    return false;
  }
};

// ============================================
// WELCOME EMAIL (Initial Registration)
// ============================================
const sendWelcomeEmail = async ({ fullName, clientUrl, email }) => {
  console.log("🔄 sendWelcomeEmail called for:", email);
  const subject = "Welcome to Eventry - Verify Your Email";
  const html = createWelcomeTemplate(fullName, clientUrl);
  return await sendMail({ to: email, subject, html });
};

// ============================================
// RESEND VERIFICATION EMAIL
// ============================================
const sendResendVerificationEmail = async ({ fullName, clientUrl, email }) => {
  console.log("🔄 sendResendVerificationEmail called for:", email);
  const subject = "Verify Your Email - Eventry";
  const html = createResendVerificationTemplate(fullName, clientUrl);
  return await sendMail({ to: email, subject, html });
};

// ============================================
// PASSWORD RESET EMAIL
// ============================================
const sendResetEmail = async ({ fullName, clientUrl, email }) => {
  console.log("🔄 sendResetEmail called for:", email);
  const subject = "Reset Your Password - Eventry";
  const html = createResetTemplate(fullName, clientUrl);
  return await sendMail({ to: email, subject, html });
};

module.exports = { 
  sendWelcomeEmail, 
  sendResetEmail, 
  sendResendVerificationEmail,
  sendMail 
};