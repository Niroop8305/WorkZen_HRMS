USE workzen_hrms;

DROP TRIGGER IF EXISTS after_leave_approval;

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
        SET used_days = used_days + NEW.total_days,
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
        SET used_days = GREATEST(used_days - NEW.total_days, 0),
            remaining_days = remaining_days + NEW.total_days
        WHERE user_id = NEW.user_id
          AND leave_type_id = NEW.leave_type_id
          AND year = YEAR(NEW.start_date);
    END IF;
END;