import pool from "../config/database.js";
import {
  getMyPayrollRows,
  getAllPayrollRows,
  getEmployeeForUpdate,
  findPayrollForPeriod,
  getAttendanceRowsForPeriod,
  getApprovedLeaveForPeriod,
  resolveSalaryStructureForUpdate,
  insertPayroll,
  insertPayrollDetails,
  getPayrollStatusForUpdate,
  applyPayrollStatus,
  createPayrollAudit,
} from "../models/payrollModel.js";

// =====================================================
// Authoritative payroll policy (single source of truth)
// =====================================================

export const payrollPolicy = Object.freeze({
  // Working-day calendar: Monday-Friday are working days; Saturday/Sunday are
  // not. Holidays are not modeled in the current project.
  workingDays: Object.freeze({ includeWeekends: false, modelsHolidays: false }),
  // Frozen Attendance status -> payable-day weight. "On Leave" contributes 0
  // here because approved paid leave is added separately from leave_applications
  // (this avoids double counting).
  attendanceWeights: Object.freeze({
    Present: 1,
    Late: 1,
    "Half-Day": 0.5,
    Absent: 0,
    "On Leave": 0,
  }),
  // Percentage components (earning or deduction) resolve against this base:
  // the prorated total of FIXED earnings. Fixed deductions are NOT prorated;
  // fixed earnings and the percentage base ARE prorated by the payable ratio.
  percentageBase: "prorated_fixed_earnings",
  // Payroll status state machine. Any transition not listed is rejected.
  statusTransitions: Object.freeze({
    Pending: Object.freeze(["Processed", "On Hold"]),
    Processed: Object.freeze(["Paid"]),
    "On Hold": Object.freeze(["Processed"]),
    Paid: Object.freeze([]),
  }),
});

const VALID_STATUSES = Object.freeze(["Pending", "Processed", "Paid", "On Hold"]);

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad2 = (n) => String(n).padStart(2, "0");
const isIsoDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const toUtc = (iso) => new Date(`${iso}T00:00:00Z`);

// =====================================================
// Pure, deterministic calculation primitives
// =====================================================

// Number of Monday-Friday days in a calendar month. month is 1-12.
export const countWorkingDays = (year, month) => {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
};

// Inclusive count of Monday-Friday days between two YYYY-MM-DD dates.
export const countWeekdaysInclusive = (startIso, endIso) => {
  const start = toUtc(startIso);
  const end = toUtc(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return 0;
  }
  let count = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
};

// Payable days derived from frozen Attendance rows for the period.
export const attendancePayableDays = (rows = []) => {
  const weights = payrollPolicy.attendanceWeights;
  return rows.reduce((sum, r) => sum + (weights[r.status] ?? 0), 0);
};

// Paid leave days that actually fall inside the payroll period. Each approved
// paid leave interval is clipped to [periodStart, periodEnd] and counted on a
// weekday basis, which fixes the multi-month double-count bug.
export const paidLeaveDaysForPeriod = (leaveRows = [], periodStart, periodEnd) => {
  return leaveRows.reduce((sum, leave) => {
    if (!leave.is_paid) return sum;
    const clipStart = leave.start_date > periodStart ? leave.start_date : periodStart;
    const clipEnd = leave.end_date < periodEnd ? leave.end_date : periodEnd;
    if (clipStart > clipEnd) return sum;
    return sum + countWeekdaysInclusive(clipStart, clipEnd);
  }, 0);
};

// The single authoritative payroll calculation. Given working days, attendance
// present days, paid leave days and the resolved salary components, it returns
// the per-component breakdown plus gross/deductions/net.
export const calculatePayroll = ({
  workingDays,
  presentDays,
  leaveDays,
  components,
}) => {
  const payableDays = Math.min(presentDays + leaveDays, workingDays);
  const payableRatio =
    workingDays > 0 ? Math.max(0, Math.min(1, payableDays / workingDays)) : 0;

  const fixedEarningsTotal = components
    .filter((c) => c.component_type === "Earning" && c.calculation_type === "FIXED")
    .reduce((s, c) => s + Number(c.amount), 0);
  const percentageBase = fixedEarningsTotal * payableRatio;

  const breakdown = components.map((c) => {
    const value = Number(c.amount);
    let amount;
    if (c.component_type === "Earning") {
      amount = c.calculation_type === "FIXED" ? value * payableRatio : (value / 100) * percentageBase;
    } else {
      // Deductions: fixed are flat (not prorated); percentage use the base.
      amount = c.calculation_type === "FIXED" ? value : (value / 100) * percentageBase;
    }
    return {
      component_id: c.component_id,
      component_name: c.component_name,
      component_type: c.component_type,
      calculation_type: c.calculation_type,
      amount: round2(Math.max(0, amount)),
    };
  });

  const grossSalary = round2(
    breakdown.filter((b) => b.component_type === "Earning").reduce((s, b) => s + b.amount, 0),
  );
  const totalDeductions = round2(
    breakdown.filter((b) => b.component_type === "Deduction").reduce((s, b) => s + b.amount, 0),
  );
  const netSalary = round2(grossSalary - totalDeductions);

  return {
    workingDays,
    presentDays,
    leaveDays,
    payableDays,
    payableRatio: round2(payableRatio),
    percentageBase: round2(percentageBase),
    grossSalary,
    totalDeductions,
    netSalary,
    breakdown,
  };
};

// =====================================================
// Period helpers
// =====================================================

const buildPeriod = (year, month) => {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    periodStart: `${year}-${pad2(month)}-01`,
    periodEnd: `${year}-${pad2(month)}-${pad2(lastDay)}`,
    // Salary configuration is resolved as-of the first day of the payroll month.
    asOfDate: `${year}-${pad2(month)}-01`,
  };
};

const validatePeriod = (month, year) => {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    fail("month must be an integer between 1 and 12");
  }
  if (!Number.isInteger(y) || y < 1970 || y > 2100) {
    fail("year must be an integer between 1970 and 2100");
  }
  return { month: m, year: y };
};

// =====================================================
// Read APIs
// =====================================================

export const getMyPayroll = (userId, query = {}) =>
  getMyPayrollRows(userId, { month: query.month, year: query.year });

export const getAllPayroll = (query = {}) => getAllPayrollRows(query);

// Payslip reads moved to payslipService (M4): the payslip is an immutable
// historical snapshot with its own authorization + integrity verification.

// =====================================================
// Transaction-safe payroll generation
// =====================================================

export const generatePayroll = async ({
  userId: rawUserId,
  month: rawMonth,
  year: rawYear,
  paymentMethod,
  remarks,
  generatedBy,
  ipAddress,
  userAgent,
}) => {
  const userId = Number(rawUserId);
  if (!Number.isInteger(userId) || userId < 1) {
    fail("user_id must be a positive integer");
  }
  const { month, year } = validatePeriod(rawMonth, rawYear);
  const { periodStart, periodEnd, asOfDate } = buildPeriod(year, month);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const employee = await getEmployeeForUpdate(connection, userId);
    if (!employee) fail("Employee not found", 404);
    if (!employee.is_active) fail("Employee is inactive", 409);

    const existing = await findPayrollForPeriod(connection, userId, month, year);
    if (existing) {
      fail(
        `Payroll already generated for ${year}-${pad2(month)} (payroll_id ${existing.payroll_id})`,
        409,
      );
    }

    const components = await resolveSalaryStructureForUpdate(connection, userId, asOfDate);
    if (components.length === 0) {
      fail(`No salary structure is effective for ${year}-${pad2(month)}`, 400);
    }

    const [attendanceRows, leaveRows] = await Promise.all([
      getAttendanceRowsForPeriod(connection, userId, month, year),
      getApprovedLeaveForPeriod(connection, userId, periodStart, periodEnd),
    ]);

    const workingDays = countWorkingDays(year, month);
    const presentDays = attendancePayableDays(attendanceRows);
    const leaveDays = paidLeaveDaysForPeriod(leaveRows, periodStart, periodEnd);

    const result = calculatePayroll({ workingDays, presentDays, leaveDays, components });

    const payrollId = await insertPayroll(connection, {
      userId,
      month,
      year,
      workingDays: result.workingDays,
      presentDays: result.presentDays,
      leaveDays: result.leaveDays,
      grossSalary: result.grossSalary,
      totalDeductions: result.totalDeductions,
      netSalary: result.netSalary,
      paymentStatus: "Pending",
      paymentMethod: paymentMethod || "Bank Transfer",
      remarks: remarks || null,
      generatedBy,
    });

    await insertPayrollDetails(connection, payrollId, result.breakdown);

    await createPayrollAudit(connection, {
      actorId: generatedBy,
      action: "PAYROLL_GENERATED",
      recordId: payrollId,
      newValue: {
        user_id: userId,
        period: `${year}-${pad2(month)}`,
        working_days: result.workingDays,
        present_days: result.presentDays,
        leave_days: result.leaveDays,
        payable_days: result.payableDays,
        gross_salary: result.grossSalary,
        total_deductions: result.totalDeductions,
        net_salary: result.netSalary,
      },
      ipAddress,
      userAgent,
    });

    await connection.commit();

    return {
      payroll_id: payrollId,
      period: `${year}-${pad2(month)}`,
      working_days: result.workingDays,
      present_days: result.presentDays,
      leave_days: result.leaveDays,
      payable_days: result.payableDays,
      payable_ratio: result.payableRatio,
      percentage_base: result.percentageBase,
      gross_salary: result.grossSalary,
      total_deductions: result.totalDeductions,
      net_salary: result.netSalary,
      payment_status: "Pending",
      components: result.breakdown,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// =====================================================
// Status state machine
// =====================================================

const validatePaymentDate = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (!isIsoDate(value)) fail("payment_date must use YYYY-MM-DD format");
  return value;
};

export const updatePayrollStatus = async ({
  payrollId: rawPayrollId,
  status,
  paymentDate,
  actorId,
  ipAddress,
  userAgent,
}) => {
  const payrollId = Number(rawPayrollId);
  if (!Number.isInteger(payrollId) || payrollId < 1) {
    fail("payrollId must be a positive integer");
  }
  if (!VALID_STATUSES.includes(status)) {
    fail("payment_status must be one of Pending, Processed, Paid, On Hold");
  }
  let resolvedDate = validatePaymentDate(paymentDate);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const payroll = await getPayrollStatusForUpdate(connection, payrollId);
    if (!payroll) fail("Payroll record not found", 404);

    const current = payroll.payment_status;
    if (current === status) {
      fail(`Payroll is already ${status}`, 409);
    }
    const allowed = payrollPolicy.statusTransitions[current] || [];
    if (!allowed.includes(status)) {
      fail(`Invalid status transition: ${current} -> ${status}`, 409);
    }

    if (status === "Paid" && !resolvedDate) {
      resolvedDate = new Date().toISOString().slice(0, 10);
    }

    await applyPayrollStatus(connection, payrollId, status, resolvedDate);
    await createPayrollAudit(connection, {
      actorId,
      action: "PAYROLL_STATUS_CHANGED",
      recordId: payrollId,
      oldValue: { payment_status: current },
      newValue: { payment_status: status, payment_date: resolvedDate },
      ipAddress,
      userAgent,
    });

    await connection.commit();
    return { payroll_id: payrollId, previous_status: current, payment_status: status, payment_date: resolvedDate };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
