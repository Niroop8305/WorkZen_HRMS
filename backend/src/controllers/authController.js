import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, Role } from "../models/userModel.js";
import { EmployeeProfile } from "../models/profileModel.js";
import pool from "../config/database.js";
import {
  sendPasswordChangeEmail,
  sendPasswordResetByAdminEmail,
  sendPasswordResetCodeEmail,
} from "../config/email.js";

// Generate JWT Token
const generateToken = (userId, roleId, roleName) => {
  return jwt.sign({ userId, roleId, roleName }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// @desc    Register new user (Admin/HR can create)
// @route   POST /api/auth/register
// @access  Public (for initial admin) / Private (for other roles)
export const register = async (req, res) => {
  try {
    const {
      email,
      password,
      role_name,
      company_name,
      first_name,
      last_name,
      phone,
    } = req.body;

    // Validate input
    if (!email || !password || !role_name || !first_name) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Get role ID
    const role = await Role.findByName(role_name);
    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user
    const userId = await User.create({
      role_id: role.role_id,
      email,
      password_hash,
    });

    // Generate employee code in format: OIJODO20250001
    // OI -> Company initials (first two letters)
    // JODO -> First two letters of first and last name
    // 2025 -> Year of joining
    // 0001 -> Serial number padded
    const companyCode = (company_name || "Odoo India")
      .substring(0, 2)
      .toUpperCase();
    const firstNameInitials = (first_name || "").substring(0, 2).toUpperCase();
    const lastNameInitials = (last_name || first_name || "")
      .substring(0, 2)
      .toUpperCase();
    const yearOfJoining = new Date().getFullYear();
    const serialNumber = String(userId).padStart(4, "0");
    const employee_code = `${companyCode}${firstNameInitials}${lastNameInitials}${yearOfJoining}${serialNumber}`;

    // Create employee profile
    await EmployeeProfile.create({
      user_id: userId,
      employee_code,
      company_name: company_name || "Odoo India",
      first_name,
      last_name: last_name || null,
      phone: phone || null,
      date_of_joining: new Date(),
    });

    // Generate token
    const token = generateToken(userId, role.role_id, role.role_name);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        userId,
        email,
        role: role.role_name,
        employee_code,
        token,
      },
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
      error: error.message,
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Check if user exists
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          "Your account has been deactivated. Please contact administrator.",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Update last login
    await User.updateLastLogin(user.user_id);

    // Get employee profile
    const profile = await EmployeeProfile.findByUserId(user.user_id);

    // Generate token
    const token = generateToken(user.user_id, user.role_id, user.role_name);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        userId: user.user_id,
        email: user.email,
        role: user.role_name,
        profile: profile
          ? {
              employee_code: profile.employee_code,
              company_name: profile.company_name,
              full_name: `${profile.first_name} ${
                profile.last_name || ""
              }`.trim(),
              phone: profile.phone,
              department: profile.department,
              designation: profile.designation,
            }
          : null,
        token,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login",
      error: error.message,
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const profile = await EmployeeProfile.findByUserId(user.user_id);

    res.status(200).json({
      success: true,
      data: {
        userId: user.user_id,
        email: user.email,
        role: user.role_name,
        is_active: user.is_active,
        last_login: user.last_login,
        profile: profile || null,
      },
    });
  } catch (error) {
    console.error("GetMe Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Logout user (client-side token removal)
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logout successful",
  });
};

// @desc    Change user password
// @route   POST /api/auth/change-password
// @access  Private
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.userId;

    // Validate input
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide both old and new passwords",
      });
    }

    // Password strength validation
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be at least 8 characters with uppercase, lowercase, number, and special character (!@#$%^&*)",
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(
      oldPassword,
      user.password_hash
    );
    if (!isOldPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Check if new password is same as old password
    const isSamePassword = await bcrypt.compare(
      newPassword,
      user.password_hash
    );
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from the current password",
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await User.updatePassword(userId, newPasswordHash);

    // Get user profile for personalized email
    const profile = await EmployeeProfile.findByUserId(userId);
    const userName = profile
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : user.email;

    // Send confirmation email
    try {
      await sendPasswordChangeEmail(user.email, userName);
      console.log(
        `Password changed for user: ${user.email} - Confirmation email sent`
      );
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Don't fail the password change if email fails
    }

    res.status(200).json({
      success: true,
      message:
        "Password updated successfully! A confirmation email has been sent to your registered email address.",
    });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while changing password",
      error: error.message,
    });
  }
};

// @desc    Reset password for another user (Admin only)
// @route   POST /api/auth/reset-user-password
// @access  Private (Admin only)
export const resetUserPassword = async (req, res) => {
  try {
    const { targetUserId, newPassword } = req.body;
    const adminUserId = req.user.userId;
    const adminRole = req.user.roleName;

    // Check if user is admin
    if (adminRole !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Only administrators can reset passwords for other users",
      });
    }

    // Validate input
    if (!targetUserId || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide target user ID and new password",
      });
    }

    // Password strength validation
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be at least 8 characters with uppercase, lowercase, number, and special character (!@#$%^&*)",
      });
    }

    // Get target user
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Target user not found",
      });
    }

    // Prevent admin from resetting their own password this way
    if (parseInt(targetUserId) === parseInt(adminUserId)) {
      return res.status(400).json({
        success: false,
        message:
          "Please use the change password feature to update your own password",
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await User.updatePassword(targetUserId, newPasswordHash);

    // Get target user profile for personalized email
    const targetProfile = await EmployeeProfile.findByUserId(targetUserId);
    const targetUserName = targetProfile
      ? `${targetProfile.first_name} ${targetProfile.last_name || ""}`.trim()
      : targetUser.email;

    // Send email with new credentials
    try {
      await sendPasswordResetByAdminEmail(
        targetUser.email,
        targetUserName,
        newPassword
      );
      console.log(
        `Password reset by admin for user: ${targetUser.email} - Email sent with credentials`
      );
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      // Don't fail the password reset if email fails
    }

    res.status(200).json({
      success: true,
      message: `Password reset successfully for ${targetUser.email}. Credentials have been sent to their email address.`,
    });
  } catch (error) {
    console.error("Reset User Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while resetting password",
      error: error.message,
    });
  }
};

// @desc    Request password reset code
// @route   POST /api/auth/request-reset-code
// @access  Private
export const requestPasswordResetCode = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate 6-digit random code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiration time (10 minutes from now)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate any existing codes for this user
    await pool.query(
      "UPDATE password_reset_codes SET is_used = TRUE WHERE user_id = ? AND is_used = FALSE",
      [userId]
    );

    // Store the reset code in database
    await pool.query(
      "INSERT INTO password_reset_codes (user_id, reset_code, expires_at) VALUES (?, ?, ?)",
      [userId, resetCode, expiresAt]
    );

    // Get user profile for personalized email
    const profile = await EmployeeProfile.findByUserId(userId);
    const userName = profile
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : user.email;

    // Send verification code via email
    try {
      await sendPasswordResetCodeEmail(user.email, userName, resetCode);
      console.log(
        `Password reset code sent to: ${user.email} - Code: ${resetCode}`
      );
    } catch (emailError) {
      console.error("Failed to send verification code email:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification code. Please try again.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Verification code sent to your email. Please check your inbox and spam folder.",
      expiresIn: "10 minutes",
    });
  } catch (error) {
    console.error("Request Reset Code Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while requesting reset code",
      error: error.message,
    });
  }
};

// @desc    Verify reset code and change password
// @route   POST /api/auth/reset-password-with-code
// @access  Private
export const resetPasswordWithCode = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { resetCode, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!resetCode || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide reset code, new password, and confirmation",
      });
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Password strength validation
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be at least 8 characters with uppercase, lowercase, number, and special character (!@#$%^&*)",
      });
    }

    // Verify reset code
    const [codes] = await pool.query(
      `SELECT * FROM password_reset_codes 
       WHERE user_id = ? AND reset_code = ? AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, resetCode]
    );

    if (codes.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired verification code. Please request a new code.",
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if new password is same as old password
    const isSamePassword = await bcrypt.compare(
      newPassword,
      user.password_hash
    );
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from the current password",
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await User.updatePassword(userId, newPasswordHash);

    // Mark the reset code as used
    await pool.query(
      "UPDATE password_reset_codes SET is_used = TRUE WHERE reset_id = ?",
      [codes[0].reset_id]
    );

    // Get user profile for personalized email
    const profile = await EmployeeProfile.findByUserId(userId);
    const userName = profile
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : user.email;

    // Send confirmation email
    try {
      await sendPasswordChangeEmail(user.email, userName);
      console.log(
        `Password reset successfully for: ${user.email} - Confirmation email sent`
      );
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Don't fail the password reset if email fails
    }

    res.status(200).json({
      success: true,
      message:
        "Password reset successfully! You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset Password With Code Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while resetting password",
      error: error.message,
    });
  }
};
