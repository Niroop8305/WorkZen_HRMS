import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const databaseName = process.env.DB_NAME || "workzen_hrms";

const migrateAttendance = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
    port: process.env.DB_PORT,
  });

  try {
    const [duplicates] = await connection.query(
      `SELECT user_id, attendance_date, COUNT(*) AS duplicate_count
       FROM attendance
       GROUP BY user_id, attendance_date
       HAVING COUNT(*) > 1`,
    );

    if (duplicates.length > 0) {
      throw new Error(
        `Cannot add daily attendance uniqueness; found ${duplicates.length} duplicate employee/date groups`,
      );
    }

    const [columns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance'`,
      [databaseName],
    );
    const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));

    const additions = [
      ["worked_minutes", "INT NULL AFTER total_hours"],
      ["late_minutes", "INT NOT NULL DEFAULT 0 AFTER worked_minutes"],
      [
        "early_checkout_minutes",
        "INT NOT NULL DEFAULT 0 AFTER late_minutes",
      ],
    ];

    for (const [name, definition] of additions) {
      if (!existingColumns.has(name)) {
        await connection.query(`ALTER TABLE attendance ADD COLUMN ${name} ${definition}`);
      }
    }

    const [indexes] = await connection.query(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'attendance'
         AND INDEX_NAME = 'unique_user_attendance_date'`,
      [databaseName],
    );

    if (indexes.length === 0) {
      await connection.query(
        "ALTER TABLE attendance ADD UNIQUE KEY unique_user_attendance_date (user_id, attendance_date)",
      );
    }

    console.log("Attendance migration completed successfully");
  } finally {
    await connection.end();
  }
};

migrateAttendance().catch((error) => {
  console.error("Attendance migration failed:", error.message);
  process.exitCode = 1;
});