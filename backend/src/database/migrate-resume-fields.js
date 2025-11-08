import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function migrateResumeFields() {
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
    console.log("📋 Existing columns:", columnNames);

    // Add missing columns
    const columnsToAdd = [
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

    // Initialize JSON fields for existing records
    console.log("🔄 Initializing JSON fields...");
    await connection.query(`
      UPDATE employee_profiles 
      SET skills = COALESCE(skills, JSON_ARRAY()),
          certifications = COALESCE(certifications, JSON_ARRAY())
      WHERE skills IS NULL OR certifications IS NULL
    `);
    console.log("✅ JSON fields initialized");

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
migrateResumeFields()
  .then(() => {
    console.log("✅ All done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
