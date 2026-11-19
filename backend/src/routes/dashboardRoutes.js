import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import pool from '../config/database.js';
import { getBusinessNow } from '../config/attendance.js';

const router = express.Router();

// Get dashboard statistics (Admin/HR only)
router.get('/stats', protect, authorize('Admin', 'HR Officer'), async (req, res) => {
  try {
    // Total employees
    const [totalEmployees] = await pool.query(
      'SELECT COUNT(*) as total FROM users WHERE is_active = TRUE'
    );

    // Total departments
    const [departments] = await pool.query(
      'SELECT COUNT(DISTINCT department) as total FROM employee_profiles WHERE department IS NOT NULL'
    );

    // Today's attendance. Uses the single attendance business-date rule
    // (see src/config/attendance.js), not the UTC calendar date. One read
    // serves the day and month metrics so they cannot straddle a boundary.
    const businessNow = getBusinessNow();
    const today = businessNow.date;
    const [todayAttendance] = await pool.query(
      'SELECT COUNT(*) as present FROM attendance WHERE attendance_date = ? AND status = "Present"',
      [today]
    );

    // Pending leaves
    const [pendingLeaves] = await pool.query(
      'SELECT COUNT(*) as pending FROM leave_applications WHERE status = "Pending"'
    );

    // Recent leave applications
    const [recentLeaves] = await pool.query(
      `SELECT la.*, 
              lt.leave_type_name,
              CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
              ep.employee_code
       FROM leave_applications la
       INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
       INNER JOIN users u ON la.user_id = u.user_id
       LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
       ORDER BY la.applied_date DESC
       LIMIT 10`
    );

    // Attendance summary for current month. The period comes from the same
    // business clock as the day above; MONTH(CURRENT_DATE) would resolve
    // against the database session's own timezone instead.
    const [monthlyAttendance] = await pool.query(
      `SELECT 
         COUNT(DISTINCT user_id) as total_employees,
         SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as total_present,
         SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as total_absent,
         SUM(CASE WHEN status = 'On Leave' THEN 1 ELSE 0 END) as total_on_leave
       FROM attendance
       WHERE MONTH(attendance_date) = ?
       AND YEAR(attendance_date) = ?`,
      [businessNow.month, businessNow.year]
    );

    // Department-wise employee count
    const [departmentStats] = await pool.query(
      `SELECT department, COUNT(*) as count
       FROM employee_profiles
       WHERE department IS NOT NULL
       GROUP BY department
       ORDER BY count DESC`
    );

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total_employees: totalEmployees[0].total,
          total_departments: departments[0].total,
          today_present: todayAttendance[0].present,
          pending_leaves: pendingLeaves[0].pending
        },
        monthly_attendance: monthlyAttendance[0],
        department_stats: departmentStats,
        recent_leaves: recentLeaves
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
    });
  }
});

// Get employee dashboard (for individual employees)
router.get('/my-stats', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    // The period must come from the business clock, like the attendance rows
    // the view aggregates. getMonth()/getFullYear() are host-local and name
    // the previous month or year during the shifted hours at a month end.
    const businessNow = getBusinessNow();
    const currentMonth = businessNow.month;
    const currentYear = businessNow.year;

    // Monthly attendance summary
    const [attendanceSummary] = await pool.query(
      'SELECT * FROM view_monthly_attendance WHERE user_id = ? AND month = ? AND year = ?',
      [userId, currentMonth, currentYear]
    );

    // Leave balance
    const [leaveBalance] = await pool.query(
      `SELECT lb.*, lt.leave_type_name
       FROM leave_balance lb
       INNER JOIN leave_types lt ON lb.leave_type_id = lt.leave_type_id
       WHERE lb.user_id = ? AND lb.year = ?`,
      [userId, currentYear]
    );

    // Pending leave applications
    const [pendingLeaves] = await pool.query(
      `SELECT la.*, lt.leave_type_name
       FROM leave_applications la
       INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
       WHERE la.user_id = ? AND la.status = 'Pending'
       ORDER BY la.applied_date DESC`,
      [userId]
    );

    // Recent payroll
    const [recentPayroll] = await pool.query(
      `SELECT * FROM payroll
       WHERE user_id = ?
       ORDER BY year DESC, month DESC
       LIMIT 3`,
      [userId]
    );

    res.status(200).json({
      success: true,
      data: {
        attendance_summary: attendanceSummary[0] || {},
        leave_balance: leaveBalance,
        pending_leaves: pendingLeaves,
        recent_payroll: recentPayroll
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching employee dashboard',
    });
  }
});

export default router;
