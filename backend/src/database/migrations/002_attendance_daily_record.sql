-- Attendance Milestone 1: one daily record with server-calculated metrics
USE workzen_hrms;

-- Stop before changing the key if historical duplicates need review.
SELECT user_id, attendance_date, COUNT(*) AS duplicate_count
FROM attendance
GROUP BY user_id, attendance_date
HAVING COUNT(*) > 1;

ALTER TABLE attendance
  ADD COLUMN worked_minutes INT NULL AFTER total_hours,
  ADD COLUMN late_minutes INT NOT NULL DEFAULT 0 AFTER worked_minutes,
  ADD COLUMN early_checkout_minutes INT NOT NULL DEFAULT 0 AFTER late_minutes,
  ADD UNIQUE KEY unique_user_attendance_date (user_id, attendance_date);