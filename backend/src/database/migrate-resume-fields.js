// Resume profile fields on employee_profiles (about, what_i_love, interests,
// skills, certifications). Exported so the init-db pipeline can run it against
// the pipeline's connection; running the file directly keeps the standalone CLI
// behaviour for existing databases.
//
// IMPORTANT: the authoritative schema lives in schema.sql, which does NOT
// define these columns; they are part of the effective schema only after this
// migration, so the pipeline must always run it on a fresh database.

import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const RESUME_COLUMNS = [
  { name: "about", type: "TEXT", comment: "About section for resume" },
  {
    name: "what_i_love",
    type: "TEXT",
    comment: "What I love about my job",
  },
  { name: "interests", type: "TEXT", comment: "My interests and hobbies" },
  { name: "skills", type: "JSON", comment: "Array of skills" },
  {
    name: "certifications",
    type: "JSON",
    comment: "Array of certifications",
  },
];

/** Idempotent: adds only the columns that are missing; safe to re-run. */
export const migrateResumeFields = async (connection) => {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_profiles'`,
  );
  const present = new Set(columns.map((col) => col.name));

  for (const col of RESUME_COLUMNS) {
    if (!present.has(col.name)) {
      await connection.query(
        `ALTER TABLE employee_profiles
         ADD COLUMN ${col.name} ${col.type} COMMENT '${col.comment}'`,
      );
    }
  }

  // Initialize JSON fields so NULL never reaches the JSON-parsing profile code.
  await connection.query(`
    UPDATE employee_profiles
    SET skills = COALESCE(skills, JSON_ARRAY()),
        certifications = COALESCE(certifications, JSON_ARRAY())
    WHERE skills IS NULL OR certifications IS NULL
  `);

  return { added: RESUME_COLUMNS.filter((col) => !present.has(col.name)).map((col) => col.name) };
};

// Standalone CLI entry: `node src/database/migrate-resume-fields.js`
const isDirectRun =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());

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
      const { added } = await migrateResumeFields(connection);
      console.log(
        added.length === 0
          ? "⏭️  All resume columns already present"
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
