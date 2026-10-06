import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const migrate = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    multipleStatements: true,
  });
  try {
    await connection.query(
      fs.readFileSync(new URL("./migrations/003_leave_cancellation_trigger.sql", import.meta.url), "utf8"),
    );
    console.log("Leave cancellation trigger migration completed successfully");
  } finally {
    await connection.end();
  }
};

migrate().catch((error) => {
  console.error("Leave cancellation migration failed:", error.message);
  process.exitCode = 1;
});