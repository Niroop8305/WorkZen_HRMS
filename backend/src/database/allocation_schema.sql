-- =====================================================
-- Leave Allocation History Table
-- Tracks all manual adjustments to leave balances
-- =====================================================

USE workzen_hrms;

-- Create leave_allocations table to track allocation history
CREATE TABLE IF NOT EXISTS leave_allocations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  leave_type ENUM('Paid Time Off', 'Sick Time Off') NOT NULL,
  days_allocated DECIMAL(5,2) NOT NULL,
  validity_start DATE,
  validity_end DATE,
  reason TEXT,
  allocated_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (allocated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  INDEX idx_user_id (user_id),
  INDEX idx_leave_type (leave_type),
  INDEX idx_allocated_by (allocated_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add maximum threshold columns to leave_balances table
ALTER TABLE leave_balances 
ADD COLUMN IF NOT EXISTS paid_time_off_max DECIMAL(5,2) DEFAULT 30.00 AFTER paid_time_off,
ADD COLUMN IF NOT EXISTS sick_time_off_max DECIMAL(5,2) DEFAULT 15.00 AFTER sick_time_off;

-- Update existing records to set max values
UPDATE leave_balances 
SET paid_time_off_max = 30.00, sick_time_off_max = 15.00
WHERE paid_time_off_max IS NULL OR sick_time_off_max IS NULL;

SELECT '✅ Allocation schema created successfully!' AS status;
