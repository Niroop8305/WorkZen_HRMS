-- =====================================================
-- WorkZen HRMS Mock Data Script
-- Generated: November 9, 2025
-- Purpose: Insert comprehensive mock data for testing
-- =====================================================

USE workzen_hrms;

-- =====================================================
-- 1. CREATE USERS WITH DIFFERENT ROLES
-- =====================================================

-- Note: Password for all users is: admin123 (hashed with bcrypt)

-- Check and insert Admin User (user_id will be 1 if not exists)
INSERT IGNORE INTO users (user_id, role_id, email, password_hash, is_active) VALUES
(1, 1, 'admin@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE);

-- HR Officers (user_id 2-3)
INSERT IGNORE INTO users (user_id, role_id, email, password_hash, is_active) VALUES
(2, 2, 'hr.manager@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(3, 2, 'hr.officer@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE);

-- Payroll Officer (user_id 4)
INSERT IGNORE INTO users (user_id, role_id, email, password_hash, is_active) VALUES
(4, 3, 'payroll@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE);

-- Regular Employees (user_id 5-14)
INSERT IGNORE INTO users (user_id, role_id, email, password_hash, is_active) VALUES
(5, 4, 'rajesh.kumar@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(6, 4, 'priya.sharma@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(7, 4, 'amit.patel@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(8, 4, 'sneha.reddy@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(9, 4, 'vikram.singh@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(10, 4, 'anjali.verma@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(11, 4, 'rahul.mehta@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(12, 4, 'kavya.nair@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(13, 4, 'arjun.gupta@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE),
(14, 4, 'neha.iyer@odooindia.com', '$2b$10$rJ5z8F7GYvH.9XKqP/1.2eZJ9kF.Y3Wq7VKXC8L5N2M4P6R8T0V2W', TRUE);

-- =====================================================
-- 2. CREATE EMPLOYEE PROFILES
-- =====================================================

-- Admin Profile
INSERT IGNORE INTO employee_profiles (
    user_id, employee_code, company_name, first_name, last_name, phone, 
    date_of_birth, gender, department, designation, date_of_joining
) VALUES
(1, 'OIADAD20230001', 'Odoo India', 'Admin', 'User', '+91-9876543210', '1985-01-15', 'Male', 'Management', 'System Administrator', '2023-01-01');

-- HR Officers
INSERT IGNORE INTO employee_profiles (
    user_id, employee_code, company_name, first_name, last_name, phone, 
    date_of_birth, gender, department, designation, date_of_joining
) VALUES
(2, 'OIHMHM20230002', 'Odoo India', 'Harsha', 'Malhotra', '+91-9876543211', '1988-03-20', 'Female', 'Human Resources', 'HR Manager', '2023-02-01'),
(3, 'OIHOHO20230003', 'Odoo India', 'Harsh', 'Officer', '+91-9876543212', '1990-05-10', 'Male', 'Human Resources', 'HR Officer', '2023-03-15');

-- Payroll Officer
INSERT IGNORE INTO employee_profiles (
    user_id, employee_code, company_name, first_name, last_name, phone, 
    date_of_birth, gender, department, designation, date_of_joining
) VALUES
(4, 'OIPOPO20230004', 'Odoo India', 'Pooja', 'Officer', '+91-9876543213', '1987-07-25', 'Female', 'Finance', 'Payroll Officer', '2023-04-01');

-- Regular Employees
INSERT IGNORE INTO employee_profiles (
    user_id, employee_code, company_name, first_name, last_name, phone, 
    date_of_birth, gender, department, designation, date_of_joining
) VALUES
(5, 'OIRKRK20240001', 'Odoo India', 'Rajesh', 'Kumar', '+91-9876543214', '1992-06-15', 'Male', 'Engineering', 'Senior Developer', '2024-01-15'),
(6, 'OIPSPS20240002', 'Odoo India', 'Priya', 'Sharma', '+91-9876543215', '1993-08-20', 'Female', 'Engineering', 'Full Stack Developer', '2024-02-01'),
(7, 'OIAPAP20240003', 'Odoo India', 'Amit', 'Patel', '+91-9876543216', '1991-04-10', 'Male', 'Engineering', 'Backend Developer', '2024-02-15'),
(8, 'OISRSR20240004', 'Odoo India', 'Sneha', 'Reddy', '+91-9876543217', '1994-11-05', 'Female', 'Marketing', 'Marketing Manager', '2024-03-01'),
(9, 'OIVSVS20240005', 'Odoo India', 'Vikram', 'Singh', '+91-9876543218', '1990-09-18', 'Male', 'Sales', 'Sales Executive', '2024-03-15'),
(10, 'OIAVAV20240006', 'Odoo India', 'Anjali', 'Verma', '+91-9876543219', '1995-02-22', 'Female', 'Engineering', 'Frontend Developer', '2024-04-01'),
(11, 'OIRMRM20240007', 'Odoo India', 'Rahul', 'Mehta', '+91-9876543220', '1989-12-30', 'Male', 'Operations', 'Operations Manager', '2024-04-15'),
(12, 'OIKNKN20240008', 'Odoo India', 'Kavya', 'Nair', '+91-9876543221', '1996-07-14', 'Female', 'Design', 'UI/UX Designer', '2024-05-01'),
(13, 'OIAGAG20240009', 'Odoo India', 'Arjun', 'Gupta', '+91-9876543222', '1992-03-08', 'Male', 'Engineering', 'DevOps Engineer', '2024-05-15'),
(14, 'OININI20240010', 'Odoo India', 'Neha', 'Iyer', '+91-9876543223', '1994-10-25', 'Female', 'Finance', 'Financial Analyst', '2024-06-01');

-- =====================================================
-- 3. SALARY STRUCTURE FOR EMPLOYEES
-- =====================================================

-- Salary structure for Rajesh Kumar (user_id=5)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(5, 1, 25000.00, '2024-01-15', TRUE),  -- Basic Salary
(5, 2, 5000.00, '2024-01-15', TRUE),   -- HRA (20%)
(5, 4, 2000.00, '2024-01-15', TRUE),   -- Transport Allowance
(5, 6, 3000.00, '2024-01-15', TRUE),   -- PF Deduction (12%)
(5, 7, 200.00, '2024-01-15', TRUE);    -- Professional Tax

-- Salary structure for Priya Sharma (user_id=6)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(6, 1, 30000.00, '2024-02-01', TRUE),
(6, 2, 6000.00, '2024-02-01', TRUE),
(6, 4, 2000.00, '2024-02-01', TRUE),
(6, 6, 3600.00, '2024-02-01', TRUE),
(6, 7, 200.00, '2024-02-01', TRUE);

-- Salary structure for Amit Patel (user_id=7)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(7, 1, 28000.00, '2024-02-15', TRUE),
(7, 2, 5600.00, '2024-02-15', TRUE),
(7, 4, 2000.00, '2024-02-15', TRUE),
(7, 6, 3360.00, '2024-02-15', TRUE),
(7, 7, 200.00, '2024-02-15', TRUE);

-- Salary structure for Sneha Reddy (user_id=8)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(8, 1, 32000.00, '2024-03-01', TRUE),
(8, 2, 6400.00, '2024-03-01', TRUE),
(8, 4, 2500.00, '2024-03-01', TRUE),
(8, 6, 3840.00, '2024-03-01', TRUE),
(8, 7, 200.00, '2024-03-01', TRUE);

-- Salary structure for Vikram Singh (user_id=9)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(9, 1, 27000.00, '2024-03-15', TRUE),
(9, 2, 5400.00, '2024-03-15', TRUE),
(9, 4, 2000.00, '2024-03-15', TRUE),
(9, 6, 3240.00, '2024-03-15', TRUE),
(9, 7, 200.00, '2024-03-15', TRUE);

-- Salary structure for Anjali Verma (user_id=10)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(10, 1, 26000.00, '2024-04-01', TRUE),
(10, 2, 5200.00, '2024-04-01', TRUE),
(10, 4, 2000.00, '2024-04-01', TRUE),
(10, 6, 3120.00, '2024-04-01', TRUE),
(10, 7, 200.00, '2024-04-01', TRUE);

-- Salary structure for Rahul Mehta (user_id=11)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(11, 1, 35000.00, '2024-04-15', TRUE),
(11, 2, 7000.00, '2024-04-15', TRUE),
(11, 4, 2500.00, '2024-04-15', TRUE),
(11, 6, 4200.00, '2024-04-15', TRUE),
(11, 7, 200.00, '2024-04-15', TRUE);

-- Salary structure for Kavya Nair (user_id=12)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(12, 1, 29000.00, '2024-05-01', TRUE),
(12, 2, 5800.00, '2024-05-01', TRUE),
(12, 4, 2000.00, '2024-05-01', TRUE),
(12, 6, 3480.00, '2024-05-01', TRUE),
(12, 7, 200.00, '2024-05-01', TRUE);

-- Salary structure for Arjun Gupta (user_id=13)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(13, 1, 31000.00, '2024-05-15', TRUE),
(13, 2, 6200.00, '2024-05-15', TRUE),
(13, 4, 2500.00, '2024-05-15', TRUE),
(13, 6, 3720.00, '2024-05-15', TRUE),
(13, 7, 200.00, '2024-05-15', TRUE);

-- Salary structure for Neha Iyer (user_id=14)
INSERT IGNORE INTO employee_salary_structure (user_id, component_id, amount, effective_from, is_active) VALUES
(14, 1, 28000.00, '2024-06-01', TRUE),
(14, 2, 5600.00, '2024-06-01', TRUE),
(14, 4, 2000.00, '2024-06-01', TRUE),
(14, 6, 3360.00, '2024-06-01', TRUE),
(14, 7, 200.00, '2024-06-01', TRUE);

-- =====================================================
-- 4. ATTENDANCE DATA - NOVEMBER 2025 (Multiple Sessions per Day)
-- =====================================================

-- Rajesh Kumar - Multiple check-ins on different days (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
-- Nov 1 - Full day with lunch break
(5, '2025-11-01', '2025-11-01 09:00:00', '2025-11-01 13:00:00', 4.00, 'Present'),
(5, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
-- Nov 4 - Full day
(5, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(5, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
-- Nov 5 - Multiple sessions (3 check-ins)
(5, '2025-11-05', '2025-11-05 09:15:00', '2025-11-05 12:00:00', 2.75, 'Present'),
(5, '2025-11-05', '2025-11-05 13:00:00', '2025-11-05 15:30:00', 2.50, 'Present'),
(5, '2025-11-05', '2025-11-05 16:00:00', '2025-11-05 18:00:00', 2.00, 'Present'),
-- Nov 6 - Regular day
(5, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(5, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
-- Nov 7 - Full day
(5, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(5, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Current day, checked in (no checkout yet)
(5, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(5, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- Priya Sharma - Regular pattern (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(6, '2025-11-01', '2025-11-01 09:00:00', '2025-11-01 13:00:00', 4.00, 'Present'),
(6, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
(6, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(6, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
(6, '2025-11-05', '2025-11-05 09:00:00', '2025-11-05 13:00:00', 4.00, 'Present'),
(6, '2025-11-05', '2025-11-05 14:00:00', '2025-11-05 18:00:00', 4.00, 'Present'),
(6, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(6, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
(6, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(6, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Currently checked in
(6, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(6, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- Amit Patel - Some late arrivals (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(7, '2025-11-01', '2025-11-01 09:30:00', '2025-11-01 13:00:00', 3.50, 'Late'),
(7, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
(7, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(7, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
(7, '2025-11-05', '2025-11-05 09:00:00', '2025-11-05 13:00:00', 4.00, 'Present'),
(7, '2025-11-05', '2025-11-05 14:00:00', '2025-11-05 18:00:00', 4.00, 'Present'),
(7, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(7, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
(7, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(7, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Currently checked in
(7, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(7, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- Sneha Reddy (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(8, '2025-11-01', '2025-11-01 09:00:00', '2025-11-01 13:00:00', 4.00, 'Present'),
(8, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
(8, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(8, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
(8, '2025-11-05', '2025-11-05 09:00:00', '2025-11-05 13:00:00', 4.00, 'Present'),
(8, '2025-11-05', '2025-11-05 14:00:00', '2025-11-05 18:00:00', 4.00, 'Present'),
(8, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(8, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
(8, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(8, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Currently checked in
(8, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(8, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- Vikram Singh (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(9, '2025-11-01', '2025-11-01 09:00:00', '2025-11-01 13:00:00', 4.00, 'Present'),
(9, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
(9, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(9, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
(9, '2025-11-05', '2025-11-05 09:00:00', '2025-11-05 13:00:00', 4.00, 'Present'),
(9, '2025-11-05', '2025-11-05 14:00:00', '2025-11-05 18:00:00', 4.00, 'Present'),
(9, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(9, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
(9, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(9, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Currently checked in
(9, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(9, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- Anjali Verma (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(10, '2025-11-01', '2025-11-01 09:00:00', '2025-11-01 13:00:00', 4.00, 'Present'),
(10, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
(10, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(10, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
(10, '2025-11-05', '2025-11-05 09:00:00', '2025-11-05 13:00:00', 4.00, 'Present'),
(10, '2025-11-05', '2025-11-05 14:00:00', '2025-11-05 18:00:00', 4.00, 'Present'),
(10, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(10, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
(10, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(10, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Currently checked in
(10, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(10, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- Rahul Mehta (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(11, '2025-11-01', '2025-11-01 09:00:00', '2025-11-01 13:00:00', 4.00, 'Present'),
(11, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
(11, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(11, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
(11, '2025-11-05', '2025-11-05 09:00:00', '2025-11-05 13:00:00', 4.00, 'Present'),
(11, '2025-11-05', '2025-11-05 14:00:00', '2025-11-05 18:00:00', 4.00, 'Present'),
(11, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(11, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
(11, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(11, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Currently checked in
(11, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(11, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- Kavya Nair (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(12, '2025-11-01', '2025-11-01 09:00:00', '2025-11-01 13:00:00', 4.00, 'Present'),
(12, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
(12, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(12, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
(12, '2025-11-05', '2025-11-05 09:00:00', '2025-11-05 13:00:00', 4.00, 'Present'),
(12, '2025-11-05', '2025-11-05 14:00:00', '2025-11-05 18:00:00', 4.00, 'Present'),
(12, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(12, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
(12, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(12, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Currently checked in
(12, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(12, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- Arjun Gupta (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(13, '2025-11-01', '2025-11-01 09:00:00', '2025-11-01 13:00:00', 4.00, 'Present'),
(13, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
(13, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(13, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
(13, '2025-11-05', '2025-11-05 09:00:00', '2025-11-05 13:00:00', 4.00, 'Present'),
(13, '2025-11-05', '2025-11-05 14:00:00', '2025-11-05 18:00:00', 4.00, 'Present'),
(13, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(13, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
(13, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(13, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Currently checked in
(13, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(13, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- Neha Iyer (Nov 1-8, 2025)
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(14, '2025-11-01', '2025-11-01 09:00:00', '2025-11-01 13:00:00', 4.00, 'Present'),
(14, '2025-11-01', '2025-11-01 14:00:00', '2025-11-01 18:00:00', 4.00, 'Present'),
(14, '2025-11-04', '2025-11-04 09:00:00', '2025-11-04 13:00:00', 4.00, 'Present'),
(14, '2025-11-04', '2025-11-04 14:00:00', '2025-11-04 18:00:00', 4.00, 'Present'),
(14, '2025-11-05', '2025-11-05 09:00:00', '2025-11-05 13:00:00', 4.00, 'Present'),
(14, '2025-11-05', '2025-11-05 14:00:00', '2025-11-05 18:00:00', 4.00, 'Present'),
(14, '2025-11-06', '2025-11-06 09:00:00', '2025-11-06 13:00:00', 4.00, 'Present'),
(14, '2025-11-06', '2025-11-06 14:00:00', '2025-11-06 18:00:00', 4.00, 'Present'),
(14, '2025-11-07', '2025-11-07 09:00:00', '2025-11-07 13:00:00', 4.00, 'Present'),
(14, '2025-11-07', '2025-11-07 14:00:00', '2025-11-07 18:00:00', 4.00, 'Present'),
-- Nov 8 - Currently checked in
(14, '2025-11-08', '2025-11-08 09:00:00', '2025-11-08 13:00:00', 4.00, 'Present'),
(14, '2025-11-08', '2025-11-08 14:00:00', NULL, NULL, 'Present');

-- =====================================================
-- OCTOBER 2025 ATTENDANCE DATA (For historical payroll)
-- =====================================================

-- Rajesh Kumar - October data
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
-- Oct 1 - Full day
(5, '2025-10-01', '2025-10-01 09:00:00', '2025-10-01 13:00:00', 4.00, 'Present'),
(5, '2025-10-01', '2025-10-01 14:00:00', '2025-10-01 18:00:00', 4.00, 'Present'),
-- Oct 2 - Full day with 3 sessions
(5, '2025-10-02', '2025-10-02 09:15:00', '2025-10-02 12:00:00', 2.75, 'Present'),
(5, '2025-10-02', '2025-10-02 13:00:00', '2025-10-02 15:30:00', 2.50, 'Present'),
(5, '2025-10-02', '2025-10-02 16:00:00', '2025-10-02 18:00:00', 2.00, 'Present'),
-- Oct 3 - Regular day
(5, '2025-10-03', '2025-10-03 09:00:00', '2025-10-03 18:00:00', 8.00, 'Present'),
-- Oct 4 - Half day
(5, '2025-10-04', '2025-10-04 09:00:00', '2025-10-04 13:00:00', 4.00, 'Half-Day'),
-- Oct 7-11 - Full work week with lunch breaks
(5, '2025-10-07', '2025-10-07 09:00:00', '2025-10-07 13:00:00', 4.00, 'Present'),
(5, '2025-10-07', '2025-10-07 14:00:00', '2025-10-07 18:00:00', 4.00, 'Present'),
(5, '2025-10-08', '2025-10-08 09:00:00', '2025-10-08 13:00:00', 4.00, 'Present'),
(5, '2025-10-08', '2025-10-08 14:00:00', '2025-10-08 18:00:00', 4.00, 'Present'),
(5, '2025-10-09', '2025-10-09 09:00:00', '2025-10-09 13:00:00', 4.00, 'Present'),
(5, '2025-10-09', '2025-10-09 14:00:00', '2025-10-09 18:00:00', 4.00, 'Present'),
(5, '2025-10-10', '2025-10-10 09:00:00', '2025-10-10 13:00:00', 4.00, 'Present'),
(5, '2025-10-10', '2025-10-10 14:00:00', '2025-10-10 18:00:00', 4.00, 'Present'),
(5, '2025-10-11', '2025-10-11 09:00:00', '2025-10-11 13:00:00', 4.00, 'Present'),
(5, '2025-10-11', '2025-10-11 14:00:00', '2025-10-11 18:00:00', 4.00, 'Present'),
-- Oct 14-18 - Full week
(5, '2025-10-14', '2025-10-14 09:00:00', '2025-10-14 13:00:00', 4.00, 'Present'),
(5, '2025-10-14', '2025-10-14 14:00:00', '2025-10-14 18:00:00', 4.00, 'Present'),
(5, '2025-10-15', '2025-10-15 09:00:00', '2025-10-15 13:00:00', 4.00, 'Present'),
(5, '2025-10-15', '2025-10-15 14:00:00', '2025-10-15 18:00:00', 4.00, 'Present'),
(5, '2025-10-16', '2025-10-16 09:00:00', '2025-10-16 13:00:00', 4.00, 'Present'),
(5, '2025-10-16', '2025-10-16 14:00:00', '2025-10-16 18:00:00', 4.00, 'Present'),
(5, '2025-10-17', '2025-10-17 09:00:00', '2025-10-17 13:00:00', 4.00, 'Present'),
(5, '2025-10-17', '2025-10-17 14:00:00', '2025-10-17 18:00:00', 4.00, 'Present'),
(5, '2025-10-18', '2025-10-18 09:00:00', '2025-10-18 13:00:00', 4.00, 'Present'),
(5, '2025-10-18', '2025-10-18 14:00:00', '2025-10-18 18:00:00', 4.00, 'Present');

-- Priya Sharma - More regular pattern
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(6, '2025-10-01', '2025-10-01 09:00:00', '2025-10-01 13:00:00', 4.00, 'Present'),
(6, '2025-10-01', '2025-10-01 14:00:00', '2025-10-01 18:00:00', 4.00, 'Present'),
(6, '2025-10-02', '2025-10-02 09:00:00', '2025-10-02 13:00:00', 4.00, 'Present'),
(6, '2025-10-02', '2025-10-02 14:00:00', '2025-10-02 18:00:00', 4.00, 'Present'),
(6, '2025-10-03', '2025-10-03 09:00:00', '2025-10-03 13:00:00', 4.00, 'Present'),
(6, '2025-10-03', '2025-10-03 14:00:00', '2025-10-03 18:00:00', 4.00, 'Present'),
(6, '2025-10-04', '2025-10-04 09:00:00', '2025-10-04 13:00:00', 4.00, 'Present'),
(6, '2025-10-04', '2025-10-04 14:00:00', '2025-10-04 18:00:00', 4.00, 'Present'),
(6, '2025-10-07', '2025-10-07 09:00:00', '2025-10-07 13:00:00', 4.00, 'Present'),
(6, '2025-10-07', '2025-10-07 14:00:00', '2025-10-07 18:00:00', 4.00, 'Present'),
(6, '2025-10-08', '2025-10-08 09:00:00', '2025-10-08 13:00:00', 4.00, 'Present'),
(6, '2025-10-08', '2025-10-08 14:00:00', '2025-10-08 18:00:00', 4.00, 'Present'),
(6, '2025-10-09', '2025-10-09 09:00:00', '2025-10-09 13:00:00', 4.00, 'Present'),
(6, '2025-10-09', '2025-10-09 14:00:00', '2025-10-09 18:00:00', 4.00, 'Present'),
(6, '2025-10-10', '2025-10-10 09:00:00', '2025-10-10 13:00:00', 4.00, 'Present'),
(6, '2025-10-10', '2025-10-10 14:00:00', '2025-10-10 18:00:00', 4.00, 'Present'),
(6, '2025-10-11', '2025-10-11 09:00:00', '2025-10-11 13:00:00', 4.00, 'Present'),
(6, '2025-10-11', '2025-10-11 14:00:00', '2025-10-11 18:00:00', 4.00, 'Present'),
(6, '2025-10-14', '2025-10-14 09:00:00', '2025-10-14 13:00:00', 4.00, 'Present'),
(6, '2025-10-14', '2025-10-14 14:00:00', '2025-10-14 18:00:00', 4.00, 'Present'),
(6, '2025-10-15', '2025-10-15 09:00:00', '2025-10-15 13:00:00', 4.00, 'Present'),
(6, '2025-10-15', '2025-10-15 14:00:00', '2025-10-15 18:00:00', 4.00, 'Present'),
(6, '2025-10-16', '2025-10-16 09:00:00', '2025-10-16 13:00:00', 4.00, 'Present'),
(6, '2025-10-16', '2025-10-16 14:00:00', '2025-10-16 18:00:00', 4.00, 'Present'),
(6, '2025-10-17', '2025-10-17 09:00:00', '2025-10-17 13:00:00', 4.00, 'Present'),
(6, '2025-10-17', '2025-10-17 14:00:00', '2025-10-17 18:00:00', 4.00, 'Present'),
(6, '2025-10-18', '2025-10-18 09:00:00', '2025-10-18 13:00:00', 4.00, 'Present'),
(6, '2025-10-18', '2025-10-18 14:00:00', '2025-10-18 18:00:00', 4.00, 'Present');

-- Amit Patel - Some irregular patterns with unpaid leaves
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(7, '2025-10-01', '2025-10-01 09:00:00', '2025-10-01 13:00:00', 4.00, 'Present'),
(7, '2025-10-01', '2025-10-01 14:00:00', '2025-10-01 18:00:00', 4.00, 'Present'),
(7, '2025-10-02', '2025-10-02 09:30:00', '2025-10-02 13:00:00', 3.50, 'Late'),
(7, '2025-10-02', '2025-10-02 14:00:00', '2025-10-02 17:30:00', 3.50, 'Present'),
(7, '2025-10-03', '2025-10-03 09:00:00', '2025-10-03 13:00:00', 4.00, 'Present'),
(7, '2025-10-03', '2025-10-03 14:00:00', '2025-10-03 18:00:00', 4.00, 'Present'),
-- Oct 4-5: Unpaid leave (no attendance records)
(7, '2025-10-07', '2025-10-07 09:00:00', '2025-10-07 13:00:00', 4.00, 'Present'),
(7, '2025-10-07', '2025-10-07 14:00:00', '2025-10-07 18:00:00', 4.00, 'Present'),
(7, '2025-10-08', '2025-10-08 09:00:00', '2025-10-08 13:00:00', 4.00, 'Present'),
(7, '2025-10-08', '2025-10-08 14:00:00', '2025-10-08 18:00:00', 4.00, 'Present'),
(7, '2025-10-09', '2025-10-09 09:00:00', '2025-10-09 13:00:00', 4.00, 'Present'),
(7, '2025-10-09', '2025-10-09 14:00:00', '2025-10-09 18:00:00', 4.00, 'Present'),
(7, '2025-10-10', '2025-10-10 09:00:00', '2025-10-10 13:00:00', 4.00, 'Present'),
(7, '2025-10-10', '2025-10-10 14:00:00', '2025-10-10 18:00:00', 4.00, 'Present'),
(7, '2025-10-11', '2025-10-11 09:00:00', '2025-10-11 13:00:00', 4.00, 'Present'),
(7, '2025-10-11', '2025-10-11 14:00:00', '2025-10-11 18:00:00', 4.00, 'Present'),
(7, '2025-10-14', '2025-10-14 09:00:00', '2025-10-14 13:00:00', 4.00, 'Present'),
(7, '2025-10-14', '2025-10-14 14:00:00', '2025-10-14 18:00:00', 4.00, 'Present'),
(7, '2025-10-15', '2025-10-15 09:00:00', '2025-10-15 13:00:00', 4.00, 'Present'),
(7, '2025-10-15', '2025-10-15 14:00:00', '2025-10-15 18:00:00', 4.00, 'Present'),
(7, '2025-10-16', '2025-10-16 09:00:00', '2025-10-16 13:00:00', 4.00, 'Present'),
(7, '2025-10-16', '2025-10-16 14:00:00', '2025-10-16 18:00:00', 4.00, 'Present'),
(7, '2025-10-17', '2025-10-17 09:00:00', '2025-10-17 13:00:00', 4.00, 'Present'),
(7, '2025-10-17', '2025-10-17 14:00:00', '2025-10-17 18:00:00', 4.00, 'Present'),
(7, '2025-10-18', '2025-10-18 09:00:00', '2025-10-18 13:00:00', 4.00, 'Present'),
(7, '2025-10-18', '2025-10-18 14:00:00', '2025-10-18 18:00:00', 4.00, 'Present');

-- Similar patterns for other employees (8-14)
-- Sneha Reddy
INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status) VALUES
(8, '2025-10-01', '2025-10-01 09:00:00', '2025-10-01 18:00:00', 8.00, 'Present'),
(8, '2025-10-02', '2025-10-02 09:00:00', '2025-10-02 13:00:00', 4.00, 'Present'),
(8, '2025-10-02', '2025-10-02 14:00:00', '2025-10-02 18:00:00', 4.00, 'Present'),
(8, '2025-10-03', '2025-10-03 09:00:00', '2025-10-03 13:00:00', 4.00, 'Present'),
(8, '2025-10-03', '2025-10-03 14:00:00', '2025-10-03 18:00:00', 4.00, 'Present'),
(8, '2025-10-04', '2025-10-04 09:00:00', '2025-10-04 13:00:00', 4.00, 'Present'),
(8, '2025-10-04', '2025-10-04 14:00:00', '2025-10-04 18:00:00', 4.00, 'Present'),
(8, '2025-10-07', '2025-10-07 09:00:00', '2025-10-07 13:00:00', 4.00, 'Present'),
(8, '2025-10-07', '2025-10-07 14:00:00', '2025-10-07 18:00:00', 4.00, 'Present'),
(8, '2025-10-08', '2025-10-08 09:00:00', '2025-10-08 13:00:00', 4.00, 'Present'),
(8, '2025-10-08', '2025-10-08 14:00:00', '2025-10-08 18:00:00', 4.00, 'Present'),
(8, '2025-10-09', '2025-10-09 09:00:00', '2025-10-09 13:00:00', 4.00, 'Present'),
(8, '2025-10-09', '2025-10-09 14:00:00', '2025-10-09 18:00:00', 4.00, 'Present'),
(8, '2025-10-10', '2025-10-10 09:00:00', '2025-10-10 13:00:00', 4.00, 'Present'),
(8, '2025-10-10', '2025-10-10 14:00:00', '2025-10-10 18:00:00', 4.00, 'Present'),
(8, '2025-10-11', '2025-10-11 09:00:00', '2025-10-11 13:00:00', 4.00, 'Present'),
(8, '2025-10-11', '2025-10-11 14:00:00', '2025-10-11 18:00:00', 4.00, 'Present'),
(8, '2025-10-14', '2025-10-14 09:00:00', '2025-10-14 13:00:00', 4.00, 'Present'),
(8, '2025-10-14', '2025-10-14 14:00:00', '2025-10-14 18:00:00', 4.00, 'Present'),
(8, '2025-10-15', '2025-10-15 09:00:00', '2025-10-15 13:00:00', 4.00, 'Present'),
(8, '2025-10-15', '2025-10-15 14:00:00', '2025-10-15 18:00:00', 4.00, 'Present'),
(8, '2025-10-16', '2025-10-16 09:00:00', '2025-10-16 13:00:00', 4.00, 'Present'),
(8, '2025-10-16', '2025-10-16 14:00:00', '2025-10-16 18:00:00', 4.00, 'Present'),
(8, '2025-10-17', '2025-10-17 09:00:00', '2025-10-17 13:00:00', 4.00, 'Present'),
(8, '2025-10-17', '2025-10-17 14:00:00', '2025-10-17 18:00:00', 4.00, 'Present'),
(8, '2025-10-18', '2025-10-18 09:00:00', '2025-10-18 13:00:00', 4.00, 'Present'),
(8, '2025-10-18', '2025-10-18 14:00:00', '2025-10-18 18:00:00', 4.00, 'Present');

-- =====================================================
-- 5. LEAVE BALANCE FOR EMPLOYEES (2025)
-- =====================================================

INSERT IGNORE INTO leave_balance (user_id, leave_type_id, year, total_allocated, used_days, remaining_days) VALUES
-- Rajesh Kumar
(5, 1, 2025, 12, 2, 10),  -- Casual Leave
(5, 2, 2025, 10, 0, 10),  -- Sick Leave
(5, 3, 2025, 20, 0, 20),  -- Earned Leave
-- Priya Sharma
(6, 1, 2025, 12, 0, 12),
(6, 2, 2025, 10, 0, 10),
(6, 3, 2025, 20, 0, 20),
-- Amit Patel
(7, 1, 2025, 12, 2, 10),
(7, 2, 2025, 10, 0, 10),
(7, 3, 2025, 20, 0, 20),
-- Sneha Reddy
(8, 1, 2025, 12, 1, 11),
(8, 2, 2025, 10, 0, 10),
(8, 3, 2025, 20, 0, 20),
-- Vikram Singh
(9, 1, 2025, 12, 3, 9),
(9, 2, 2025, 10, 0, 10),
(9, 3, 2025, 20, 0, 20),
-- Anjali Verma
(10, 1, 2025, 12, 0, 12),
(10, 2, 2025, 10, 0, 10),
(10, 3, 2025, 20, 0, 20),
-- Rahul Mehta
(11, 1, 2025, 12, 1, 11),
(11, 2, 2025, 10, 1, 9),
(11, 3, 2025, 20, 0, 20),
-- Kavya Nair
(12, 1, 2025, 12, 0, 12),
(12, 2, 2025, 10, 0, 10),
(12, 3, 2025, 20, 0, 20),
-- Arjun Gupta
(13, 1, 2025, 12, 2, 10),
(13, 2, 2025, 10, 0, 10),
(13, 3, 2025, 20, 0, 20),
-- Neha Iyer
(14, 1, 2025, 12, 0, 12),
(14, 2, 2025, 10, 0, 10),
(14, 3, 2025, 20, 0, 20);

-- =====================================================
-- 6. LEAVE APPLICATIONS
-- =====================================================

INSERT IGNORE INTO leave_applications (user_id, leave_type_id, start_date, end_date, total_days, reason, status, approved_by, approved_date) VALUES
(5, 1, '2025-10-23', '2025-10-24', 2, 'Personal work', 'Approved', 2, '2025-10-20 10:00:00'),
(7, 1, '2025-10-04', '2025-10-05', 2, 'Family function', 'Approved', 2, '2025-10-01 14:00:00'),
(8, 1, '2025-10-25', '2025-10-25', 1, 'Medical checkup', 'Approved', 2, '2025-10-22 11:00:00'),
(9, 1, '2025-10-21', '2025-10-23', 3, 'Personal reasons', 'Pending', NULL, NULL),
(11, 1, '2025-10-28', '2025-10-28', 1, 'Bank work', 'Approved', 2, '2025-10-25 09:00:00'),
(13, 1, '2025-10-30', '2025-10-31', 2, 'Travel', 'Pending', NULL, NULL);

-- =====================================================
-- SUMMARY QUERIES TO VERIFY DATA
-- =====================================================

-- Total users by role
SELECT r.role_name, COUNT(u.user_id) as user_count 
FROM roles r 
LEFT JOIN users u ON r.role_id = u.role_id 
GROUP BY r.role_name;

-- Employees with profiles
SELECT COUNT(*) as total_employees 
FROM employee_profiles;

-- Attendance summary for October 2025
SELECT 
    u.user_id,
    CONCAT(ep.first_name, ' ', ep.last_name) as name,
    COUNT(DISTINCT a.attendance_date) as days_present,
    COUNT(a.attendance_id) as total_sessions,
    SUM(a.total_hours) as total_hours
FROM users u
JOIN employee_profiles ep ON u.user_id = ep.user_id
LEFT JOIN attendance a ON u.user_id = a.user_id 
    AND a.attendance_date BETWEEN '2025-10-01' AND '2025-10-31'
WHERE u.role_id = 4
GROUP BY u.user_id
ORDER BY u.user_id;

-- Attendance summary for November 2025 (Current Month)
SELECT 
    u.user_id,
    CONCAT(ep.first_name, ' ', ep.last_name) as name,
    COUNT(DISTINCT a.attendance_date) as days_present,
    COUNT(a.attendance_id) as total_sessions,
    SUM(a.total_hours) as total_hours,
    MAX(a.check_in_time) as last_check_in,
    MAX(a.check_out_time) as last_check_out
FROM users u
JOIN employee_profiles ep ON u.user_id = ep.user_id
LEFT JOIN attendance a ON u.user_id = a.user_id 
    AND a.attendance_date BETWEEN '2025-11-01' AND '2025-11-08'
WHERE u.role_id = 4
GROUP BY u.user_id
ORDER BY u.user_id;

-- Salary structure summary
SELECT 
    u.user_id,
    CONCAT(ep.first_name, ' ', ep.last_name) as name,
    SUM(CASE WHEN sc.component_type = 'Earning' THEN ess.amount ELSE 0 END) as gross_earnings,
    SUM(CASE WHEN sc.component_type = 'Deduction' THEN ess.amount ELSE 0 END) as total_deductions,
    SUM(CASE WHEN sc.component_type = 'Earning' THEN ess.amount ELSE 0 END) - 
    SUM(CASE WHEN sc.component_type = 'Deduction' THEN ess.amount ELSE 0 END) as net_salary
FROM users u
JOIN employee_profiles ep ON u.user_id = ep.user_id
JOIN employee_salary_structure ess ON u.user_id = ess.user_id
JOIN salary_components sc ON ess.component_id = sc.component_id
WHERE ess.is_active = TRUE
GROUP BY u.user_id
ORDER BY u.user_id;

-- =====================================================
-- END OF MOCK DATA
-- =====================================================
