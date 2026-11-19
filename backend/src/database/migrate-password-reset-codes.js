import mysql from "mysql2/promise";
import dotenv from "dotenv";
import pool, { connectDB } from "../config/database.js";

dotenv.config();

// T-003 one-time migration for an EXISTING database: bring
// password_reset_codes to the hashed-code shape, idempotently.
//
//   - create the table when missing (fresh shape: VARCHAR(64) digest column);
//   - widen `reset_code` to VARCHAR(64) when an older install stored the raw
//     6-digit code (VARCHAR(6)); existing plaintext rows remain valid to
//     compare against until they expire (the lookup hashes the submitted code,
//     so plaintext legacy rows simply never match — they are already stale);
//   - enforce `expires_at DATETIME NOT NULL` and the composite lookup index.
//
// The target is the schema the running app is configured for (DB_NAME); the
// table is created there, never anywhere else.

const schemaName = () => process.env.DB_NAME || "workzen_hrms";

const widenColumn = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'password_reset_codes'
       AND COLUMN_NAME IN ('reset_code', 'expires_at')`,
    [schemaName()],
  );
  const byName = new Map(columns.map((c) => [c.COLUMN_NAME, c]));
  const changes = [];

  const codeColumn = byName.get("reset_code");
  if (codeColumn && !/varchar\(64\)/i.test(codeColumn.COLUMN_TYPE)) {
    await pool.query(
      `ALTER TABLE password_reset_codes
       MODIFY reset_code VARCHAR(64) NOT NULL
       COMMENT 'SHA-256 hex digest of the emailed 6-digit code (T-003)'`,
    );
    changes.push(`reset_code widened ${codeColumn.COLUMN_TYPE} -> VARCHAR(64)`);
  }

  const expiryColumn = byName.get("expires_at");
  if (expiryColumn && expiryColumn.IS_NULLABLE === "YES") {
    await pool.query(
      "ALTER TABLE password_reset_codes MODIFY expires_at DATETIME NOT NULL",
    );
    changes.push("expires_at made NOT NULL");
  }

  return changes;
};

const ensureLookupIndex = async () => {
  const [indexes] = await pool.query(
    `SELECT DISTINCT INDEX_NAME AS name
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'password_reset_codes'
       AND INDEX_NAME = 'idx_user_reset_code'`,
    [schemaName()],
  );
  if (indexes.length === 0) {
    await pool.query(
      "ALTER TABLE password_reset_codes ADD INDEX idx_user_reset_code (user_id, reset_code)",
    );
    return true;
  }
  return false;
};

async function run() {
  try {
    await connectDB();
    console.log(
      `Starting password_reset_codes migration for schema "${schemaName()}"...`,
    );

    const [tables] = await pool.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'password_reset_codes'`,
      [schemaName()],
    );

    if (tables.length === 0) {
      await pool.query(`
        CREATE TABLE password_reset_codes (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          reset_code VARCHAR(64) NOT NULL COMMENT 'SHA-256 hex digest of the emailed 6-digit code (T-003)',
          expires_at DATETIME NOT NULL,
          is_used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id),
          INDEX idx_user_reset_code (user_id, reset_code),
          INDEX idx_expires_at (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ password_reset_codes created in the hashed-code shape");
    } else {
      const changes = await widenColumn();
      const indexAdded = await ensureLookupIndex();
      if (changes.length === 0 && !indexAdded) {
        console.log(
          "✅ password_reset_codes already matches the hashed-code shape. No migration needed.",
        );
      } else {
        for (const change of changes) console.log(`   • ${change}`);
        if (indexAdded) console.log("   • composite lookup index added");
        console.log("✅ password_reset_codes reconciled");
      }
    }
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
