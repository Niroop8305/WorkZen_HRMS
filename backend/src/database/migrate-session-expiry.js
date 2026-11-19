import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import { assertSafeSchemaName } from "./setup/schemaSetup.js";
import {
  MAX_ACTIVE_SESSIONS,
  SESSION_ABSOLUTE_TTL_HOURS,
} from "../config/throttleConfig.js";

dotenv.config();

const databaseName = () => process.env.DB_NAME || "workzen_hrms";

// T-002: absolute session expiry for databases created before the column.
//
// Idempotent by construction - every step asks first, acts only when needed:
//   1. add `expires_at` when the column is missing;
//   2. stamp every NULL-expiry row with `issued_at + SESSION_ABSOLUTE_TTL_HOURS`
//      (backfill of the historical window, never a lifetime extension: rows
//      older than the TTL are stamped into the past on purpose);
//   3. revoke anything the stamp just expired;
//   4. enforce the <= MAX_ACTIVE_SESSIONS cap: keep the newest N live rows per
//      account (highest session_id), revoke the rest, and report the counts.
//
// Re-running converges: after one run there are no NULL expiry rows left, no
// live row past its window, and no account above the cap, so steps 2-4 become
// no-ops. Never deletes anything - revoked rows are evidence and belong to
// prune-sessions' retention window.

export const migrateSessionExpiry = async (connection, schema = databaseName()) => {
  const report = {
    schema,
    addedColumn: false,
    backfilled: 0,
    revokedExpired: 0,
    revokedOverCap: 0,
    cappedAccounts: 0,
  };

  // The ALTER/UPDATEs need a default schema; the caller may hand us a bare
  // connection. The name is validated against the same charset rule every
  // other setup script uses.
  assertSafeSchemaName(schema);
  await connection.query(`USE \`${schema}\``);

  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_sessions'
       AND COLUMN_NAME = 'expires_at'`,
    [schema],
  );
  if (columns.length === 0) {
    await connection.query(
      `ALTER TABLE user_sessions
       ADD COLUMN expires_at DATETIME NULL AFTER revoked_at,
       ADD INDEX idx_session_expiry (expires_at)`,
    );
    report.addedColumn = true;
  }

  if (!Number.isInteger(SESSION_ABSOLUTE_TTL_HOURS) || SESSION_ABSOLUTE_TTL_HOURS < 1) {
    throw new Error("SESSION_ABSOLUTE_TTL_HOURS must be a positive whole number of hours");
  }

  const [backfill] = await connection.query(
    `UPDATE user_sessions
     SET expires_at = DATE_ADD(issued_at, INTERVAL ? HOUR)
     WHERE expires_at IS NULL`,
    [SESSION_ABSOLUTE_TTL_HOURS],
  );
  report.backfilled = backfill.affectedRows ?? 0;

  const [expired] = await connection.query(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE revoked_at IS NULL
       AND expires_at IS NOT NULL AND expires_at <= NOW()`,
  );
  report.revokedExpired = expired.affectedRows ?? 0;

  // The cap keeps the newest rows (highest session_id; session_id is
  // AUTO_INCREMENT so it is monotonic even within one second). One UPDATE per
  // over-cap account keeps the lock scope small and mirrors exactly what
  // Session.create enforces going forward.
  const [overCap] = await connection.query(
    `SELECT user_id, COUNT(*) AS live
     FROM user_sessions
     WHERE revoked_at IS NULL
     GROUP BY user_id
     HAVING COUNT(*) > ?`,
    [MAX_ACTIVE_SESSIONS],
  );
  for (const account of overCap) {
    const [kept] = await connection.query(
      `SELECT session_id FROM user_sessions
       WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY session_id DESC
       LIMIT ?`,
      [account.user_id, MAX_ACTIVE_SESSIONS],
    );
    const keepIds = kept.map((row) => row.session_id);
    const [revoked] = await connection.query(
      `UPDATE user_sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND revoked_at IS NULL
         AND session_id NOT IN (${keepIds.map(() => "?").join(", ")})`,
      [account.user_id, ...keepIds],
    );
    report.revokedOverCap += revoked.affectedRows ?? 0;
    report.cappedAccounts += 1;
  }

  return report;
};

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const run = async () => {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 3306,
      multipleStatements: true,
    });
    try {
      const report = await migrateSessionExpiry(connection);
      console.log(
        `✅ Session expiry migration complete for ${report.schema}: ` +
          `column added=${report.addedColumn}, backfilled=${report.backfilled}, ` +
          `revoked expired=${report.revokedExpired}, over-cap revoked=${report.revokedOverCap} ` +
          `across ${report.cappedAccounts} account(s). Re-run: no-op.`,
      );
    } finally {
      await connection.end();
    }
  };
  run().catch((error) => {
    console.error(`❌ Session expiry migration failed: ${error.message}`);
    process.exit(1);
  });
}
