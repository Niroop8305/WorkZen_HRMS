# How to Fix the "Failed to run payrun" Error

## Problem
The error occurs because there's no attendance data for November 2025 in the database.

## Solution

### Option 1: Run the SQL Script (Recommended)
I've created a file `backend/november_attendance.sql` that contains attendance data for November 2025.

**Steps:**
1. Open MySQL Workbench or your MySQL client
2. Connect to your `payroll_system` database
3. Run the SQL script: `backend/november_attendance.sql`
4. Go back to the frontend and click "Run Payrun" again

### Option 2: Use MySQL Command Line
```bash
cd backend
mysql -u root -p payroll_system < november_attendance.sql
```

### Option 3: Manual SQL Insert
If you want to add attendance data manually, run this in MySQL:

```sql
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days)
VALUES
(1, 'November', 2025, 20, 2, 0, 30),
(2, 'November', 2025, 22, 0, 0, 30),
(3, 'November', 2025, 19, 3, 0, 30);
-- Add more employees as needed
```

### Verify the Data
After inserting, verify by running:
```sql
SELECT a.*, e.name, e.emp_id as employee_id 
FROM attendance a
JOIN employees e ON a.emp_id = e.id
WHERE a.month = 'November' AND a.year = 2025;
```

## Why This Happens
The payrun system requires attendance records for all employees for the selected period. Without attendance data, the system cannot calculate salaries, hence the 500 error.

## Next Steps
1. Insert attendance data for November 2025
2. Refresh the payrun page
3. Click "Run Payrun" button again
4. The payslips should generate successfully!
