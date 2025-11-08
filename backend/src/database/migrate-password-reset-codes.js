import pool from "../config/database.js";

async function createPasswordResetTable() {
  try {
    console.log("Starting migration to create password_reset_codes table...");

    // Check if table already exists
    const [tables] = await pool.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'workzen_hrms' 
        AND TABLE_NAME = 'password_reset_codes'
    `);

    if (tables.length > 0) {
      console.log(
        "password_reset_codes table already exists. No migration needed."
      );
      return;
    }

    // Create password_reset_codes table
    await pool.query(`
      CREATE TABLE password_reset_codes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        reset_code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_reset_code (reset_code),
        INDEX idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("✅ Successfully created password_reset_codes table");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

createPasswordResetTable();
