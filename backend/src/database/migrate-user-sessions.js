import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";

dotenv.config();

const databaseName = () => process.env.DB_NAME || "workzen_hrms";

// Creates the user_sessions table when it does not exist yet (HIGH-3 session
// revocation). Additive and idempotent: existing users, sessions and data are
// preserved. Returns { created } so an orchestrator can report what changed.
export const migrateUserSessions = async (connection, schema = databaseName()) => {
  const [tables] = await connection.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_sessions'`,
    [schema],
  );

  if (tables.length > 0) {
    return { created: false };
  }

  await connection.query(`
    CREATE TABLE user_sessions (
      session_id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMP NULL,
      expires_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_revoked_at (revoked_at),
      INDEX idx_session_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
    console.log("Starting migration to create user_sessions table...");
    const { created } = await migrateUserSessions(connection);
    console.log(
      created
        ? "✅ Successfully created user_sessions table"
        : "user_sessions table already exists. No migration needed.",
    );
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}
