import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USERS_TO_CREATE = [
  {
    role: 'Admin',
    email: 'admin@workzen.com',
    password: 'Password@123',
    firstName: 'Admin',
    lastName: 'User',
    designation: 'System Administrator',
    department: 'IT'
  },
  {
    role: 'HR Officer',
    email: 'hr@workzen.com',
    password: 'Password@123',
    firstName: 'Sarah',
    lastName: 'Connor',
    designation: 'HR Manager',
    department: 'Human Resources'
  },
  {
    role: 'Payroll Officer',
    email: 'payroll@workzen.com',
    password: 'Password@123',
    firstName: 'Peter',
    lastName: 'Parker',
    designation: 'Payroll Specialist',
    department: 'Finance'
  },
  {
    role: 'Employee',
    email: 'emp1@workzen.com',
    password: 'Password@123',
    firstName: 'John',
    lastName: 'Doe',
    designation: 'Software Engineer',
    department: 'Engineering'
  },
  {
    role: 'Employee',
    email: 'emp2@workzen.com',
    password: 'Password@123',
    firstName: 'Jane',
    lastName: 'Smith',
    designation: 'Product Designer',
    department: 'Design'
  },
  {
      role: 'Employee',
      email: 'emp3@workzen.com',
      password: 'Password@123',
      firstName: 'Alice',
      lastName: 'Johnson',
      designation: 'QA Engineer',
      department: 'Engineering'
  }
];

// Helper to get random date within range
const getRandomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

async function seedDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });

    console.log('🌱 Starting Database Seeding...');

    // 1. Clear existing data (in reverse order of dependencies)
    console.log('🧹 Clearing existing data...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE password_reset_codes');
    await connection.query('TRUNCATE TABLE audit_logs');
    await connection.query('TRUNCATE TABLE payroll_details');
    await connection.query('TRUNCATE TABLE payroll');
    await connection.query('TRUNCATE TABLE employee_salary_structure');
    await connection.query('TRUNCATE TABLE salary_components');
    await connection.query('TRUNCATE TABLE leave_applications');
    await connection.query('TRUNCATE TABLE leave_balance');
    await connection.query('TRUNCATE TABLE attendance');
    await connection.query('TRUNCATE TABLE employee_profiles');
    await connection.query('TRUNCATE TABLE users');
    // We don't truncate roles or leave_types as they are static enum-like tables, 
    // but we can ensure they exist.
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // 2. Ensure Roles exist
    console.log('🛡️  Verifying Roles...');
    // Roles are likely inserted by schema.sql, but let's fetch them to get IDs
    const [roles] = await connection.query('SELECT * FROM roles');
    const roleMap = {};
    roles.forEach(r => roleMap[r.role_name] = r.role_id);

    // 3. Create Users & Profiles
    console.log('👥 Creating Users and Profiles...');
    const userMap = {}; // email -> user_id

    for (const u of USERS_TO_CREATE) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(u.password, salt);
      const roleId = roleMap[u.role];

      const [userResult] = await connection.query(
        'INSERT INTO users (role_id, email, password_hash, is_active) VALUES (?, ?, ?, ?)',
        [roleId, u.email, hashedPassword, true]
      );
      
      const userId = userResult.insertId;
      userMap[u.email] = userId;

      const employeeCode = 'WZ' + Math.floor(1000 + Math.random() * 9000); // Random code

      await connection.query(
        `INSERT INTO employee_profiles 
        (user_id, employee_code, first_name, last_name, designation, department, company_name, date_of_joining) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, employeeCode, u.firstName, u.lastName, u.designation, u.department, 'WorkZen Inc', new Date('2024-01-01')]
      );
    }

    // 4. Create Salary Components (if not exist - redundant if schema.sql inserts them)
    // We'll rely on schema.sql for components but let's fetch them
    const [components] = await connection.query('SELECT * FROM salary_components');
    const compMap = {};
    components.forEach(c => compMap[c.component_name] = c.component_id);


    // 5. Assign Salary Structure to Employees
    console.log('💰 Assigning Salary Structures...');
    const employeeEmails = USERS_TO_CREATE.filter(u => u.designation).map(u => u.email);
    
    for (const email of employeeEmails) {
      const userId = userMap[email];
      // Basic structure
      const structure = [
        { name: 'Basic Salary', amount: 30000 },
        { name: 'House Rent Allowance', amount: 15000 },
        { name: 'Special Allowance', amount: 5000 },
        { name: 'Provident Fund', amount: 1800 }, // Deduction
        { name: 'Professional Tax', amount: 200 } // Deduction
      ];

      for (const item of structure) {
         if (compMap[item.name]) {
             await connection.query(
                 'INSERT INTO employee_salary_structure (user_id, component_id, amount, effective_from) VALUES (?, ?, ?, ?)',
                 [userId, compMap[item.name], item.amount, new Date('2024-01-01')]
             );
         }
      }
    }


    // 6. Generate Attendance (Last 30 days)
    console.log('📅 Generating Attendance Logs...');
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    for (const email of employeeEmails) {
        const userId = userMap[email];
        let currentDate = new Date(thirtyDaysAgo);

        while (currentDate <= today) {
            // Skip weekends
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) { 
                const isPresent = Math.random() > 0.1; // 90% attendance
                const status = isPresent ? 'Present' : 'Absent';
                const checkIn = isPresent ? new Date(currentDate.setHours(9, 0, 0)) : null;
                const checkOut = isPresent ? new Date(currentDate.setHours(18, 0, 0)) : null;
                const hours = isPresent ? 9 : 0;

                await connection.query(
                    'INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, currentDate, checkIn, checkOut, hours, status]
                );
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    // 7. Initialize Leave Balances
    console.log('🏖️  Initializing Leave Balances...');
    const [leaveTypes] = await connection.query('SELECT * FROM leave_types');
    
    for (const email of employeeEmails) {
        const userId = userMap[email];
        for (const type of leaveTypes) {
             await connection.query(
                'INSERT INTO leave_balance (user_id, leave_type_id, year, total_allocated, remaining_days) VALUES (?, ?, ?, ?, ?)',
                [userId, type.leave_type_id, 2025, type.default_days_per_year, type.default_days_per_year]
             );
        }
    }

    console.log('✅ Seeding Completed Successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Seeding Failed:', error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

seedDatabase();
