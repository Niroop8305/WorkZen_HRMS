import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pool from "../config/database.js";

dotenv.config();

const demoUsers = [
  {
    role: "Admin",
    email: "admin@workzen.demo",
    password: "Admin@123",
    employeeCode: "WZ-ADMIN-001",
    firstName: "Aarav",
    lastName: "Mehta",
    department: "Administration",
    designation: "HRMS Administrator",
  },
  {
    role: "HR Officer",
    email: "hr@workzen.demo",
    password: "Hr@123",
    employeeCode: "WZ-HR-001",
    firstName: "Ananya",
    lastName: "Rao",
    department: "Human Resources",
    designation: "HR Officer",
  },
  {
    role: "Payroll Officer",
    email: "payroll@workzen.demo",
    password: "Payroll@123",
    employeeCode: "WZ-PAY-001",
    firstName: "Vikram",
    lastName: "Shah",
    department: "Finance",
    designation: "Payroll Officer",
  },
  {
    role: "Employee",
    email: "employee@workzen.demo",
    password: "Employee@123",
    employeeCode: "WZ-EMP-001",
    firstName: "Priya",
    lastName: "Nair",
    department: "Engineering",
    designation: "Software Engineer",
  },
];

const seedDemoUsers = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const demoUser of demoUsers) {
      const [roles] = await connection.query(
        "SELECT role_id FROM roles WHERE role_name = ?",
        [demoUser.role],
      );
      if (roles.length === 0) throw new Error(`Role not found: ${demoUser.role}`);

      const passwordHash = await bcrypt.hash(demoUser.password, 10);
      await connection.query(
        `INSERT INTO users (role_id, email, password_hash, is_active)
         VALUES (?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE
           role_id = VALUES(role_id),
           password_hash = VALUES(password_hash),
           is_active = TRUE`,
        [roles[0].role_id, demoUser.email, passwordHash],
      );
      const [users] = await connection.query(
        "SELECT user_id FROM users WHERE email = ?",
        [demoUser.email],
      );

      await connection.query(
        `INSERT INTO employee_profiles
          (user_id, employee_code, company_name, first_name, last_name,
           country, date_of_joining, department, designation)
         VALUES (?, ?, 'WorkZen Technologies', ?, ?, 'India', CURRENT_DATE, ?, ?)
         ON DUPLICATE KEY UPDATE
           employee_code = VALUES(employee_code),
           first_name = VALUES(first_name),
           last_name = VALUES(last_name),
           department = VALUES(department),
           designation = VALUES(designation)`,
        [
          users[0].user_id,
          demoUser.employeeCode,
          demoUser.firstName,
          demoUser.lastName,
          demoUser.department,
          demoUser.designation,
        ],
      );
    }
    await connection.commit();
    console.log("Demo users are ready:");
    for (const demoUser of demoUsers) {
      console.log(`- ${demoUser.role}: ${demoUser.email} / ${demoUser.password}`);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
};

seedDemoUsers().catch((error) => {
  console.error("Demo user seeding failed:", error.message);
  process.exitCode = 1;
});