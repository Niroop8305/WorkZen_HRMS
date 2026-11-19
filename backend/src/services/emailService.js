import {
  createTransporter,
  deliveryResult,
  emailTransportMode,
  failureResult,
  skippedResult,
  smtpConfigured,
} from "../config/email.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Send welcome email with credentials
export const sendWelcomeEmail = async (userDetails) => {
  if (!smtpConfigured()) {
    return skippedResult("SMTP credentials are not configured");
  }
  try {
    const transporter = createTransporter();

    const {
      email,
      full_name,
      employee_code,
      temporary_password,
      role,
      company_name,
    } = userDetails;

    const mailOptions = {
      from: {
        name: "Odoo HRMS",
        address: process.env.EMAIL_USER,
      },
      to: email,
      subject: "🎉 Welcome to Odoo HRMS - Your Account Has Been Created",
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
            <p>Dear <strong>${full_name || "User"}</strong>,</p>
            
            <p>Welcome to <strong>${company_name || "Odoo India"}</strong>! Your account has been successfully created in our HRMS system.</p>
            
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
              <a href="${FRONTEND_URL}/login" class="button">Login to HRMS</a>
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
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Welcome email accepted:", info.messageId);
    return deliveryResult(info);
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return failureResult(error);
  }
};

// Test email configuration
export const testEmailConnection = async () => {
  // A diagnostic is not an exemption: an unconfigured deployment must not dial a
  // provider with the placeholder account, because that is a real connection
  // attempt and a real credential-probing failure against someone else's service.
  if (!smtpConfigured()) {
    return skippedResult("SMTP credentials are not configured");
  }

  const mode = emailTransportMode();

  // A connection test is the one path that would actively hand-shake and
  // authenticate with the provider, so under dry-run it reports the mode instead
  // of verifying. The test seam still runs, so its failure branch stays provable.
  if (mode === "dry-run") {
    console.log("Email connection test skipped: mail transport is dry-run");
    return {
      success: true,
      delivered: false,
      transport: mode,
      message:
        "Mail delivery is disabled in this environment (EMAIL_DRY_RUN=true); no SMTP connection was attempted",
    };
  }

  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log("Email server connection successful");
    return {
      success: true,
      delivered: true,
      transport: mode,
      message: "Email configuration is working",
    };
  } catch (error) {
    console.error("Email server connection failed:", error);
    return failureResult(error);
  }
};

export const sendLeaveNotification = async ({
  recipients,
  employeeEmail,
  employeeName,
  action,
  leaveType,
  startDate,
  endDate,
  totalDays,
  rejectionReason,
}) => {
  const to = Array.isArray(recipients) ? recipients.filter(Boolean) : [];
  if (employeeEmail) to.push(employeeEmail);
  if (to.length === 0) {
    return skippedResult("No recipients resolved for this notification");
  }
  if (!smtpConfigured()) {
    return skippedResult("SMTP credentials are not configured");
  }

  try {
    const transporter = createTransporter();
    const subject = `WorkZen Leave ${action}`;
    const reason = rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : "";
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: [...new Set(to)].join(","),
      subject,
      html: `<p>Leave status: <strong>${action}</strong></p>
        <p>Employee: ${employeeName || employeeEmail || "Employee"}</p>
        <p>Type: ${leaveType}</p>
        <p>Dates: ${startDate} to ${endDate} (${totalDays} day(s))</p>${reason}`,
    });
    return deliveryResult(info);
  } catch (error) {
    console.error("Leave notification failed:", error.message);
    return failureResult(error);
  }
};
