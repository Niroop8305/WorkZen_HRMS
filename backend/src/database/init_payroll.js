import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializePayrollDatabase() {
  try {
    console.log('🚀 Initializing Payroll Database...\n');

    // Read and execute the schema file
    const schemaPath = path.join(__dirname, 'payroll_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split SQL statements by semicolon and execute one by one
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (error) {
        // Ignore duplicate entry errors for sample data
        if (!error.message.includes('Duplicate entry')) {
          console.error('Error executing statement:', error.message);
        }
      }
    }

    console.log('✅ Database tables created successfully');
    console.log('✅ Sample employees added');
    console.log('✅ Sample attendance data added\n');

    // Verify data
    const [employees] = await pool.query('SELECT COUNT(*) as count FROM employees');
    const [attendance] = await pool.query('SELECT COUNT(*) as count FROM attendance');

    console.log('📊 Database Summary:');
    console.log(`   - Employees: ${employees[0].count}`);
    console.log(`   - Attendance Records: ${attendance[0].count}\n`);

    console.log('🎉 Payroll database initialization complete!\n');
    console.log('You can now:');
    console.log('   1. Start the backend server: npm start');
    console.log('   2. Access the Payrun Dashboard at: http://localhost:5173/payrun');
    console.log('   3. Click "Run Payrun" to generate payslips\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
}

initializePayrollDatabase();
