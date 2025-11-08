-- Clear existing payrun data to test validation feature
-- This script will delete existing payruns and payslips for November 2025

-- Clear payslips for November 2025
DELETE FROM payslips WHERE month = 'November' AND year = 2025;

-- Clear payruns for November 2025
DELETE FROM payruns WHERE month = 'November' AND year = 2025;

-- Verify deletion
SELECT 'Payslips cleared:' as message, COUNT(*) as remaining_payslips 
FROM payslips WHERE month = 'November' AND year = 2025;

SELECT 'Payruns cleared:' as message, COUNT(*) as remaining_payruns 
FROM payruns WHERE month = 'November' AND year = 2025;

-- Now you can run "Run Payrun" again and all payslips will be created with "Pending" status
-- This will allow you to test the Validate button functionality
