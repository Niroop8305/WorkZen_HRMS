// Additional employee-profile fields (marital status, bank/PAN/UAN details)
// used by the Private Info and Salary Info tabs. Exported so the init-db
// pipeline can run it against the pipeline's connection; running the file
// directly keeps the standalone CLI behaviour for existing databases.
//
// IMPORTANT: schema.sql does NOT define these columns; they are part of the
// effective schema only after this migration.

import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const ADDITIONAL_COLUMNS = [
  {
    name: "marital_status",
    type: "VARCHAR(50)",
    comment: "Marital status of employee",
  },
  {
    name: "bank_account_number",
    type: "VARCHAR(50)",
    comment: "Bank account number",
  },
  { name: "bank_name", type: "VARCHAR(255)", comment: "Name of the bank" },
  {
    name: "ifsc_code",
    type: "VARCHAR(20)",
    comment: "IFSC code of bank branch",
  },
  { name: "pan_number", type: "VARCHAR(20)", comment: "PAN number" },
  { name: "uan_number", type: "VARCHAR(20)", comment: "UAN number" },
];

/** Idempotent: adds only the columns that are missing; safe to re-run. */
export const migrateAdditionalFields = async (connection) => {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_profiles'`,
  );
  const present = new Set(columns.map((col) => col.name));

  for (const col of ADDITIONAL_COLUMNS) {
    if (!present.has(col.name)) {
      await connection.query(
        `ALTER TABLE employee_profiles
         ADD COLUMN ${col.name} ${col.type} COMMENT '${col.comment}'`,
      );
    }
  }

  return {
    added: ADDITIONAL_COLUMNS.filter((col) => !present.has(col.name)).map(
      (col) => col.name,
    ),
  };
};

// Standalone CLI entry: `node src/database/migrate-additional-fields.js`
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
      const { added } = await migrateAdditionalFields(connection);
      console.log(
        added.length === 0
          ? "⏭️  All additional columns already present"
          : `✅ Added columns: ${added.join(", ")}`,
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
