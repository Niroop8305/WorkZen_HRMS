-- November 2025 Attendance Data
-- Insert attendance records for all employees for November 2025

-- Clear any existing November 2025 data (optional)
DELETE FROM attendance WHERE month = 'November' AND year = 2025;

-- Insert attendance for all employees
INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days, created_at)
VALUES
-- Assuming you have employees with IDs 1-10
(1, 'November', 2025, 20, 2, 0, 30, NOW()),
(2, 'November', 2025, 22, 0, 0, 30, NOW()),
(3, 'November', 2025, 19, 3, 0, 30, NOW()),
(4, 'November', 2025, 21, 1, 0, 30, NOW()),
(5, 'November', 2025, 18, 2, 2, 30, NOW()),
(6, 'November', 2025, 20, 2, 0, 30, NOW()),
(7, 'November', 2025, 22, 0, 0, 30, NOW()),
(8, 'November', 2025, 21, 1, 0, 30, NOW()),
(9, 'November', 2025, 19, 3, 0, 30, NOW()),
(10, 'November', 2025, 20, 2, 0, 30, NOW());

-- Verify the data
SELECT a.*, e.name, e.emp_id as employee_id 
FROM attendance a
JOIN employees e ON a.emp_id = e.id
WHERE a.month = 'November' AND a.year = 2025;
