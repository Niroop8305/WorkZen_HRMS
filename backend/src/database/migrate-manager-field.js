// `manager` display field on employee_profiles. Exported so the init-db
// pipeline can run it against the pipeline's connection; running the file
// directly keeps the standalone CLI behaviour for existing databases.
//
// IMPORTANT: schema.sql does NOT define this column; it is part of the
// effective schema only after this migration.

import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/** Idempotent: adds the column only if it is missing; safe to re-run. */
export const migrateManagerField = async (connection) => {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_profiles'
       AND COLUMN_NAME = 'manager'`,
  );
  if (columns.length > 0) {
    return { added: false };
  }
  await connection.query(
    `ALTER TABLE employee_profiles
     ADD COLUMN manager VARCHAR(255) DEFAULT NULL AFTER department`,
  );
  return { added: true };
};

// Standalone CLI entry: `node src/database/migrate-manager-field.js`
const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(
    process.argv[1].replace(/\\/g, "/").split("/").pop(),
  );

if (isDirectRun) {
  const run = async () => {
    if (!process.env.DB_NAME) {
      console.error(
        "❌ Refusing to run without an explicit DB_NAME (set it in .env)",
      );
      process.exitCode = 1;
      return;
    }
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
    });
    try {
      const { added } = await migrateManagerField(connection);
      console.log(
        added
          ? "✅ Added manager column"
          : "⏭️  Manager column already present",
      );
      process.exitCode = 0;
    } catch (error) {
      console.error("❌ Migration failed:", error.message);
      process.exitCode = 1;
    } finally {
      await connection.end();
    }
  };
  run();
}
