import pool from '../config/database.js';

// Helper function to calculate payable days using attendance data
export const calculatePayableDays = async (userId, month, year) => {
  try {
    // Get working days in month
    const daysInMonth = new Date(year, month, 0).getDate();

    // Calculate present days (including half days and late attendance)
    const [attendanceRows] = await pool.query(
      `SELECT 
        COALESCE(SUM(CASE 
          WHEN status = 'Present' THEN 1 
          WHEN status = 'Half-Day' THEN 0.5 
          WHEN status = 'Late' THEN 1
          ELSE 0 
        END), 0) as present_days,
        COALESCE(SUM(total_hours), 0) as total_hours
       FROM attendance 
       WHERE user_id = ? AND MONTH(attendance_date) = ? AND YEAR(attendance_date) = ?`,
      [userId, month, year]
    );

    // Calculate paid leave days
    const [leaveRows] = await pool.query(
      `SELECT COALESCE(SUM(la.total_days), 0) as paid_leave_days
       FROM leave_applications la
       INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
       WHERE la.user_id = ? 
       AND la.status = 'Approved'
       AND lt.is_paid = TRUE
       AND ((MONTH(la.start_date) = ? AND YEAR(la.start_date) = ?)
            OR (MONTH(la.end_date) = ? AND YEAR(la.end_date) = ?))`,
      [userId, month, year, month, year]
    );

    const presentDays = parseFloat(attendanceRows[0]?.present_days || 0);
    const paidLeaveDays = parseFloat(leaveRows[0]?.paid_leave_days || 0);
    const totalHours = parseFloat(attendanceRows[0]?.total_hours || 0);
    const payableDays = presentDays + paidLeaveDays;

    return {
      working_days: daysInMonth,
      present_days: presentDays,
      paid_leave_days: paidLeaveDays,
      payable_days: payableDays,
      unpaid_days: Math.max(0, daysInMonth - payableDays),
      total_hours: totalHours
    };
  } catch (error) {
    console.error('Error calculating payable days:', error);
    throw error;
  }
};

// Get my payroll
export const getMyPayroll = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { month, year } = req.query;

    let query = `
      SELECT p.*, 
             CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
             ep.employee_code, ep.department, ep.designation
      FROM payroll p
      INNER JOIN users u ON p.user_id = u.user_id
      LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
      WHERE p.user_id = ?
    `;
    const params = [userId];

    if (month && year) {
      query += ' AND p.month = ? AND p.year = ?';
      params.push(month, year);
    }

    query += ' ORDER BY p.year DESC, p.month DESC';

    const [rows] = await pool.query(query, params);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll',
      error: error.message
    });
  }
};

// Get payslip details with attendance breakdown
export const getPayslipDetails = async (req, res) => {
  try {
    const { payrollId } = req.params;

    // Get payroll summary
    const [payroll] = await pool.query(
      `SELECT p.*, 
              CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
              ep.employee_code, ep.department, ep.designation,
              u.email
       FROM payroll p
       INNER JOIN users u ON p.user_id = u.user_id
       LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
       WHERE p.payroll_id = ?`,
      [payrollId]
    );

    if (payroll.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payslip not found'
      });
    }

    // Check authorization
    if (req.user.userId !== payroll[0].user_id && 
        !['Admin', 'Payroll Officer'].includes(req.user.roleName)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this payslip'
      });
    }

    // Get payroll details (component breakdown)
    const [details] = await pool.query(
      `SELECT pd.*, sc.component_name, sc.component_type, sc.is_taxable
       FROM payroll_details pd
       INNER JOIN salary_components sc ON pd.component_id = sc.component_id
       WHERE pd.payroll_id = ?
       ORDER BY sc.component_type DESC, pd.amount DESC`,
      [payrollId]
    );

    // Get attendance breakdown for that month
    const [attendance] = await pool.query(
      `SELECT 
        COUNT(*) as total_marked_days,
        SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN status = 'Half-Day' THEN 0.5 ELSE 0 END) as half_days,
        SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late_days,
        SUM(CASE WHEN status = 'On Leave' THEN 1 ELSE 0 END) as leave_days,
        SUM(total_hours) as total_hours_worked
       FROM attendance 
       WHERE user_id = ? 
       AND MONTH(attendance_date) = ? 
       AND YEAR(attendance_date) = ?`,
      [payroll[0].user_id, payroll[0].month, payroll[0].year]
    );

    res.status(200).json({
      success: true,
      data: {
        payroll: payroll[0],
        details,
        attendance: attendance[0] || {}
      }
    });
  } catch (error) {
    console.error('Error fetching payslip:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payslip',
      error: error.message
    });
  }
};

// Get all payroll (Admin/Payroll Officer only)
export const getAllPayroll = async (req, res) => {
  try {
    const { month, year, userId, status, department } = req.query;

    let query = `
      SELECT p.*, 
             CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
             ep.employee_code, ep.department
      FROM payroll p
      INNER JOIN users u ON p.user_id = u.user_id
      LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      query += ' AND p.user_id = ?';
      params.push(userId);
    }

    if (department) {
      query += ' AND ep.department = ?';
      params.push(department);
    }

    if (month && year) {
      query += ' AND p.month = ? AND p.year = ?';
      params.push(month, year);
    }

    if (status) {
      query += ' AND p.payment_status = ?';
      params.push(status);
    }

    query += ' ORDER BY p.year DESC, p.month DESC, ep.employee_code';

    const [rows] = await pool.query(query, params);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll records',
      error: error.message
    });
  }
};

// Generate payroll with attendance integration
export const generatePayroll = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { user_id, month, year, payment_status, payment_method, remarks } = req.body;
    const generatedBy = req.user.userId;

    // Calculate payable days from attendance
    const attendanceData = await calculatePayableDays(user_id, month, year);
    const { working_days, payable_days, present_days, paid_leave_days } = attendanceData;

    // Get employee salary structure
    const [salaryComponents] = await connection.query(
      `SELECT ess.*, sc.component_name, sc.component_type, sc.is_taxable
       FROM employee_salary_structure ess
       INNER JOIN salary_components sc ON ess.component_id = sc.component_id
       WHERE ess.user_id = ? AND ess.is_active = TRUE`,
      [user_id]
    );

    if (salaryComponents.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'No salary structure defined for this employee'
      });
    }

    // Calculate pro-rated salary based on payable days
    const salaryFactor = payable_days / working_days;

    let grossSalary = 0;
    let totalDeductions = 0;
    const componentBreakdown = [];

    salaryComponents.forEach(comp => {
      const amount = comp.component_type === 'Earning'
        ? parseFloat(comp.amount) * salaryFactor
        : parseFloat(comp.amount);

      if (comp.component_type === 'Earning') {
        grossSalary += amount;
      } else {
        totalDeductions += amount;
      }

      componentBreakdown.push({
        component_id: comp.component_id,
        component_name: comp.component_name,
        component_type: comp.component_type,
        amount: parseFloat(amount.toFixed(2))
      });
    });

    const netSalary = grossSalary - totalDeductions;

    // Insert payroll record
    const [result] = await connection.query(
      `INSERT INTO payroll 
       (user_id, month, year, working_days, present_days, leave_days,
        gross_salary, total_deductions, net_salary, payment_status,
        payment_method, remarks, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id, month, year, working_days, payable_days, paid_leave_days,
        parseFloat(grossSalary.toFixed(2)),
        parseFloat(totalDeductions.toFixed(2)),
        parseFloat(netSalary.toFixed(2)),
        payment_status || 'Pending',
        payment_method || 'Bank Transfer',
        remarks || null,
        generatedBy
      ]
    );

    const payrollId = result.insertId;

    // Insert payroll details (component breakdown)
    const detailsValues = componentBreakdown.map(c => [payrollId, c.component_id, c.amount]);
    await connection.query(
      'INSERT INTO payroll_details (payroll_id, component_id, amount) VALUES ?',
      [detailsValues]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Payroll generated successfully',
      data: {
        payroll_id: payrollId,
        attendance_summary: attendanceData,
        gross_salary: parseFloat(grossSalary.toFixed(2)),
        total_deductions: parseFloat(totalDeductions.toFixed(2)),
        net_salary: parseFloat(netSalary.toFixed(2)),
        components: componentBreakdown
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error generating payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating payroll',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// Update payroll status
export const updatePayrollStatus = async (req, res) => {
  try {
    const { payrollId } = req.params;
    const { payment_status, payment_date } = req.body;

    const [result] = await pool.query(
      'UPDATE payroll SET payment_status = ?, payment_date = ? WHERE payroll_id = ?',
      [payment_status, payment_date || null, payrollId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payroll status updated successfully'
    });
  } catch (error) {
    console.error('Error updating payroll status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payroll status',
      error: error.message
    });
  }
};

// Get salary components
export const getSalaryComponents = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM salary_components WHERE is_active = TRUE ORDER BY component_type DESC, component_name'
    );

    res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching salary components:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary components',
      error: error.message
    });
  }
};

// Get employee salary structure
export const getEmployeeSalaryStructure = async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await pool.query(
      `SELECT ess.*, sc.component_name, sc.component_type, sc.is_taxable
       FROM employee_salary_structure ess
       INNER JOIN salary_components sc ON ess.component_id = sc.component_id
       WHERE ess.user_id = ? AND ess.is_active = TRUE
       ORDER BY sc.component_type DESC, sc.component_name`,
      [userId]
    );

    const earnings = rows.filter(r => r.component_type === 'Earning');
    const deductions = rows.filter(r => r.component_type === 'Deduction');

    const totalEarnings = earnings.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const totalDeductions = deductions.reduce((sum, d) => sum + parseFloat(d.amount), 0);

    res.status(200).json({
      success: true,
      data: {
        earnings,
        deductions,
        total_earnings: totalEarnings,
        total_deductions: totalDeductions,
        net_salary: totalEarnings - totalDeductions
      }
    });
  } catch (error) {
    console.error('Error fetching salary structure:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary structure',
      error: error.message
    });
  }
};

// Get salary statement report for an employee
export const getSalaryStatement = async (req, res) => {
  try {
    const { employee_id, year } = req.query;

    if (!employee_id || !year) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and year are required'
      });
    }

    // Get all payroll records for the employee in the given year
    const [payrollRecords] = await pool.query(
      `SELECT 
        p.month,
        p.year,
        p.gross_salary as basic_salary,
        (SELECT COALESCE(SUM(pd.amount), 0)
         FROM payroll_details pd
         INNER JOIN salary_components sc ON pd.component_id = sc.component_id
         WHERE pd.payroll_id = p.payroll_id AND sc.component_type = 'Earning'
         AND sc.component_name != 'Basic Salary') as allowances,
        p.total_deductions as deductions,
        p.net_salary,
        p.working_days,
        p.present_days,
        p.leave_days,
        p.payment_status,
        p.payment_date
       FROM payroll p
       WHERE p.user_id = ? AND p.year = ?
       ORDER BY p.month`,
      [employee_id, year]
    );

    // Get month names
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const formattedRecords = payrollRecords.map(record => ({
      month: monthNames[record.month - 1],
      month_number: record.month,
      basic_salary: parseFloat(record.basic_salary || 0),
      allowances: parseFloat(record.allowances || 0),
      deductions: parseFloat(record.deductions || 0),
      net_salary: parseFloat(record.net_salary || 0),
      working_days: record.working_days,
      present_days: record.present_days,
      leave_days: record.leave_days,
      payment_status: record.payment_status,
      payment_date: record.payment_date
    }));

    res.status(200).json({
      success: true,
      data: formattedRecords,
      summary: {
        total_basic_salary: formattedRecords.reduce((sum, r) => sum + r.basic_salary, 0),
        total_allowances: formattedRecords.reduce((sum, r) => sum + r.allowances, 0),
        total_deductions: formattedRecords.reduce((sum, r) => sum + r.deductions, 0),
        total_net_salary: formattedRecords.reduce((sum, r) => sum + r.net_salary, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching salary statement:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary statement',
      error: error.message
    });
  }
};
