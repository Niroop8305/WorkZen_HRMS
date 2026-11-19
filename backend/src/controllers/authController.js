import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { User, Role } from "../models/userModel.js";
import { EmployeeProfile } from "../models/profileModel.js";
import { Session } from "../models/sessionModel.js";
import pool from "../config/database.js";
import { JWT_ALGORITHM } from "../config/authConfig.js";
import {
  RESET_CODE_INVALID_ACTION,
  RESET_CODE_ISSUED_ACTION,
  releaseReservation,
  reserveBudget,
} from "../models/authThrottleModel.js";
import {
  sendPasswordChangeEmail,
  sendPasswordResetByAdminEmail,
  sendPasswordResetCodeEmail,
} from "../config/email.js";
import {
  MAX_EMAIL_LENGTH,
  THROTTLE_UNAVAILABLE_MESSAGE,
} from "../config/throttleConfig.js";
import {
  buildFailureBucket,
  clearFailedCredentials,
  evaluateLoginAttempt,
  recordFailedCredential,
  recordLockoutAudit,
} from "../models/loginThrottleModel.js";

// Cost factor 10 matches every bcrypt.hash call in this file, so the comparison
// against a nonexistent account costs the same as one against a real account.
// The digest is of random bytes nobody can present, so it can never authenticate;
// it exists only to remove the response-time answer to "does this address exist?".
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  `workzen-unusable-${crypto.randomBytes(16).toString("hex")}`,
  10,
);

// Generate JWT Token bound to a server-side session. Whether the token stays
// valid is decided by the user_sessions row, not by the claims alone.
const generateToken = (userId, roleId, roleName, sessionId) => {
  return jwt.sign(
    { userId, roleId, roleName, sessionId },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE,
      algorithm: JWT_ALGORITHM,
    },
  );
};

// ---------------------------------------------------------------------------
// Password reset code lifecycle (HIGH-4)
// ---------------------------------------------------------------------------

const RESET_CODE_TTL_MINUTES = 10; // unchanged contract, now measured by the DB clock
const MAX_INVALID_CODE_ATTEMPTS = 5;
const CODE_ATTEMPT_WINDOW_MINUTES = 15;
const CODE_ISSUANCE_WINDOW_MINUTES = 15;
const MAX_CODE_ISSUANCES_PER_WINDOW = 3;

// A budget is charged when the recorded count reaches the ceiling, so the request
// that would be the Nth evaluated action is refused instead. Guesses are therefore
// capped at MAX_INVALID_CODE_ATTEMPTS - 1 per window and the 5th submission answers
// 429 before any hashing or verification work, exactly as the previous in-process
// guard did, but durably and atomically.
const CODE_ATTEMPT_CEILING = MAX_INVALID_CODE_ATTEMPTS - 1;

// Math.random() is a predictable non-cryptographic generator; a code that
// protects credential recovery must come from the CSPRNG. The 6-digit shape is
// what the user receives and types back; storage is the SHA-256 digest below.
const generateResetCode = () => crypto.randomInt(100000, 1000000).toString();

// Codes are stored hashed, never plaintext (T-003). A 6-digit code has only
// 10^6 possibilities, so the digest must be keyed to the account (the consume
// lookup always pairs user_id with the code) and bounded by the guessing
// budget and the 10-minute TTL - the hash adds confidentiality at rest, not
// brute-force resistance. SHA-256 is deterministic, which is what preserves
// the atomic SQL equality-match on the consume path; bcrypt cannot be used
// there because it is non-deterministic by design.
export const hashResetCode = (code) =>
  crypto.createHash("sha256").update(String(code).trim()).digest("hex");

// Guessing and issuance budgets live in the database (authThrottleModel): an
// in-process counter is bypassable by restarting the app, by running a second
// process, by racing the check-then-increment pair, and - the defect this
// replaces - by requesting a new code, which used to clear it.

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Private (Admin only)
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

    // Only the listed fields above are read from the request body, so a
    // client-supplied role_id or is_admin is ignored. role_name is allowlisted so
    // this path can never mint an Admin, matching POST /api/users/create.
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

    // Open the server-side session this token is bound to
    const sessionId = await Session.create(userId);

    // Generate token
    const token = generateToken(userId, role.role_id, role.role_name, sessionId);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        userId,
        email,
        role: role.role_name,
        employee_code,
        sessionId,
        token,
      },
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
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

    // A longer address than the column can hold cannot match a user, and letting
    // it through would make the bucket key a function of attacker-chosen length.
    if (
      typeof email !== "string" ||
      email.trim().length === 0 ||
      email.length > MAX_EMAIL_LENGTH ||
      typeof password !== "string" ||
      password.length === 0 ||
      password.length > 1024
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // The gate is a single indexed read, committed before bcrypt starts, so no
    // row lock is ever held across the password work.
    const gate = await evaluateLoginAttempt(email);
    if (gate.storeUnavailable) {
      console.error("Login throttle storage unavailable (gate)");
      return res.status(503).json({
        success: false,
        message: THROTTLE_UNAVAILABLE_MESSAGE,
      });
    }

    if (!gate.allowed) {
      // 429, not 401: the credentials were never examined, so the caller is not
      // being told anything about them. Retry-After is the server clock, so the
      // countdown cannot be shortened by a client-side clock.
      res.set("Retry-After", String(gate.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: "Too many failed sign-in attempts. Please try again later.",
      });
    }

    let user;
    try {
      user = await User.findByEmail(email);
    } catch {
      // The account lookup and the throttle share one store. If it cannot be
      // read, the attempt cannot be accounted for, and an unaccounted failed
      // password is exactly what a lockout is meant to bound.
      console.error("Login account lookup failed");
      return res.status(503).json({
        success: false,
        message: THROTTLE_UNAVAILABLE_MESSAGE,
      });
    }

    // Always compare, against a real hash even when there is no account, so the
    // unknown-address path performs the same work as the wrong-password path.
    const isPasswordValid = await bcrypt.compare(
      password,
      user ? user.password_hash : DUMMY_PASSWORD_HASH,
    );

    if (!isPasswordValid) {
      const charge = await recordFailedCredential(
        gate.bucket ?? buildFailureBucket(email),
      );
      if (charge.storeUnavailable) {
        console.error("Login throttle storage unavailable (charge)");
        return res.status(503).json({
          success: false,
          message: THROTTLE_UNAVAILABLE_MESSAGE,
        });
      }

      // Only the transition into a lockout is audited; the attempt itself is
      // already implied by the durable counter, and a row per guess would make
      // the log the amplification vector.
      if (charge.locked && !gate.wasLocked) {
        await recordLockoutAudit({
          bucket: gate.bucket,
          ipAddress: req.ip,
          userAgent: req.get("user-agent")?.slice(0, 200) ?? null,
        });
      }

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Correct password, closed account: the password is verified before the
    // deactivation is revealed, so this response proves nothing to a caller who
    // does not already hold the credentials. It is not a failed credential and
    // charges nothing, and it does not clear the bucket either - an account that
    // cannot sign in has no successful authentication to reward.
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          "Your account has been deactivated. Please contact administrator.",
      });
    }

    // Authentication succeeded, so the failure window is voided. Failing closed
    // here is deliberate: a bucket that could not be cleared is still enforcing,
    // and the caller can retry; issuing a token while the store is misbehaving
    // would leave the throttle state unknown rather than corrected.
    const cleared = await clearFailedCredentials(email);
    if (cleared.storeUnavailable) {
      console.error("Login throttle storage unavailable (clear)");
      return res.status(503).json({
        success: false,
        message: THROTTLE_UNAVAILABLE_MESSAGE,
      });
    }

    // Update last login
    await User.updateLastLogin(user.user_id);

    // Get employee profile
    const profile = await EmployeeProfile.findByUserId(user.user_id);

    // Open the server-side session this token is bound to
    const sessionId = await Session.create(user.user_id);

    // Generate token
    const token = generateToken(
      user.user_id,
      user.role_id,
      user.role_name,
      sessionId
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        userId: user.user_id,
        email: user.email,
        role: user.role_name,
        sessionId,
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
    // The message is not echoed: an unauthenticated caller has no use for a
    // driver error, and one often carries table or column names.
    res.status(500).json({
      success: false,
      message: "Server error during login",
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
    });
  }
};

// @desc    Logout user and revoke the current session
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  try {
    // protect guarantees the token carries a session id for this user
    await Session.revokeById(req.user.sessionId);

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during logout",
    });
  }
};

// A credential mail has three outcomes, and only the first may be described as
// sent: mail that left for SMTP, mail the environment declined to send (skipped
// or dry-run), and mail that failed. `delivered` is the single field that tells
// them apart. Exported because the delivered branch is unreachable in a test
// without a real SMTP account, so the branching needs a direct seam.
export const credentialMailOutcome = (prefix, result) =>
  result?.delivered === true
    ? { level: "log", message: `${prefix} - Confirmation email sent` }
    : {
        level: "warn",
        message: `${prefix} - Confirmation email NOT delivered; transport=${
          result?.transport ?? "unknown"
        }, reason=${result?.reason || result?.error || "delivery disabled"}`,
      };

// The client is told the same three-way truth as the log, split so a user can
// act on it: the mail left, the environment declined to send it (skipped or
// dry-run), or sending failed. A sender that threw reports nothing, which is a
// failure and never a delivery.
export const credentialMailNotice = (result) => {
  if (result?.delivered === true) {
    return "A confirmation email has been sent to your registered email address.";
  }
  if (result?.skipped === true || result?.success === true) {
    return "Mail delivery is disabled in this environment, so no confirmation email was sent.";
  }
  return "The confirmation email could not be sent. Your password has been updated.";
};

// A verification code is issued, stored and usable even when the transport only
// rendered the message, so the success response must describe the code by what
// happened to it rather than by what the mail pipeline was asked to do. Anything
// that is not a confirmed SMTP delivery therefore makes no inbox promise, and a
// result that never reported `delivered` (dry-run, skipped, failed, or a sender
// that returned nothing) cannot claim one either.
export const credentialCodeMailNotice = (result) =>
  result?.delivered === true
    ? "Verification code sent to your email. Please check your inbox and spam folder."
    : "Verification code issued. Mail delivery is disabled in this environment, so no email was sent.";

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
    const user = await User.findCredentialsById(userId);
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

    // A credential rotation invalidates every other session the user holds;
    // the session that performed the change stays signed in.
    await Session.revokeOthersForUser(userId, req.user.sessionId);

    // Get user profile for personalized email
    const profile = await EmployeeProfile.findByUserId(userId);
    const userName = profile
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : user.email;

    // Send confirmation email
    let emailResult;
    try {
      emailResult = await sendPasswordChangeEmail(user.email, userName);
      const outcome = credentialMailOutcome(
        `Password changed for user: ${user.email}`,
        emailResult,
      );
      console[outcome.level](outcome.message);
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Don't fail the password change if email fails
    }

    res.status(200).json({
      success: true,
      message: `Password updated successfully! ${credentialMailNotice(emailResult)}`,
      emailSent: emailResult?.delivered === true,
      mailTransport: emailResult?.transport ?? null,
    });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while changing password",
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

    // Get target user profile for personalized email
    const targetProfile = await EmployeeProfile.findByUserId(targetUserId);
    const targetUserName = targetProfile
      ? `${targetProfile.first_name} ${targetProfile.last_name || ""}`.trim()
      : targetUser.email;

    // Deliver before any state changes, mirroring the self-service code path,
    // because no transaction can unsend an email. Committing first would mean a
    // delivery failure leaves the target with a password nobody told them and all
    // sessions revoked - a lockout the response then denies. Refusing to commit on
    // failure keeps the old password working and tells the admin the truth.
    let delivery;
    try {
      delivery = await sendPasswordResetByAdminEmail(
        targetUser.email,
        targetUserName,
        newPassword
      );
    } catch (emailError) {
      console.error("Failed to send admin password reset email:", emailError);
      delivery = { success: false };
    }

    if (!delivery || delivery.success === false) {
      console.error(
        "Admin password reset aborted for user %s: %s",
        targetUser.email,
        delivery?.error || "email transport reported no success"
      );
      return res.status(500).json({
        success: false,
        message:
          "Could not deliver the reset email, so the password was not changed. Fix the mail configuration or set a password through the employee's own change-password flow.",
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Rotate the credential, void any code issued against the old one, and drop
    // every session the target holds as one unit of work. An admin reset is
    // exactly the "my account is compromised" path, so no prior session may keep
    // authenticating afterwards.
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [update] = await connection.query(
        "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
        [newPasswordHash, targetUserId]
      );
      if (update.affectedRows !== 1) {
        throw new Error("Password update affected no rows");
      }
      await connection.query(
        "UPDATE password_reset_codes SET is_used = TRUE WHERE user_id = ? AND is_used = FALSE",
        [targetUserId]
      );
      await connection.query(
        "UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL",
        [targetUserId]
      );
      await connection.commit();
    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    } finally {
      connection.release();
    }

    // Only the email address and the transport mode are logged: never the
    // credential. Failed-guess history is deliberately left alone - it is audit
    // evidence, the window expires by itself, and the target now holds a password
    // from an administrator rather than a code.
    console.log(
      `Password reset by admin for user: ${targetUser.email}; mail transport=${delivery.transport ?? "smtp"}, delivered=${delivery.delivered === true}`
    );

    res.status(200).json({
      success: true,
      message:
        delivery.delivered === true
          ? `Password reset successfully for ${targetUser.email}. Credentials have been sent to their email address.`
          : `Password reset successfully for ${targetUser.email}, but mail delivery is disabled in this environment, so the new credentials were not emailed.`,
    });
  } catch (error) {
    console.error("Reset User Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while resetting password",
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

    // Generate a 6-digit code from the CSPRNG
    const resetCode = generateResetCode();

    // Get user profile for personalized email
    const profile = await EmployeeProfile.findByUserId(userId);
    const userName = profile
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : user.email;

    // Reserve issuance capacity before anything is emailed. Charging the slot up
    // front is what bounds the mail flood: checking afterwards would let a burst of
    // concurrent requests each deliver an email and then discard all but three.
    const issuance = await reserveBudget({
      userId,
      action: RESET_CODE_ISSUED_ACTION,
      ceiling: MAX_CODE_ISSUANCES_PER_WINDOW,
      windowMinutes: CODE_ISSUANCE_WINDOW_MINUTES,
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.["user-agent"] ?? null,
    });

    if (issuance.missingAccount) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!issuance.allowed) {
      return res.status(429).json({
        success: false,
        message:
          "Too many verification code requests. Please try again later.",
      });
    }

    // Send before persisting. config/email.js resolves with
    // { success: false } instead of throwing, so checking only the thrown error
    // would leave an active code stored while nobody was ever sent it.
    let delivery;
    try {
      delivery = await sendPasswordResetCodeEmail(
        user.email,
        userName,
        resetCode
      );
    } catch (emailError) {
      console.error("Failed to send verification code email:", emailError);
      await releaseReservation(issuance.reservationId);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification code. Please try again.",
      });
    }

    // Keyed on `success`, never on `delivered`: a dry-run transport accepts the
    // message without dialling anyone, and issuing under it is how the reset flow
    // stays exercisable in development and in the HTTP suites. Requiring delivery
    // here would turn every non-SMTP environment into a 500. Honesty lives in the
    // response wording instead.
    if (!delivery || delivery.success === false) {
      console.error(
        "Failed to send verification code email:",
        delivery?.error || "email transport reported no success"
      );
      // The transport took nothing, so the slot is given back.
      await releaseReservation(issuance.reservationId);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification code. Please try again.",
      });
    }

    // Supersede outstanding codes and store the new one as one unit of work. The
    // expiry is produced by the database clock, which is the same clock the
    // verification query compares against, so an application host in a different
    // timezone cannot silently lengthen the window.
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // Same per-account mutex the throttle uses, and taken before the code rows,
      // so every credential write path locks users then password_reset_codes.
      // Without it two concurrent issuances each gap-lock the supersede UPDATE
      // and then deadlock on the INSERT.
      await connection.query(
        "SELECT user_id FROM users WHERE user_id = ? FOR UPDATE",
        [userId]
      );
      await connection.query(
        "UPDATE password_reset_codes SET is_used = TRUE WHERE user_id = ? AND is_used = FALSE",
        [userId]
      );
      await connection.query(
        `INSERT INTO password_reset_codes (user_id, reset_code, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [userId, hashResetCode(resetCode), RESET_CODE_TTL_MINUTES]
      );
      await connection.commit();
    } catch (transactionError) {
      await connection.rollback();
      // The mail step already reported success, so this slot stays charged:
      // releasing it would let a failing path refill the issuance budget. The code
      // the transport accepted can never validate, because it was never stored -
      // and under a non-delivering transport no mail reached anyone at all.
      console.error(
        `Password reset code for user ${userId} passed the mail step (transport=${
          delivery.transport ?? "unknown"
        }) but was not persisted; issuance slot kept`,
        transactionError
      );
      throw transactionError;
    } finally {
      connection.release();
    }

    // The code value must never reach stdout, logs or the response body. The log
    // names the transport so an operator can tell an issued-but-unmailed code from
    // one that really left for SMTP.
    console.log(
      `Password reset code issued for user ${userId}; valid for ${RESET_CODE_TTL_MINUTES} minutes; ` +
        `mailTransport=${delivery.transport ?? "unknown"}, delivered=${
          delivery.delivered === true
        }`
    );

    res.status(200).json({
      success: true,
      message: credentialCodeMailNotice(delivery),
      emailSent: delivery.delivered === true,
      mailTransport: delivery.transport ?? null,
      expiresIn: `${RESET_CODE_TTL_MINUTES} minutes`,
    });
  } catch (error) {
    console.error("Request Reset Code Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while requesting reset code",
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

    // The code is the only secret standing between an attacker and a credential
    // replacement, so reject shapes that can never match before touching the DB.
    // A malformed submission is not evidence of guessing the real code space, so
    // it is refused before any budget is charged.
    if (!/^\d{6}$/.test(String(resetCode))) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired verification code. Please request a new code.",
      });
    }

    // Online-guessing guard for the 6-digit space. Reserved before the bcrypt work
    // and before the code is looked up: concurrent submissions then serialize on
    // the account lock instead of all reading the same stale count, a blocked
    // request costs no hashing, and requesting a fresh code cannot restore budget.
    const reservation = await reserveBudget({
      userId,
      action: RESET_CODE_INVALID_ACTION,
      ceiling: CODE_ATTEMPT_CEILING,
      windowMinutes: CODE_ATTEMPT_WINDOW_MINUTES,
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.["user-agent"] ?? null,
    });

    if (reservation.missingAccount) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!reservation.allowed) {
      return res.status(429).json({
        success: false,
        message:
          "Too many invalid verification codes. Please request a new code.",
      });
    }

    // Hash before opening the transaction so the row locks below are not held
    // across the bcrypt work factor.
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    const connection = await pool.getConnection();
    let invalidCode = false;
    let refundReservation = false;
    let reject = null;
    let accountEmail = null;

    try {
      await connection.beginTransaction();

      // Lock the account row first. The throttle reservation, this handler and the
      // admin reset all take users before password_reset_codes, so there is one
      // lock order across every credential path instead of two that can deadlock.
      const [users] = await connection.query(
        "SELECT password_hash, email FROM users WHERE user_id = ? FOR UPDATE",
        [userId]
      );

      if (users.length === 0) {
        await connection.rollback();
        refundReservation = true;
        reject = {
          status: 404,
          message: "User not found",
        };
      } else {
        // Lock the live row for this user + code. FOR UPDATE serializes two
        // concurrent submissions of the same code: the loser blocks here, then
        // re-reads the row as is_used = TRUE and cannot consume it twice.
        // The submitted code is hashed with the same deterministic digest the
        // issuance path stored, so the equality-match still decides - but a
        // database reader now sees only digests, never a usable code (T-003).
        const [codes] = await connection.query(
          `SELECT id FROM password_reset_codes
           WHERE user_id = ? AND reset_code = ? AND is_used = FALSE AND expires_at > NOW()
           ORDER BY created_at DESC LIMIT 1
           FOR UPDATE`,
          [userId, hashResetCode(resetCode)]
        );

        if (codes.length === 0) {
          await connection.rollback();
          invalidCode = true;
        } else {
          // This UPDATE is the consumption point. Re-checking is_used = FALSE in
          // the predicate means affectedRows, not the earlier read, decides who
          // owns the code.
          const [consume] = await connection.query(
            "UPDATE password_reset_codes SET is_used = TRUE WHERE id = ? AND is_used = FALSE",
            [codes[0].id]
          );

          if (consume.affectedRows !== 1) {
            await connection.rollback();
            invalidCode = true;
          } else if (
            await bcrypt.compare(newPassword, users[0].password_hash)
          ) {
            // A rejected password must not burn the code: rollback restores
            // is_used = FALSE, so the user can retry with a valid password. The
            // caller demonstrably holds the live code, so the reservation is
            // released as well.
            await connection.rollback();
            refundReservation = true;
            reject = {
              status: 400,
              message: "New password must be different from the current password",
            };
          } else {
            accountEmail = users[0].email;

            const [update] = await connection.query(
              "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
              [newPasswordHash, userId]
            );

            if (update.affectedRows !== 1) {
              await connection.rollback();
              throw new Error("Password update affected no rows");
            }

            // One code consumed means every other outstanding code is void.
            await connection.query(
              "UPDATE password_reset_codes SET is_used = TRUE WHERE user_id = ? AND is_used = FALSE",
              [userId]
            );

            // HIGH-3 policy, identical to changePassword: the session performing
            // the reset survives, everything else issued for this account dies.
            // Done here rather than through Session.revokeOthersForUser so that
            // consumption, credential rotation and revocation commit together.
            await connection.query(
              `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
               WHERE user_id = ? AND session_id <> ? AND revoked_at IS NULL`,
              [userId, req.user.sessionId]
            );

            await connection.commit();

            // A correct code is not an invalid guess. Earlier wrong guesses in this
            // window keep their charge, so succeeding does not launder the budget.
            refundReservation = true;
          }
        }
      }
    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    } finally {
      connection.release();
    }

    // Released reservations: a correct code, a password the caller already knew,
    // or an account that no longer exists. A wrong guess keeps its charge, and the
    // next submission is refused before any work happens.
    if (refundReservation) {
      await releaseReservation(reservation.reservationId);
    }

    if (invalidCode) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired verification code. Please request a new code.",
      });
    }

    if (reject) {
      return res.status(reject.status).json({ success: false, message: reject.message });
    }

    // Get user profile for personalized email
    const profile = await EmployeeProfile.findByUserId(userId);
    const userName = profile
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : accountEmail;

    // Send confirmation email
    try {
      const emailResult = await sendPasswordChangeEmail(accountEmail, userName);
      const outcome = credentialMailOutcome(
        `Password reset successfully for: ${accountEmail}`,
        emailResult,
      );
      console[outcome.level](outcome.message);
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
    // Driver and SQL text stays server-side: it names tables and columns to
    // whoever is probing the guessing budget.
    res.status(500).json({
      success: false,
      message: "Server error while resetting password",
    });
  }
};
