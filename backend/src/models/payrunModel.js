import pool from "../config/database.js";

class PayrunModel {
  // Create new payrun
  static async createPayrun(payrunData) {
    const { month, year, total_employees, total_cost, status } = payrunData;
    const [result] = await pool.query(
      `INSERT INTO payroll_payruns (month, year, total_employees, total_cost, status) 
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       total_employees = VALUES(total_employees),
       total_cost = VALUES(total_cost),
       status = VALUES(status)`,
      [month, year, total_employees, total_cost, status || "Done"]
    );
    return result.insertId;
  }

  // Get all payruns
  static async getAllPayruns() {
    const [rows] = await pool.query(
      "SELECT * FROM payroll_payruns ORDER BY year DESC, created_at DESC"
    );
    return rows;
  }

  // Get payrun by ID
  static async getPayrunById(id) {
    const [rows] = await pool.query(
      "SELECT * FROM payroll_payruns WHERE id = ?",
      [id]
    );
    return rows[0];
  }

  // Get payrun by month and year
  static async getPayrunByPeriod(month, year) {
    const [rows] = await pool.query(
      "SELECT * FROM payroll_payruns WHERE month = ? AND year = ?",
      [month, year]
    );
    return rows[0];
  }

  // Update payrun status
  static async updatePayrunStatus(id, status) {
    const [result] = await pool.query(
      "UPDATE payroll_payruns SET status = ? WHERE id = ?",
      [status, id]
    );
    return result.affectedRows;
  }

  // Delete payrun
  static async deletePayrun(id) {
    const [result] = await pool.query(
      "DELETE FROM payroll_payruns WHERE id = ?",
      [id]
    );
    return result.affectedRows;
  }

  // Get payrun with payslips
  static async getPayrunWithPayslips(id) {
    const payrun = await this.getPayrunById(id);
    if (!payrun) return null;

    const [payslips] = await pool.query(
      `SELECT p.*, e.name as employee_name, e.emp_id as employee_id
       FROM payroll_payslips p
       JOIN payroll_employees e ON p.emp_id = e.id
       WHERE p.payrun_id = ?
       ORDER BY e.name`,
      [id]
    );

    return {
      ...payrun,
      payslips,
    };
  }
}

export default PayrunModel;
