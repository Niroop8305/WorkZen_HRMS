import pool from "../config/database.js";

// Durable, per-account attempt accounting for the password-reset workflow.
//
// The store is the existing audit trail: every *evaluated* reset-code guess and
// every code issuance is one audit_logs row, so the budget survives a process
// restart, is shared by every Node process that reaches the database, and
// cannot be laundered by requesting a fresh code. No new table or column is
// required because the counter is a count of rows that already have meaning as
// audit events.
//
// Atomicity: "count, then reserve" runs inside a transaction that first takes a
// row lock on the account. Concurrent submissions therefore serialize on that
// lock, so a burst of twenty guesses is charged twenty times rather than all
// reading the same stale count. Without the lock the count-and-insert pair is
// exactly the race that made the in-memory limiter bypassable.
//
// Refusals are never recorded. Writing a row for a blocked request would keep
// pushing the window forward and lock a legitimate account out permanently.
//
// Retention dependency: the budget is derived from audit history, so pruning
// audit_logs for these actions would reset it. The actions below are the
// accounting keys and must not be deleted by any log-retention job.

export const RESET_CODE_ISSUED_ACTION = "PASSWORD_RESET_CODE_ISSUED";
export const RESET_CODE_INVALID_ACTION = "PASSWORD_RESET_CODE_INVALID";

const THROTTLED_ACTIONS = [RESET_CODE_ISSUED_ACTION, RESET_CODE_INVALID_ACTION];

const inClause = THROTTLED_ACTIONS.map(() => "?").join(", ");

// Reads only the most recent `ceiling` events for one action and counts how many
// fall inside the window. log_id is monotonically increasing with time and is
// appended to the idx_user_action secondary index, so this is a bounded backward
// index scan instead of a scan over the account's whole history.
const countInWindow = async (connection, { userId, action, ceiling, windowMinutes }) => {
  const [rows] = await connection.query(
    `SELECT (created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)) AS in_window
     FROM audit_logs
     WHERE user_id = ? AND action = ?
     ORDER BY log_id DESC
     LIMIT ?`,
    [windowMinutes, userId, action, ceiling],
  );
  return rows.filter((row) => Number(row.in_window) === 1).length;
};

// Reserves one slot of a budget before the caller does any expensive or
// revealing work. Returns { allowed: true, reservationId } when the caller may
// proceed, or { allowed: false, count } when the budget for this window is spent.
export const reserveBudget = async ({
  userId,
  action,
  ceiling,
  windowMinutes,
  ipAddress = null,
  userAgent = null,
}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // The account row is the mutex. It is guaranteed to exist for a live session
    // in normal flow; a missing row means the account is gone, which the caller
    // reports as not-found rather than as a throttled request.
    const [account] = await connection.query(
      "SELECT user_id FROM users WHERE user_id = ? FOR UPDATE",
      [userId],
    );
    if (account.length === 0) {
      await connection.rollback();
      return { allowed: false, missingAccount: true, count: 0 };
    }

    const count = await countInWindow(connection, {
      userId,
      action,
      ceiling,
      windowMinutes,
    });

    if (count >= ceiling) {
      await connection.rollback();
      return { allowed: false, count };
    }

    const [reservation] = await connection.query(
      `INSERT INTO audit_logs
        (user_id, action, table_name, record_id, old_value, new_value, ip_address, user_agent)
       VALUES (?, ?, 'password_reset_codes', NULL, NULL, NULL, ?, ?)`,
      [userId, action, ipAddress, userAgent],
    );

    await connection.commit();
    return { allowed: true, count: count + 1, reservationId: reservation.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Releases a reservation that turned out not to be an incorrect guess: a correct
// code, a rejected password the user already knew, or an unknown account. A
// genuinely wrong guess keeps its row, because that row is both the budget
// charge and the audit evidence.
export const releaseReservation = async (reservationId) => {
  if (!Number.isInteger(reservationId)) return;
  await pool.query(
    `DELETE FROM audit_logs
     WHERE log_id = ? AND action IN (${inClause}) AND record_id IS NULL AND new_value IS NULL`,
    [reservationId, ...THROTTLED_ACTIONS],
  );
};

// Test support: ages a reservation out of its window so window expiry can be
// proven without sleeping. Not used by any request path.
export const ageReservations = async (userId, minutes = 20) => {
  await pool.query(
    `UPDATE audit_logs
     SET created_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)
     WHERE user_id = ? AND action IN (${inClause})`,
    [minutes, userId, ...THROTTLED_ACTIONS],
  );
};

export const countReservations = async (userId, action) => {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM audit_logs WHERE user_id = ? AND action = ?",
    [userId, action],
  );
  return Number(rows[0].total);
};
