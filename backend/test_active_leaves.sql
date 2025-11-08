-- Test query to check for active approved leaves
USE workzen_hrms;

-- Check what today's date is
SELECT CURDATE() as today;

-- Check all approved leave requests
SELECT 
    lr.id,
    lr.user_id,
    lr.start_date,
    lr.end_date,
    lr.status,
    lr.leave_type,
    lr.days_requested,
    CONCAT(COALESCE(ep.first_name, ''), ' ', COALESCE(ep.last_name, '')) as employee_name,
    u.email,
    CASE 
        WHEN CURDATE() BETWEEN lr.start_date AND lr.end_date THEN 'ACTIVE TODAY'
        ELSE 'NOT ACTIVE'
    END as is_active_today
FROM leave_requests lr
LEFT JOIN users u ON lr.user_id = u.user_id
LEFT JOIN employee_profiles ep ON lr.user_id = ep.user_id
WHERE lr.status = 'Approved'
ORDER BY lr.start_date DESC;

-- Check for approved leaves that should be active today
SELECT 
    lr.id,
    lr.user_id,
    lr.start_date,
    lr.end_date,
    lr.leave_type,
    CONCAT(COALESCE(ep.first_name, ''), ' ', COALESCE(ep.last_name, '')) as employee_name,
    u.email
FROM leave_requests lr
LEFT JOIN users u ON lr.user_id = u.user_id
LEFT JOIN employee_profiles ep ON lr.user_id = ep.user_id
WHERE lr.status = 'Approved'
AND CURDATE() BETWEEN lr.start_date AND lr.end_date;
