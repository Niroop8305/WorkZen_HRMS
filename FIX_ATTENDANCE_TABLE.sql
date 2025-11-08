-- Fix Database Schema for Payroll System
-- This will ensure the correct attendance table structure exists
-- Run this in MySQL Workbench

USE payroll_system;

-- Drop the old attendance table if it exists with wrong structure
-- DROP TABLE IF EXISTS attendance;

-- Create the correct attendance table for payroll
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

-- Insert November 2025 attendance data
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days) VALUES
(1, 'November', 2025, 20, 2, 0, 30),
(2, 'November', 2025, 22, 0, 0, 30),
(3, 'November', 2025, 19, 3, 0, 30),
(4, 'November', 2025, 21, 1, 0, 30),
(5, 'November', 2025, 18, 2, 2, 30)
ON DUPLICATE KEY UPDATE 
  present_days=VALUES(present_days), 
  paid_leaves=VALUES(paid_leaves), 
  unpaid_leaves=VALUES(unpaid_leaves);

SELECT 'Attendance table fixed and November data added!' as Status;
SELECT * FROM attendance WHERE month = 'November' AND year = 2025;
