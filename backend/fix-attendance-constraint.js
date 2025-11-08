import pool from "./src/config/database.js";

async function fixUniqueConstraint() {
  let connection;
  try {
    console.log("🔧 Fixing attendance unique constraint...\n");

    connection = await pool.getConnection();

    // Check if the constraint exists
    console.log("Checking for unique_user_date constraint...");
    const [indexes] = await connection.query(`
      SHOW INDEX FROM attendance WHERE Key_name = 'unique_user_date'
    `);

    if (indexes.length > 0) {
      console.log("✓ Found unique_user_date constraint, removing it...");

      // Drop the unique constraint
      await connection.query(`
        ALTER TABLE attendance DROP INDEX unique_user_date
      `);

      console.log("✅ Unique constraint removed successfully!");
    } else {
      console.log(
        "✓ No unique_user_date constraint found. Database is already correct."
      );
    }

    // Verify the fix
    console.log("\nVerifying attendance table structure...");
    const [allIndexes] = await connection.query(`
      SHOW INDEX FROM attendance
    `);

    console.log("\nCurrent indexes on attendance table:");
    allIndexes.forEach((idx) => {
      console.log(`  - ${idx.Key_name} (${idx.Column_name})`);
    });

    console.log(
      "\n✅ Fix completed! Multiple check-ins per day are now allowed."
    );
  } catch (error) {
    console.error("❌ Error fixing constraint:", error.message);
    throw error;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

fixUniqueConstraint();
