-- =====================================================
-- Time Off Management Feature - Database Setup
-- CORRECTED VERSION with proper foreign key references
-- =====================================================

USE workzen_hrms;

-- Create leave_balances table
CREATE TABLE IF NOT EXISTS leave_balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  paid_time_off DECIMAL(5,2) NOT NULL DEFAULT 24.00,
  sick_time_off DECIMAL(5,2) NOT NULL DEFAULT 7.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_balance (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create leave_requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  leave_type ENUM('Paid Time Off', 'Sick Time Off') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested DECIMAL(5,2) NOT NULL,
  reason TEXT,
  status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create leave_requests_view
CREATE OR REPLACE VIEW leave_requests_view AS
SELECT 
  lr.id,
  lr.user_id,
  u.email,
  CONCAT(ep.first_name, ' ', ep.last_name) AS full_name,
  lr.leave_type,
  lr.start_date,
  lr.end_date,
  lr.days_requested,
  lr.reason,
  lr.status,
  lr.reviewed_by,
  CONCAT(reviewer_ep.first_name, ' ', reviewer_ep.last_name) AS reviewed_by_name,
  lr.reviewed_at,
  lr.created_at,
  lr.updated_at
FROM leave_requests lr
INNER JOIN users u ON lr.user_id = u.user_id
LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
LEFT JOIN users reviewer ON lr.reviewed_by = reviewer.user_id
LEFT JOIN employee_profiles reviewer_ep ON reviewer.user_id = reviewer_ep.user_id;

-- Initialize leave balances for all existing users
INSERT INTO leave_balances (user_id, paid_time_off, sick_time_off)
SELECT u.user_id, 24.00, 7.00
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM leave_balances lb WHERE lb.user_id = u.user_id
);

SELECT '✅ Time Off Management tables created successfully!' AS status;
