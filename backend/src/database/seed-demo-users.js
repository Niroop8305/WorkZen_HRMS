import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";

dotenv.config();

const databaseName = () => process.env.DB_NAME || "workzen_hrms";

export const demoUsers = [
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

// Creates/refreshes the four documented demo accounts plus their current-year
// leave balances. Additive and idempotent: it only touches these four emails and
// never deletes application data. Runs on the caller's connection so an
// orchestrator can target any schema and control the transaction.
export const seedDemoUsers = async (connection, users = demoUsers) => {
  const [leaveTypes] = await connection.query(
    "SELECT leave_type_id, default_days_per_year FROM leave_types",
  );
  if (leaveTypes.length === 0) {
    throw new Error("leave_types is empty; run schema initialization first");
  }

  const summary = [];
  for (const demoUser of users) {
    const [roles] = await connection.query(
      "SELECT role_id FROM roles WHERE role_name = ?",
      [demoUser.role],
    );
    if (roles.length === 0) throw new Error(`Role not found: ${demoUser.role}`);

    const [existing] = await connection.query(
      "SELECT user_id FROM users WHERE email = ?",
      [demoUser.email],
    );
    const isExisting = existing.length > 0;

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
    const [createdUsers] = await connection.query(
      "SELECT user_id FROM users WHERE email = ?",
      [demoUser.email],
    );
    const userId = createdUsers[0].user_id;

    // The upsert above overwrote this account's password. Every credential-rotating
    // path in the application revokes the sessions it did not just mint, and a seed
    // is no exception: a token issued under the previous demo password must not keep
    // working simply because the password was replaced out from under it.
    if (isExisting) {
      await connection.query(
        `UPDATE user_sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND revoked_at IS NULL`,
        [userId],
      );
    }

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
        userId,
        demoUser.employeeCode,
        demoUser.firstName,
        demoUser.lastName,
        demoUser.department,
        demoUser.designation,
      ],
    );

    for (const leaveType of leaveTypes) {
      await connection.query(
        `INSERT IGNORE INTO leave_balance
          (user_id, leave_type_id, year, total_allocated, used_days, remaining_days)
         VALUES (?, ?, YEAR(CURRENT_DATE), ?, 0, ?)`,
        [
          userId,
          leaveType.leave_type_id,
          leaveType.default_days_per_year,
          leaveType.default_days_per_year,
        ],
      );
    }

    summary.push({ role: demoUser.role, email: demoUser.email, userId, isExisting });
  }
  return summary;
};

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName(),
  });

  try {
    await connection.beginTransaction();
    const summary = await seedDemoUsers(connection);
    await connection.commit();
    console.log("Demo users are ready:");
    for (const demoUser of demoUsers) {
      console.log(`- ${demoUser.role}: ${demoUser.email} / ${demoUser.password}`);
    }
    for (const row of summary) {
      if (row.isExisting) {
        console.log(`Note: refreshed existing demo account ${row.email} (id ${row.userId}).`);
      }
    }
  } catch (error) {
    await connection.rollback();
    console.error("Demo user seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}
