import EmployeeModel from '../models/employeeModel.js';
import AttendanceModel from '../models/attendanceModel.js';
import PayslipModel from '../models/payslipModel.js';
import PayrunModel from '../models/payrunModel.js';

// Salary Calculation Function
function calculateSalary(employee, attendance) {
  const { basic_salary, hra, pf_rate, tax_rate } = employee;
  const { present_days, paid_leaves, unpaid_leaves, total_working_days } = attendance;

  // Calculate per day salary
  const perDaySalary = basic_salary / total_working_days;

  // Calculate earned salary (present days + paid leaves)
  const earnedBasicSalary = perDaySalary * (present_days + paid_leaves);
  const earnedHRA = (hra / total_working_days) * (present_days + paid_leaves);
  const earnedSalary = earnedBasicSalary + earnedHRA;

  // Calculate gross salary
  const grossSalary = earnedSalary;

  // Calculate deductions
  const pfDeduction = basic_salary * pf_rate; // PF on full basic salary
  const taxDeduction = 200; // Fixed tax
  const unpaidDeduction = perDaySalary * unpaid_leaves + (hra / total_working_days) * unpaid_leaves;

  // Total deductions
  const totalDeductions = pfDeduction + taxDeduction + unpaidDeduction;

  // Net salary
  const netSalary = grossSalary - totalDeductions;

  return {
    basic_salary,
    hra,
    earned_salary: parseFloat(earnedSalary.toFixed(2)),
    gross_salary: parseFloat(grossSalary.toFixed(2)),
    pf_deduction: parseFloat(pfDeduction.toFixed(2)),
    tax_deduction: parseFloat(taxDeduction.toFixed(2)),
    unpaid_deduction: parseFloat(unpaidDeduction.toFixed(2)),
    total_deductions: parseFloat(totalDeductions.toFixed(2)),
    net_salary: parseFloat(netSalary.toFixed(2)),
    present_days,
    paid_leaves,
    unpaid_leaves
  };
}

// Controller: Run Payrun
export const runPayrun = async (req, res) => {
  try {
    const { month, year } = req.body;

    // Validate input
    if (!month || !year) {
      return res.status(400).json({ 
        success: false, 
        message: 'Month and year are required' 
      });
    }

    // Check if payrun already exists
    const existingPayrun = await PayrunModel.getPayrunByPeriod(month, year);
    
    // Get all employees with attendance for this period
    const attendanceRecords = await AttendanceModel.getAttendanceByPeriod(month, year);

    if (attendanceRecords.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `No attendance records found for ${month} ${year}` 
      });
    }

    const payslips = [];
    let totalCost = 0;

    // If payrun exists, get its ID, otherwise create new one
    let payrunId;
    if (existingPayrun) {
      payrunId = existingPayrun.id;
      // Delete existing payslips for this payrun to regenerate
      await Promise.all(
        attendanceRecords.map(record => 
          PayslipModel.deletePayslip(record.emp_id)
        )
      );
    } else {
      // Create placeholder payrun (will update later)
      payrunId = await PayrunModel.createPayrun({
        month,
        year,
        total_employees: 0,
        total_cost: 0,
        status: 'Pending'
      });
    }

    // Process each employee
    for (const record of attendanceRecords) {
      const employee = {
        id: record.emp_id,
        name: record.name,
        emp_id: record.employee_id,
        basic_salary: parseFloat(record.basic_salary),
        hra: parseFloat(record.hra),
        pf_rate: parseFloat(record.pf_rate),
        tax_rate: parseFloat(record.tax_rate)
      };

      const attendance = {
        present_days: record.present_days,
        paid_leaves: record.paid_leaves,
        unpaid_leaves: record.unpaid_leaves,
        total_working_days: record.total_working_days
      };

      // Calculate salary
      const salaryDetails = calculateSalary(employee, attendance);

      // Create payslip
      const payslipData = {
        emp_id: employee.id,
        payrun_id: payrunId,
        month,
        year,
        ...salaryDetails,
        status: 'Pending'
      };

      const payslipId = await PayslipModel.createPayslip(payslipData);

      payslips.push({
        id: payslipId,
        employee_name: employee.name,
        employee_id: employee.emp_id,
        ...salaryDetails,
        status: 'Pending'
      });

      totalCost += salaryDetails.net_salary;
    }

    // Update payrun with final totals
    await PayrunModel.createPayrun({
      month,
      year,
      total_employees: attendanceRecords.length,
      total_cost: parseFloat(totalCost.toFixed(2)),
      status: 'Pending'
    });

    // Get updated payrun details
    const finalPayrun = await PayrunModel.getPayrunByPeriod(month, year);

    res.status(201).json({
      success: true,
      message: `Payrun generated successfully for ${month} ${year}`,
      payrun: {
        id: finalPayrun.id,
        month: finalPayrun.month,
        year: finalPayrun.year,
        total_employees: finalPayrun.total_employees,
        total_cost: finalPayrun.total_cost,
        status: finalPayrun.status
      },
      payslips
    });

  } catch (error) {
    console.error('Error running payrun:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to run payrun', 
      error: error.message 
    });
  }
};

// Controller: Get All Payruns
export const getAllPayruns = async (req, res) => {
  try {
    const payruns = await PayrunModel.getAllPayruns();
    res.status(200).json({
      success: true,
      count: payruns.length,
      payruns
    });
  } catch (error) {
    console.error('Error fetching payruns:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payruns', 
      error: error.message 
    });
  }
};

// Controller: Get Payrun by ID with Payslips
export const getPayrunById = async (req, res) => {
  try {
    const { id } = req.params;
    const payrun = await PayrunModel.getPayrunWithPayslips(id);

    if (!payrun) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payrun not found' 
      });
    }

    res.status(200).json({
      success: true,
      payrun
    });
  } catch (error) {
    console.error('Error fetching payrun:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payrun', 
      error: error.message 
    });
  }
};

// Controller: Get Single Payslip
export const getPayslipById = async (req, res) => {
  try {
    const { id } = req.params;
    const payslip = await PayslipModel.getPayslipById(id);

    if (!payslip) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payslip not found' 
      });
    }

    res.status(200).json({
      success: true,
      payslip
    });
  } catch (error) {
    console.error('Error fetching payslip:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payslip', 
      error: error.message 
    });
  }
};

// Controller: Update Payrun Status
export const updatePayrunStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['Pending', 'Done', 'Validated'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be Pending, Done, or Validated' 
      });
    }

    const affectedRows = await PayrunModel.updatePayrunStatus(id, status);

    if (affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payrun not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payrun status updated successfully'
    });
  } catch (error) {
    console.error('Error updating payrun status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update payrun status', 
      error: error.message 
    });
  }
};
