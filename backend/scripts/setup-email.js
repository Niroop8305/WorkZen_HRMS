#!/usr/bin/env node

/**
 * Email Configuration Setup Script
 * Run this script to configure email settings for WorkZen HRMS
 */

import readline from "readline";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function setupEmail() {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║     WorkZen HRMS - Email Configuration Setup          ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  console.log("This wizard will help you configure email notifications.\n");

  // Step 1: Email Provider
  console.log("📧 Step 1: Email Provider");
  console.log("Choose your email provider:");
  console.log("  1. Gmail (recommended)");
  console.log("  2. Outlook/Hotmail");
  console.log("  3. Yahoo");
  console.log("  4. Custom SMTP\n");

  const provider = await question("Enter choice (1-4): ");

  let service;
  switch (provider.trim()) {
    case "1":
      service = "gmail";
      break;
    case "2":
      service = "hotmail";
      break;
    case "3":
      service = "yahoo";
      break;
    case "4":
      service = "custom";
      break;
    default:
      console.log("Invalid choice. Defaulting to Gmail.");
      service = "gmail";
  }

  // Step 2: Email credentials
  console.log("\n📝 Step 2: Email Credentials");
  const emailUser = await question("Enter your email address: ");
  const emailPass = await question(
    "Enter your app password (will not be displayed): "
  );

  // Step 3: Update .env file
  console.log("\n💾 Step 3: Updating configuration...");

  const envPath = path.join(__dirname, "..", "..", ".env");
  let envContent = "";

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }

  // Update or add email configuration
  const emailUserRegex = /EMAIL_USER=.*/;
  const emailPassRegex = /EMAIL_PASSWORD=.*/;

  if (emailUserRegex.test(envContent)) {
    envContent = envContent.replace(emailUserRegex, `EMAIL_USER=${emailUser}`);
  } else {
    envContent += `\nEMAIL_USER=${emailUser}`;
  }

  if (emailPassRegex.test(envContent)) {
    envContent = envContent.replace(
      emailPassRegex,
      `EMAIL_PASSWORD=${emailPass}`
    );
  } else {
    envContent += `\nEMAIL_PASSWORD=${emailPass}`;
  }

  fs.writeFileSync(envPath, envContent);

  console.log("✅ Configuration saved to .env file\n");

  // Step 4: Test email
  const testEmail = await question(
    "Would you like to send a test email? (y/n): "
  );

  if (testEmail.toLowerCase() === "y") {
    console.log("\n📤 Sending test email...");
    console.log("Please run: npm run test:email\n");
  }

  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║              Configuration Complete! ✅                 ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  console.log("Next steps:");
  console.log("  1. Restart your backend server");
  console.log("  2. Test password change functionality");
  console.log("  3. Check your email for notifications\n");

  if (service === "gmail") {
    console.log("📌 Gmail Users:");
    console.log("   Make sure you generated an App Password:");
    console.log("   https://myaccount.google.com/apppasswords\n");
  }

  rl.close();
}

setupEmail().catch((error) => {
  console.error("❌ Error during setup:", error);
  rl.close();
  process.exit(1);
});
