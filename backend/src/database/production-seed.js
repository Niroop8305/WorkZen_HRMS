import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

// Comprehensive production-ready users
const USERS_TO_CREATE = [
  // Admin Users
  {
    role: "Admin",
    email: "admin@workzen.com",
    password: "Admin@2025",
    firstName: "Rajesh",
    lastName: "Kumar",
    phone: "+91-9876543210",
    dateOfBirth: "1985-05-15",
    gender: "Male",
    designation: "Chief Technology Officer",
    department: "IT",
    address: "123 Tech Park",
    city: "Bangalore",
    state: "Karnataka",
    postalCode: "560001",
    emergencyContactName: "Priya Kumar",
    emergencyContactPhone: "+91-9876543211",
    dateOfJoining: "2020-01-15",
  },

  // HR Officers
  {
    role: "HR Officer",
    email: "sarah.hr@workzen.com",
    password: "Hr@2025",
    firstName: "Sarah",
    lastName: "Mathews",
    phone: "+91-9876543220",
    dateOfBirth: "1990-08-22",
    gender: "Female",
    designation: "HR Manager",
    department: "Human Resources",
    address: "456 HR Plaza",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400001",
    emergencyContactName: "John Mathews",
    emergencyContactPhone: "+91-9876543221",
    dateOfJoining: "2021-03-10",
  },

  // Payroll Officers
  {
    role: "Payroll Officer",
    email: "finance@workzen.com",
    password: "Payroll@2025",
    firstName: "Amit",
    lastName: "Sharma",
    phone: "+91-9876543230",
    dateOfBirth: "1988-12-05",
    gender: "Male",
    designation: "Payroll Specialist",
    department: "Finance",
    address: "789 Finance Tower",
    city: "Delhi",
    state: "Delhi",
    postalCode: "110001",
    emergencyContactName: "Ritu Sharma",
    emergencyContactPhone: "+91-9876543231",
    dateOfJoining: "2021-06-01",
  },

  // Engineering Team
  {
    role: "Employee",
    email: "john.dev@workzen.com",
    password: "Employee@2025",
    firstName: "John",
    lastName: "Doe",
    phone: "+91-9876543240",
    dateOfBirth: "1995-03-18",
    gender: "Male",
    designation: "Senior Software Engineer",
    department: "Engineering",
    address: "101 Tech Valley",
    city: "Bangalore",
    state: "Karnataka",
    postalCode: "560002",
    emergencyContactName: "Jane Doe",
    emergencyContactPhone: "+91-9876543241",
    dateOfJoining: "2022-01-10",
  },
  {
    role: "Employee",
    email: "priya.dev@workzen.com",
    password: "Employee@2025",
    firstName: "Priya",
    lastName: "Reddy",
    phone: "+91-9876543250",
    dateOfBirth: "1996-07-25",
    gender: "Female",
    designation: "Software Engineer",
    department: "Engineering",
    address: "202 Innovation Hub",
    city: "Hyderabad",
    state: "Telangana",
    postalCode: "500001",
    emergencyContactName: "Ramesh Reddy",
    emergencyContactPhone: "+91-9876543251",
    dateOfJoining: "2023-02-15",
  },
  {
    role: "Employee",
    email: "david.qa@workzen.com",
    password: "Employee@2025",
    firstName: "David",
    lastName: "Wilson",
    phone: "+91-9876543260",
    dateOfBirth: "1994-11-30",
    gender: "Male",
    designation: "QA Engineer",
    department: "Engineering",
    address: "303 Quality Street",
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411001",
    emergencyContactName: "Lisa Wilson",
    emergencyContactPhone: "+91-9876543261",
    dateOfJoining: "2022-08-20",
  },

  // Design Team
  {
    role: "Employee",
    email: "emily.design@workzen.com",
    password: "Employee@2025",
    firstName: "Emily",
    lastName: "Chen",
    phone: "+91-9876543270",
    dateOfBirth: "1997-04-12",
    gender: "Female",
    designation: "Senior UI/UX Designer",
    department: "Design",
    address: "404 Creative Square",
    city: "Bangalore",
    state: "Karnataka",
    postalCode: "560003",
    emergencyContactName: "Michael Chen",
    emergencyContactPhone: "+91-9876543271",
    dateOfJoining: "2022-04-01",
  },
  {
    role: "Employee",
    email: "alex.design@workzen.com",
    password: "Employee@2025",
    firstName: "Alex",
    lastName: "Kumar",
    phone: "+91-9876543280",
    dateOfBirth: "1998-09-08",
    gender: "Male",
    designation: "Product Designer",
    department: "Design",
    address: "505 Design Hub",
    city: "Chennai",
    state: "Tamil Nadu",
    postalCode: "600001",
    emergencyContactName: "Sneha Kumar",
    emergencyContactPhone: "+91-9876543281",
    dateOfJoining: "2023-07-15",
  },

  // Product Management
  {
    role: "Employee",
    email: "lisa.pm@workzen.com",
    password: "Employee@2025",
    firstName: "Lisa",
    lastName: "Thompson",
    phone: "+91-9876543290",
    dateOfBirth: "1992-06-20",
    gender: "Female",
    designation: "Product Manager",
    department: "Product",
    address: "606 Product Plaza",
    city: "Bangalore",
    state: "Karnataka",
    postalCode: "560004",
    emergencyContactName: "Robert Thompson",
    emergencyContactPhone: "+91-9876543291",
    dateOfJoining: "2021-09-01",
  },

  // Sales Team
  {
    role: "Employee",
    email: "raj.sales@workzen.com",
    password: "Employee@2025",
    firstName: "Raj",
    lastName: "Patel",
    phone: "+91-9876543300",
    dateOfBirth: "1993-02-14",
    gender: "Male",
    designation: "Sales Manager",
    department: "Sales",
    address: "707 Sales Center",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400002",
    emergencyContactName: "Anjali Patel",
    emergencyContactPhone: "+91-9876543301",
    dateOfJoining: "2021-11-15",
  },

  // Marketing Team
  {
    role: "Employee",
    email: "maya.marketing@workzen.com",
    password: "Employee@2025",
    firstName: "Maya",
    lastName: "Singh",
    phone: "+91-9876543310",
    dateOfBirth: "1996-10-05",
    gender: "Female",
    designation: "Marketing Specialist",
    department: "Marketing",
    address: "808 Marketing Avenue",
    city: "Delhi",
    state: "Delhi",
    postalCode: "110002",
    emergencyContactName: "Vikram Singh",
    emergencyContactPhone: "+91-9876543311",
    dateOfJoining: "2023-01-10",
  },

  // Customer Support
  {
    role: "Employee",
    email: "tom.support@workzen.com",
    password: "Employee@2025",
    firstName: "Tom",
    lastName: "Anderson",
    phone: "+91-9876543320",
    dateOfBirth: "1995-01-28",
    gender: "Male",
    designation: "Customer Support Lead",
    department: "Support",
    address: "909 Support Center",
    city: "Bangalore",
    state: "Karnataka",
    postalCode: "560005",
    emergencyContactName: "Anna Anderson",
    emergencyContactPhone: "+91-9876543321",
    dateOfJoining: "2022-05-20",
  },
];

// Helper to get random date within range
const getRandomDate = (start, end) => {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
};

// Helper to get random time within working hours
const getRandomWorkTime = (baseHour, varianceMinutes = 30) => {
  const hour = baseHour;
  const minute = Math.floor(Math.random() * varianceMinutes);
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00`;
};

async function seedDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
    });

    console.log("🌱 Starting Production Database Seeding...");
    console.log("================================================\n");

    // 1. Clear existing data (in reverse order of dependencies)
    console.log("🧹 Clearing existing data...");
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    await connection.query("TRUNCATE TABLE password_reset_codes");
    await connection.query("TRUNCATE TABLE audit_logs");
    await connection.query("TRUNCATE TABLE payroll_details");
    await connection.query("TRUNCATE TABLE payroll");
    await connection.query("TRUNCATE TABLE employee_salary_structure");
    await connection.query("TRUNCATE TABLE leave_applications");
    await connection.query("TRUNCATE TABLE leave_balance");
    await connection.query("TRUNCATE TABLE attendance");
    await connection.query("TRUNCATE TABLE employee_profiles");
    await connection.query("TRUNCATE TABLE users");
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("✅ Data cleared successfully\n");

    // 2. Get Roles and Leave Types
    console.log("🛡️  Fetching roles and leave types...");
    const [roles] = await connection.query("SELECT * FROM roles");
    const roleMap = {};
    roles.forEach((r) => (roleMap[r.role_name] = r.role_id));

    const [leaveTypes] = await connection.query("SELECT * FROM leave_types");
    const leaveTypeMap = {};
    leaveTypes.forEach(
      (lt) => (leaveTypeMap[lt.leave_type_name] = lt.leave_type_id),
    );
    console.log(
      `✅ Found ${roles.length} roles and ${leaveTypes.length} leave types\n`,
    );

    // 3. Get Salary Components
    console.log("💰 Fetching salary components...");
    const [components] = await connection.query(
      "SELECT * FROM salary_components",
    );
    const compMap = {};
    components.forEach((c) => (compMap[c.component_name] = c.component_id));
    console.log(`✅ Found ${components.length} salary components\n`);

    // 4. Create Users & Profiles
    console.log("👥 Creating users and employee profiles...");
    const userMap = {}; // email -> user_id
    let userCount = 0;

    for (const u of USERS_TO_CREATE) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(u.password, salt);
      const roleId = roleMap[u.role];

      const [userResult] = await connection.query(
        "INSERT INTO users (role_id, email, password_hash, is_active) VALUES (?, ?, ?, ?)",
        [roleId, u.email, hashedPassword, true],
      );

      const userId = userResult.insertId;
      userMap[u.email] = userId;

      // Generate employee code based on department
      const deptCode = u.department.substring(0, 3).toUpperCase();
      const employeeCode = `WZ${deptCode}${(1000 + userCount).toString()}`;

      await connection.query(
        `INSERT INTO employee_profiles 
        (user_id, employee_code, first_name, last_name, phone, date_of_birth, gender,
         address, city, state, country, postal_code, emergency_contact_name, 
         emergency_contact_phone, date_of_joining, department, designation, company_name) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          employeeCode,
          u.firstName,
          u.lastName,
          u.phone,
          u.dateOfBirth,
          u.gender,
          u.address,
          u.city,
          u.state,
          "India",
          u.postalCode,
          u.emergencyContactName,
          u.emergencyContactPhone,
          u.dateOfJoining,
          u.department,
          u.designation,
          "WorkZen Inc",
        ],
      );

      userCount++;
      console.log(
        `  ✓ Created ${u.role}: ${u.email} (${u.firstName} ${u.lastName})`,
      );
    }
    console.log(`✅ Created ${userCount} users with profiles\n`);

    // 5. Assign Salary Structures
    console.log("💵 Assigning salary structures...");
    const salaryStructures = {
      "Chief Technology Officer": {
        "Basic Salary": 80000,
        "House Rent Allowance": 40000,
        "Special Allowance": 20000,
        "Transport Allowance": 5000,
        "Medical Allowance": 2500,
        "Provident Fund": 9600,
        "Professional Tax": 200,
        "Income Tax": 15000,
      },
      "HR Manager": {
        "Basic Salary": 60000,
        "House Rent Allowance": 30000,
        "Special Allowance": 15000,
        "Transport Allowance": 3000,
        "Medical Allowance": 2000,
        "Provident Fund": 7200,
        "Professional Tax": 200,
        "Income Tax": 10000,
      },
      "Payroll Specialist": {
        "Basic Salary": 55000,
        "House Rent Allowance": 27500,
        "Special Allowance": 12000,
        "Transport Allowance": 3000,
        "Medical Allowance": 2000,
        "Provident Fund": 6600,
        "Professional Tax": 200,
        "Income Tax": 8500,
      },
      "Senior Software Engineer": {
        "Basic Salary": 70000,
        "House Rent Allowance": 35000,
        "Special Allowance": 18000,
        "Transport Allowance": 4000,
        "Medical Allowance": 2500,
        "Provident Fund": 8400,
        "Professional Tax": 200,
        "Income Tax": 12000,
      },
      "Software Engineer": {
        "Basic Salary": 50000,
        "House Rent Allowance": 25000,
        "Special Allowance": 10000,
        "Transport Allowance": 3000,
        "Medical Allowance": 2000,
        "Provident Fund": 6000,
        "Professional Tax": 200,
        "Income Tax": 7000,
      },
      "QA Engineer": {
        "Basic Salary": 45000,
        "House Rent Allowance": 22500,
        "Special Allowance": 9000,
        "Transport Allowance": 3000,
        "Medical Allowance": 1500,
        "Provident Fund": 5400,
        "Professional Tax": 200,
        "Income Tax": 6000,
      },
      "Senior UI/UX Designer": {
        "Basic Salary": 65000,
        "House Rent Allowance": 32500,
        "Special Allowance": 16000,
        "Transport Allowance": 3500,
        "Medical Allowance": 2500,
        "Provident Fund": 7800,
        "Professional Tax": 200,
        "Income Tax": 11000,
      },
      "Product Designer": {
        "Basic Salary": 48000,
        "House Rent Allowance": 24000,
        "Special Allowance": 10000,
        "Transport Allowance": 3000,
        "Medical Allowance": 2000,
        "Provident Fund": 5760,
        "Professional Tax": 200,
        "Income Tax": 6500,
      },
      "Product Manager": {
        "Basic Salary": 75000,
        "House Rent Allowance": 37500,
        "Special Allowance": 20000,
        "Transport Allowance": 5000,
        "Medical Allowance": 3000,
        "Provident Fund": 9000,
        "Professional Tax": 200,
        "Income Tax": 13000,
      },
      "Sales Manager": {
        "Basic Salary": 60000,
        "House Rent Allowance": 30000,
        "Special Allowance": 15000,
        "Transport Allowance": 5000,
        "Medical Allowance": 2500,
        "Provident Fund": 7200,
        "Professional Tax": 200,
        "Income Tax": 10000,
      },
      "Marketing Specialist": {
        "Basic Salary": 45000,
        "House Rent Allowance": 22500,
        "Special Allowance": 10000,
        "Transport Allowance": 3000,
        "Medical Allowance": 2000,
        "Provident Fund": 5400,
        "Professional Tax": 200,
        "Income Tax": 6000,
      },
      "Customer Support Lead": {
        "Basic Salary": 42000,
        "House Rent Allowance": 21000,
        "Special Allowance": 8000,
        "Transport Allowance": 2500,
        "Medical Allowance": 1500,
        "Provident Fund": 5040,
        "Professional Tax": 200,
        "Income Tax": 5500,
      },
    };

    let structureCount = 0;
    for (const u of USERS_TO_CREATE) {
      const userId = userMap[u.email];
      const structure = salaryStructures[u.designation];

      if (structure) {
        for (const [componentName, amount] of Object.entries(structure)) {
          if (compMap[componentName]) {
            await connection.query(
              "INSERT INTO employee_salary_structure (user_id, component_id, amount, effective_from) VALUES (?, ?, ?, ?)",
              [userId, compMap[componentName], amount, new Date("2024-01-01")],
            );
            structureCount++;
          }
        }
        console.log(
          `  ✓ Assigned salary structure for ${u.firstName} ${u.lastName}`,
        );
      }
    }
    console.log(`✅ Created ${structureCount} salary structure entries\n`);

    // 6. Generate Realistic Attendance Data (Last 90 days)
    console.log("📅 Generating attendance records for last 90 days...");
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);

    let attendanceCount = 0;
    for (const u of USERS_TO_CREATE) {
      const userId = userMap[u.email];
      let currentDate = new Date(ninetyDaysAgo);

      while (currentDate <= today) {
        // Skip weekends (Saturday=6, Sunday=0)
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          // 95% attendance rate for realistic data
          const isPresent = Math.random() > 0.05;

          if (isPresent) {
            // Realistic check-in times (8:45 AM - 9:30 AM)
            const checkInHour = 9;
            const checkInMinute = Math.floor(Math.random() * 45); // 0-45 minutes
            const checkInTime = new Date(currentDate);
            checkInTime.setHours(checkInHour, checkInMinute, 0);

            // Realistic check-out times (5:30 PM - 7:00 PM)
            const checkOutHour = 17 + Math.floor(Math.random() * 2); // 17-18 hours
            const checkOutMinute = 30 + Math.floor(Math.random() * 30); // 30-60 minutes
            const checkOutTime = new Date(currentDate);
            checkOutTime.setHours(checkOutHour, checkOutMinute, 0);

            // Calculate hours
            const hours = (
              (checkOutTime - checkInTime) /
              (1000 * 60 * 60)
            ).toFixed(2);

            // Determine status based on check-in time
            let status = "Present";
            if (checkInMinute > 30) {
              status = "Late";
            }

            await connection.query(
              "INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES (?, ?, ?, ?, ?, ?)",
              [
                userId,
                currentDate.toISOString().split("T")[0],
                checkInTime,
                checkOutTime,
                hours,
                status,
              ],
            );
            attendanceCount++;
          } else {
            // Absent
            await connection.query(
              "INSERT INTO attendance (user_id, attendance_date, status) VALUES (?, ?, ?)",
              [userId, currentDate.toISOString().split("T")[0], "Absent"],
            );
            attendanceCount++;
          }
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      console.log(`  ✓ Generated attendance for ${u.firstName} ${u.lastName}`);
    }
    console.log(`✅ Created ${attendanceCount} attendance records\n`);

    // 7. Initialize Leave Balances for 2025 and 2026
    console.log("🏖️  Initializing leave balances...");
    let balanceCount = 0;

    for (const u of USERS_TO_CREATE) {
      const userId = userMap[u.email];

      for (const lt of leaveTypes) {
        // 2025 balances (partially used)
        const allocated2025 = lt.default_days_per_year;
        const used2025 = Math.floor(Math.random() * 5); // 0-4 days used
        const remaining2025 = allocated2025 - used2025;

        await connection.query(
          "INSERT INTO leave_balance (user_id, leave_type_id, year, total_allocated, used_days, remaining_days) VALUES (?, ?, ?, ?, ?, ?)",
          [
            userId,
            lt.leave_type_id,
            2025,
            allocated2025,
            used2025,
            remaining2025,
          ],
        );

        // 2026 balances (fresh)
        await connection.query(
          "INSERT INTO leave_balance (user_id, leave_type_id, year, total_allocated, used_days, remaining_days) VALUES (?, ?, ?, ?, ?, ?)",
          [
            userId,
            lt.leave_type_id,
            2026,
            lt.default_days_per_year,
            0,
            lt.default_days_per_year,
          ],
        );

        balanceCount += 2;
      }
      console.log(
        `  ✓ Initialized leave balances for ${u.firstName} ${u.lastName}`,
      );
    }
    console.log(`✅ Created ${balanceCount} leave balance entries\n`);

    // 8. Create Sample Leave Applications
    console.log("📝 Creating sample leave applications...");
    let leaveAppCount = 0;

    // Create some historical and pending leave applications
    const casualLeaveId = leaveTypeMap["Casual Leave"];
    const sickLeaveId = leaveTypeMap["Sick Leave"];

    // Employee emails for leave applications
    const employeeUsers = USERS_TO_CREATE.filter((u) => u.role === "Employee");

    for (const u of employeeUsers.slice(0, 4)) {
      // First 4 employees
      const userId = userMap[u.email];

      // Approved leave in the past
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);

      await connection.query(
        `INSERT INTO leave_applications 
        (user_id, leave_type_id, start_date, end_date, total_days, reason, status, applied_date, approved_date, approved_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          casualLeaveId,
          pastDate.toISOString().split("T")[0],
          new Date(pastDate.getTime() + 2 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          3,
          "Family function",
          "Approved",
          new Date(pastDate.getTime() - 5 * 24 * 60 * 60 * 1000),
          pastDate,
          userMap["sarah.hr@workzen.com"], // Approved by HR
        ],
      );
      leaveAppCount++;

      // Update leave balance
      await connection.query(
        "UPDATE leave_balance SET used_days = used_days + 3, remaining_days = remaining_days - 3 WHERE user_id = ? AND leave_type_id = ? AND year = 2025",
        [userId, casualLeaveId],
      );
    }

    // Pending leave applications
    for (const u of employeeUsers.slice(4, 6)) {
      // Next 2 employees
      const userId = userMap[u.email];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      await connection.query(
        `INSERT INTO leave_applications 
        (user_id, leave_type_id, start_date, end_date, total_days, reason, status, applied_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          sickLeaveId,
          futureDate.toISOString().split("T")[0],
          new Date(futureDate.getTime() + 1 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          2,
          "Medical appointment",
          "Pending",
          new Date(),
        ],
      );
      leaveAppCount++;
    }

    console.log(`✅ Created ${leaveAppCount} leave applications\n`);

    // 9. Generate Payroll for Last 3 Months
    console.log("💸 Generating payroll records...");
    let payrollCount = 0;

    const currentDate = new Date();
    const months = [
      { month: currentDate.getMonth(), year: currentDate.getFullYear() }, // Current month
      { month: currentDate.getMonth() - 1, year: currentDate.getFullYear() }, // Last month
      { month: currentDate.getMonth() - 2, year: currentDate.getFullYear() }, // 2 months ago
    ];

    // Adjust for negative months
    months.forEach((m) => {
      if (m.month < 1) {
        m.month += 12;
        m.year -= 1;
      }
    });

    for (const u of USERS_TO_CREATE) {
      const userId = userMap[u.email];

      // Get user's salary structure
      const [salaryComponents] = await connection.query(
        `SELECT ess.*, sc.component_name, sc.component_type 
         FROM employee_salary_structure ess
         INNER JOIN salary_components sc ON ess.component_id = sc.component_id
         WHERE ess.user_id = ?`,
        [userId],
      );

      for (const period of months) {
        // Calculate totals
        let grossSalary = 0;
        let totalEarnings = 0;
        let totalDeductions = 0;

        salaryComponents.forEach((comp) => {
          if (comp.component_type === "Earning") {
            totalEarnings += parseFloat(comp.amount);
          } else {
            totalDeductions += parseFloat(comp.amount);
          }
        });

        grossSalary = totalEarnings;
        const netSalary = totalEarnings - totalDeductions;

        // Calculate working days and present days
        const daysInMonth = new Date(period.year, period.month, 0).getDate();
        // Assume 95% attendance for past months
        const presentDays = Math.floor(daysInMonth * 0.95);

        // Insert payroll record
        const [payrollResult] = await connection.query(
          `INSERT INTO payroll 
          (user_id, month, year, gross_salary, total_deductions, net_salary, 
           working_days, present_days, payment_status, payment_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            period.month,
            period.year,
            grossSalary,
            totalDeductions,
            netSalary,
            daysInMonth,
            presentDays,
            "Paid",
            new Date(period.year, period.month, 5), // Payment on 5th of next month
          ],
        );

        const payrollId = payrollResult.insertId;

        // Insert payroll details (component breakdown)
        for (const comp of salaryComponents) {
          await connection.query(
            "INSERT INTO payroll_details (payroll_id, component_id, amount) VALUES (?, ?, ?)",
            [payrollId, comp.component_id, comp.amount],
          );
        }

        payrollCount++;
      }
      console.log(`  ✓ Generated payroll for ${u.firstName} ${u.lastName}`);
    }
    console.log(`✅ Created ${payrollCount} payroll records\n`);

    // 10. Create Audit Logs
    console.log("📋 Creating audit logs...");
    let auditCount = 0;

    const adminUserId = userMap["admin@workzen.com"];
    const hrUserId = userMap["sarah.hr@workzen.com"];

    const auditActions = [
      {
        userId: adminUserId,
        action: "CREATE_USER",
        tableName: "users",
        recordId: userMap["john.dev@workzen.com"],
      },
      {
        userId: hrUserId,
        action: "APPROVE_LEAVE",
        tableName: "leave_applications",
        recordId: null,
      },
      {
        userId: adminUserId,
        action: "UPDATE_SALARY",
        tableName: "employee_salary_structure",
        recordId: null,
      },
      {
        userId: hrUserId,
        action: "MARK_ATTENDANCE",
        tableName: "attendance",
        recordId: null,
      },
    ];

    for (const audit of auditActions) {
      await connection.query(
        "INSERT INTO audit_logs (user_id, action, table_name, record_id) VALUES (?, ?, ?, ?)",
        [audit.userId, audit.action, audit.tableName, audit.recordId],
      );
      auditCount++;
    }
    console.log(`✅ Created ${auditCount} audit log entries\n`);

    // Summary
    console.log("================================================");
    console.log("✅ PRODUCTION DATABASE SEEDING COMPLETED!");
    console.log("================================================");
    console.log(`👥 Users Created: ${userCount}`);
    console.log(`💰 Salary Structures: ${structureCount} entries`);
    console.log(`📅 Attendance Records: ${attendanceCount}`);
    console.log(`🏖️  Leave Balances: ${balanceCount} entries`);
    console.log(`📝 Leave Applications: ${leaveAppCount}`);
    console.log(`💸 Payroll Records: ${payrollCount}`);
    console.log(`📋 Audit Logs: ${auditCount}`);
    console.log("================================================\n");
    console.log("🔑 Default Credentials:");
    console.log("   Admin: admin@workzen.com / Admin@2025");
    console.log("   HR: sarah.hr@workzen.com / Hr@2025");
    console.log("   Payroll: finance@workzen.com / Payroll@2025");
    console.log("   Employee: john.dev@workzen.com / Employee@2025");
    console.log("================================================\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding Failed:", error);
    console.error("Error Details:", error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

// Run seeding
seedDatabase();
