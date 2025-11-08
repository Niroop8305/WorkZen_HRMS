import {
  sendPasswordChangeEmail,
  sendPasswordResetByAdminEmail,
} from "./email.js";

// Test email functionality
async function testEmailService() {
  console.log("🧪 Testing Email Service...\n");

  // Test 1: Password Change Email
  console.log("Test 1: Sending password change confirmation email...");
  const testEmail = process.env.EMAIL_USER; // Send to yourself for testing
  const testName = "Test User";

  try {
    const result1 = await sendPasswordChangeEmail(testEmail, testName);
    if (result1.success) {
      console.log("✅ Password change email sent successfully!");
      console.log(`   Message ID: ${result1.messageId}\n`);
    } else {
      console.log("❌ Failed to send password change email");
      console.log(`   Error: ${result1.error}\n`);
    }
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
    if (result2.success) {
      console.log("✅ Password reset email sent successfully!");
      console.log(`   Message ID: ${result2.messageId}\n`);
    } else {
      console.log("❌ Failed to send password reset email");
      console.log(`   Error: ${result2.error}\n`);
    }
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
