import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const databaseName = process.env.DB_NAME || "workzen_hrms";

const migrateSalaryComponents = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
    port: process.env.DB_PORT,
  });

  try {
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'salary_components'`,
      [databaseName],
    );
    const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));

    if (!existingColumns.has("calculation_type")) {
      await connection.query(
        `ALTER TABLE salary_components
           ADD COLUMN calculation_type ENUM('FIXED', 'PERCENTAGE') NOT NULL DEFAULT 'FIXED'
           AFTER component_type`,
      );
      console.log("Added salary_components.calculation_type");
    } else {
      console.log("salary_components.calculation_type already exists; skipping");
    }

    console.log("Salary components migration completed successfully");
  } finally {
    await connection.end();
  }
};

migrateSalaryComponents().catch((error) => {
  console.error("Salary components migration failed:", error.message);
  process.exitCode = 1;
});
