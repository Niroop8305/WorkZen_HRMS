import pool from "../config/database.js";

class EmployeeController {
  // Get all employees
  static async getAllEmployees(req, res) {
    try {
      const [employees] = await pool.query(
        "SELECT id, name, emp_id, basic_salary, hra, pf_rate, tax_rate FROM payroll_employees ORDER BY id"
      );

      res.status(200).json({
        success: true,
        count: employees.length,
        employees,
      });
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch employees",
        error: error.message,
      });
    }
  }

  // Get employee by ID
  static async getEmployeeById(req, res) {
    const { id } = req.params;

    try {
      const [employee] = await pool.query(
        "SELECT * FROM payroll_employees WHERE id = ?",
        [id]
      );

      if (employee.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      res.status(200).json({
        success: true,
        employee: employee[0],
      });
    } catch (error) {
      console.error("Error fetching employee:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch employee",
        error: error.message,
      });
    }
  }

  // Get employee attendance for a specific month
  static async getEmployeeAttendance(req, res) {
    const { id } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    try {
      const [attendance] = await pool.query(
        `SELECT * FROM payroll_attendance 
         WHERE emp_id = ? AND month = ? AND year = ?`,
        [id, month, year]
      );

      if (attendance.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Attendance data not found for this period",
        });
      }

      res.status(200).json({
        success: true,
        attendance: attendance[0],
      });
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch attendance",
        error: error.message,
      });
    }
  }

  // Get all attendance records for an employee
  static async getEmployeeAttendanceHistory(req, res) {
    const { id } = req.params;

    try {
      const [attendance] = await pool.query(
        `SELECT * FROM payroll_attendance 
         WHERE emp_id = ? 
         ORDER BY year DESC, FIELD(month, 'December', 'November', 'October', 'September', 'August', 'July', 'June', 'May', 'April', 'March', 'February', 'January')`,
        [id]
      );

      res.status(200).json({
        success: true,
        count: attendance.length,
        attendance,
      });
    } catch (error) {
      console.error("Error fetching attendance history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch attendance history",
        error: error.message,
      });
    }
  }

  // Get employee with attendance summary
  static async getEmployeeWithAttendanceSummary(req, res) {
    const { id } = req.params;

    try {
      const [employee] = await pool.query(
        "SELECT * FROM payroll_employees WHERE id = ?",
        [id]
      );

      if (employee.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const [attendance] = await pool.query(
        `SELECT 
          month,
          year,
          present_days,
          paid_leaves,
          unpaid_leaves,
          total_working_days,
          (present_days + paid_leaves) as earned_days
         FROM payroll_attendance 
         WHERE emp_id = ? 
         ORDER BY year DESC, FIELD(month, 'December', 'November', 'October', 'September', 'August', 'July', 'June', 'May', 'April', 'March', 'February', 'January')`,
        [id]
      );

      res.status(200).json({
        success: true,
        employee: employee[0],
        attendance_records: attendance,
      });
    } catch (error) {
      console.error("Error fetching employee summary:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch employee summary",
        error: error.message,
      });
    }
  }

  // Get all employees with their latest attendance
  static async getAllEmployeesWithAttendance(req, res) {
    const { month, year } = req.query;

    try {
      let query = `
        SELECT 
          e.id,
          e.name,
          e.emp_id,
          e.basic_salary,
          e.hra,
          e.pf_rate,
          a.month,
          a.year,
          a.present_days,
          a.paid_leaves,
          a.unpaid_leaves,
          a.total_working_days,
          (a.present_days + a.paid_leaves) as earned_days
        FROM payroll_employees e
        LEFT JOIN payroll_attendance a ON e.id = a.emp_id
      `;

      const params = [];

      if (month && year) {
        query += " WHERE a.month = ? AND a.year = ?";
        params.push(month, year);
      }

      query += " ORDER BY e.id, a.year DESC";

      const [results] = await pool.query(query, params);

      res.status(200).json({
        success: true,
        count: results.length,
        employees: results,
      });
    } catch (error) {
      console.error("Error fetching employees with attendance:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch employees with attendance",
        error: error.message,
      });
    }
  }

  // Get available months with attendance data
  static async getAvailableMonths(req, res) {
    try {
      const [months] = await pool.query(
        `SELECT DISTINCT 
          month,
          year,
          COUNT(DISTINCT emp_id) as employee_count
         FROM payroll_attendance 
         GROUP BY month, year 
         ORDER BY year DESC, FIELD(month, 'December', 'November', 'October', 'September', 'August', 'July', 'June', 'May', 'April', 'March', 'February', 'January')`
      );

      res.status(200).json({
        success: true,
        count: months.length,
        months,
      });
    } catch (error) {
      console.error("Error fetching available months:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch available months",
        error: error.message,
      });
    }
  }
}

export default EmployeeController;
