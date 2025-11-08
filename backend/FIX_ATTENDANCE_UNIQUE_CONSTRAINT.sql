-- Fix: Remove unique constraint to allow multiple check-ins per day
-- This will allow employees to check in and out multiple times in a single day

USE workzen_hrms;

-- Show current indexes (for reference)
SHOW INDEX FROM attendance WHERE Key_name = 'unique_user_date';

-- Drop the unique constraint if it exists
ALTER TABLE attendance DROP INDEX IF EXISTS unique_user_date;

-- Verify the constraint is removed
SHOW INDEX FROM attendance;

-- Success message
SELECT 'Unique constraint removed successfully. Multiple check-ins per day are now allowed.' AS Result;
