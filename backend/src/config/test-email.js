import {
  sendPasswordChangeEmail,
  sendPasswordResetByAdminEmail,
} from "./email.js";

// "success" only means the pipeline accepted the message. This CLI has to say
// which transport did the work, otherwise a dry-run run reports real delivery.
const report = (label, result) => {
  if (result.skipped) {
    console.log(`⏭️ ${label} skipped: ${result.reason}`);
    return;
  }
  if (!result.success) {
    console.log(`❌ ${label} failed: ${result.error}`);
    return;
  }
  if (result.delivered) {
    console.log(`✅ ${label} handed to the SMTP server: ${result.messageId}`);
  } else {
    console.log(
      `🧾 ${label} rendered without delivery (transport=${result.transport}); no SMTP connection was used`,
    );
  }
};

// Test email functionality
async function testEmailService() {
  console.log("🧪 Testing Email Service...\n");

  // Test 1: Password Change Email
  console.log("Test 1: Sending password change confirmation email...");
  const testEmail = process.env.EMAIL_USER; // Send to yourself for testing
  const testName = "Test User";

  try {
    const result1 = await sendPasswordChangeEmail(testEmail, testName);
    report("Password change confirmation email", result1);
  } catch (error) {
    console.log("❌ Error sending password change email:", error.message, "\n");
  }

  // Test 2: Admin Password Reset Email
  console.log("Test 2: Sending admin password reset email...");
  const tempPassword = "TempPass@123";

  try {
    const result2 = await sendPasswordResetByAdminEmail(
      testEmail,
      testName,
      tempPassword
    );
    report("Admin password reset email", result2);
  } catch (error) {
    console.log("❌ Error sending password reset email:", error.message, "\n");
  }

  console.log("🏁 Email service test completed!");
  console.log(
    "\nNote: Check your email inbox (and spam folder) for test emails."
  );
  process.exit(0);
}

// Run the test
testEmailService();
