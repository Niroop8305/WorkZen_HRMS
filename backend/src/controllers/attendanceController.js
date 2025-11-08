import pool from '../config/database.js';

// Mark attendance (Check-in/Check-out)
export const markAttendance = async (req, res) => {
  try {
    const { attendance_date, check_in_time, check_out_time, status } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!attendance_date) {
      return res.status(400).json({
        success: false,
        message: 'Attendance date is required'
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
      [userId, attendance_date, check_in_time, check_out_time, totalHours, status || 'Present']
    );

    res.status(200).json({
      success: true,
      message: 'Attendance marked successfully',
      data: {
        userId,
        attendance_date,
        check_in_time,
        check_out_time,
        total_hours: totalHours,
        status: status || 'Present'
      }
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking attendance',
      error: error.message
    });
  }
};

// Get user's own attendance logs
export const getMyAttendance = async (req, res) => {
  try {
    const { month, year, start_date, end_date } = req.query;
    const userId = req.user.userId;

    let query = `
      SELECT 
        a.attendance_id,
        a.attendance_date,
        a.check_in_time,
        a.check_out_time,
        a.total_hours,
        a.status,
        a.remarks,
        DATE_FORMAT(a.attendance_date, '%Y-%m-%d') as date,
        TIME_FORMAT(a.check_in_time, '%H:%i') as checkIn,
        TIME_FORMAT(a.check_out_time, '%H:%i') as checkOut
      FROM attendance a
      WHERE a.user_id = ?
    `;
    const params = [userId];

    if (start_date && end_date) {
      query += ' AND a.attendance_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (month && year) {
      query += ' AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?';
      params.push(month, year);
    }

    query += ' ORDER BY a.attendance_date DESC';

    const [rows] = await pool.query(query, params);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance logs',
      error: error.message
    });
  }
};

// Get attendance for a specific day (Admin/HR only) - shows all employees present
export const getAttendanceByDay = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }

    const query = `
      SELECT 
        a.attendance_id,
        a.user_id as userId,
        a.attendance_date,
        a.check_in_time,
        a.check_out_time,
        a.total_hours,
        a.status,
        a.remarks,
        CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS userName,
        ep.employee_code,
        ep.department,
        ep.designation,
        DATE_FORMAT(a.attendance_date, '%Y-%m-%d') as date,
        TIME_FORMAT(a.check_in_time, '%H:%i') as checkIn,
        TIME_FORMAT(a.check_out_time, '%H:%i') as checkOut
      FROM attendance a
      INNER JOIN users u ON a.user_id = u.user_id
      LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
      WHERE a.attendance_date = ?
      ORDER BY ep.employee_code, a.check_in_time
    `;

    const [rows] = await pool.query(query, [date]);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching attendance by day:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance records',
      error: error.message
    });
  }
};

// Get all attendance records (Admin/HR only)
export const getAllAttendance = async (req, res) => {
  try {
    const { month, year, userId, department, status } = req.query;

    let query = `
      SELECT 
        a.attendance_id,
        a.user_id,
        a.attendance_date,
        a.check_in_time,
        a.check_out_time,
        a.total_hours,
        a.status,
        a.remarks,
        CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
        ep.employee_code,
        ep.department,
        ep.designation,
        u.email
      FROM attendance a
      INNER JOIN users u ON a.user_id = u.user_id
      LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      query += ' AND a.user_id = ?';
      params.push(userId);
    }

    if (department) {
      query += ' AND ep.department = ?';
      params.push(department);
    }

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (month && year) {
      query += ' AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?';
      params.push(month, year);
    }

    query += ' ORDER BY a.attendance_date DESC, ep.employee_code';

    const [rows] = await pool.query(query, params);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching all attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance records',
      error: error.message
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
        message: 'Month and year are required'
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
        total_hours_worked: 0
      }
    });
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance summary',
      error: error.message
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
        message: 'userId, month, and year are required'
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
        unpaid_days: Math.max(0, daysInMonth - payableDays)
      }
    });
  } catch (error) {
    console.error('Error calculating payable days:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating payable days',
      error: error.message
    });
  }
};

// Update attendance record (Admin/HR only)
export const updateAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { check_in_time, check_out_time, status, remarks } = req.body;

    // Calculate total hours if both times are provided
    let totalHours = null;
    if (check_in_time && check_out_time) {
      const checkIn = new Date(`2000-01-01 ${check_in_time}`);
      const checkOut = new Date(`2000-01-01 ${check_out_time}`);
      const diffMs = checkOut - checkIn;
      totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
    }

    const [result] = await pool.query(
      `UPDATE attendance 
       SET check_in_time = ?, check_out_time = ?, total_hours = ?, status = ?, remarks = ?
       WHERE attendance_id = ?`,
      [check_in_time, check_out_time, totalHours, status, remarks, attendanceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance updated successfully'
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating attendance',
      error: error.message
    });
  }
};

// Delete attendance record (Admin only)
export const deleteAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;

    const [result] = await pool.query(
      'DELETE FROM attendance WHERE attendance_id = ?',
      [attendanceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting attendance',
      error: error.message
    });
  }
};

// @desc    Check-in (Clock in)
// @route   POST /api/attendance/check-in
// @access  Private
export const checkIn = async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];
    const currentDateTime = new Date();

    // Check if there's an active check-in (not yet checked out)
    const [existing] = await pool.query(
      `SELECT * FROM attendance 
       WHERE user_id = ? 
       AND attendance_date = ? 
       AND check_in_time IS NOT NULL 
       AND check_out_time IS NULL
       ORDER BY check_in_time DESC
       LIMIT 1`,
      [userId, today]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You are currently checked in. Please check out first.',
        data: {
          attendance_id: existing[0].attendance_id,
          check_in_time: existing[0].check_in_time,
          check_out_time: existing[0].check_out_time
        }
      });
    }

    // Insert new check-in record
    const [result] = await pool.query(
      `INSERT INTO attendance (user_id, attendance_date, check_in_time, status)
       VALUES (?, ?, ?, 'Present')`,
      [userId, today, currentDateTime]
    );

    res.status(200).json({
      success: true,
      message: 'Checked in successfully',
      data: {
        attendance_id: result.insertId,
        attendance_date: today,
        check_in_time: currentDateTime,
        status: 'checked_in'
      }
    });
  } catch (error) {
    console.error('Error during check-in:', error);
    res.status(500).json({
      success: false,
      message: 'Error during check-in',
      error: error.message
    });
  }
};

// @desc    Check-out (Clock out)
// @route   POST /api/attendance/check-out
// @access  Private
export const checkOut = async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];
    const currentDateTime = new Date();

    // Find the active check-in (without check-out)
    const [existing] = await pool.query(
      `SELECT * FROM attendance 
       WHERE user_id = ? 
       AND attendance_date = ? 
       AND check_in_time IS NOT NULL 
       AND check_out_time IS NULL
       ORDER BY check_in_time DESC
       LIMIT 1`,
      [userId, today]
    );

    if (existing.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'You need to check in first'
      });
    }

    const attendance = existing[0];

    // Calculate total hours
    const checkInTime = new Date(attendance.check_in_time);
    const checkOutTime = currentDateTime;
    const diffMs = checkOutTime - checkInTime;
    const totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2);

    // Update check-out
    await pool.query(
      `UPDATE attendance 
       SET check_out_time = ?, total_hours = ?
       WHERE attendance_id = ?`,
      [currentDateTime, totalHours, attendance.attendance_id]
    );

    res.status(200).json({
      success: true,
      message: 'Checked out successfully',
      data: {
        attendance_id: attendance.attendance_id,
        attendance_date: today,
        check_in_time: attendance.check_in_time,
        check_out_time: currentDateTime,
        total_hours: totalHours,
        status: 'checked_out'
      }
    });
  } catch (error) {
    console.error('Error during check-out:', error);
    res.status(500).json({
      success: false,
      message: 'Error during check-out',
      error: error.message
    });
  }
};

// @desc    Get current attendance status
// @route   GET /api/attendance/status
// @access  Private
export const getAttendanceStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

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
          status: 'not_checked_in',
          attendance_date: today,
          check_in_time: null,
          check_out_time: null
        }
      });
    }

    const attendance = rows[0];
    let status = 'not_checked_in';
    
    if (attendance.check_in_time && attendance.check_out_time) {
      status = 'checked_out';
    } else if (attendance.check_in_time) {
      status = 'checked_in';
    }

    res.status(200).json({
      success: true,
      data: {
        status,
        attendance_id: attendance.attendance_id,
        attendance_date: attendance.attendance_date,
        check_in_time: attendance.check_in_time,
        check_out_time: attendance.check_out_time,
        total_hours: attendance.total_hours
      }
    });
  } catch (error) {
    console.error('Error fetching attendance status:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance status',
      error: error.message
    });
  }
};

// @desc    Get attendance status for all employees (Admin/HR)
// @route   GET /api/attendance/all-status
// @access  Private (Admin, HR Manager, Payroll Officer)
export const getAllEmployeesAttendanceStatus = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

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
    rows.forEach(row => {
      attendanceMap[row.user_id] = row.status;
    });

    res.status(200).json({
      success: true,
      data: attendanceMap
    });
  } catch (error) {
    console.error('Error fetching all employees attendance status:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance status',
      error: error.message
    });
  }
};

// @desc    Get today's attendance history (all check-ins/check-outs)
// @route   GET /api/attendance/today
// @access  Private
export const getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

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
        record_count: rows.length
      }
    });
  } catch (error) {
    console.error('Error fetching today\'s attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance history',
      error: error.message
    });
  }
};
