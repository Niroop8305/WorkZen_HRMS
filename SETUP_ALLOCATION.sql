-- =====================================================
-- QUICK SETUP: Run this in MySQL Workbench
-- Adds Allocation feature to Time Off Management
-- =====================================================

USE workzen_hrms;

-- Step 1: Create leave_allocations table
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

-- Step 2: Add maximum threshold columns if they don't exist
-- Check if columns exist first
SET @dbname = DATABASE();
SET @tablename = 'leave_balances';
SET @col1 = 'paid_time_off_max';
SET @col2 = 'sick_time_off_max';

SET @col1_exists = (SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname 
  AND TABLE_NAME = @tablename 
  AND COLUMN_NAME = @col1);

SET @col2_exists = (SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname 
  AND TABLE_NAME = @tablename 
  AND COLUMN_NAME = @col2);

-- Add columns if they don't exist
SET @query1 = IF(@col1_exists = 0, 
  'ALTER TABLE leave_balances ADD COLUMN paid_time_off_max DECIMAL(5,2) DEFAULT 30.00 AFTER paid_time_off', 
  'SELECT "Column paid_time_off_max already exists" AS message');
PREPARE stmt1 FROM @query1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @query2 = IF(@col2_exists = 0, 
  'ALTER TABLE leave_balances ADD COLUMN sick_time_off_max DECIMAL(5,2) DEFAULT 15.00 AFTER sick_time_off', 
  'SELECT "Column sick_time_off_max already exists" AS message');
PREPARE stmt2 FROM @query2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Step 3: Update existing records to set default max values
UPDATE leave_balances 
SET paid_time_off_max = COALESCE(paid_time_off_max, 30.00), 
    sick_time_off_max = COALESCE(sick_time_off_max, 15.00);

SELECT '✅ Allocation feature setup complete!' AS status;
SELECT 'Tables created:' AS info, 'leave_allocations' AS table_name;
SELECT 'Columns added:' AS info, 'paid_time_off_max, sick_time_off_max' AS columns;
