import pool from '../config/database.js';

class EmployeeModel {
  // Get all employees
  static async getAllEmployees() {
    const [rows] = await pool.query('SELECT * FROM employees ORDER BY name');
    return rows;
  }

  // Get employee by ID
  static async getEmployeeById(id) {
    const [rows] = await pool.query('SELECT * FROM employees WHERE id = ?', [id]);
    return rows[0];
  }

  // Get employee by emp_id
  static async getEmployeeByEmpId(empId) {
    const [rows] = await pool.query('SELECT * FROM employees WHERE emp_id = ?', [empId]);
    return rows[0];
  }

  // Create new employee
  static async createEmployee(employeeData) {
    const { name, emp_id, basic_salary, hra, pf_rate, tax_rate } = employeeData;
    const [result] = await pool.query(
      'INSERT INTO employees (name, emp_id, basic_salary, hra, pf_rate, tax_rate) VALUES (?, ?, ?, ?, ?, ?)',
      [name, emp_id, basic_salary, hra || 0, pf_rate || 0.12, tax_rate || 0]
    );
    return result.insertId;
  }

  // Update employee
  static async updateEmployee(id, employeeData) {
    const { name, basic_salary, hra, pf_rate, tax_rate } = employeeData;
    const [result] = await pool.query(
      'UPDATE employees SET name = ?, basic_salary = ?, hra = ?, pf_rate = ?, tax_rate = ? WHERE id = ?',
      [name, basic_salary, hra, pf_rate, tax_rate, id]
    );
    return result.affectedRows;
  }

  // Delete employee
  static async deleteEmployee(id) {
    const [result] = await pool.query('DELETE FROM employees WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

export default EmployeeModel;
