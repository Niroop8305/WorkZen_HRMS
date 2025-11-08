# Email Configuration Guide for WorkZen HRMS

This guide will help you set up email notifications for password changes and resets in the WorkZen HRMS system.

## Features

- ✅ Password change confirmation emails
- ✅ Admin password reset notifications with temporary password
- ✅ Professional HTML email templates
- ✅ Fallback to plain text for email clients that don't support HTML

## Quick Setup with Gmail

### Step 1: Enable 2-Step Verification

1. Go to your Google Account: https://myaccount.google.com/
2. Select **Security** from the left menu
3. Under "Signing in to Google," select **2-Step Verification**
4. Follow the prompts to enable it

### Step 2: Generate App Password

1. Go to: https://myaccount.google.com/apppasswords
2. Select **Mail** as the app
3. Select **Other (Custom name)** as the device
4. Type "WorkZen HRMS" or any name you prefer
5. Click **Generate**
6. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### Step 3: Update .env File

Edit your `backend/.env` file:

```env
# Email Configuration
EMAIL_USER=your-actual-email@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop
```

**Note:** Remove spaces from the app password!

### Step 4: Restart the Backend Server

```bash
cd backend
npm run dev
```

## Using Other Email Providers

### Outlook/Hotmail

```javascript
// In backend/src/config/email.js, change the service to:
service: "hotmail";
```

### Yahoo Mail

```javascript
// In backend/src/config/email.js, change the service to:
service: "yahoo";
```

### Custom SMTP Server

```javascript
// Replace the transporter configuration with:
const transporter = nodemailer.createTransporter({
  host: "smtp.your-domain.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});
```

## Email Templates

### Password Change Confirmation

Sent when a user changes their own password through the Security tab.

**Includes:**

- Security notice if unauthorized change
- Timestamp of change
- Best security practices
- Professional branding

### Admin Password Reset

Sent when an admin resets another user's password.

**Includes:**

- Temporary password in a highlighted box
- Step-by-step login instructions
- Security warnings
- Call to action to change password immediately

## Testing the Email Functionality

### Test Password Change

1. Log in to the system
2. Go to **My Profile → Security** tab
3. Fill in:
   - Old Password: Your current password
   - New Password: A new strong password
   - Confirm Password: Same as new password
4. Click **Save Changes**
5. Check your email inbox

### Test Admin Password Reset

1. Log in as an **Admin** user
2. Go to **My Profile → Security** tab
3. Scroll to the **Admin Password Reset** section
4. Select a user from the dropdown
5. Enter a new temporary password
6. Click **Reset User Password**
7. The selected user will receive an email with credentials

## Troubleshooting

### Emails Not Sending

1. **Check Console Logs**

   - Backend console will show email send status
   - Look for "✅ Password change email sent" or error messages

2. **Verify Credentials**

   - Double-check EMAIL_USER and EMAIL_PASSWORD in .env
   - Ensure no extra spaces in app password

3. **Gmail Specific Issues**

   - Confirm 2-Step Verification is enabled
   - Generate a new app password if needed
   - Check if "Less secure app access" is off (it should be)

4. **Firewall/Network Issues**

   - Ensure your server can connect to Gmail SMTP (smtp.gmail.com:587)
   - Check corporate firewall settings

5. **Email in Spam Folder**
   - Check spam/junk folder
   - Mark WorkZen emails as "Not Spam"

### Common Errors

**Error: Invalid login**

```
Solution: Re-generate your app password and update .env
```

**Error: Connection timeout**

```
Solution: Check your internet connection and firewall settings
```

**Error: self signed certificate**

```javascript
// Add to email.js transporter config:
tls: {
  rejectUnauthorized: false;
}
```

## Email Flow Diagram

```
User Changes Password
        ↓
Backend validates password
        ↓
Password updated in database
        ↓
Email service sends confirmation
        ↓
User receives email notification
```

```
Admin Resets User Password
        ↓
Backend validates admin permission
        ↓
New password generated/provided
        ↓
Password updated in database
        ↓
Email service sends temporary password
        ↓
User receives email with credentials
```

## Security Best Practices

1. **Never commit .env file** - It's already in .gitignore
2. **Use App Passwords** - Never use your actual email password
3. **Rotate credentials regularly** - Generate new app passwords periodically
4. **Monitor email logs** - Check for suspicious activity
5. **Use environment variables** - Never hardcode credentials

## Production Deployment

For production environments:

1. **Use a dedicated email service:**

   - SendGrid
   - AWS SES (Simple Email Service)
   - Mailgun
   - SparkPost

2. **Update email.js configuration:**

```javascript
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});
```

3. **Set up proper DNS records:**
   - SPF record
   - DKIM signature
   - DMARC policy

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review backend console logs
3. Verify all environment variables are set correctly
4. Test with a simple nodemailer test script

## Files Modified

- `backend/src/config/email.js` - Email service configuration
- `backend/src/controllers/authController.js` - Integration with password change/reset
- `backend/.env` - Email credentials (not committed to git)

---

**Note:** Email functionality is optional. The system will continue to work even if emails fail to send. However, users won't receive notifications about password changes.
