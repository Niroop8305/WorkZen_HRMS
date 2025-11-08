// Test Data for Payroll Module
// Run this script in your MySQL database to create sample payroll data

-- Sample payroll data for testing
-- Assumes you have users with user_ids 1, 2, 3, etc.

-- Insert sample payroll records
INSERT INTO payroll (user_id, month, year, gross_salary, total_deductions, net_salary, worked_days, paid_time_off, payment_status, payment_date, created_at, updated_at)
VALUES
-- Employee 1 - October 2025
(1, 10, 2025, 80000.00, 26000.00, 54000.00, 20, 2, 'Paid', '2025-10-31', NOW(), NOW()),
-- Employee 1 - September 2025
(1, 9, 2025, 80000.00, 26000.00, 54000.00, 22, 0, 'Paid', '2025-09-30', NOW(), NOW()),
-- Employee 1 - August 2025
(1, 8, 2025, 75000.00, 24500.00, 50500.00, 18, 4, 'Paid', '2025-08-31', NOW(), NOW()),

-- Employee 2 - October 2025
(2, 10, 2025, 65000.00, 21000.00, 44000.00, 21, 1, 'Paid', '2025-10-31', NOW(), NOW()),
-- Employee 2 - September 2025
(2, 9, 2025, 65000.00, 21000.00, 44000.00, 22, 0, 'Paid', '2025-09-30', NOW(), NOW()),

-- Employee 3 - October 2025 (Pending)
(3, 10, 2025, 90000.00, 30000.00, 60000.00, 20, 2, 'Pending', NULL, NOW(), NOW());

-- Insert salary components if not exists
INSERT INTO salary_components (component_name, component_type, is_taxable, is_active, created_at, updated_at)
VALUES
('Basic Salary', 'Earning', true, true, NOW(), NOW()),
('House Rent Allowance', 'Earning', true, true, NOW(), NOW()),
('Standard Allowance', 'Earning', true, true, NOW(), NOW()),
('Performance Bonus', 'Earning', true, true, NOW(), NOW()),
('Leave Travel Allowance', 'Earning', true, true, NOW(), NOW()),
('Fixed Allowance', 'Earning', true, true, NOW(), NOW()),
('Gross', 'Earning', true, true, NOW(), NOW()),
('PF Employer', 'Deduction', false, true, NOW(), NOW()),
('PF Employee', 'Deduction', false, true, NOW(), NOW()),
('Professional Tax', 'Deduction', false, true, NOW(), NOW()),
('HRA Deduction', 'Deduction', false, true, NOW(), NOW()),
('TDS Deduction', 'Deduction', true, true, NOW(), NOW())
ON DUPLICATE KEY UPDATE component_name = VALUES(component_name);

-- Get component IDs (adjust these based on your actual component_ids)
-- You may need to run SELECT * FROM salary_components; first to get the actual IDs

-- Insert payroll details for Employee 1 - October 2025
-- Assuming payroll_id = 1 (check your actual payroll_id)
INSERT INTO payroll_details (payroll_id, component_id, amount, rate, created_at, updated_at)
VALUES
-- Earnings
(1, 1, 40000.00, 100, NOW(), NOW()),  -- Basic Salary
(1, 2, 16000.00, 40, NOW(), NOW()),   -- House Rent Allowance
(1, 3, 9600.00, 24, NOW(), NOW()),    -- Standard Allowance
(1, 4, 8000.00, 20, NOW(), NOW()),    -- Performance Bonus
(1, 5, 4000.00, 10, NOW(), NOW()),    -- Leave Travel Allowance
(1, 6, 2400.00, 6, NOW(), NOW()),     -- Fixed Allowance
-- Deductions
(1, 8, 4800.00, 12, NOW(), NOW()),    -- PF Employer
(1, 9, 4800.00, 12, NOW(), NOW()),    -- PF Employee
(1, 10, 200.00, 0.5, NOW(), NOW()),   -- Professional Tax
(1, 11, 8000.00, 20, NOW(), NOW()),   -- HRA Deduction
(1, 12, 8200.00, 20.5, NOW(), NOW());  -- TDS Deduction

-- Alternative: Full test script with multiple employees
-- Run this to create complete test data

DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS generate_test_payroll()
BEGIN
    DECLARE user_count INT DEFAULT 0;
    DECLARE current_user INT DEFAULT 1;
    DECLARE current_month INT DEFAULT 8;
    DECLARE current_year INT DEFAULT 2025;
    DECLARE payroll_id_var INT;
    DECLARE basic_salary DECIMAL(10,2);
    
    -- Get number of users
    SELECT COUNT(*) INTO user_count FROM users WHERE role_id IN (1, 2, 3, 4);
    
    -- Loop through users
    WHILE current_user <= user_count DO
        -- Generate random basic salary between 40000 and 100000
        SET basic_salary = 40000 + (RAND() * 60000);
        
        -- Generate payroll for last 3 months
        SET current_month = 8;
        WHILE current_month <= 10 DO
            -- Calculate components
            INSERT INTO payroll (
                user_id, 
                month, 
                year, 
                gross_salary, 
                total_deductions, 
                net_salary, 
                worked_days, 
                paid_time_off, 
                payment_status, 
                payment_date, 
                created_at, 
                updated_at
            ) VALUES (
                current_user,
                current_month,
                current_year,
                basic_salary * 2,
                basic_salary * 0.65,
                basic_salary * 1.35,
                FLOOR(18 + (RAND() * 4)),
                FLOOR(RAND() * 3),
                IF(current_month = 10, 'Pending', 'Paid'),
                IF(current_month = 10, NULL, CONCAT(current_year, '-', LPAD(current_month, 2, '0'), '-30')),
                NOW(),
                NOW()
            );
            
            SET payroll_id_var = LAST_INSERT_ID();
            
            -- Insert payroll details
            -- Earnings
            INSERT INTO payroll_details (payroll_id, component_id, amount, rate)
            SELECT 
                payroll_id_var,
                component_id,
                CASE component_name
                    WHEN 'Basic Salary' THEN basic_salary
                    WHEN 'House Rent Allowance' THEN basic_salary * 0.4
                    WHEN 'Standard Allowance' THEN basic_salary * 0.24
                    WHEN 'Performance Bonus' THEN basic_salary * 0.2
                    WHEN 'Leave Travel Allowance' THEN basic_salary * 0.1
                    WHEN 'Fixed Allowance' THEN basic_salary * 0.06
                END,
                CASE component_name
                    WHEN 'Basic Salary' THEN 100
                    WHEN 'House Rent Allowance' THEN 40
                    WHEN 'Standard Allowance' THEN 24
                    WHEN 'Performance Bonus' THEN 20
                    WHEN 'Leave Travel Allowance' THEN 10
                    WHEN 'Fixed Allowance' THEN 6
                END
            FROM salary_components
            WHERE component_type = 'Earning'
            AND component_name IN ('Basic Salary', 'House Rent Allowance', 'Standard Allowance', 
                                   'Performance Bonus', 'Leave Travel Allowance', 'Fixed Allowance');
            
            -- Deductions
            INSERT INTO payroll_details (payroll_id, component_id, amount, rate)
            SELECT 
                payroll_id_var,
                component_id,
                CASE component_name
                    WHEN 'PF Employer' THEN basic_salary * 0.12
                    WHEN 'PF Employee' THEN basic_salary * 0.12
                    WHEN 'Professional Tax' THEN 200
                    WHEN 'HRA Deduction' THEN basic_salary * 0.2
                    WHEN 'TDS Deduction' THEN basic_salary * 0.205
                END,
                CASE component_name
                    WHEN 'PF Employer' THEN 12
                    WHEN 'PF Employee' THEN 12
                    WHEN 'Professional Tax' THEN 0.5
                    WHEN 'HRA Deduction' THEN 20
                    WHEN 'TDS Deduction' THEN 20.5
                END
            FROM salary_components
            WHERE component_type = 'Deduction'
            AND component_name IN ('PF Employer', 'PF Employee', 'Professional Tax', 
                                   'HRA Deduction', 'TDS Deduction');
            
            SET current_month = current_month + 1;
        END WHILE;
        
        SET current_user = current_user + 1;
    END WHILE;
    
END$$

DELIMITER ;

-- Call the procedure to generate test data
-- CALL generate_test_payroll();

-- Query to verify data
-- SELECT 
--     p.payroll_id,
--     u.email,
--     ep.full_name,
--     p.month,
--     p.year,
--     p.gross_salary,
--     p.total_deductions,
--     p.net_salary,
--     p.payment_status
-- FROM payroll p
-- JOIN users u ON p.user_id = u.user_id
-- LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
-- ORDER BY p.year DESC, p.month DESC, u.email;
