import pool from "../config/database.js";

class PayslipController {
  // 1. Create New Payslip (Draft)
  static async createNewPayslip(req, res) {
    const { emp_id, month, year } = req.body;

    // Validation
    if (!emp_id || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "emp_id, month, and year are required",
      });
    }

    try {
      // Check if employee exists
      const [employee] = await pool.query(
        "SELECT id, name, emp_id, basic_salary FROM payroll_employees WHERE id = ?",
        [emp_id]
      );

      if (employee.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      // Check if payslip already exists
      const [existingPayslip] = await pool.query(
        "SELECT id, status FROM payroll_payslips WHERE emp_id = ? AND month = ? AND year = ?",
        [emp_id, month, year]
      );

      if (existingPayslip.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Payslip already exists for this employee and period",
          payslip: existingPayslip[0],
        });
      }

      // Create draft payslip
      const [result] = await pool.query(
        `INSERT INTO payroll_payslips (emp_id, month, year, basic_salary, status) 
         VALUES (?, ?, ?, ?, 'Draft')`,
        [emp_id, month, year, employee[0].basic_salary]
      );

      const payslipId = result.insertId;

      // Fetch created payslip
      const [newPayslip] = await pool.query(
        `SELECT p.*, e.name as employee_name, e.emp_id as employee_code 
         FROM payroll_payslips p 
         JOIN payroll_employees e ON p.emp_id = e.id 
         WHERE p.id = ?`,
        [payslipId]
      );

      res.status(201).json({
        success: true,
        message: "Draft payslip created successfully",
        payslip: newPayslip[0],
      });
    } catch (error) {
      console.error("Error creating payslip:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create payslip",
        error: error.message,
      });
    }
  }

  // 2. Compute Salary
  static async computeSalary(req, res) {
    const { emp_id, month, year, present_days, paid_leaves, unpaid_leaves } =
      req.body;

    // Validation
    if (!emp_id || !month || !year || present_days === undefined) {
      return res.status(400).json({
        success: false,
        message: "emp_id, month, year, and present_days are required",
      });
    }

    try {
      // Fetch employee details
      const [employee] = await pool.query(
        "SELECT id, name, emp_id, basic_salary, hra, pf_rate FROM payroll_employees WHERE id = ?",
        [emp_id]
      );

      if (employee.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const emp = employee[0];
      const totalWorkingDays = 30;
      const presentDays = parseInt(present_days) || 0;
      const paidLeaves = parseInt(paid_leaves) || 0;
      const unpaidLeaves = parseInt(unpaid_leaves) || 0;

      // Calculate per day rate
      const perDayRate = emp.basic_salary / totalWorkingDays;

      // Calculate earned days and salary
      const earnedDays = presentDays + paidLeaves;
      const earnedSalary = perDayRate * earnedDays;

      // Calculate HRA (20% of earned salary)
      const hra = earnedSalary * 0.2;

      // Calculate gross salary
      const grossSalary = earnedSalary + hra;

      // Calculate deductions
      const pfDeduction = earnedSalary * (emp.pf_rate || 0.12); // 12% of earned salary
      const taxDeduction = 200; // Fixed tax
      const unpaidDeduction = perDayRate * unpaidLeaves;
      const totalDeductions = pfDeduction + taxDeduction + unpaidDeduction;

      // Calculate net salary
      const netSalary = grossSalary - totalDeductions;

      const computation = {
        employee_id: emp.id,
        employee_name: emp.name,
        employee_code: emp.emp_id,
        month,
        year,
        basic_salary: parseFloat(emp.basic_salary.toFixed(2)),
        total_working_days: totalWorkingDays,
        present_days: presentDays,
        paid_leaves: paidLeaves,
        unpaid_leaves: unpaidLeaves,
        earned_days: earnedDays,
        per_day_rate: parseFloat(perDayRate.toFixed(2)),
        earned_salary: parseFloat(earnedSalary.toFixed(2)),
        hra: parseFloat(hra.toFixed(2)),
        gross_salary: parseFloat(grossSalary.toFixed(2)),
        pf_deduction: parseFloat(pfDeduction.toFixed(2)),
        tax_deduction: parseFloat(taxDeduction.toFixed(2)),
        unpaid_deduction: parseFloat(unpaidDeduction.toFixed(2)),
        total_deductions: parseFloat(totalDeductions.toFixed(2)),
        net_salary: parseFloat(netSalary.toFixed(2)),
      };

      res.status(200).json({
        success: true,
        message: "Salary computed successfully",
        computation,
      });
    } catch (error) {
      console.error("Error computing salary:", error);
      res.status(500).json({
        success: false,
        message: "Failed to compute salary",
        error: error.message,
      });
    }
  }

  // 3. Save Computed Payslip
  static async saveComputedPayslip(req, res) {
    const { id } = req.params;
    const {
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
    } = req.body;

    // Validation
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Payslip ID is required",
      });
    }

    try {
      // Check if payslip exists
      const [existingPayslip] = await pool.query(
        "SELECT id, status FROM payroll_payslips WHERE id = ?",
        [id]
      );

      if (existingPayslip.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Payslip not found",
        });
      }

      // Update payslip with computed values
      await pool.query(
        `UPDATE payroll_payslips 
         SET basic_salary = ?, hra = ?, earned_salary = ?, gross_salary = ?,
             pf_deduction = ?, tax_deduction = ?, unpaid_deduction = ?,
             total_deductions = ?, net_salary = ?,
             present_days = ?, paid_leaves = ?, unpaid_leaves = ?,
             status = 'Done'
         WHERE id = ?`,
        [
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
          id,
        ]
      );

      // Fetch updated payslip
      const [updatedPayslip] = await pool.query(
        `SELECT p.*, e.name as employee_name, e.emp_id as employee_code 
         FROM payroll_payslips p 
         JOIN payroll_employees e ON p.emp_id = e.id 
         WHERE p.id = ?`,
        [id]
      );

      res.status(200).json({
        success: true,
        message: "Payslip saved successfully",
        payslip: updatedPayslip[0],
      });
    } catch (error) {
      console.error("Error saving payslip:", error);
      res.status(500).json({
        success: false,
        message: "Failed to save payslip",
        error: error.message,
      });
    }
  }

  // 4. Get Payslip by ID
  static async getPayslipById(req, res) {
    const { id } = req.params;

    try {
      const [payslip] = await pool.query(
        `SELECT p.*, e.name as employee_name, e.emp_id as employee_code, e.basic_salary as emp_basic_salary
         FROM payroll_payslips p 
         JOIN payroll_employees e ON p.emp_id = e.id 
         WHERE p.id = ?`,
        [id]
      );

      if (payslip.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Payslip not found",
        });
      }

      res.status(200).json({
        success: true,
        payslip: payslip[0],
      });
    } catch (error) {
      console.error("Error fetching payslip:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch payslip",
        error: error.message,
      });
    }
  }

  // 5. Delete Payslip
  static async deletePayslip(req, res) {
    const { id } = req.params;

    try {
      // Check if payslip exists
      const [payslip] = await pool.query(
        "SELECT id, status FROM payroll_payslips WHERE id = ?",
        [id]
      );

      if (payslip.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Payslip not found",
        });
      }

      // Only allow deletion of Draft payslips
      if (payslip[0].status !== "Draft") {
        return res.status(403).json({
          success: false,
          message: "Only draft payslips can be deleted",
        });
      }

      // Delete payslip
      await pool.query("DELETE FROM payroll_payslips WHERE id = ?", [id]);

      res.status(200).json({
        success: true,
        message: "Payslip deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting payslip:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete payslip",
        error: error.message,
      });
    }
  }

  // 6. Get All Payslips (with filters)
  static async getAllPayslips(req, res) {
    const { month, year, emp_id, status } = req.query;

    try {
      let query = `
        SELECT p.*, e.name as employee_name, e.emp_id as employee_code 
        FROM payroll_payslips p 
        JOIN payroll_employees e ON p.emp_id = e.id 
        WHERE 1=1
      `;
      const params = [];

      if (month) {
        query += " AND p.month = ?";
        params.push(month);
      }

      if (year) {
        query += " AND p.year = ?";
        params.push(year);
      }

      if (emp_id) {
        query += " AND p.emp_id = ?";
        params.push(emp_id);
      }

      if (status) {
        query += " AND p.status = ?";
        params.push(status);
      }

      query += " ORDER BY p.created_at DESC";

      const [payslips] = await pool.query(query, params);

      res.status(200).json({
        success: true,
        count: payslips.length,
        payslips,
      });
    } catch (error) {
      console.error("Error fetching payslips:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch payslips",
        error: error.message,
      });
    }
  }

  // 7. Validate Payslip (Mark as Done)
  static async validatePayslip(req, res) {
    const { id } = req.params;

    try {
      // Check if payslip exists
      const [payslip] = await pool.query(
        "SELECT id, status FROM payroll_payslips WHERE id = ?",
        [id]
      );

      if (payslip.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Payslip not found",
        });
      }

      // Check if already validated
      if (payslip[0].status === "Done") {
        return res.status(400).json({
          success: false,
          message: "Payslip is already validated",
        });
      }

      // Update status to Done
      const [result] = await pool.query(
        "UPDATE payroll_payslips SET status = ?, updated_at = NOW() WHERE id = ?",
        ["Done", id]
      );

      if (result.affectedRows === 0) {
        return res.status(500).json({
          success: false,
          message: "Failed to validate payslip",
        });
      }

      // Fetch updated payslip
      const [updatedPayslip] = await pool.query(
        `SELECT p.*, e.name as employee_name, e.emp_id as employee_id
         FROM payroll_payslips p
         JOIN payroll_employees e ON p.emp_id = e.id
         WHERE p.id = ?`,
        [id]
      );

      res.status(200).json({
        success: true,
        message: "Payslip validated successfully",
        payslip: updatedPayslip[0],
      });
    } catch (error) {
      console.error("Error validating payslip:", error);
      res.status(500).json({
        success: false,
        message: "Failed to validate payslip",
        error: error.message,
      });
    }
  }
}

export default PayslipController;
