import pool from '../config/database.js';

class PayslipModel {
  // Create new payslip
  static async createPayslip(payslipData) {
    const {
      emp_id,
      payrun_id,
      month,
      year,
      basic_salary,
      hra,
      earned_salary,
      gross_salary,
      pf_deduction,
      tax_deduction,
      unpaid_deduction,
      total_deductions,
      net_salary,
      present_days,
      paid_leaves,
      unpaid_leaves,
      status
    } = payslipData;

    const [result] = await pool.query(
      `INSERT INTO payslips 
      (emp_id, payrun_id, month, year, basic_salary, hra, earned_salary, gross_salary, 
       pf_deduction, tax_deduction, unpaid_deduction, total_deductions, net_salary,
       present_days, paid_leaves, unpaid_leaves, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      earned_salary = VALUES(earned_salary),
      gross_salary = VALUES(gross_salary),
      pf_deduction = VALUES(pf_deduction),
      tax_deduction = VALUES(tax_deduction),
      unpaid_deduction = VALUES(unpaid_deduction),
      total_deductions = VALUES(total_deductions),
      net_salary = VALUES(net_salary),
      present_days = VALUES(present_days),
      paid_leaves = VALUES(paid_leaves),
      unpaid_leaves = VALUES(unpaid_leaves),
      status = VALUES(status)`,
      [
        emp_id, payrun_id, month, year, basic_salary, hra, earned_salary, gross_salary,
        pf_deduction, tax_deduction, unpaid_deduction, total_deductions, net_salary,
        present_days, paid_leaves, unpaid_leaves, status || 'Done'
      ]
    );
    return result.insertId;
  }

  // Get payslip by ID with employee details
  static async getPayslipById(id) {
    const [rows] = await pool.query(
      `SELECT p.*, e.name as employee_name, e.emp_id as employee_id
       FROM payslips p
       JOIN employees e ON p.emp_id = e.id
       WHERE p.id = ?`,
      [id]
    );
    return rows[0];
  }

  // Get all payslips for a payrun
  static async getPayslipsByPayrunId(payrunId) {
    const [rows] = await pool.query(
      `SELECT p.*, e.name as employee_name, e.emp_id as employee_id
       FROM payslips p
       JOIN employees e ON p.emp_id = e.id
       WHERE p.payrun_id = ?
       ORDER BY e.name`,
      [payrunId]
    );
    return rows;
  }

  // Get payslips by month and year
  static async getPayslipsByPeriod(month, year) {
    const [rows] = await pool.query(
      `SELECT p.*, e.name as employee_name, e.emp_id as employee_id
       FROM payslips p
       JOIN employees e ON p.emp_id = e.id
       WHERE p.month = ? AND p.year = ?
       ORDER BY e.name`,
      [month, year]
    );
    return rows;
  }

  // Get payslip for specific employee and payrun
  static async getPayslipByEmployeeAndPayrun(empId, payrunId) {
    const [rows] = await pool.query(
      `SELECT p.*, e.name as employee_name, e.emp_id as employee_id
       FROM payslips p
       JOIN employees e ON p.emp_id = e.id
       WHERE p.emp_id = ? AND p.payrun_id = ?`,
      [empId, payrunId]
    );
    return rows[0];
  }

  // Delete payslip
  static async deletePayslip(id) {
    const [result] = await pool.query('DELETE FROM payslips WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

export default PayslipModel;
