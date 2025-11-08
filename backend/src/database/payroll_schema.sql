-- Payroll System Database Schema

-- Employees Table
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

-- Attendance Table
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

-- Payruns Table
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

-- Payslips Table
CREATE TABLE IF NOT EXISTS payslips (
  id INT PRIMARY KEY AUTO_INCREMENT,
  emp_id INT NOT NULL,
  payrun_id INT NULL,  -- NULL for standalone payslips
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

-- Insert Sample Employees
INSERT INTO employees (name, emp_id, basic_salary, hra, pf_rate, tax_rate) VALUES
('Rajesh Kumar', 'EMP001', 25000.00, 5000.00, 0.12, 0),
('Priya Sharma', 'EMP002', 30000.00, 6000.00, 0.12, 0),
('Amit Patel', 'EMP003', 28000.00, 5600.00, 0.12, 0),
('Sneha Reddy', 'EMP004', 32000.00, 6400.00, 0.12, 0),
('Vikram Singh', 'EMP005', 27000.00, 5400.00, 0.12, 0)
ON DUPLICATE KEY UPDATE name=name;

-- Insert Sample Attendance Data for October 2025
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days) VALUES
(1, 'October', 2025, 22, 2, 0, 30),
(2, 'October', 2025, 24, 0, 0, 30),
(3, 'October', 2025, 20, 2, 2, 30),
(4, 'October', 2025, 23, 1, 0, 30),
(5, 'October', 2025, 21, 3, 0, 30)
ON DUPLICATE KEY UPDATE present_days=VALUES(present_days), paid_leaves=VALUES(paid_leaves), unpaid_leaves=VALUES(unpaid_leaves);

-- Insert Sample Attendance Data for September 2025
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days) VALUES
(1, 'September', 2025, 20, 2, 2, 30),
(2, 'September', 2025, 22, 2, 0, 30),
(3, 'September', 2025, 21, 1, 2, 30),
(4, 'September', 2025, 23, 1, 0, 30),
(5, 'September', 2025, 20, 2, 2, 30)
ON DUPLICATE KEY UPDATE present_days=VALUES(present_days), paid_leaves=VALUES(paid_leaves), unpaid_leaves=VALUES(unpaid_leaves);
