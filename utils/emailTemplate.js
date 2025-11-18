// WELCOME EMAIL TEMPLATE

const createWelcomeTemplate = (fullName, clientUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to Eventry</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #f8fafc; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <!-- Header -->
      <div style="background-color: #FF6B35; padding: 32px 40px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Eventry</h1>
        <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 16px; font-weight: 400; opacity: 0.9;">Email Confirmation</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 48px 40px;">
        <!-- Greeting -->
        <div style="margin-bottom: 40px;">
          <h2 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 24px; font-weight: 600; letter-spacing: -0.25px;">
            Hello, ${fullName}!
          </h2>
          <p style="color: #64748b; margin: 0; font-size: 16px; font-weight: 400;">
            Welcome to Eventry! We're excited to have you join our community.
          </p>
        </div>

        <!-- Confirmation Card -->
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 32px; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="display: flex; align-items: center; margin-bottom: 24px;">
            <div style="background-color: #FF6B35; width: 4px; height: 32px; border-radius: 2px; margin-right: 16px;"></div>
            <h3 style="color: #1a1a1a; margin: 0; font-size: 20px; font-weight: 600;">Email Confirmation Required</h3>
          </div>
          
          <p style="color: #64748b; margin: 0 0 24px 0; font-size: 16px; font-weight: 400;">
            Thank you for registering on Eventry. To finish your registration and access all features, please confirm your email address by clicking the button below.
          </p>

          <!-- Status Badge -->
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 500;">
              ⏱️ This link expires in 24 hours
            </p>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${clientUrl}" target="_blank" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 600; transition: all 0.2s;">
              Confirm Your Email
            </a>
          </div>

          <p style="color: #64748b; margin: 0; font-size: 14px; font-weight: 400; text-align: center;">
            Didn't sign up for Eventry? You can safely ignore this email.
          </p>
        </div>

        <!-- Help Section -->
        <div style="background-color: #f8fafc; border-radius: 16px; padding: 24px; text-align: center;">
          <h4 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Need Help?</h4>
          <p style="color: #64748b; margin: 0 0 16px 0; font-size: 14px; font-weight: 400;">
            If you have any questions, feel free to contact our support team.
          </p>
          <a href="mailto:event_entry@outlook.com" style="color: #FF6B35; text-decoration: none; font-size: 14px; font-weight: 500;">
            event_entry@outlook.com
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

// RESEND VERIFICATION EMAIL TEMPLATE

const createResendVerificationTemplate = (fullName, clientUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify Your Email - Eventry</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #f8fafc; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <!-- Header -->
      <div style="background-color: #FF6B35; padding: 32px 40px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Eventry</h1>
        <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 16px; font-weight: 400; opacity: 0.9;">Email Verification</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 48px 40px;">
        <!-- Greeting -->
        <div style="margin-bottom: 40px;">
          <h2 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 24px; font-weight: 600; letter-spacing: -0.25px;">
            Hello, ${fullName}!
          </h2>
          <p style="color: #64748b; margin: 0; font-size: 16px; font-weight: 400;">
            We've generated a fresh verification link for your account.
          </p>
        </div>

        <!-- Verification Card -->
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 32px; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="display: flex; align-items: center; margin-bottom: 24px;">
            <div style="background-color: #FF6B35; width: 4px; height: 32px; border-radius: 2px; margin-right: 16px;"></div>
            <h3 style="color: #1a1a1a; margin: 0; font-size: 20px; font-weight: 600;">Verify Your Email to Access Eventry</h3>
          </div>
          
          <p style="color: #64748b; margin: 0 0 24px 0; font-size: 16px; font-weight: 400;">
            Your verification link has expired or wasn't received. No problem! Here's a fresh verification link to complete your registration.
          </p>

          <!-- Status Badge -->
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 500;">
              ⏱️ This link expires in 24 hours
            </p>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${clientUrl}" target="_blank" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 600; transition: all 0.2s;">
              Verify Your Email
            </a>
          </div>

          <!-- Troubleshooting Section -->
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-top: 24px;">
            <h4 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 14px; font-weight: 600;">Troubleshooting Tips</h4>
            <ul style="color: #64748b; margin: 0; padding-left: 20px; font-size: 14px; font-weight: 400;">
              <li style="margin-bottom: 8px;">Check your spam or junk folder</li>
              <li style="margin-bottom: 8px;">Make sure to click the link within 24 hours</li>
              <li>Still having issues? Contact our support team</li>
            </ul>
          </div>
        </div>

        <!-- Help Section -->
        <div style="background-color: #f8fafc; border-radius: 16px; padding: 24px; text-align: center;">
          <h4 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Need Help?</h4>
          <p style="color: #64748b; margin: 0 0 16px 0; font-size: 14px; font-weight: 400;">
            If you continue to experience issues, our support team is here to help.
          </p>
          <a href="mailto:event_entry@outlook.com" style="color: #FF6B35; text-decoration: none; font-size: 14px; font-weight: 500;">
            event_entry@outlook.com
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

// PASSWORD RESET EMAIL TEMPLATE
const createResetTemplate = (fullName, clientUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Password - Eventry</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #f8fafc; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <!-- Header -->
      <div style="background-color: #FF6B35; padding: 32px 40px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Eventry</h1>
        <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 16px; font-weight: 400; opacity: 0.9;">Password Reset</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 48px 40px;">
        <!-- Greeting -->
        <div style="margin-bottom: 40px;">
          <h2 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 24px; font-weight: 600; letter-spacing: -0.25px;">
            Hello, ${fullName}!
          </h2>
          <p style="color: #64748b; margin: 0; font-size: 16px; font-weight: 400;">
            We received a request to reset your password. Click the button below to proceed.
          </p>
        </div>

        <!-- Reset Card -->
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 32px; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="display: flex; align-items: center; margin-bottom: 24px;">
            <div style="background-color: #FF6B35; width: 4px; height: 32px; border-radius: 2px; margin-right: 16px;"></div>
            <h3 style="color: #1a1a1a; margin: 0; font-size: 20px; font-weight: 600;">Password Reset Confirmation</h3>
          </div>
          
          <p style="color: #64748b; margin: 0 0 24px 0; font-size: 16px; font-weight: 400;">
            To reset your password, please verify your email by clicking the button below. This will take you to a secure page where you can create a new password.
          </p>

          <!-- Warning Badge -->
          <div style="background-color: #fee2e2; border: 1px solid #ef4444; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #991b1b; margin: 0; font-size: 14px; font-weight: 500;">
              ⚠️ This link expires in 1 hour
            </p>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${clientUrl}" target="_blank" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 600; transition: all 0.2s;">
              Reset Password
            </a>
          </div>

          <!-- Security Notice -->
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-top: 24px;">
            <h4 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 14px; font-weight: 600;">Security Notice</h4>
            <p style="color: #64748b; margin: 0; font-size: 14px; font-weight: 400;">
              If you didn't request a password reset, please ignore this email or contact our support team if you have concerns about your account security.
            </p>
          </div>
        </div>

        <!-- Help Section -->
        <div style="background-color: #f8fafc; border-radius: 16px; padding: 24px; text-align: center;">
          <h4 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Need Help?</h4>
          <p style="color: #64748b; margin: 0 0 16px 0; font-size: 14px; font-weight: 400;">
            If you have any questions about resetting your password, contact our support team.
          </p>
          <a href="mailto:event_entry@outlook.com" style="color: #FF6B35; text-decoration: none; font-size: 14px; font-weight: 500;">
            event_entry@outlook.com
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

module.exports = {
  createResetTemplate,
  createWelcomeTemplate,
  createResendVerificationTemplate,
};
