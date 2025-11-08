-- Migration: Allow multiple check-ins/check-outs per day
-- This removes the unique constraint and changes time columns to datetime

USE workzen_hrms;

-- Drop the unique constraint if it exists
ALTER TABLE attendance DROP INDEX IF EXISTS unique_user_date;

-- Modify check_in_time and check_out_time to DATETIME
ALTER TABLE attendance 
  MODIFY COLUMN check_in_time DATETIME,
  MODIFY COLUMN check_out_time DATETIME;

-- Add new indexes for better performance
ALTER TABLE attendance 
  ADD INDEX IF NOT EXISTS idx_check_in (user_id, check_in_time),
  ADD INDEX IF NOT EXISTS idx_check_out (user_id, check_out_time);

-- Verify the changes
DESCRIBE attendance;
