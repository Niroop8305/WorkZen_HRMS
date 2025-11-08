-- Quick check if Time Off tables exist
-- Run this to verify your database is set up correctly

USE workzen_hrms;

-- Check if tables exist
SELECT 
    TABLE_NAME,
    TABLE_ROWS,
    CREATE_TIME
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'workzen_hrms' 
AND TABLE_NAME IN ('leave_requests', 'leave_balances')
ORDER BY TABLE_NAME;

-- Check if view exists
SELECT TABLE_NAME 
FROM information_schema.VIEWS 
WHERE TABLE_SCHEMA = 'workzen_hrms' 
AND TABLE_NAME = 'leave_requests_view';

-- If tables exist, show sample data
SELECT '=== Leave Balances ===' as Info;
SELECT * FROM leave_balances LIMIT 3;

SELECT '=== Leave Requests ===' as Info;
SELECT * FROM leave_requests LIMIT 3;
