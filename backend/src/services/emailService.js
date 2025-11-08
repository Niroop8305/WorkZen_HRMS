import nodemailer from 'nodemailer';

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

// Send welcome email with credentials
export const sendWelcomeEmail = async (userDetails) => {
  try {
    const transporter = createTransporter();

    const { email, full_name, employee_code, temporary_password, role, company_name } = userDetails;

    const mailOptions = {
      from: {
        name: 'Odoo HRMS',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: '🎉 Welcome to Odoo HRMS - Your Account Has Been Created',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #714B67 0%, #8B5F7D 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e0e0e0;
              border-top: none;
            }
            .credentials-box {
              background: #f8f9fa;
              border-left: 4px solid #714B67;
              padding: 20px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .credential-item {
              margin: 12px 0;
              display: flex;
              align-items: center;
            }
            .credential-label {
              font-weight: 600;
              color: #714B67;
              min-width: 160px;
            }
            .credential-value {
              background: #fff;
              padding: 8px 12px;
              border-radius: 4px;
              border: 1px solid #dee2e6;
              font-family: 'Courier New', monospace;
              flex: 1;
            }
            .password-value {
              background: #fff3cd;
              border-color: #ffc107;
              font-weight: 600;
              color: #856404;
              letter-spacing: 1px;
            }
            .warning-box {
              background: #fff3cd;
              border: 1px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .warning-box strong {
              color: #856404;
              display: block;
              margin-bottom: 8px;
            }
            .steps {
              background: #e8f4f8;
              padding: 20px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .steps h3 {
              color: #714B67;
              margin-top: 0;
            }
            .step {
              margin: 10px 0;
              padding-left: 25px;
              position: relative;
            }
            .step:before {
              content: "→";
              position: absolute;
              left: 0;
              color: #714B67;
              font-weight: bold;
            }
            .footer {
              background: #f8f9fa;
              padding: 20px;
              text-align: center;
              border-radius: 0 0 8px 8px;
              font-size: 14px;
              color: #6c757d;
              border: 1px solid #e0e0e0;
              border-top: none;
            }
            .button {
              display: inline-block;
              background: #714B67;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              margin: 20px 0;
              font-weight: 600;
            }
            .logo {
              font-size: 36px;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">🏢</div>
            <h1>Welcome to Odoo HRMS!</h1>
          </div>
          
          <div class="content">
            <p>Dear <strong>${full_name || 'User'}</strong>,</p>
            
            <p>Welcome to <strong>${company_name || 'Odoo India'}</strong>! Your account has been successfully created in our HRMS system.</p>
            
            <div class="credentials-box">
              <h3 style="margin-top: 0; color: #714B67;">Your Login Credentials</h3>
              
              <div class="credential-item">
                <span class="credential-label">Employee Code:</span>
                <span class="credential-value">${employee_code}</span>
              </div>
              
              <div class="credential-item">
                <span class="credential-label">Email Address:</span>
                <span class="credential-value">${email}</span>
              </div>
              
              <div class="credential-item">
                <span class="credential-label">Temporary Password:</span>
                <span class="credential-value password-value">${temporary_password}</span>
              </div>
              
              <div class="credential-item">
                <span class="credential-label">Role:</span>
                <span class="credential-value">${role}</span>
              </div>
            </div>
            
            <div class="warning-box">
              <strong>⚠️ Important Security Notice:</strong>
              <p style="margin: 5px 0;">
                This is a temporary password. For security reasons, please change your password immediately after your first login.
              </p>
            </div>
            
            <div class="steps">
              <h3>Getting Started</h3>
              <div class="step">Visit the HRMS login page</div>
              <div class="step">Enter your email address: <strong>${email}</strong></div>
              <div class="step">Enter the temporary password provided above</div>
              <div class="step">Change your password in the Settings section</div>
              <div class="step">Complete your profile information</div>
            </div>
            
            <center>
              <a href="http://localhost:5173/login" class="button">Login to HRMS</a>
            </center>
            
            <p style="margin-top: 30px;">
              If you have any questions or need assistance, please contact your HR department or system administrator.
            </p>
            
            <p>
              Best regards,<br>
              <strong>Odoo HRMS Team</strong>
            </p>
          </div>
          
          <div class="footer">
            <p>
              This is an automated message. Please do not reply to this email.<br>
              © ${new Date().getFullYear()} Odoo India. All rights reserved.
            </p>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};

// Test email configuration
export const testEmailConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('Email server connection successful');
    return { success: true, message: 'Email configuration is working' };
  } catch (error) {
    console.error('Email server connection failed:', error);
    return { success: false, error: error.message };
  }
};

// Send password change confirmation email
export const sendPasswordChangeEmail = async (email, userName) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: {
        name: 'Odoo HRMS',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: '🔒 Password Changed Successfully - Odoo HRMS',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #714B67 0%, #8B5F7D 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e0e0e0;
              border-top: none;
            }
            .info-box {
              background: #f8f9fa;
              border-left: 4px solid #28a745;
              padding: 20px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .warning-box {
              background: #fff3cd;
              border: 1px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              background: #f8f9fa;
              padding: 20px;
              text-align: center;
              border-radius: 0 0 8px 8px;
              font-size: 14px;
              color: #6c757d;
              border: 1px solid #e0e0e0;
              border-top: none;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🔒 Password Changed</h1>
          </div>
          
          <div class="content">
            <p>Dear <strong>${userName}</strong>,</p>
            
            <div class="info-box">
              <p style="margin: 0;">
                <strong>✅ Your password has been changed successfully!</strong>
              </p>
            </div>
            
            <p>
              This email confirms that your Odoo HRMS account password was changed on 
              <strong>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</strong>.
            </p>
            
            <div class="warning-box">
              <strong>⚠️ Did you make this change?</strong>
              <p style="margin: 5px 0 0 0;">
                If you did not change your password, please contact your system administrator 
                immediately or reset your password right away to secure your account.
              </p>
            </div>
            
            <p>
              <strong>Security Tips:</strong>
            </p>
            <ul>
              <li>Never share your password with anyone</li>
              <li>Use a unique password for your HRMS account</li>
              <li>Change your password regularly</li>
              <li>Enable two-factor authentication if available</li>
            </ul>
            
            <p>
              If you need any assistance, please contact your HR department or system administrator.
            </p>
            
            <p>
              Best regards,<br>
              <strong>Odoo HRMS Team</strong>
            </p>
          </div>
          
          <div class="footer">
            <p>
              This is an automated message. Please do not reply to this email.<br>
              © ${new Date().getFullYear()} Odoo India. All rights reserved.
            </p>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password change confirmation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Error sending password change email:', error);
    return { success: false, error: error.message };
  }
};

// Send password reset code email
export const sendPasswordResetCodeEmail = async (email, userName, resetCode) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: {
        name: 'Odoo HRMS',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: '🔐 Password Reset Code - Odoo HRMS',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #714B67 0%, #8B5F7D 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e0e0e0;
              border-top: none;
            }
            .code-box {
              background: #f8f9fa;
              border: 2px solid #714B67;
              padding: 30px;
              margin: 25px 0;
              text-align: center;
              border-radius: 8px;
            }
            .code {
              font-size: 36px;
              font-weight: bold;
              color: #714B67;
              letter-spacing: 8px;
              font-family: 'Courier New', monospace;
            }
            .warning-box {
              background: #fff3cd;
              border: 1px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              background: #f8f9fa;
              padding: 20px;
              text-align: center;
              border-radius: 0 0 8px 8px;
              font-size: 14px;
              color: #6c757d;
              border: 1px solid #e0e0e0;
              border-top: none;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          
          <div class="content">
            <p>Dear <strong>${userName}</strong>,</p>
            
            <p>
              We received a request to reset your password for your Odoo HRMS account. 
              Use the code below to complete the password reset process.
            </p>
            
            <div class="code-box">
              <p style="margin: 0 0 10px 0; color: #6c757d; font-size: 14px;">Your Reset Code:</p>
              <div class="code">${resetCode}</div>
              <p style="margin: 15px 0 0 0; color: #6c757d; font-size: 13px;">
                This code expires in <strong>10 minutes</strong>
              </p>
            </div>
            
            <div class="warning-box">
              <strong>⚠️ Security Notice:</strong>
              <p style="margin: 5px 0 0 0;">
                If you didn't request a password reset, please ignore this email. 
                Your password will remain unchanged.
              </p>
            </div>
            
            <p>
              <strong>How to reset your password:</strong>
            </p>
            <ol>
              <li>Go to your profile settings in Odoo HRMS</li>
              <li>Enter the reset code shown above</li>
              <li>Create a new password</li>
              <li>Save your changes</li>
            </ol>
            
            <p>
              If you need any assistance, please contact your HR department or system administrator.
            </p>
            
            <p>
              Best regards,<br>
              <strong>Odoo HRMS Team</strong>
            </p>
          </div>
          
          <div class="footer">
            <p>
              This is an automated message. Please do not reply to this email.<br>
              © ${new Date().getFullYear()} Odoo India. All rights reserved.
            </p>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset code email sent:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Error sending password reset code email:', error);
    return { success: false, error: error.message };
  }
};
