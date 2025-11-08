-- Fix leave_requests_view to include full_name and email
USE workzen_hrms;

DROP VIEW IF EXISTS leave_requests_view;

CREATE VIEW leave_requests_view AS
SELECT 
    lr.id,
    lr.user_id,
    CONCAT(COALESCE(ep.first_name, ''), ' ', COALESCE(ep.last_name, '')) as employee_name,
    CONCAT(COALESCE(ep.first_name, ''), ' ', COALESCE(ep.last_name, '')) as full_name,
    u.email,
    ep.employee_code,
    ep.department,
    lr.start_date,
    lr.end_date,
    lr.leave_type,
    lr.days_requested,
    lr.reason,
    lr.status,
    lr.reviewed_by,
    lr.reviewed_at,
    lr.created_at,
    CONCAT(COALESCE(rev_ep.first_name, ''), ' ', COALESCE(rev_ep.last_name, '')) as reviewed_by_name
FROM leave_requests lr
LEFT JOIN users u ON lr.user_id = u.user_id
LEFT JOIN employee_profiles ep ON lr.user_id = ep.user_id
LEFT JOIN users rev_u ON lr.reviewed_by = rev_u.user_id
LEFT JOIN employee_profiles rev_ep ON rev_u.user_id = rev_ep.user_id;

-- Verify the view
SELECT * FROM leave_requests_view LIMIT 5;
