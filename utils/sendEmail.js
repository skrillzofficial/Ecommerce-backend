const nodemailer = require("nodemailer");
const { createResetTemplate, createWelcomeTemplate } = require("./emailTemplate");

const sendMail = async ({ to, subject, html }) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASSWORD,
        },
        tls: {
            rejectUnauthorized: false 
        }
    });
    
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL,
            to: to,
            subject: subject,
            html: html,
        });
        console.log(` Email sent successfully: ${info.response}`);
        return true; 
    } catch (error) {
        console.log(' Email sending failed:', error);
        return false; 
    }
}

// function to send an email
const sendWelcomeEmail = async ({ fullName, clientUrl, email }) => {
    const subject = "Welcome to the awesome Eventry";
    const html = createWelcomeTemplate(fullName, clientUrl);
    return await sendMail({ to: email, subject, html }); 
}

// function to send a password reset email
const sendResetEmail = async ({ fullName, clientUrl, email }) => {
    const subject = "Password Reset";
    const html = createResetTemplate(fullName, clientUrl);
    return await sendMail({ to: email, subject, html }); 
}

module.exports = { sendWelcomeEmail, sendResetEmail };