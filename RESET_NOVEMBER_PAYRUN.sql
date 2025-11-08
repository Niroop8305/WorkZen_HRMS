-- Quick script to clear November 2025 payrun and test validation feature
-- Run this in MySQL Workbench or command line

USE payroll_system;

-- Delete all payslips for November 2025
DELETE FROM payslips WHERE month = 'November' AND year = 2025;

-- Delete payrun for November 2025
DELETE FROM payruns WHERE month = 'November' AND year = 2025;

-- Verify deletion
SELECT 'Payslips deleted successfully!' as Status, COUNT(*) as Count 
FROM payslips WHERE month = 'November' AND year = 2025;

SELECT 'Payruns deleted successfully!' as Status, COUNT(*) as Count 
FROM payruns WHERE month = 'November' AND year = 2025;

-- Now go back to your frontend and click "Run Payrun" again
-- All new payslips will be created with "Pending" status (Orange badge)
-- Then you can test the Validate button!
