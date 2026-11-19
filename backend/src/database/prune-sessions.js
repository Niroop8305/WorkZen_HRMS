import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import {
  SESSION_RETENTION_DAYS,
  THROTTLE_IDLE_RETENTION_MINUTES,
  THROTTLE_ROW_CAP,
} from "../config/throttleConfig.js";

dotenv.config();

const databaseName = () => process.env.DB_NAME || "workzen_hrms";

// Retention for the two tables that only accumulate.
//
// DRY RUN IS THE DEFAULT. Nothing in this file writes unless a caller passes
// `apply: true`, and the command line needs `--apply` for that. A maintenance
// job whose first run deletes rows is not a maintenance job.
//
// Revoked sessions are kept for SESSION_RETENTION_DAYS because they are the
// evidence behind "this token was signed out on that date", and are then removed
// in bounded batches. A session that has not been revoked is never a candidate:
// retention must not log anyone out, so the predicate requires revoked_at to be
// set, and the report counts what it deliberately left alone.
export const pruneRevokedSessions = async (
  connection,
  {
    retentionDays = SESSION_RETENTION_DAYS,
    batchSize = 5000,
    maxBatches = 200,
    apply = false,
  } = {},
) => {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("Session retention must be a positive whole number of days");
  }

  const [counted] = await connection.query(
    `SELECT
        COUNT(*) AS expired,
        SUM(revoked_at IS NULL) AS kept_active
     FROM user_sessions
     WHERE revoked_at IS NOT NULL
       AND revoked_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)`,
    [retentionDays],
  );
  const expired = Number(counted[0]?.expired ?? 0);

  // Counted separately so an operator can see what the run protected rather than
  // only what it removed.
  const [active] = await connection.query(
    `SELECT COUNT(*) AS live FROM user_sessions WHERE revoked_at IS NULL`,
  );

  let removed = 0;
  let batches = 0;
  if (apply) {
    while (batches < maxBatches) {
      const [result] = await connection.query(
        `DELETE FROM user_sessions
         WHERE revoked_at IS NOT NULL
           AND revoked_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)
         ORDER BY revoked_at ASC
         LIMIT ?`,
        [retentionDays, batchSize],
      );
      const affected = Number(result.affectedRows ?? 0);
      batches += 1;
      removed += affected;
      if (affected === 0) break;
    }
  }

  return {
    table: "user_sessions",
    apply,
    expiredCandidates: expired,
    removed,
    batches,
    liveSessionsProtected: Number(active[0]?.live ?? 0),
    retentionDays,
    truncated: batches >= maxBatches && expired > removed,
  };
};

// Failure buckets are counters, not history, so they age out far sooner: an
// expired window that has seen no traffic for the idle floor can go, and a table
// over its cap is trimmed from the oldest inactive rows. A bucket that is still
// locked is protected by both predicates.
export const pruneThrottleBuckets = async (
  connection,
  {
    idleMinutes = THROTTLE_IDLE_RETENTION_MINUTES,
    rowCap = THROTTLE_ROW_CAP,
    apply = false,
    sweep = null,
  } = {},
) => {
  const [candidates] = await connection.query(
    `SELECT
        COUNT(*) AS total,
        SUM(locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP) AS reclaimable,
        SUM(locked_until > CURRENT_TIMESTAMP) AS live_lockouts
     FROM auth_throttle`,
  );
  const row = candidates[0] ?? {};
  const summary = {
    table: "auth_throttle",
    apply,
    totalRows: Number(row.total ?? 0),
    reclaimable: Number(row.reclaimable ?? 0),
    liveLockoutsProtected: Number(row.live_lockouts ?? 0),
    idleMinutes,
    rowCap,
  };

  if (!apply) {
    return { ...summary, idleRemoved: 0, capRemoved: 0 };
  }

  // Imported only for a real run, so a dry run never loads the application pool.
  const sweepBuckets =
    sweep ??
    (await import("../models/loginThrottleModel.js")).sweepExpiredBuckets;
  const swept = await sweepBuckets({ idleMinutes, rowCap, connection });
  return {
    ...summary,
    idleRemoved: swept.idleRemoved,
    capRemoved: swept.capRemoved,
  };
};

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const apply = process.argv.includes("--apply");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName(),
    port: process.env.DB_PORT,
  });

  try {
    const reports = [
      await pruneRevokedSessions(connection, { apply }),
      await pruneThrottleBuckets(connection, { apply }),
    ];

    for (const report of reports) {
      console.log(
        `${apply ? "APPLIED" : "DRY RUN"}  ${report.table}: ` +
          (report.table === "user_sessions"
            ? `${report.expiredCandidates} past retention, ${report.removed} removed, ` +
              `${report.liveSessionsProtected} live sessions protected`
            : `${report.totalRows} rows, ${report.reclaimable} reclaimable, ` +
              `${report.liveLockoutsProtected} live lockouts protected, ` +
              `${(report.idleRemoved ?? 0) + (report.capRemoved ?? 0)} removed`),
      );
    }

    if (!apply) {
      console.log("No rows were changed. Re-run with --apply to prune.");
    }
  } catch (error) {
    console.error("Retention pruning failed:", error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}
