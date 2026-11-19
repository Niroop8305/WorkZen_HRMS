import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User, Role } from "../models/userModel.js";
import { EmployeeProfile } from "../models/profileModel.js";
import { sendWelcomeEmail } from "../services/emailService.js";

// Generate random password
const generateRandomPassword = () => {
  return crypto.randomBytes(8).toString("hex"); // 16 character password
};

// @desc    Create new user (Admin only)
// @route   POST /api/users/create
// @access  Private (Admin only)
export const createUser = async (req, res) => {
  try {
    const {
      email,
      role_name,
      company_name,
      first_name,
      last_name,
      phone,
      department,
      designation,
    } = req.body;

    // Check if requester is admin
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin users can create new users",
      });
    }

    // Validate input
    if (!email || !role_name || !first_name) {
      return res.status(400).json({
        success: false,
        message: "Please provide email, role, and first name",
      });
    }

    // Validate role (only Employee, HR Officer, Payroll Officer)
    const allowedRoles = ["Employee", "HR Officer", "Payroll Officer"];
    if (!allowedRoles.includes(role_name)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid role. Allowed roles: Employee, HR Officer, Payroll Officer",
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

    // Generate random password
    const randomPassword = generateRandomPassword();

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(randomPassword, salt);

    // Create user
    const userId = await User.create({
      role_id: role.role_id,
      email,
      password_hash,
    });

    // Generate employee code in format: OIJODO20220001
    const companyCode = (company_name || "Odoo India")
      .substring(0, 2)
      .toUpperCase();
    const firstNameInitials = first_name.substring(0, 2).toUpperCase();
    const lastNameInitials = (last_name || first_name)
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
      department: department || null,
      designation: designation || null,
      date_of_joining: new Date(),
    });

    // Prepare user details for email
    const userDetails = {
      email,
      full_name: `${first_name} ${last_name || ""}`.trim(),
      employee_code,
      temporary_password: randomPassword,
      role: role.role_name,
      company_name: company_name || "Odoo India",
    };

    // Send welcome email with credentials
    const emailResult = await sendWelcomeEmail(userDetails);

    // Three outcomes, deliberately not collapsed: mail that left for SMTP, mail the
    // environment declined to send, and mail that failed. Only the first is "sent".
    if (emailResult.delivered !== true) {
      console.warn(
        `Welcome email not delivered for ${email}; transport=${emailResult.transport}, reason=${emailResult.reason || emailResult.error || "delivery disabled"}`
      );
    }

    res.status(201).json({
      success: true,
      message:
        emailResult.delivered === true
          ? "User created successfully and welcome email sent"
          : emailResult.success
            ? "User created successfully; mail is disabled in this environment, so no welcome email was sent"
            : "User created successfully but email failed to send",
      // T-008: the temporary credential exists only inside the welcome email.
      // The API reports how the credential was delivered; it never carries the
      // credential itself in a response body, a log line or a modal.
      emailSent: emailResult.delivered === true,
      credentials_emailed: emailResult.delivered === true,
      email_delivery_status:
        emailResult.delivered === true
          ? "emailed"
          : emailResult.success
            ? "mail-disabled"
            : "failed",
      mailTransport: emailResult.transport ?? null,
      data: {
        userId,
        email,
        role: role.role_name,
        employee_code,
        full_name: `${first_name} ${last_name || ""}`.trim(),
      },
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during user creation",
    });
  }
};

// @desc    Get all users (organization-wide directory)
// @route   GET /api/users
// @access  Private (Admin, HR Officer, Payroll Officer)
export const getAllUsers = async (req, res) => {
  try {
    // The directory is staff-only; an Employee sees their own profile through
    // GET /api/users/profile/:userId instead. Route authorization owns the role
    // check, so every record returned here is already for a permitted audience.
    const users = await User.findAllWithProfiles();

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching users",
    });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
export const getUserById = async (req, res) => {
  try {
    const userId = req.params.id;

    // Users can only view their own profile unless they're admin
    if (req.user.userId !== parseInt(userId) && req.user.roleName !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "You can only view your own profile",
      });
    }

    const user = await User.findByIdWithProfile(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching user",
    });
  }
};

// @desc    Delete user (Admin only)
// @route   DELETE /api/users/:id
// @access  Private (Admin only)
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if requester is admin
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin users can delete users",
      });
    }

    // Prevent admin from deleting themselves
    if (req.user.userId === parseInt(userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await User.delete(userId);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting user",
    });
  }
};
