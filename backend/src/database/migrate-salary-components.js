import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";

dotenv.config();

const databaseName = () => process.env.DB_NAME || "workzen_hrms";

// Adds salary_components.calculation_type, which the payroll salary-structure
// model reads. Idempotent: re-running detects the existing column and no-ops.
// Returns { added } so an orchestrator can report what actually changed.
export const migrateSalaryComponents = async (
  connection,
  schema = databaseName(),
) => {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'salary_components'`,
    [schema],
  );
  const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));

  if (existingColumns.has("calculation_type")) {
    return { added: false };
  }

  await connection.query(
    `ALTER TABLE salary_components
       ADD COLUMN calculation_type ENUM('FIXED', 'PERCENTAGE') NOT NULL DEFAULT 'FIXED'
       AFTER component_type`,
  );
  return { added: true };
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
    const { added } = await migrateSalaryComponents(connection);
    console.log(
      added
        ? "Added salary_components.calculation_type"
        : "salary_components.calculation_type already exists; skipping",
    );
    console.log("Salary components migration completed successfully");
  } catch (error) {
    console.error("Salary components migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}
