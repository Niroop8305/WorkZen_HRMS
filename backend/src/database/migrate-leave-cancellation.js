import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import { pathToFileURL } from "node:url";

dotenv.config();

const databaseName = () => process.env.DB_NAME || "workzen_hrms";

const migrationFile = new URL(
  "./migrations/003_leave_cancellation_trigger.sql",
  import.meta.url,
);

// Reinstalls the leave approval/cancellation balance trigger. The script drops
// before creating, so re-running is safe. Any hard-coded `USE <schema>;`
// statement is removed so the migration can target the orchestrator's schema.
export const migrateLeaveCancellation = async (connection, schema = databaseName()) => {
  const sql = fs
    .readFileSync(migrationFile, "utf8")
    .replace(/^\s*USE\s+`?\w+`?\s*;\s*$/im, "");

  await connection.query(sql);
  return { schema };
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
    multipleStatements: true,
  });

  try {
    await migrateLeaveCancellation(connection);
    console.log("Leave cancellation trigger migration completed successfully");
  } catch (error) {
    console.error("Leave cancellation migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}
