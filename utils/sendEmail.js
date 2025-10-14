const nodemailer = require("nodemailer");
const { createResetTemplate, createWelcomeTemplate } = require("./emailTemplate");

const sendMail = async ({ to, subject, html }) => {
  console.log("📧 Attempting to send email to:", to);
  
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465, // Changed from default 587
    secure: true, // Use SSL
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD,
    },
  });

  try {
    await transporter.verify();
    console.log("✅ SMTP connection verified");
    
    const info = await transporter.sendMail({
      from: process.env.EMAIL,
      to: to,
      subject: subject,
      html: html,
    });
    
    console.log("✅ Email sent successfully:", info.response);
    return true;
    
  } catch (error) {
    console.error("❌ Email sending failed:");
    console.error("   Error:", error.message);
    console.error("   Code:", error.code);
    console.error("   Config - EMAIL:", process.env.EMAIL ? "SET" : "NOT SET");
    console.error("   Config - PASSWORD:", process.env.PASSWORD ? "SET" : "NOT SET");
    return false;
  }
};

const sendWelcomeEmail = async ({ fullName, clientUrl, email }) => {
  console.log("🔄 sendWelcomeEmail called for:", email);
  const subject = "Welcome to Eventry";
  const html = createWelcomeTemplate(fullName, clientUrl);
  return await sendMail({ to: email, subject, html });
};

const sendResetEmail = async ({ fullName, clientUrl, email }) => {
  console.log("🔄 sendResetEmail called for:", email);
  const subject = "Password Reset";
  const html = createResetTemplate(fullName, clientUrl);
  return await sendMail({ to: email, subject, html });
};

module.exports = { sendWelcomeEmail, sendResetEmail };