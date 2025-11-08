-- Time Off Management Schema
-- Run this file to create the necessary tables for leave management

USE workzen_hrms;

-- Create leave_balances table to track available days for each employee
CREATE TABLE IF NOT EXISTS leave_balances (
    balance_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    paid_time_off_balance DECIMAL(5,2) DEFAULT 24.00,
    sick_time_off_balance DECIMAL(5,2) DEFAULT 7.00,
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_year (user_id, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create leave_requests table to store time off requests
CREATE TABLE IF NOT EXISTS leave_requests (
    request_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    employee_name VARCHAR(255),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    leave_type ENUM('Paid time Off', 'Sick time off') NOT NULL,
    total_days DECIMAL(5,2) NOT NULL,
    reason TEXT,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    reviewed_by INT,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_leave_type (leave_type),
    INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialize leave balances for existing users for current year
INSERT INTO leave_balances (user_id, paid_time_off_balance, sick_time_off_balance, year)
SELECT 
    user_id,
    24.00,
    7.00,
    YEAR(CURDATE())
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM leave_balances 
    WHERE leave_balances.user_id = users.user_id 
    AND leave_balances.year = YEAR(CURDATE())
)
ON DUPLICATE KEY UPDATE user_id = user_id;

-- Create a view to show leave requests with employee details
CREATE OR REPLACE VIEW leave_requests_view AS
SELECT 
    lr.request_id,
    lr.user_id,
    COALESCE(lr.employee_name, CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, ''))) as employee_name,
    ep.employee_code,
    ep.department,
    lr.start_date,
    lr.end_date,
    lr.leave_type,
    lr.total_days,
    lr.reason,
    lr.status,
    lr.reviewed_by,
    lr.reviewed_at,
    lr.created_at,
    CONCAT(rev_ep.first_name, ' ', COALESCE(rev_ep.last_name, '')) as reviewed_by_name
FROM leave_requests lr
LEFT JOIN employee_profiles ep ON lr.user_id = ep.user_id
LEFT JOIN users rev_u ON lr.reviewed_by = rev_u.user_id
LEFT JOIN employee_profiles rev_ep ON rev_u.user_id = rev_ep.user_id;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON leave_requests TO 'workzen_user'@'localhost';
GRANT SELECT, INSERT, UPDATE ON leave_balances TO 'workzen_user'@'localhost';
GRANT SELECT ON leave_requests_view TO 'workzen_user'@'localhost';
