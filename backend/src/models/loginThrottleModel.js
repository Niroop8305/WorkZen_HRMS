import crypto from "crypto";
import pool from "../config/database.js";
import {
  FAILED_CREDENTIAL_NAMESPACE,
  FAILURE_WINDOW_MINUTES,
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  THROTTLE_IDLE_RETENTION_MINUTES,
  THROTTLE_ROW_CAP,
  getThrottleDigestKey,
  normalizeThrottleEmail,
} from "../config/throttleConfig.js";

// Login throttling state, one row per bucket in `auth_throttle`.
//
// Why it lives in the database: an in-process counter is cleared by a restart,
// is invisible to a second application process, and makes the lockout a per-
// worker accident rather than a property of the account.
//
// Why every statement is clocked by the server: the window anchor, the lockout
// expiry and the retention floor are all compared against CURRENT_TIMESTAMP in
// SQL, so no Node process clock or timezone can move a lockout, and no JS Date
// conversion (which is where TIMESTAMP columns are fragile) is involved. The
// only values the application reads back are integers.
//
// Why there is no read-modify-write: charging is a single INSERT ... ON DUPLICATE
// KEY UPDATE. Reading the count and then writing it back is the race that lets a
// parallel burst under-count. The statements here are ordered so every derived
// expression reads the column values as they were before the statement, which
// makes the write independent of MySQL's left-to-right assignment rule; the
// live-MySQL suite under test/auth-throttle-concurrency.test.js measures that
// assumption instead of relying on it.
//
// Fail closed: every function lets driver errors propagate. The login path turns
// them into a 503 rather than proceeding unthrottled, because a throttle that
// silently disappears when its storage breaks is not a control at all.

export const ACCOUNT_LOCKED_ACTION = "ACCOUNT_LOGIN_LOCKED";

// 74 bytes at most: the namespace plus a 64-character HMAC-SHA256 digest, inside
// the VARBINARY(96) primary key. Only the digest is ever written, so the table
// holds no account identifier an attacker can enumerate or reverse.
export const buildFailureBucket = (email) => {
  const normalized = normalizeThrottleEmail(email);
  if (normalized === null) return null;
  const digest = crypto
    .createHmac("sha256", getThrottleDigestKey())
    .update(normalized)
    .digest("hex");
  return `${FAILED_CREDENTIAL_NAMESPACE}${digest}`;
};

const readFailureState = async (connection, bucket) => {
  const [rows] = await connection.query(
    `SELECT
        IF(window_start < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), 0, attempts) AS window_attempts,
        COALESCE(GREATEST(0, TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, locked_until)), 0) AS lockout_seconds
     FROM auth_throttle
     WHERE bucket = ?`,
    [FAILURE_WINDOW_MINUTES, bucket],
  );
  return rows[0];
};

// @returns { allowed } with the counters that are still live, or { storeUnavailable }
// for anything the throttle storage cannot answer.
export const evaluateLoginAttempt = async (email) => {
  let bucket;
  try {
    bucket = buildFailureBucket(email);
  } catch {
    return { storeUnavailable: true };
  }
  if (bucket === null) {
    // Nothing to charge and nothing to look up: the caller has already rejected
    // the shape of the request, which is not a credential failure.
    return { allowed: true, unknownBucket: true };
  }

  try {
    const state = await readFailureState(pool, bucket);
    const lockoutSeconds = Number(state?.lockout_seconds || 0);
    const windowAttempts = Number(state?.window_attempts || 0);
    const locked =
      lockoutSeconds > 0 || windowAttempts >= MAX_FAILED_LOGINS;
    return {
      allowed: !locked,
      bucket,
      attempts: windowAttempts,
      locked,
      retryAfterSeconds: locked
        ? Math.max(1, lockoutSeconds || FAILURE_WINDOW_MINUTES * 60)
        : 0,
      // A bucket that is already locked is not charged again: the request is
      // refused before the password is looked at, so waiting out a lockout can
      // never extend it.
      wasLocked: locked,
    };
  } catch {
    return { storeUnavailable: true };
  }
};

// Charges one failed credential. Creates the bucket on first use, rolls a stale
// window over, and applies the lockout in the same statement, so two concurrent
// failures cannot both read "nine" and both write "ten".
export const recordFailedCredential = async (bucket) => {
  const charge = () =>
    pool.query(
      `INSERT INTO auth_throttle
         (bucket, window_start, attempts, locked_until, last_attempt_at)
       VALUES (?, CURRENT_TIMESTAMP, 1, NULL, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         locked_until = IF(IF(window_start < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), 1, attempts + 1) >= ?,
                           DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), locked_until),
         attempts = IF(window_start < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), 1, attempts + 1),
         last_attempt_at = CURRENT_TIMESTAMP,
         window_start = IF(window_start < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), CURRENT_TIMESTAMP, window_start)`,
      [
        bucket,
        FAILURE_WINDOW_MINUTES,
        MAX_FAILED_LOGINS,
        LOCKOUT_MINUTES,
        FAILURE_WINDOW_MINUTES,
        FAILURE_WINDOW_MINUTES,
      ],
    );

  try {
    await charge();
    const state = await readFailureState(pool, bucket);
    const lockoutSeconds = Number(state?.lockout_seconds || 0);
    return {
      attempts: Number(state?.window_attempts || 0),
      locked: lockoutSeconds > 0 || Number(state?.window_attempts || 0) >= MAX_FAILED_LOGINS,
      retryAfterSeconds: lockoutSeconds > 0 ? lockoutSeconds : 0,
    };
  } catch {
    return { storeUnavailable: true };
  }
};

// Successful authentication clears the failure bucket. This is a single atomic
// DELETE rather than "read, check, delete": a concurrently committed failure can
// re-create the bucket at one attempt, which is the correct outcome - a real
// wrong password after a real correct password starts a new window. The lockout
// cannot be laundered this way because a locked bucket is refused by
// evaluateLoginAttempt before the password is ever verified.
export const clearFailedCredentials = async (email) => {
  let bucket;
  try {
    bucket = buildFailureBucket(email);
    if (bucket === null) return { cleared: false };
    await pool.query("DELETE FROM auth_throttle WHERE bucket = ?", [bucket]);
    return { cleared: true };
  } catch {
    // Losing the clear must not fail an authentication that already succeeded,
    // and must not leave the caller thinking the bucket is gone.
    return { cleared: false, storeUnavailable: true };
  }
};

// Lockout transitions are the only login events written to the audit trail; a row
// per attempt would turn a denial-of-service amplifier into the log itself.
// An unknown address has no user row, so the digest identifies the bucket and the
// account column stays NULL - the FK allows it and ON DELETE SET NULL keeps the
// history readable after an account is removed.
export const recordLockoutAudit = async ({ bucket, ipAddress, userAgent }) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, action, table_name, record_id, old_value, new_value, ip_address, user_agent)
       VALUES (NULL, ?, 'auth_throttle', NULL, NULL, ?, ?, ?)`,
      [ACCOUNT_LOCKED_ACTION, bucket, ipAddress, userAgent],
    );
    return { recorded: true };
  } catch {
    // The lockout is already durable in auth_throttle; a failed audit write must
    // not turn a working control into a login outage.
    return { recorded: false };
  }
};

// Bounded retention. Two rules, in this order: idle buckets past the floor are
// removed, and if the table is still over its cap the oldest *inactive* rows go.
// A live lockout is never collected, so cleanup cannot shorten a sentence, and an
// attacker cannot buy headroom by burning through the cap.
export const sweepExpiredBuckets = async ({
  idleMinutes = THROTTLE_IDLE_RETENTION_MINUTES,
  rowCap = THROTTLE_ROW_CAP,
  connection = pool,
} = {}) => {
  const [idle] = await connection.query(
    `DELETE FROM auth_throttle
     WHERE (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)
       AND last_attempt_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)`,
    [idleMinutes],
  );

  const [counted] = await connection.query(
    "SELECT COUNT(*) AS total FROM auth_throttle",
  );
  const total = Number(counted[0].total);
  if (total <= rowCap) {
    return { idleRemoved: idle.affectedRows ?? 0, capRemoved: 0, total };
  }

  const overflow = total - rowCap;
  const [evicted] = await connection.query(
    `DELETE FROM auth_throttle
     WHERE (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)
     ORDER BY last_attempt_at ASC
     LIMIT ?`,
    [overflow],
  );

  return {
    idleRemoved: idle.affectedRows ?? 0,
    capRemoved: evicted.affectedRows ?? 0,
    total: Math.max(0, total - overflow),
  };
};
