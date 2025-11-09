-- Quick test to verify all tables and data
USE workzen_hrms;

-- Test 1: Check tables exist
SELECT 'Table Check' as Test;
SHOW TABLES LIKE 'payroll_%';

-- Test 2: Count employees
SELECT 'Employee Count' as Test, COUNT(*) as count FROM payroll_employees;

-- Test 3: Count attendance records
SELECT 'Attendance Count' as Test, COUNT(*) as count FROM payroll_attendance;

-- Test 4: Sample data
SELECT 'Sample Employee' as Test, * FROM payroll_employees LIMIT 1;

-- Test 5: Sample attendance
SELECT 'Sample Attendance' as Test, * FROM payroll_attendance LIMIT 1;

-- Test 6: Months available
SELECT 'Available Months' as Test, DISTINCT month, year FROM payroll_attendance ORDER BY year, month;
