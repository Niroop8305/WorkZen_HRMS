-- Fix leave_requests_view to use LEFT JOIN instead of INNER JOIN
-- This ensures employee names are fetched even if profile data is incomplete

USE workzen_hrms;

-- Drop existing view
DROP VIEW IF EXISTS leave_requests_view;

-- Recreate view with LEFT JOIN for employee_profiles
CREATE OR REPLACE VIEW leave_requests_view AS
SELECT 
  lr.id,
  lr.user_id,
  u.email,
  COALESCE(CONCAT(ep.first_name, ' ', ep.last_name), u.email, 'Unknown User') AS full_name,
  ep.first_name,
  ep.last_name,
  lr.leave_type,
  lr.start_date,
  lr.end_date,
  lr.days_requested,
  lr.reason,
  lr.status,
  lr.reviewed_by,
  COALESCE(CONCAT(reviewer_ep.first_name, ' ', reviewer_ep.last_name), reviewer.email, 'Unknown') AS reviewed_by_name,
  lr.reviewed_at,
  lr.created_at,
  lr.updated_at
FROM leave_requests lr
INNER JOIN users u ON lr.user_id = u.user_id
LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
LEFT JOIN users reviewer ON lr.reviewed_by = reviewer.user_id
LEFT JOIN employee_profiles reviewer_ep ON reviewer.user_id = reviewer_ep.user_id;

-- Verify the view works
SELECT 'View recreated successfully!' AS status;

-- Show sample data
SELECT id, user_id, full_name, leave_type, status, created_at
FROM leave_requests_view
ORDER BY created_at DESC
LIMIT 10;
