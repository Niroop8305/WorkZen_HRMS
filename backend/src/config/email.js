import pkg from "nodemailer";
const { createTransport } = pkg;

// Create email transporter
const createTransporter = () => {
  // For development, you can use Gmail or any SMTP service
  // For production, use environment variables
  const transporter = createTransport({
    service: "gmail", // You can change this to other services like 'outlook', 'yahoo', etc.
    auth: {
      user: process.env.EMAIL_USER || "your-email@gmail.com", // Replace with your email
      pass: process.env.EMAIL_PASSWORD || "your-app-password", // Replace with your app password
    },
  });

  return transporter;
};

// Send password change confirmation email
export const sendPasswordChangeEmail = async (userEmail, userName) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER || "WorkZen HRMS <noreply@workzen.com>",
      to: userEmail,
      subject: "🔒 Password Changed Successfully - WorkZen HRMS",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #714B67 0%, #8b5f83 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 0 0 10px 10px;
            }
            .icon {
              font-size: 48px;
              margin-bottom: 10px;
            }
            .alert-box {
              background: #fff3cd;
              border: 1px solid #ffc107;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #856404;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 12px;
            }
            .button {
              display: inline-block;
              background-color: #714B67;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="icon">🔒</div>
            <h1>Password Changed Successfully</h1>
          </div>
          <div class="content">
            <p>Hi ${userName || "there"},</p>
            
            <p>This email confirms that your password for your WorkZen HRMS account has been successfully changed.</p>
            
            <div class="alert-box">
              <strong>⚠️ Security Notice:</strong> If you did not make this change, please contact your system administrator immediately.
            </div>
            
            <p><strong>Details:</strong></p>
            <ul>
              <li>Account: ${userEmail}</li>
              <li>Date & Time: ${new Date().toLocaleString()}</li>
              <li>Action: Password Changed</li>
            </ul>
            
            <p>For your security, we recommend:</p>
            <ul>
              <li>Using a strong, unique password</li>
              <li>Not sharing your password with anyone</li>
              <li>Logging out of shared devices</li>
            </ul>
            
            <p>If you have any questions or concerns, please contact your HR department or system administrator.</p>
            
            <p>Best regards,<br>
            <strong>WorkZen HRMS Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message from WorkZen HRMS. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} WorkZen HRMS. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Changed Successfully
        
        Hi ${userName || "there"},
        
        This email confirms that your password for your WorkZen HRMS account has been successfully changed.
        
        Security Notice: If you did not make this change, please contact your system administrator immediately.
        
        Details:
        - Account: ${userEmail}
        - Date & Time: ${new Date().toLocaleString()}
        - Action: Password Changed
        
        For your security, we recommend:
        - Using a strong, unique password
        - Not sharing your password with anyone
        - Logging out of shared devices
        
        Best regards,
        WorkZen HRMS Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Password change email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending password change email:", error);
    return { success: false, error: error.message };
  }
};

// Send password reset email (when admin resets password)
export const sendPasswordResetByAdminEmail = async (
  userEmail,
  userName,
  tempPassword
) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER || "WorkZen HRMS <noreply@workzen.com>",
      to: userEmail,
      subject: "🔑 Your Password Has Been Reset - WorkZen HRMS",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #714B67 0%, #8b5f83 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 0 0 10px 10px;
            }
            .icon {
              font-size: 48px;
              margin-bottom: 10px;
            }
            .password-box {
              background: white;
              border: 2px dashed #714B67;
              border-radius: 5px;
              padding: 20px;
              margin: 20px 0;
              text-align: center;
              font-size: 24px;
              font-weight: bold;
              color: #714B67;
              letter-spacing: 2px;
            }
            .alert-box {
              background: #ffebee;
              border: 1px solid #f44336;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #c62828;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="icon">🔑</div>
            <h1>Password Reset by Administrator</h1>
          </div>
          <div class="content">
            <p>Hi ${userName || "there"},</p>
            
            <p>Your password has been reset by a system administrator. Below is your temporary password:</p>
            
            <div class="password-box">
              ${tempPassword}
            </div>
            
            <div class="alert-box">
              <strong>⚠️ Important:</strong> Please change this temporary password immediately after logging in for security purposes.
            </div>
            
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Log in using your email and the temporary password above</li>
              <li>Go to your Profile → Security tab</li>
              <li>Change your password to something secure and memorable</li>
            </ol>
            
            <p><strong>Details:</strong></p>
            <ul>
              <li>Account: ${userEmail}</li>
              <li>Date & Time: ${new Date().toLocaleString()}</li>
              <li>Action: Password Reset by Admin</li>
            </ul>
            
            <p>If you did not request this password reset, please contact your system administrator immediately.</p>
            
            <p>Best regards,<br>
            <strong>WorkZen HRMS Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message from WorkZen HRMS. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} WorkZen HRMS. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset by Administrator
        
        Hi ${userName || "there"},
        
        Your password has been reset by a system administrator. Below is your temporary password:
        
        Temporary Password: ${tempPassword}
        
        Important: Please change this temporary password immediately after logging in for security purposes.
        
        Next Steps:
        1. Log in using your email and the temporary password above
        2. Go to your Profile → Security tab
        3. Change your password to something secure and memorable
        
        Details:
        - Account: ${userEmail}
        - Date & Time: ${new Date().toLocaleString()}
        - Action: Password Reset by Admin
        
        If you did not request this password reset, please contact your system administrator immediately.
        
        Best regards,
        WorkZen HRMS Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Password reset email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending password reset email:", error);
    return { success: false, error: error.message };
  }
};

// Send password reset verification code email
export const sendPasswordResetCodeEmail = async (
  userEmail,
  userName,
  resetCode
) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER || "WorkZen HRMS <noreply@workzen.com>",
      to: userEmail,
      subject: "🔐 Password Reset Verification Code - WorkZen HRMS",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #714B67 0%, #8b5f83 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 0 0 10px 10px;
            }
            .icon {
              font-size: 48px;
              margin-bottom: 10px;
            }
            .code-box {
              background: white;
              border: 3px solid #714B67;
              border-radius: 10px;
              padding: 30px;
              margin: 30px 0;
              text-align: center;
            }
            .verification-code {
              font-size: 36px;
              font-weight: bold;
              color: #714B67;
              letter-spacing: 8px;
              font-family: 'Courier New', monospace;
            }
            .alert-box {
              background: #fff3cd;
              border: 1px solid #ffc107;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #856404;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 12px;
            }
            .expiry-notice {
              background: #e3f2fd;
              border-left: 4px solid #2196F3;
              padding: 12px;
              margin: 15px 0;
              color: #1565c0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="icon">🔐</div>
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi ${userName || "there"},</p>
            
            <p>We received a request to reset your password for your WorkZen HRMS account. Use the verification code below to complete the password reset process:</p>
            
            <div class="code-box">
              <p style="margin: 0; font-size: 14px; color: #666;">Your Verification Code</p>
              <div class="verification-code">${resetCode}</div>
            </div>

            <div class="expiry-notice">
              <strong>⏰ This code will expire in 10 minutes</strong> for security purposes.
            </div>
            
            <div class="alert-box">
              <strong>⚠️ Security Warning:</strong> If you did not request this password reset, please ignore this email or contact your system administrator immediately. Your account may be at risk.
            </div>
            
            <p><strong>Steps to reset your password:</strong></p>
            <ol>
              <li>Enter the verification code: <strong>${resetCode}</strong></li>
              <li>Create a new strong password</li>
              <li>Confirm your new password</li>
            </ol>
            
            <p><strong>Details:</strong></p>
            <ul>
              <li>Account: ${userEmail}</li>
              <li>Date & Time: ${new Date().toLocaleString()}</li>
              <li>Valid for: 10 minutes</li>
            </ul>
            
            <p>For your security:</p>
            <ul>
              <li>Never share this code with anyone</li>
              <li>WorkZen staff will never ask for this code</li>
              <li>This code can only be used once</li>
            </ul>
            
            <p>If you need assistance, please contact your HR department or system administrator.</p>
            
            <p>Best regards,<br>
            <strong>WorkZen HRMS Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message from WorkZen HRMS. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} WorkZen HRMS. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        Hi ${userName || "there"},
        
        We received a request to reset your password for your WorkZen HRMS account.
        
        Your Verification Code: ${resetCode}
        
        This code will expire in 10 minutes for security purposes.
        
        Steps to reset your password:
        1. Enter the verification code: ${resetCode}
        2. Create a new strong password
        3. Confirm your new password
        
        Details:
        - Account: ${userEmail}
        - Date & Time: ${new Date().toLocaleString()}
        - Valid for: 10 minutes
        
        Security Warning: If you did not request this password reset, please ignore this email or contact your system administrator immediately.
        
        For your security:
        - Never share this code with anyone
        - WorkZen staff will never ask for this code
        - This code can only be used once
        
        Best regards,
        WorkZen HRMS Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Password reset verification code sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending verification code email:", error);
    return { success: false, error: error.message };
  }
};

export default {
  sendPasswordChangeEmail,
  sendPasswordResetByAdminEmail,
  sendPasswordResetCodeEmail,
};
