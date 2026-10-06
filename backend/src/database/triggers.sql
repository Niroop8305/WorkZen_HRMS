-- =====================================================
-- WorkZen HRMS - Database Triggers
-- =====================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS after_leave_approval;
DROP TRIGGER IF EXISTS before_attendance_update;
DROP TRIGGER IF EXISTS before_attendance_insert;

-- =====================================================
-- Trigger 1: Update leave balance after approval
-- =====================================================
CREATE TRIGGER after_leave_approval
AFTER UPDATE ON leave_applications
FOR EACH ROW
BEGIN
    IF NEW.status = 'Approved' AND OLD.status = 'Pending'
       AND EXISTS (
           SELECT 1 FROM leave_types
           WHERE leave_type_id = NEW.leave_type_id AND is_paid = TRUE
       ) THEN
        UPDATE leave_balance 
        SET 
            used_days = used_days + NEW.total_days,
            remaining_days = remaining_days - NEW.total_days
        WHERE user_id = NEW.user_id 
        AND leave_type_id = NEW.leave_type_id 
        AND year = YEAR(NEW.start_date);
    ELSEIF NEW.status = 'Cancelled' AND OLD.status = 'Approved'
       AND EXISTS (
           SELECT 1 FROM leave_types
           WHERE leave_type_id = NEW.leave_type_id AND is_paid = TRUE
       ) THEN
        UPDATE leave_balance
        SET
            used_days = GREATEST(used_days - NEW.total_days, 0),
            remaining_days = remaining_days + NEW.total_days
        WHERE user_id = NEW.user_id
        AND leave_type_id = NEW.leave_type_id
        AND year = YEAR(NEW.start_date);
    END IF;
END;

-- =====================================================
-- Trigger 2: Calculate total hours before update
-- =====================================================
CREATE TRIGGER before_attendance_update
BEFORE UPDATE ON attendance
FOR EACH ROW
BEGIN
    IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
        SET NEW.total_hours = TIMESTAMPDIFF(MINUTE, NEW.check_in_time, NEW.check_out_time) / 60;
    END IF;
END;

-- =====================================================
-- Trigger 3: Calculate total hours before insert
-- =====================================================
CREATE TRIGGER before_attendance_insert
BEFORE INSERT ON attendance
FOR EACH ROW
BEGIN
    IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
        SET NEW.total_hours = TIMESTAMPDIFF(MINUTE, NEW.check_in_time, NEW.check_out_time) / 60;
    END IF;
END;
