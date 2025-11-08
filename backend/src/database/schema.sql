-- =====================================================
-- WorkZen HRMS Database Schema
-- Smart Human Resource Management System
-- =====================================================

-- Create Database
CREATE DATABASE IF NOT EXISTS workzen_hrms 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE workzen_hrms;

-- =====================================================
-- 1. ROLES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS roles (
    role_id INT PRIMARY KEY AUTO_INCREMENT,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role_name (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default roles
INSERT INTO roles (role_name, description) VALUES
('Admin', 'Full system access with all privileges'),
('HR Officer', 'Manage employees, leave, and attendance'),
('Payroll Officer', 'Manage payroll and salary disbursement'),
('Employee', 'Basic employee access')
ON DUPLICATE KEY UPDATE description=VALUES(description);

-- =====================================================
-- 2. USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    role_id INT NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT,
    INDEX idx_email (email),
    INDEX idx_role_id (role_id),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 3. EMPLOYEE PROFILES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS employee_profiles (
    profile_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    employee_code VARCHAR(50) UNIQUE,
    company_name VARCHAR(255),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    phone VARCHAR(20),
    date_of_birth DATE,
    gender ENUM('Male', 'Female', 'Other'),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    postal_code VARCHAR(20),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    date_of_joining DATE,
    department VARCHAR(100),
    designation VARCHAR(100),
    profile_picture VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_employee_code (employee_code),
    INDEX idx_department (department),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 4. ATTENDANCE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS attendance (
    attendance_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    attendance_date DATE NOT NULL,
    check_in_time DATETIME,
    check_out_time DATETIME,
    total_hours DECIMAL(4,2),
    status ENUM('Present', 'Absent', 'Half-Day', 'Late', 'On Leave') DEFAULT 'Present',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, attendance_date),
    INDEX idx_attendance_date (attendance_date),
    INDEX idx_status (status),
    INDEX idx_check_in (user_id, check_in_time),
    INDEX idx_check_out (user_id, check_out_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 5. LEAVE TYPES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS leave_types (
    leave_type_id INT PRIMARY KEY AUTO_INCREMENT,
    leave_type_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    default_days_per_year INT DEFAULT 0,
    is_paid BOOLEAN DEFAULT TRUE,
    requires_approval BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_leave_type_name (leave_type_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default leave types
INSERT INTO leave_types (leave_type_name, description, default_days_per_year, is_paid) VALUES
('Casual Leave', 'Short-term personal leave', 12, TRUE),
('Sick Leave', 'Medical or health-related leave', 10, TRUE),
('Earned Leave', 'Annual earned leave', 20, TRUE),
('Maternity Leave', 'Leave for maternity purposes', 180, TRUE),
('Paternity Leave', 'Leave for paternity purposes', 15, TRUE),
('Unpaid Leave', 'Leave without pay', 0, FALSE)
ON DUPLICATE KEY UPDATE description=VALUES(description);

-- =====================================================
-- 6. LEAVE BALANCE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS leave_balance (
    balance_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    leave_type_id INT NOT NULL,
    year INT NOT NULL,
    total_allocated INT DEFAULT 0,
    used_days DECIMAL(5,2) DEFAULT 0,
    remaining_days DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_leave_year (user_id, leave_type_id, year),
    INDEX idx_user_year (user_id, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 7. LEAVE APPLICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS leave_applications (
    leave_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    leave_type_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days DECIMAL(5,2) NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') DEFAULT 'Pending',
    applied_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by INT NULL,
    approved_date TIMESTAMP NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_user_status (user_id, status),
    INDEX idx_dates (start_date, end_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 8. SALARY COMPONENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS salary_components (
    component_id INT PRIMARY KEY AUTO_INCREMENT,
    component_name VARCHAR(100) NOT NULL UNIQUE,
    component_type ENUM('Earning', 'Deduction') NOT NULL,
    description TEXT,
    is_taxable BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_component_type (component_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default salary components
INSERT INTO salary_components (component_name, component_type, description, is_taxable) VALUES
('Basic Salary', 'Earning', 'Base salary component', TRUE),
('House Rent Allowance', 'Earning', 'HRA component', TRUE),
('Special Allowance', 'Earning', 'Special allowance', TRUE),
('Transport Allowance', 'Earning', 'Transportation allowance', FALSE),
('Medical Allowance', 'Earning', 'Medical benefits', FALSE),
('Provident Fund', 'Deduction', 'PF deduction', FALSE),
('Professional Tax', 'Deduction', 'Professional tax', FALSE),
('Income Tax', 'Deduction', 'TDS deduction', FALSE),
('Insurance', 'Deduction', 'Insurance premium', FALSE)
ON DUPLICATE KEY UPDATE description=VALUES(description);

-- =====================================================
-- 9. EMPLOYEE SALARY STRUCTURE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS employee_salary_structure (
    structure_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    component_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES salary_components(component_id) ON DELETE CASCADE,
    INDEX idx_user_component (user_id, component_id),
    INDEX idx_user_active (user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 10. PAYROLL TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payroll (
    payroll_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    working_days INT NOT NULL,
    present_days DECIMAL(5,2) NOT NULL,
    leave_days DECIMAL(5,2) DEFAULT 0,
    gross_salary DECIMAL(12,2) NOT NULL,
    total_deductions DECIMAL(12,2) DEFAULT 0,
    net_salary DECIMAL(12,2) NOT NULL,
    payment_date DATE NULL,
    payment_status ENUM('Pending', 'Processed', 'Paid', 'On Hold') DEFAULT 'Pending',
    payment_method ENUM('Bank Transfer', 'Cash', 'Cheque') DEFAULT 'Bank Transfer',
    remarks TEXT,
    generated_by INT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (generated_by) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_month_year (user_id, month, year),
    INDEX idx_user_year_month (user_id, year, month),
    INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 11. PAYROLL DETAILS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payroll_details (
    detail_id INT PRIMARY KEY AUTO_INCREMENT,
    payroll_id INT NOT NULL,
    component_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payroll_id) REFERENCES payroll(payroll_id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES salary_components(component_id) ON DELETE CASCADE,
    INDEX idx_payroll_id (payroll_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 12. AUDIT LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id INT,
    old_value TEXT,
    new_value TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_user_action (user_id, action),
    INDEX idx_table_record (table_name, record_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 13. PASSWORD RESET CODES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS password_reset_codes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    reset_code VARCHAR(6) NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_reset_code (reset_code),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- VIEWS FOR EASY QUERYING
-- =====================================================

-- View: Complete User Information
CREATE OR REPLACE VIEW view_user_details AS
SELECT 
    u.user_id,
    u.email,
    u.is_active,
    u.last_login,
    r.role_name,
    ep.employee_code,
    ep.company_name,
    CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS full_name,
    ep.phone,
    ep.department,
    ep.designation,
    ep.date_of_joining,
    ep.profile_picture
FROM users u
INNER JOIN roles r ON u.role_id = r.role_id
LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id;

-- View: Monthly Attendance Summary
CREATE OR REPLACE VIEW view_monthly_attendance AS
SELECT 
    user_id,
    YEAR(attendance_date) AS year,
    MONTH(attendance_date) AS month,
    COUNT(*) AS total_days,
    SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_days,
    SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_days,
    SUM(CASE WHEN status = 'Half-Day' THEN 0.5 ELSE 0 END) AS half_days,
    SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late_days,
    SUM(CASE WHEN status = 'On Leave' THEN 1 ELSE 0 END) AS leave_days,
    SUM(total_hours) AS total_hours_worked
FROM attendance
GROUP BY user_id, YEAR(attendance_date), MONTH(attendance_date);

-- View: Leave Balance Summary
CREATE OR REPLACE VIEW view_leave_summary AS
SELECT 
    lb.user_id,
    u.email,
    CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS full_name,
    lt.leave_type_name,
    lb.year,
    lb.total_allocated,
    lb.used_days,
    lb.remaining_days
FROM leave_balance lb
INNER JOIN users u ON lb.user_id = u.user_id
INNER JOIN leave_types lt ON lb.leave_type_id = lt.leave_type_id
LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id;

-- =====================================================
-- END OF SCHEMA
-- =====================================================
