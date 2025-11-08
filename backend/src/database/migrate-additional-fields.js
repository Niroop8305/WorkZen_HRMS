import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function migrateAdditionalFields() {
  let connection;

  try {
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "workzen_hrms",
      port: process.env.DB_PORT || 3306,
    });

    console.log("✅ Connected to database");

    // Check if columns exist
    const [columns] = await connection.query(
      `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'employee_profiles'
    `,
      [process.env.DB_NAME || "workzen_hrms"]
    );

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    console.log("📋 Checking for additional fields...");

    // Add missing columns for Private Info and Salary Info
    const columnsToAdd = [
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

    for (const col of columnsToAdd) {
      if (!columnNames.includes(col.name)) {
        console.log(`➕ Adding column: ${col.name}`);
        await connection.query(`
          ALTER TABLE employee_profiles 
          ADD COLUMN ${col.name} ${col.type} COMMENT '${col.comment}'
        `);
        console.log(`✅ Added column: ${col.name}`);
      } else {
        console.log(`⏭️  Column ${col.name} already exists`);
      }
    }

    console.log("🎉 Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration
migrateAdditionalFields()
  .then(() => {
    console.log("✅ All done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
