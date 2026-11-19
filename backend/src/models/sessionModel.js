import pool from "../config/database.js";
import {
  MAX_ACTIVE_SESSIONS,
  SESSION_ABSOLUTE_TTL_HOURS,
} from "../config/throttleConfig.js";

// Server-side session records backing JWT revocation. The JWT only carries the
// session_id; whether a session is still usable always comes from this table.
export const Session = {
  // Open a new session for a user (called at login and registration), keeping at
  // most `maxActiveSessions` live per account.
  //
  // The user row is taken with FOR UPDATE first, so concurrent logins for one
  // account serialize on it exactly the way the password-reset budget does.
  // Without that mutex two sessions can both read "four live sessions", insert
  // themselves, and leave the account with six.
  //
  // Lock order is users -> user_sessions, matching the reset-code transaction, so
  // this adds no new deadlock edge. bcrypt has already run by the time this is
  // called, so no lock is held across password work.
  create: async (userId, { maxActiveSessions = MAX_ACTIVE_SESSIONS } = {}) => {
    if (!Number.isInteger(maxActiveSessions) || maxActiveSessions < 1) {
      throw new Error("Invalid session cap");
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [account] = await connection.query(
        "SELECT user_id FROM users WHERE user_id = ? FOR UPDATE",
        [userId],
      );
      if (account.length === 0) {
        // Thrown, not returned, and not rolled back here: the catch below owns the
        // single rollback, so a missing account cannot unwind the transaction twice.
        throw new Error("Cannot open a session for an unknown account");
      }

      const [result] = await connection.query(
        "INSERT INTO user_sessions (user_id) VALUES (?)",
        [userId],
      );
      const sessionId = result.insertId;

      // T-002 absolute expiry: the live window is closed by the database clock,
      // the same clock every other lifetime in this schema compares against, so
      // an application host in another timezone cannot lengthen the window.
      await connection.query(
        `UPDATE user_sessions
         SET expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)
         WHERE session_id = ?`,
        [SESSION_ABSOLUTE_TTL_HOURS, sessionId],
      );

      // Expired sessions are dead weight, not keepable capacity: stamp them
      // revoked before the cap counts what stays live.
      await connection.query(
        `UPDATE user_sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND revoked_at IS NULL
           AND expires_at IS NOT NULL AND expires_at <= NOW()`,
        [userId],
      );

      // issued_at is second-precision, so session_id breaks ties inside a second.
      // The row just inserted has the highest id, which makes "keep the newest"
      // deterministic and guarantees this session is never the one pruned.
      // Rows without an absolute expiry (pre-T-002 rows not yet backfilled) are
      // still cap-counted, but expiry-stamped rows always win the keep set:
      // legacy rows are revoked first by the migration's backfill.
      const [keepRows] = await connection.query(
        `SELECT session_id FROM user_sessions
         WHERE user_id = ? AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY session_id DESC
         LIMIT ?`,
        [userId, maxActiveSessions],
      );
      const keepIds = keepRows.map((row) => row.session_id);

      if (keepIds.length > 0) {
        await connection.query(
          `UPDATE user_sessions
           SET revoked_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND revoked_at IS NULL
             AND session_id NOT IN (${keepIds.map(() => "?").join(", ")})`,
          [userId, ...keepIds],
        );
      } else {
        await connection.query(
          `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND revoked_at IS NULL`,
          [userId],
        );
      }

      await connection.commit();
      return sessionId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // Load a session together with the user's current authoritative state.
  // T-002: only the absolute expiry is filtered in SQL. Revoked rows are still
  // returned so validateSession keeps its exact contracts ("deactivated" 403,
  // "expired or logged out" 401); an expired window, however, is not a usable
  // session at any code path, so it is filtered here and fails closed as
  // "Session is invalid".
  findActiveById: async (sessionId) => {
    const [rows] = await pool.query(
      `SELECT s.session_id, s.user_id, s.issued_at, s.revoked_at, s.expires_at,
              u.is_active, u.role_id, r.role_name
       FROM user_sessions s
       INNER JOIN users u ON s.user_id = u.user_id
       INNER JOIN roles r ON u.role_id = r.role_id
       WHERE s.session_id = ?
         AND (s.expires_at IS NULL OR s.expires_at > NOW())`,
      [sessionId],
    );
    return rows[0];
  },

  // Revoke one session (logout). Idempotent.
  revokeById: async (sessionId) => {
    await pool.query(
      `UPDATE user_sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND revoked_at IS NULL`,
      [sessionId],
    );
  },

  // Revoke every session a user holds (account deactivation).
  revokeAllForUser: async (userId) => {
    await pool.query(
      `UPDATE user_sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId],
    );
  },

  // Revoke a user's sessions except one (password change keeps the
  // session that performed the rotation, kills the rest).
  revokeOthersForUser: async (userId, keepSessionId) => {
    await pool.query(
      `UPDATE user_sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND session_id <> ? AND revoked_at IS NULL`,
      [userId, keepSessionId],
    );
  },

  delete: async (sessionId) => {
    await pool.query("DELETE FROM user_sessions WHERE session_id = ?", [
      sessionId,
    ]);
  },
};

export default Session;
