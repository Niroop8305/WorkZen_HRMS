-- =====================================================
-- PAYSLIP MOCK DATA - 5 USERS x 5 MONTHS
-- WorkZen HRMS - Comprehensive Test Data
-- Generated: November 9, 2025
-- Purpose: Insert realistic data for payslip feature testing
-- =====================================================
-- This script creates:
-- - 5 Employees with salary structures
-- - 5 Months of attendance data (June-October 2025)
-- - All required data for live payslip generation
-- =====================================================

USE workzen_hrms;

-- =====================================================
-- PART 1: INSERT EMPLOYEES INTO PAYROLL SYSTEM
-- =====================================================

-- Create the employees table if it doesn't exist (from payroll_schema.sql)
CREATE TABLE IF NOT EXISTS employees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  emp_id VARCHAR(50) UNIQUE NOT NULL,
  basic_salary DECIMAL(10,2) NOT NULL,
  hra DECIMAL(10,2) DEFAULT 0,
  pf_rate DECIMAL(5,2) DEFAULT 0.12,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create attendance table for payroll (separate from main attendance)
CREATE TABLE IF NOT EXISTS attendance (
  id INT PRIMARY KEY AUTO_INCREMENT,
  emp_id INT NOT NULL,
  month VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  present_days INT DEFAULT 0,
  paid_leaves INT DEFAULT 0,
  unpaid_leaves INT DEFAULT 0,
  total_working_days INT DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (emp_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY unique_attendance (emp_id, month, year)
);

-- Create payruns table
CREATE TABLE IF NOT EXISTS payruns (
  id INT PRIMARY KEY AUTO_INCREMENT,
  month VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  total_employees INT DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  status ENUM('Pending', 'Done', 'Validated') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_payrun (month, year)
);

-- Create payslips table
CREATE TABLE IF NOT EXISTS payslips (
  id INT PRIMARY KEY AUTO_INCREMENT,
  emp_id INT NOT NULL,
  payrun_id INT NULL,
  month VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  basic_salary DECIMAL(10,2) DEFAULT 0,
  hra DECIMAL(10,2) DEFAULT 0,
  earned_salary DECIMAL(10,2) DEFAULT 0,
  gross_salary DECIMAL(10,2) DEFAULT 0,
  pf_deduction DECIMAL(10,2) DEFAULT 0,
  tax_deduction DECIMAL(10,2) DEFAULT 0,
  unpaid_deduction DECIMAL(10,2) DEFAULT 0,
  total_deductions DECIMAL(10,2) DEFAULT 0,
  net_salary DECIMAL(10,2) DEFAULT 0,
  present_days INT DEFAULT 0,
  paid_leaves INT DEFAULT 0,
  unpaid_leaves INT DEFAULT 0,
  status ENUM('Draft','Done') DEFAULT 'Draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (emp_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (payrun_id) REFERENCES payruns(id) ON DELETE CASCADE,
  UNIQUE KEY unique_emp_month_year (emp_id, month, year)
);

-- =====================================================
-- PART 2: INSERT 5 EMPLOYEES WITH VARIED SALARIES
-- =====================================================

INSERT INTO employees (name, emp_id, basic_salary, hra, pf_rate, tax_rate) VALUES
('Rajesh Kumar', 'EMP001', 25000.00, 5000.00, 0.12, 0),
('Priya Sharma', 'EMP002', 30000.00, 6000.00, 0.12, 0),
('Amit Patel', 'EMP003', 28000.00, 5600.00, 0.12, 0),
('Sneha Reddy', 'EMP004', 32000.00, 6400.00, 0.12, 0),
('Vikram Singh', 'EMP005', 27000.00, 5400.00, 0.12, 0)
ON DUPLICATE KEY UPDATE 
  name = VALUES(name),
  basic_salary = VALUES(basic_salary),
  hra = VALUES(hra),
  pf_rate = VALUES(pf_rate),
  tax_rate = VALUES(tax_rate);

-- =====================================================
-- PART 3: ATTENDANCE DATA FOR 5 MONTHS (JUNE-OCTOBER 2025)
-- =====================================================

-- Note: Each employee has different attendance patterns to show variety
-- Total working days = 30 (standardized for easy calculation)

-- =====================================================
-- JUNE 2025 - Starting month, full attendance
-- =====================================================
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days) VALUES
(1, 'June', 2025, 22, 2, 0, 30),     -- Rajesh: 22 present + 2 paid leaves
(2, 'June', 2025, 24, 1, 0, 30),     -- Priya: 24 present + 1 paid leave
(3, 'June', 2025, 20, 2, 2, 30),     -- Amit: 20 present + 2 paid leaves + 2 unpaid
(4, 'June', 2025, 23, 1, 0, 30),     -- Sneha: 23 present + 1 paid leave
(5, 'June', 2025, 21, 3, 0, 30)      -- Vikram: 21 present + 3 paid leaves
ON DUPLICATE KEY UPDATE 
  present_days = VALUES(present_days),
  paid_leaves = VALUES(paid_leaves),
  unpaid_leaves = VALUES(unpaid_leaves);

-- =====================================================
-- JULY 2025 - Summer month, some absences
-- =====================================================
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days) VALUES
(1, 'July', 2025, 20, 3, 1, 30),     -- Rajesh: 20 present + 3 paid leaves + 1 unpaid
(2, 'July', 2025, 23, 2, 0, 30),     -- Priya: 23 present + 2 paid leaves
(3, 'July', 2025, 22, 1, 1, 30),     -- Amit: 22 present + 1 paid leave + 1 unpaid
(4, 'July', 2025, 24, 0, 0, 30),     -- Sneha: Perfect 24 present days
(5, 'July', 2025, 19, 4, 1, 30)      -- Vikram: 19 present + 4 paid leaves + 1 unpaid
ON DUPLICATE KEY UPDATE 
  present_days = VALUES(present_days),
  paid_leaves = VALUES(paid_leaves),
  unpaid_leaves = VALUES(unpaid_leaves);

-- =====================================================
-- AUGUST 2025 - Regular month
-- =====================================================
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days) VALUES
(1, 'August', 2025, 23, 1, 0, 30),   -- Rajesh: 23 present + 1 paid leave
(2, 'August', 2025, 22, 2, 0, 30),   -- Priya: 22 present + 2 paid leaves
(3, 'August', 2025, 21, 2, 1, 30),   -- Amit: 21 present + 2 paid leaves + 1 unpaid
(4, 'August', 2025, 23, 2, 0, 30),   -- Sneha: 23 present + 2 paid leaves
(5, 'August', 2025, 22, 2, 0, 30)    -- Vikram: 22 present + 2 paid leaves
ON DUPLICATE KEY UPDATE 
  present_days = VALUES(present_days),
  paid_leaves = VALUES(paid_leaves),
  unpaid_leaves = VALUES(unpaid_leaves);

-- =====================================================
-- SEPTEMBER 2025 - Some irregular attendance
-- =====================================================
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days) VALUES
(1, 'September', 2025, 20, 2, 2, 30), -- Rajesh: 20 present + 2 paid leaves + 2 unpaid
(2, 'September', 2025, 22, 2, 0, 30), -- Priya: 22 present + 2 paid leaves
(3, 'September', 2025, 21, 1, 2, 30), -- Amit: 21 present + 1 paid leave + 2 unpaid
(4, 'September', 2025, 23, 1, 0, 30), -- Sneha: 23 present + 1 paid leave
(5, 'September', 2025, 20, 2, 2, 30)  -- Vikram: 20 present + 2 paid leaves + 2 unpaid
ON DUPLICATE KEY UPDATE 
  present_days = VALUES(present_days),
  paid_leaves = VALUES(paid_leaves),
  unpaid_leaves = VALUES(unpaid_leaves);

-- =====================================================
-- OCTOBER 2025 - Latest complete month
-- =====================================================
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days) VALUES
(1, 'October', 2025, 22, 2, 0, 30),   -- Rajesh: 22 present + 2 paid leaves
(2, 'October', 2025, 24, 0, 0, 30),   -- Priya: 24 present, no leaves
(3, 'October', 2025, 20, 2, 2, 30),   -- Amit: 20 present + 2 paid leaves + 2 unpaid
(4, 'October', 2025, 23, 1, 0, 30),   -- Sneha: 23 present + 1 paid leave
(5, 'October', 2025, 21, 3, 0, 30)    -- Vikram: 21 present + 3 paid leaves
ON DUPLICATE KEY UPDATE 
  present_days = VALUES(present_days),
  paid_leaves = VALUES(paid_leaves),
  unpaid_leaves = VALUES(unpaid_leaves);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- View all employees
SELECT 
    id,
    name,
    emp_id,
    CONCAT('₹', FORMAT(basic_salary, 2)) as basic_salary,
    CONCAT('₹', FORMAT(hra, 2)) as hra,
    CONCAT((pf_rate * 100), '%') as pf_rate
FROM employees
ORDER BY id;

-- View attendance summary for all 5 months
SELECT 
    e.emp_id,
    e.name,
    a.month,
    a.year,
    a.present_days,
    a.paid_leaves,
    a.unpaid_leaves,
    (a.present_days + a.paid_leaves) as earned_days,
    a.total_working_days
FROM employees e
JOIN attendance a ON e.id = a.emp_id
ORDER BY a.year, 
    FIELD(a.month, 'June', 'July', 'August', 'September', 'October'),
    e.id;

-- Calculate expected salary for each month (Preview)
SELECT 
    e.emp_id,
    e.name,
    a.month,
    a.year,
    CONCAT('₹', FORMAT(e.basic_salary, 2)) as basic_salary,
    a.present_days,
    a.paid_leaves,
    a.unpaid_leaves,
    (a.present_days + a.paid_leaves) as earned_days,
    CONCAT('₹', FORMAT((e.basic_salary / 30) * (a.present_days + a.paid_leaves), 2)) as earned_salary,
    CONCAT('₹', FORMAT((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 0.20, 2)) as hra,
    CONCAT('₹', FORMAT(
        (e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 1.20 - 
        ((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 0.12 + 200 + (e.basic_salary / 30) * a.unpaid_leaves),
        2
    )) as estimated_net_salary
FROM employees e
JOIN attendance a ON e.id = a.emp_id
ORDER BY a.year DESC, 
    FIELD(a.month, 'October', 'September', 'August', 'July', 'June'),
    e.id;

-- Summary: Total attendance days by employee
SELECT 
    e.emp_id,
    e.name,
    SUM(a.present_days) as total_present_days,
    SUM(a.paid_leaves) as total_paid_leaves,
    SUM(a.unpaid_leaves) as total_unpaid_leaves,
    SUM(a.present_days + a.paid_leaves) as total_earned_days,
    COUNT(*) as months_recorded
FROM employees e
JOIN attendance a ON e.id = a.emp_id
GROUP BY e.id, e.emp_id, e.name
ORDER BY e.id;

-- =====================================================
-- SAMPLE PAYSLIP CALCULATION FOR OCTOBER 2025
-- =====================================================
-- This shows how payslips would be calculated
-- Use the API endpoints to actually generate payslips

SELECT 
    e.id as emp_id,
    e.name as employee_name,
    e.emp_id as employee_code,
    'October' as month,
    2025 as year,
    e.basic_salary,
    a.present_days,
    a.paid_leaves,
    a.unpaid_leaves,
    -- Calculations
    ROUND(e.basic_salary / 30, 2) as per_day_rate,
    (a.present_days + a.paid_leaves) as earned_days,
    ROUND((e.basic_salary / 30) * (a.present_days + a.paid_leaves), 2) as earned_salary,
    ROUND((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 0.20, 2) as hra,
    ROUND((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 1.20, 2) as gross_salary,
    ROUND((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 0.12, 2) as pf_deduction,
    200.00 as tax_deduction,
    ROUND((e.basic_salary / 30) * a.unpaid_leaves, 2) as unpaid_deduction,
    ROUND((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 0.12 + 200 + (e.basic_salary / 30) * a.unpaid_leaves, 2) as total_deductions,
    ROUND(
        (e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 1.20 - 
        ((e.basic_salary / 30) * (a.present_days + a.paid_leaves) * 0.12 + 200 + (e.basic_salary / 30) * a.unpaid_leaves),
        2
    ) as net_salary
FROM employees e
JOIN attendance a ON e.id = a.emp_id
WHERE a.month = 'October' AND a.year = 2025
ORDER BY e.id;

-- =====================================================
-- INSTRUCTIONS FOR USING THIS DATA
-- =====================================================
-- 
-- 1. RUN THIS SCRIPT FIRST:
--    Execute this entire SQL file in your MySQL database
--
-- 2. VERIFY DATA INSERTION:
--    Check the verification queries above to ensure data is inserted
--
-- 3. USE PAYSLIP API ENDPOINTS:
--    
--    A) Create a Draft Payslip:
--       POST /api/payslip/new
--       {
--         "emp_id": 1,
--         "month": "October",
--         "year": 2025
--       }
--    
--    B) Compute Salary (Preview without saving):
--       POST /api/payslip/compute
--       {
--         "emp_id": 1,
--         "month": "October",
--         "year": 2025,
--         "present_days": 22,
--         "paid_leaves": 2,
--         "unpaid_leaves": 0
--       }
--    
--    C) Save Computed Payslip:
--       PUT /api/payslip/:id/save
--       (Use the computed values from step B)
--    
--    D) View All Payslips:
--       GET /api/payslip/
--       Or filter by month: GET /api/payslip/?month=October&year=2025
--
-- 4. PAYRUN FEATURE:
--    Generate payslips for all employees at once:
--    POST /api/payrun/generate
--    {
--      "month": "October",
--      "year": 2025
--    }
--
-- 5. DATA AVAILABLE:
--    - 5 Employees (EMP001 to EMP005)
--    - 5 Months: June, July, August, September, October 2025
--    - Total: 25 attendance records
--    - Ready to generate 25 payslips
--
-- =====================================================

-- Success message
SELECT 
    '✅ Mock data inserted successfully!' as Status,
    COUNT(DISTINCT e.id) as Total_Employees,
    COUNT(a.id) as Total_Attendance_Records,
    COUNT(DISTINCT CONCAT(a.month, ' ', a.year)) as Months_Covered
FROM employees e
LEFT JOIN attendance a ON e.id = a.emp_id;

-- Show months available for payslip generation
SELECT DISTINCT 
    a.month,
    a.year,
    COUNT(DISTINCT a.emp_id) as employees_with_data
FROM attendance a
GROUP BY a.month, a.year
ORDER BY a.year DESC, FIELD(a.month, 'October', 'September', 'August', 'July', 'June');

-- =====================================================
-- END OF SCRIPT
-- =====================================================
