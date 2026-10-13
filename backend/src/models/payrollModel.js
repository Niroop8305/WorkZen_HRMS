import pool from "../config/database.js";

// =====================================================
// Read models (payroll history / payslip)
// =====================================================

export const getMyPayrollRows = async (userId, { month, year } = {}) => {
  const clauses = ["p.user_id = ?"];
  const params = [userId];
  if (month && year) {
    clauses.push("p.month = ?", "p.year = ?");
    params.push(month, year);
  }
  const [rows] = await pool.query(
    `SELECT p.*,
            CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
            ep.employee_code, ep.department, ep.designation
     FROM payroll p
     INNER JOIN users u ON p.user_id = u.user_id
     LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY p.year DESC, p.month DESC`,
    params,
  );
  return rows;
};

export const getAllPayrollRows = async (filters = {}) => {
  const clauses = ["1=1"];
  const params = [];
  if (filters.userId) {
    clauses.push("p.user_id = ?");
    params.push(filters.userId);
  }
  if (filters.department) {
    clauses.push("ep.department = ?");
    params.push(filters.department);
  }
  if (filters.month && filters.year) {
    clauses.push("p.month = ?", "p.year = ?");
    params.push(filters.month, filters.year);
  }
  if (filters.status) {
    clauses.push("p.payment_status = ?");
    params.push(filters.status);
  }
  const [rows] = await pool.query(
    `SELECT p.*,
            CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
            ep.employee_code, ep.department
     FROM payroll p
     INNER JOIN users u ON p.user_id = u.user_id
     LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY p.year DESC, p.month DESC, ep.employee_code`,
    params,
  );
  return rows;
};

export const getPayrollSummaryById = async (payrollId) => {
  const [rows] = await pool.query(
    `SELECT p.*,
            CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
            ep.employee_code, ep.department, ep.designation,
            u.email
     FROM payroll p
     INNER JOIN users u ON p.user_id = u.user_id
     LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
     WHERE p.payroll_id = ?`,
    [payrollId],
  );
  return rows[0] || null;
};

export const getPayrollDetailRows = async (payrollId) => {
  const [rows] = await pool.query(
    `SELECT pd.*, sc.component_name, sc.component_type, sc.is_taxable
     FROM payroll_details pd
     INNER JOIN salary_components sc ON pd.component_id = sc.component_id
     WHERE pd.payroll_id = ?
     ORDER BY sc.component_type DESC, pd.amount DESC`,
    [payrollId],
  );
  return rows;
};

// Display-only attendance breakdown for a payslip. This is NOT the payroll
// calculation; the authoritative aggregation lives in payrollService.
export const getPayslipAttendanceBreakdown = async (userId, month, year) => {
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total_marked_days,
       SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_days,
       SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_days,
       SUM(CASE WHEN status = 'Half-Day' THEN 0.5 ELSE 0 END) AS half_days,
       SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late_days,
       SUM(CASE WHEN status = 'On Leave' THEN 1 ELSE 0 END) AS leave_days,
       SUM(total_hours) AS total_hours_worked
     FROM attendance
     WHERE user_id = ? AND MONTH(attendance_date) = ? AND YEAR(attendance_date) = ?`,
    [userId, month, year],
  );
  return rows[0] || {};
};

// =====================================================
// Generation inputs (transaction-scoped)
// =====================================================

export const getEmployeeForUpdate = async (connection, userId) => {
  const [rows] = await connection.query(
    `SELECT u.user_id, u.is_active,
            CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
            ep.employee_code
     FROM users u
     LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
     WHERE u.user_id = ?`,
    [userId],
  );
  return rows[0] || null;
};

export const findPayrollForPeriod = async (connection, userId, month, year) => {
  const [rows] = await connection.query(
    `SELECT payroll_id, payment_status
     FROM payroll
     WHERE user_id = ? AND month = ? AND year = ?
     FOR UPDATE`,
    [userId, month, year],
  );
  return rows[0] || null;
};

// Raw frozen Attendance rows for the period. Payroll weighting is applied in the
// service so the attendance-to-payroll policy lives in exactly one place.
export const getAttendanceRowsForPeriod = async (connection, userId, month, year) => {
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date, status
     FROM attendance
     WHERE user_id = ? AND MONTH(attendance_date) = ? AND YEAR(attendance_date) = ?`,
    [userId, month, year],
  );
  return rows;
};

// Approved leave whose interval overlaps the payroll month, with the paid flag.
// Interval clipping and weekday counting happen in the service.
export const getApprovedLeaveForPeriod = async (
  connection,
  userId,
  periodStart,
  periodEnd,
) => {
  const [rows] = await connection.query(
    `SELECT la.leave_id,
            DATE_FORMAT(la.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(la.end_date, '%Y-%m-%d') AS end_date,
            lt.is_paid
     FROM leave_applications la
     INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
     WHERE la.user_id = ?
       AND la.status = 'Approved'
       AND la.start_date <= ?
       AND la.end_date >= ?`,
    [userId, periodEnd, periodStart],
  );
  return rows;
};

// Resolves the effective salary structure as-of a date, locking the rows so a
// concurrent M2 salary change cannot produce a torn snapshot mid-generation.
export const resolveSalaryStructureForUpdate = async (connection, userId, asOfDate) => {
  const [rows] = await connection.query(
    `SELECT ess.structure_id, ess.component_id, ess.amount,
            sc.component_name, sc.component_type, sc.calculation_type, sc.is_taxable
     FROM employee_salary_structure ess
     INNER JOIN salary_components sc ON ess.component_id = sc.component_id
     WHERE ess.user_id = ?
       AND ess.is_active = TRUE
       AND sc.is_active = TRUE
       AND ess.effective_from <= ?
       AND (ess.effective_to IS NULL OR ess.effective_to >= ?)
     ORDER BY sc.component_type DESC, sc.component_name
     FOR UPDATE`,
    [userId, asOfDate, asOfDate],
  );
  return rows;
};

// =====================================================
// Generation writes (transaction-scoped)
// =====================================================

export const insertPayroll = async (connection, payroll) => {
  const [result] = await connection.query(
    `INSERT INTO payroll
      (user_id, month, year, working_days, present_days, leave_days,
       gross_salary, total_deductions, net_salary, payment_status,
       payment_method, remarks, generated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payroll.userId,
      payroll.month,
      payroll.year,
      payroll.workingDays,
      payroll.presentDays,
      payroll.leaveDays,
      payroll.grossSalary,
      payroll.totalDeductions,
      payroll.netSalary,
      payroll.paymentStatus,
      payroll.paymentMethod,
      payroll.remarks,
      payroll.generatedBy,
    ],
  );
  return result.insertId;
};

export const insertPayrollDetails = async (connection, payrollId, details) => {
  if (details.length === 0) return;
  const values = details.map((d) => [payrollId, d.component_id, d.amount]);
  await connection.query(
    "INSERT INTO payroll_details (payroll_id, component_id, amount) VALUES ?",
    [values],
  );
};

// =====================================================
// Status transition (transaction-scoped)
// =====================================================

export const getPayrollStatusForUpdate = async (connection, payrollId) => {
  const [rows] = await connection.query(
    `SELECT payroll_id, user_id, month, year, payment_status
     FROM payroll
     WHERE payroll_id = ?
     FOR UPDATE`,
    [payrollId],
  );
  return rows[0] || null;
};

export const applyPayrollStatus = async (connection, payrollId, status, paymentDate) => {
  await connection.query(
    `UPDATE payroll SET payment_status = ?, payment_date = ? WHERE payroll_id = ?`,
    [status, paymentDate || null, payrollId],
  );
};

// =====================================================
// Audit (reuses existing audit_logs table)
// =====================================================

export const createPayrollAudit = async (connection, audit) => {
  await connection.query(
    `INSERT INTO audit_logs
      (user_id, action, table_name, record_id, old_value, new_value, ip_address, user_agent)
     VALUES (?, ?, 'payroll', ?, ?, ?, ?, ?)`,
    [
      audit.actorId,
      audit.action,
      audit.recordId,
      audit.oldValue ? JSON.stringify(audit.oldValue) : null,
      audit.newValue ? JSON.stringify(audit.newValue) : null,
      audit.ipAddress || null,
      audit.userAgent || null,
    ],
  );
};

// Best-effort, non-transactional audit for payslip read events (Milestone 4).
// Uses the shared pool because a payslip view/download is a read, not part of a
// payroll mutation transaction.
export const createPayslipAudit = async (audit) => {
  await pool.query(
    `INSERT INTO audit_logs
      (user_id, action, table_name, record_id, old_value, new_value, ip_address, user_agent)
     VALUES (?, ?, 'payroll', ?, NULL, ?, ?, ?)`,
    [
      audit.actorId ?? null,
      audit.action,
      audit.recordId,
      audit.newValue ? JSON.stringify(audit.newValue) : null,
      audit.ipAddress || null,
      audit.userAgent || null,
    ],
  );
};
