import pool from '../config/database.js';

class AttendanceModel {
  // Get attendance for employee by month and year
  static async getAttendance(empId, month, year) {
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE emp_id = ? AND month = ? AND year = ?',
      [empId, month, year]
    );
    return rows[0];
  }

  // Get all attendance records
  static async getAllAttendance() {
    const [rows] = await pool.query('SELECT * FROM attendance ORDER BY year DESC, month DESC');
    return rows;
  }

  // Create or update attendance
  static async upsertAttendance(attendanceData) {
    const { emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days } = attendanceData;
    const [result] = await pool.query(
      `INSERT INTO attendance (emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days) 
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
       present_days = VALUES(present_days),
       paid_leaves = VALUES(paid_leaves),
       unpaid_leaves = VALUES(unpaid_leaves),
       total_working_days = VALUES(total_working_days)`,
      [emp_id, month, year, present_days, paid_leaves, unpaid_leaves, total_working_days || 30]
    );
    return result.insertId || result.affectedRows;
  }

  // Get attendance by month and year for all employees
  static async getAttendanceByPeriod(month, year) {
    const [rows] = await pool.query(
      `SELECT a.*, e.name, e.emp_id as employee_id, e.basic_salary, e.hra, e.pf_rate, e.tax_rate
       FROM attendance a
       JOIN employees e ON a.emp_id = e.id
       WHERE a.month = ? AND a.year = ?`,
      [month, year]
    );
    return rows;
  }

  // Delete attendance record
  static async deleteAttendance(id) {
    const [result] = await pool.query('DELETE FROM attendance WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

export default AttendanceModel;
