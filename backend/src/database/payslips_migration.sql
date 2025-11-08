-- Migration script to update payslips table for standalone payslips
-- Run this script if you have existing database

-- Step 1: Drop the old unique constraint
ALTER TABLE payslips DROP INDEX IF EXISTS unique_payslip;

-- Step 2: Modify payrun_id to allow NULL
ALTER TABLE payslips MODIFY COLUMN payrun_id INT NULL;

-- Step 3: Modify status to use ENUM
ALTER TABLE payslips MODIFY COLUMN status ENUM('Draft','Done') DEFAULT 'Draft';

-- Step 4: Set default values for amount fields
ALTER TABLE payslips MODIFY COLUMN basic_salary DECIMAL(10,2) DEFAULT 0;
ALTER TABLE payslips MODIFY COLUMN hra DECIMAL(10,2) DEFAULT 0;
ALTER TABLE payslips MODIFY COLUMN earned_salary DECIMAL(10,2) DEFAULT 0;
ALTER TABLE payslips MODIFY COLUMN gross_salary DECIMAL(10,2) DEFAULT 0;
ALTER TABLE payslips MODIFY COLUMN total_deductions DECIMAL(10,2) DEFAULT 0;
ALTER TABLE payslips MODIFY COLUMN net_salary DECIMAL(10,2) DEFAULT 0;

-- Step 5: Add new unique constraint for emp, month, year
ALTER TABLE payslips ADD UNIQUE KEY unique_emp_month_year (emp_id, month, year);
