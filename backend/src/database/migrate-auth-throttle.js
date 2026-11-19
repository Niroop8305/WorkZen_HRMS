import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";

dotenv.config();

const databaseName = () => process.env.DB_NAME || "workzen_hrms";

// Creates the auth_throttle table when it does not exist yet (login throttling
// Step 1). Additive: it never alters, truncates or drops anything, so existing
// rows are preserved. Returns { created } so an orchestrator can report what
// changed.
//
// The DDL below must stay identical to section 15 of schema.sql: schema.sql is
// what a fresh clone gets, this migration is what an older database gets, and the
// two must converge on the same table.
//
// The probe and the CREATE are not one atomic step, so two processes can both
// observe the table as absent - two `npm run setup:demo` runs, or a setup racing a
// direct `migrate:auth-throttle`. The create is therefore `IF NOT EXISTS`, exactly
// like section 15 of schema.sql: the server decides which run creates the table
// and the other run's statement is a no-op instead of error 1050, which would
// otherwise abort the whole setup. Consequence for callers: in that race both runs
// report `created: true`, because the flag means "this run found the table absent
// and emitted the creating DDL", not "this run won the create".
export const migrateAuthThrottle = async (connection, schema = databaseName()) => {
  const [tables] = await connection.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_throttle'`,
    [schema],
  );

  if (tables.length > 0) {
    return { created: false };
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS auth_throttle (
      bucket VARBINARY(96) NOT NULL,
      window_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      attempts INT UNSIGNED NOT NULL DEFAULT 0,
      locked_until TIMESTAMP NULL DEFAULT NULL,
      last_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (bucket),
      INDEX idx_last_attempt (last_attempt_at),
      INDEX idx_locked_until (locked_until)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  `);
  return { created: true };
};

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName(),
    port: process.env.DB_PORT,
  });

  try {
    console.log("Starting migration to create auth_throttle table...");
    const { created } = await migrateAuthThrottle(connection);
    console.log(
      created
        ? "✅ Successfully created auth_throttle table"
        : "auth_throttle table already exists. No migration needed.",
    );
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}
