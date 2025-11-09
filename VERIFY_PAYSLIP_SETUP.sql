-- =====================================================
-- QUICK SETUP SCRIPT FOR PAYSLIP FEATURE
-- This script helps you quickly verify the setup
-- =====================================================

USE workzen_hrms;

-- =====================================================
-- 1. VERIFY TABLES EXIST
-- =====================================================
SELECT 
    'Checking Tables...' as Status;

-- Check if employees table exists
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ employees table exists'
        ELSE '❌ employees table missing'
    END as employees_table_status
FROM information_schema.tables 
WHERE table_schema = 'workzen_hrms' 
AND table_name = 'employees';

-- Check if attendance table exists (payroll)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ attendance table exists (payroll)'
        ELSE '❌ attendance table missing (payroll)'
    END as attendance_table_status
FROM information_schema.tables 
WHERE table_schema = 'workzen_hrms' 
AND table_name = 'attendance';

-- Check if payslips table exists
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ payslips table exists'
        ELSE '❌ payslips table missing'
    END as payslips_table_status
FROM information_schema.tables 
WHERE table_schema = 'workzen_hrms' 
AND table_name = 'payslips';

-- Check if payruns table exists
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ payruns table exists'
        ELSE '❌ payruns table missing'
    END as payruns_table_status
FROM information_schema.tables 
WHERE table_schema = 'workzen_hrms' 
AND table_name = 'payruns';

-- =====================================================
-- 2. CHECK DATA AVAILABILITY
-- =====================================================

-- Count employees
SELECT 
    'Data Check' as Status,
    COUNT(*) as Total_Employees,
    CASE 
        WHEN COUNT(*) >= 5 THEN '✅ Sufficient employee data'
        WHEN COUNT(*) > 0 THEN '⚠️ Limited employee data'
        ELSE '❌ No employee data'
    END as Employee_Status
FROM employees;

-- Count attendance records
SELECT 
    'Attendance Check' as Status,
    COUNT(*) as Total_Attendance_Records,
    COUNT(DISTINCT emp_id) as Employees_With_Attendance,
    COUNT(DISTINCT CONCAT(month, ' ', year)) as Months_Covered,
    CASE 
        WHEN COUNT(*) >= 25 THEN '✅ Sufficient attendance data'
        WHEN COUNT(*) > 0 THEN '⚠️ Limited attendance data'
        ELSE '❌ No attendance data'
    END as Attendance_Status
FROM attendance;

-- =====================================================
-- 3. VIEW EMPLOYEE SUMMARY
-- =====================================================

SELECT 
    '========== EMPLOYEE SUMMARY ==========' as '';

SELECT 
    e.id,
    e.emp_id as Employee_Code,
    e.name as Employee_Name,
    CONCAT('₹', FORMAT(e.basic_salary, 2)) as Basic_Salary,
    COUNT(a.id) as Months_With_Attendance,
    CASE 
        WHEN COUNT(a.id) >= 5 THEN '✅ Complete'
        WHEN COUNT(a.id) > 0 THEN '⚠️ Partial'
        ELSE '❌ Missing'
    END as Attendance_Status
FROM employees e
LEFT JOIN attendance a ON e.id = a.emp_id
GROUP BY e.id, e.emp_id, e.name, e.basic_salary
ORDER BY e.id;

-- =====================================================
-- 4. VIEW ATTENDANCE SUMMARY BY MONTH
-- =====================================================

SELECT 
    '========== ATTENDANCE BY MONTH ==========' as '';

SELECT 
    a.month,
    a.year,
    COUNT(DISTINCT a.emp_id) as Employees_Count,
    AVG(a.present_days) as Avg_Present_Days,
    AVG(a.paid_leaves) as Avg_Paid_Leaves,
    AVG(a.unpaid_leaves) as Avg_Unpaid_Leaves
FROM attendance a
GROUP BY a.month, a.year
ORDER BY a.year DESC, FIELD(a.month, 'October', 'September', 'August', 'July', 'June');

-- =====================================================
-- 5. SAMPLE PAYSLIP CALCULATION PREVIEW
-- =====================================================

SELECT 
    '========== SAMPLE PAYSLIP CALCULATIONS (October 2025) ==========' as '';

SELECT 
    e.emp_id as Employee_Code,
    e.name as Name,
    a.present_days as Present,
    a.paid_leaves as Paid_Leave,
    a.unpaid_leaves as Unpaid,
    CONCAT('₹', FORMAT(e.basic_salary, 2)) as Basic_Salary,
    CONCAT('₹', FORMAT(
        ROUND((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 1.20, 2), 2
    )) as Gross_Salary,
    CONCAT('₹', FORMAT(
        ROUND((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 1.20 - 
              ((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 0.12 + 200 + 
               (e.basic_salary / 30) * a.unpaid_leaves), 2), 2
    )) as Net_Salary
FROM employees e
JOIN attendance a ON e.id = a.emp_id
WHERE a.month = 'October' AND a.year = 2025
ORDER BY e.id;

-- =====================================================
-- 6. CHECK FOR EXISTING PAYSLIPS
-- =====================================================

SELECT 
    '========== EXISTING PAYSLIPS ==========' as '';

SELECT 
    COUNT(*) as Total_Payslips,
    COUNT(CASE WHEN status = 'Draft' THEN 1 END) as Draft_Count,
    COUNT(CASE WHEN status = 'Done' THEN 1 END) as Done_Count
FROM payslips;

-- List all existing payslips
SELECT 
    p.id,
    e.emp_id as Employee_Code,
    e.name as Employee_Name,
    p.month,
    p.year,
    p.status,
    CONCAT('₹', FORMAT(p.net_salary, 2)) as Net_Salary,
    p.created_at
FROM payslips p
JOIN employees e ON p.emp_id = e.id
ORDER BY p.year DESC, FIELD(p.month, 'October', 'September', 'August', 'July', 'June'), e.id;

-- =====================================================
-- 7. SYSTEM READINESS CHECK
-- =====================================================

SELECT 
    '========== SYSTEM READINESS CHECK ==========' as '';

SELECT 
    CASE 
        WHEN (SELECT COUNT(*) FROM employees) >= 5 
         AND (SELECT COUNT(*) FROM attendance) >= 25 
        THEN '✅ SYSTEM READY - You can start generating payslips!'
        WHEN (SELECT COUNT(*) FROM employees) > 0 
         AND (SELECT COUNT(*) FROM attendance) > 0
        THEN '⚠️ PARTIAL DATA - Some data is available but incomplete'
        ELSE '❌ NOT READY - Please run PAYSLIP_MOCK_DATA_5_MONTHS.sql first'
    END as System_Status;

-- =====================================================
-- 8. NEXT STEPS
-- =====================================================

SELECT 
    '========== NEXT STEPS ==========' as '';

SELECT 
    'To generate a payslip, use the following API endpoint:' as Step_1,
    'POST http://localhost:5000/api/payslip/new' as API_Endpoint,
    '{"emp_id": 1, "month": "October", "year": 2025}' as Sample_Payload;

SELECT 
    'Or generate for all employees at once:' as Step_2,
    'POST http://localhost:5000/api/payrun/generate' as API_Endpoint,
    '{"month": "October", "year": 2025}' as Sample_Payload;

SELECT 
    'For detailed instructions, refer to:' as Documentation,
    'PAYSLIP_LIVE_DATA_IMPLEMENTATION_GUIDE.md' as File_Name;

-- =====================================================
-- END OF VERIFICATION SCRIPT
-- =====================================================
