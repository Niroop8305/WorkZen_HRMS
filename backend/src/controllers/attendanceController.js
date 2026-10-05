import pool from "../config/database.js";
import {
  checkIn as checkInAttendance,
  checkOut as checkOutAttendance,
  getAdminAttendance as getAdminAttendanceRecords,
  streamAdminAttendanceExport,
  getMyAttendance as getMyAttendanceRecords,
  getAttendanceByDay as getAttendanceByDayRecords,
  updateAttendance as updateAttendanceRecord,
} from "../services/attendanceService.js";
import { getBusinessNow } from "../config/attendance.js";

// Mark attendance (Check-in/Check-out)
export const markAttendance = async (req, res) => {
  try {
    const { attendance_date, check_in_time, check_out_time, status } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!attendance_date) {
      return res.status(400).json({
        success: false,
        message: "Attendance date is required",
      });
    }

    // Calculate total hours if both check-in and check-out are provided
    let totalHours = null;
    if (check_in_time && check_out_time) {
      const checkIn = new Date(`2000-01-01 ${check_in_time}`);
      const checkOut = new Date(`2000-01-01 ${check_out_time}`);
      const diffMs = checkOut - checkIn;
      totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
    }

    const [result] = await pool.query(
      `INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, total_hours, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
       check_out_time = VALUES(check_out_time),
       total_hours = VALUES(total_hours),
       status = VALUES(status)`,
      [
        userId,
        attendance_date,
        check_in_time,
        check_out_time,
        totalHours,
        status || "Present",
      ]
    );

    res.status(200).json({
      success: true,
      message: "Attendance marked successfully",
      data: {
        userId,
        attendance_date,
        check_in_time,
        check_out_time,
        total_hours: totalHours,
        status: status || "Present",
      },
    });
  } catch (error) {
    console.error("Error marking attendance:", error);
    res.status(500).json({
      success: false,
      message: "Error marking attendance",
      error: error.message,
    });
  }
};

// Get user's own attendance logs
export const getMyAttendance = async (req, res) => {
  try {
    const result = await getMyAttendanceRecords(req.user.userId, req.query);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error fetching attendance logs",
    });
  }
};

// Get attendance for a specific day (Admin/HR only) - shows all employees present
export const getAttendanceByDay = async (req, res) => {
  try {
    const result = await getAttendanceByDayRecords(req.query);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Error fetching attendance by day:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error fetching attendance records",
    });
  }
};

// Get all attendance records (Admin/HR only)
export const getAllAttendance = async (req, res) => {
  try {
    const result = await getAdminAttendanceRecords(req.query);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Error fetching all attendance:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error fetching attendance records",
    });
  }
};

export const exportAttendance = async (req, res) => {
  let exportStream;
  try {
    const headers = [
      "Employee ID",
      "Employee Name",
      "Department",
      "Attendance Date",
      "Check In",
      "Check Out",
      "Worked Hours",
      "Worked Minutes",
      "Late Minutes",
      "Early Checkout Minutes",
      "Status",
    ];
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    exportStream = await streamAdminAttendanceExport(req.query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=attendance.csv");
    res.write(`${headers.map(escapeCsv).join(",")}\n`);

    exportStream.stream.on("data", (row) => {
      res.write(
        `${[
          row.employee_code,
          row.employee_name,
          row.department,
          row.attendance_date,
          row.check_in_time,
          row.check_out_time,
          row.total_hours,
          row.worked_minutes,
          row.late_minutes,
          row.early_checkout_minutes,
          row.status,
        ].map(escapeCsv).join(",")}\n`,
      );
    });
    exportStream.stream.on("end", () => {
      exportStream.release();
      res.end();
    });
    exportStream.stream.on("error", (error) => {
      exportStream.release();
      console.error("Error streaming attendance export:", error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "Error exporting attendance records" });
      } else {
        res.destroy(error);
      }
    });
  } catch (error) {
    exportStream?.release();
    console.error("Error exporting attendance:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error exporting attendance records",
    });
  }
};

// Get monthly attendance summary
export const getMonthlySummary = async (req, res) => {
  try {
    const { month, year } = req.query;
    const userId = req.user.userId;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    const [rows] = await pool.query(
      `SELECT 
        user_id,
        ? as year,
        ? as month,
        COUNT(*) as total_days,
        SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN status = 'Half-Day' THEN 0.5 ELSE 0 END) as half_days,
        SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late_days,
        SUM(CASE WHEN status = 'On Leave' THEN 1 ELSE 0 END) as leave_days,
        SUM(total_hours) as total_hours_worked
       FROM attendance 
       WHERE user_id = ? AND MONTH(attendance_date) = ? AND YEAR(attendance_date) = ?`,
      [year, month, userId, month, year]
    );

    res.status(200).json({
      success: true,
      data: rows[0] || {
        user_id: userId,
        year,
        month,
        total_days: 0,
        present_days: 0,
        absent_days: 0,
        half_days: 0,
        late_days: 0,
        leave_days: 0,
        total_hours_worked: 0,
      },
    });
  } catch (error) {
    console.error("Error fetching monthly summary:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching attendance summary",
      error: error.message,
    });
  }
};

// Get payable days for payroll calculation
export const getPayableDays = async (req, res) => {
  try {
    const { userId, month, year } = req.query;

    if (!userId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "userId, month, and year are required",
      });
    }

    // Get working days in the month
    const daysInMonth = new Date(year, month, 0).getDate();

    // Get present days including half days
    const [attendanceRows] = await pool.query(
      `SELECT 
        SUM(CASE 
          WHEN status = 'Present' THEN 1 
          WHEN status = 'Half-Day' THEN 0.5 
          WHEN status = 'Late' THEN 1
          ELSE 0 
        END) as present_days
       FROM attendance 
       WHERE user_id = ? AND MONTH(attendance_date) = ? AND YEAR(attendance_date) = ?`,
      [userId, month, year]
    );

    // Get paid leave days
    const [leaveRows] = await pool.query(
      `SELECT SUM(la.total_days) as paid_leave_days
       FROM leave_applications la
       INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
       WHERE la.user_id = ? 
       AND la.status = 'Approved'
       AND lt.is_paid = TRUE
       AND MONTH(la.start_date) = ? 
       AND YEAR(la.start_date) = ?`,
      [userId, month, year]
    );

    const presentDays = parseFloat(attendanceRows[0]?.present_days || 0);
    const paidLeaveDays = parseFloat(leaveRows[0]?.paid_leave_days || 0);
    const payableDays = presentDays + paidLeaveDays;

    res.status(200).json({
      success: true,
      data: {
        userId,
        month,
        year,
        working_days: daysInMonth,
        present_days: presentDays,
        paid_leave_days: paidLeaveDays,
        payable_days: payableDays,
        unpaid_days: Math.max(0, daysInMonth - payableDays),
      },
    });
  } catch (error) {
    console.error("Error calculating payable days:", error);
    res.status(500).json({
      success: false,
      message: "Error calculating payable days",
      error: error.message,
    });
  }
};

// Update attendance record (Admin/HR only)
export const updateAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const result = await updateAttendanceRecord({
      attendanceId,
      actor: {
        userId: req.user.userId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
      changes: req.body,
    });
    res.status(result.statusCode).json(result.body);
  } catch (error) {
    console.error("Error updating attendance:", error);
    const isValidationError = /Attendance|attendance_date/.test(error.message || "");
    res.status(isValidationError ? 400 : 500).json({
      success: false,
      message: isValidationError ? error.message : "Error updating attendance",
    });
  }
};

// Delete attendance record (Admin only)
export const deleteAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;

    const [result] = await pool.query(
      "DELETE FROM attendance WHERE attendance_id = ?",
      [attendanceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Attendance record deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting attendance:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting attendance",
      error: error.message,
    });
  }
};

// @desc    Check-in (Clock in)
// @route   POST /api/attendance/check-in
// @access  Private
export const checkIn = async (req, res) => {
  try {
    const result = await checkInAttendance(req.user.userId);
    res.status(result.statusCode).json(result.body);
  } catch (error) {
    console.error("Error during check-in:", error);
    res.status(500).json({
      success: false,
      message: "Error during check-in",
    });
  }
};

// @desc    Check-out (Clock out)
// @route   POST /api/attendance/check-out
// @access  Private
export const checkOut = async (req, res) => {
  try {
    const result = await checkOutAttendance(req.user.userId);
    res.status(result.statusCode).json(result.body);
  } catch (error) {
    console.error("Error during check-out:", error);
    res.status(500).json({
      success: false,
      message: "Error during check-out",
    });
  }
};

// @desc    Get current attendance status
// @route   GET /api/attendance/status
// @access  Private
export const getAttendanceStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = getBusinessNow().date;

    // Get the latest attendance record for today
    const [rows] = await pool.query(
      `SELECT * FROM attendance 
       WHERE user_id = ? AND attendance_date = ?
       ORDER BY check_in_time DESC
       LIMIT 1`,
      [userId, today]
    );

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          status: "not_checked_in",
          attendance_date: today,
          check_in_time: null,
          check_out_time: null,
        },
      });
    }

    const attendance = rows[0];
    let status = "not_checked_in";

    if (attendance.check_in_time && attendance.check_out_time) {
      status = "checked_out";
    } else if (attendance.check_in_time) {
      status = "checked_in";
    }

    res.status(200).json({
      success: true,
      data: {
        status,
        attendance_id: attendance.attendance_id,
        attendance_date: attendance.attendance_date,
        check_in_time: attendance.check_in_time,
        check_out_time: attendance.check_out_time,
        total_hours: attendance.total_hours,
        worked_minutes: attendance.worked_minutes,
        late_minutes: attendance.late_minutes,
        early_checkout_minutes: attendance.early_checkout_minutes,
        attendance_status: attendance.status,
      },
    });
  } catch (error) {
    console.error("Error fetching attendance status:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching attendance status",
      error: error.message,
    });
  }
};

// @desc    Get attendance status for all employees
// @route   GET /api/attendance/all-status
// @access  Private (All authenticated users)
export const getAllEmployeesAttendanceStatus = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Get all users with their latest attendance status for today
    const [rows] = await pool.query(
      `SELECT 
        u.user_id,
        u.email,
        ep.first_name,
        ep.last_name,
        ep.employee_code,
        a.attendance_date,
        a.check_in_time,
        a.check_out_time,
        CASE
          WHEN a.check_in_time IS NOT NULL AND a.check_out_time IS NOT NULL THEN 'checked_out'
          WHEN a.check_in_time IS NOT NULL THEN 'checked_in'
          ELSE 'not_checked_in'
        END as status
      FROM users u
      LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
      LEFT JOIN (
        SELECT user_id, attendance_date, check_in_time, check_out_time
        FROM attendance
        WHERE attendance_date = ?
        AND attendance_id IN (
          SELECT MAX(attendance_id)
          FROM attendance
          WHERE attendance_date = ?
          GROUP BY user_id
        )
      ) a ON u.user_id = a.user_id
      WHERE u.is_active = TRUE
      ORDER BY ep.first_name, ep.last_name`,
      [today, today]
    );

    // Create a map of user_id to status
    const attendanceMap = {};
    rows.forEach((row) => {
      attendanceMap[row.user_id] = row.status;
    });

    res.status(200).json({
      success: true,
      data: attendanceMap,
    });
  } catch (error) {
    console.error("Error fetching all employees attendance status:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching attendance status",
      error: error.message,
    });
  }
};

// @desc    Get today's attendance history (all check-ins/check-outs)
// @route   GET /api/attendance/today
// @access  Private
export const getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split("T")[0];

    const [rows] = await pool.query(
      `SELECT 
        attendance_id,
        attendance_date,
        check_in_time,
        check_out_time,
        total_hours,
        status,
        remarks
      FROM attendance
      WHERE user_id = ? AND attendance_date = ?
      ORDER BY check_in_time DESC`,
      [userId, today]
    );

    // Calculate total hours worked today
    const totalHoursToday = rows.reduce((sum, record) => {
      return sum + (parseFloat(record.total_hours) || 0);
    }, 0);

    res.status(200).json({
      success: true,
      data: {
        records: rows,
        total_hours: totalHoursToday.toFixed(2),
        record_count: rows.length,
      },
    });
  } catch (error) {
    console.error("Error fetching today's attendance:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching attendance history",
      error: error.message,
    });
  }
};
