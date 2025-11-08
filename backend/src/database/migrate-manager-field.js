import pool from "../config/database.js";

async function addManagerField() {
  try {
    console.log("Starting migration to add manager field...");

    // Check if manager column already exists
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'workzen_hrms' 
        AND TABLE_NAME = 'employee_profiles' 
        AND COLUMN_NAME = 'manager'
    `);

    if (columns.length > 0) {
      console.log("Manager column already exists. No migration needed.");
      return;
    }

    // Add manager column
    await pool.query(`
      ALTER TABLE employee_profiles
      ADD COLUMN manager VARCHAR(255) DEFAULT NULL AFTER department
    `);

    console.log(
      "✅ Successfully added manager field to employee_profiles table"
    );
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

addManagerField();
