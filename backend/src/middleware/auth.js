import jwt from "jsonwebtoken";
import { JWT_ALGORITHM } from "../config/authConfig.js";
import { Session } from "../models/sessionModel.js";

// Server-side session validation for HIGH-3. The JWT proves possession of a
// session id; the database decides whether that session is still usable.
//
// Validation order matters: anything that cannot be checked fails closed with
// an auth error rather than trusting stale token claims.

const stale = () => ({
  statusCode: 401,
  message: "Token is invalid or expired",
});

const unauthorized = (message) => ({ statusCode: 401, message });

const forbidden = (message) => ({ statusCode: 403, message });

// Returns null when the session is usable, otherwise { statusCode, message }.
export const validateSession = async (decoded) => {
  if (!decoded || !Number.isInteger(decoded.sessionId)) {
    return unauthorized("Token is invalid or expired");
  }

  let session;
  try {
    session = await Session.findActiveById(decoded.sessionId);
  } catch (error) {
    // Fail closed: if the session store cannot be read, do not trust the JWT.
    return {
      statusCode: 500,
      message: "Session validation is unavailable. Please try again.",
    };
  }

  if (!session) {
    return unauthorized("Session is invalid");
  }

  // Surface deactivation with the same 403 contract login uses, before the
  // generic revoked-session 401.
  if (!session.is_active) {
    return forbidden(
      "Your account has been deactivated. Please contact administrator.",
    );
  }

  if (session.revoked_at) {
    return unauthorized("Session expired or logged out");
  }

  if (
    session.user_id !== decoded.userId ||
    session.role_id !== decoded.roleId ||
    session.role_name !== decoded.roleName
  ) {
    return unauthorized("Token no longer matches this account");
  }

  // CURRENT_TIMESTAMP is stored at whole-second precision and rounds, so the
  // token iat can land a moment before the session timestamp for tokens issued
  // in the same instant. Only reject tokens issued materially earlier.
  if (decoded.iat * 1000 < new Date(session.issued_at).getTime() - 1000) {
    return unauthorized("Session has been superseded");
  }

  return null;
};

// Verify JWT token and attach user to request
export const protect = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. Please login.",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Token is invalid or expired",
    });
  }

  const failure = await validateSession(decoded);
  if (failure) {
    return res.status(failure.statusCode).json({
      success: false,
      message: failure.message,
    });
  }

  req.user = decoded;
  next();
};

// Check if user has required role
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    if (!roles.includes(req.user.roleName)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.roleName}' is not authorized to access this resource`,
      });
    }

    next();
  };
};
