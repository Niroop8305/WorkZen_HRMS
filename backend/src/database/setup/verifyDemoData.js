import { attendanceConfig } from "../../config/attendance.js";
import { countWorkingDays } from "../../services/payrollService.js";

const SYNTHETIC_SUFFIX = "@workzen.test";

const scalar = async (connection, sql, params = []) => {
  const [[row]] = await connection.query(sql, params);
  return Number(Object.values(row)[0]);
};

// Post-seed integrity verification. Every check is expressed as the number of
// offending rows, so a failure names the rule that broke instead of just
// reporting a mismatch. Read-only: verification never repairs historical data.
export const verifyDemoDataset = async (connection, schema, options = {}) => {
  const checks = [];
  const add = async (name, sql, params, expectation) => {
    const violations = await scalar(connection, sql, params);
    checks.push({
      name,
      ok: violations === (expectation ?? 0),
      violations,
    });
  };

  const syntheticParam = `%${SYNTHETIC_SUFFIX}`;

  const counts = {
    syntheticEmployees: await scalar(
      connection,
      `SELECT COUNT(*) FROM users u WHERE u.email LIKE ?`,
      [syntheticParam],
    ),
    demoAccounts: await scalar(
      connection,
      `SELECT COUNT(*) FROM users u WHERE u.email IN (
         'admin@workzen.demo','hr@workzen.demo','payroll@workzen.demo','employee@workzen.demo')`,
    ),
    attendance: await scalar(
      connection,
      `SELECT COUNT(*) FROM attendance a INNER JOIN users u ON u.user_id = a.user_id WHERE u.email LIKE ?`,
      [syntheticParam],
    ),
    // The synthetic counts above exclude the shared demo employee, whose own
    // coverage rows are reported here so table totals are never ambiguous.
    demoEmployeeAttendance: await scalar(
      connection,
      `SELECT COUNT(*) FROM attendance a INNER JOIN users u ON u.user_id = a.user_id
       WHERE u.email = 'employee@workzen.demo'`,
    ),
    demoEmployeePayroll: await scalar(
      connection,
      `SELECT COUNT(*) FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
       WHERE u.email = 'employee@workzen.demo'`,
    ),
    attendanceTotal: await scalar(connection, `SELECT COUNT(*) FROM attendance`),
    payrollTotal: await scalar(connection, `SELECT COUNT(*) FROM payroll`),
    leaveApplications: await scalar(
      connection,
      `SELECT COUNT(*) FROM leave_applications la INNER JOIN users u ON u.user_id = la.user_id WHERE u.email LIKE ?`,
      [syntheticParam],
    ),
    payroll: await scalar(
      connection,
      `SELECT COUNT(*) FROM payroll p INNER JOIN users u ON u.user_id = p.user_id WHERE u.email LIKE ?`,
      [syntheticParam],
    ),
    payrollDetails: await scalar(
      connection,
      `SELECT COUNT(*) FROM payroll_details pd INNER JOIN payroll p ON p.payroll_id = pd.payroll_id
       INNER JOIN users u ON u.user_id = p.user_id WHERE u.email LIKE ?`,
      [syntheticParam],
    ),
    leaveBalances: await scalar(
      connection,
      `SELECT COUNT(*) FROM leave_balance lb INNER JOIN users u ON u.user_id = lb.user_id WHERE u.email LIKE ?`,
      [syntheticParam],
    ),
    auditLogRows: await scalar(connection, `SELECT COUNT(*) FROM audit_logs`),
  };

  // Referential integrity beyond what the FK clauses can prove after the fact.
  await add(
    "integrity.payroll_details.orphan",
    `SELECT COUNT(*) FROM payroll_details pd
     LEFT JOIN payroll p ON p.payroll_id = pd.payroll_id WHERE p.payroll_id IS NULL`,
  );
  await add(
    "integrity.attendance.orphan",
    `SELECT COUNT(*) FROM attendance a
     LEFT JOIN users u ON u.user_id = a.user_id WHERE u.user_id IS NULL`,
  );
  await add(
    "integrity.leave_applications.orphan",
    `SELECT COUNT(*) FROM leave_applications la
     LEFT JOIN users u ON u.user_id = la.user_id WHERE u.user_id IS NULL`,
  );

  // Uniqueness.
  await add(
    "uniqueness.attendance.per-user-date",
    `SELECT COUNT(*) FROM (SELECT a.user_id, a.attendance_date FROM attendance a
     INNER JOIN users u ON u.user_id = a.user_id WHERE u.email LIKE ?
     GROUP BY a.user_id, a.attendance_date HAVING COUNT(*) > 1) d`,
    [syntheticParam],
  );
  await add(
    "uniqueness.payroll.per-user-period",
    `SELECT COUNT(*) FROM (SELECT p.user_id, p.month, p.year FROM payroll p
     INNER JOIN users u ON u.user_id = p.user_id WHERE u.email LIKE ?
     GROUP BY p.user_id, p.month, p.year HAVING COUNT(*) > 1) d`,
    [syntheticParam],
  );
  await add(
    "uniqueness.leave_balance.per-user-type-year",
    `SELECT COUNT(*) FROM (SELECT lb.user_id, lb.leave_type_id, lb.year FROM leave_balance lb
     INNER JOIN users u ON u.user_id = lb.user_id WHERE u.email LIKE ?
     GROUP BY lb.user_id, lb.leave_type_id, lb.year HAVING COUNT(*) > 1) d`,
    [syntheticParam],
  );

  // Overlapping leave windows are rejected by the application, so the dataset
  // must not contain any either.
  await add(
    "leave.no-overlapping-windows",
    `SELECT COUNT(*) FROM leave_applications a1
     INNER JOIN leave_applications a2
       ON a2.user_id = a1.user_id AND a2.leave_id > a1.leave_id
      AND a2.start_date <= a1.end_date AND a2.end_date >= a1.start_date
     INNER JOIN users u ON u.user_id = a1.user_id
     WHERE u.email LIKE ? AND a1.status <> 'Rejected' AND a2.status <> 'Rejected'`,
    [syntheticParam],
  );

  // Paid leave balances must equal the approved snapshot; cancellation must have
  // restored the deduction.
  await add(
    "leave_balance.paid-rows-match-approved",
    `SELECT COUNT(*) FROM leave_balance lb
     INNER JOIN leave_types lt ON lt.leave_type_id = lb.leave_type_id AND lt.is_paid = TRUE
     INNER JOIN users u ON u.user_id = lb.user_id
     LEFT JOIN (
       SELECT la.user_id, la.leave_type_id, YEAR(la.start_date) AS leave_year,
              SUM(la.total_days) AS approved_days
       FROM leave_applications la
       WHERE la.status = 'Approved'
       GROUP BY la.user_id, la.leave_type_id, YEAR(la.start_date)
     ) agg ON agg.user_id = lb.user_id
          AND agg.leave_type_id = lb.leave_type_id
          AND agg.leave_year = lb.year
     WHERE u.email LIKE ?
       AND (lb.used_days <> COALESCE(agg.approved_days, 0)
            OR lb.remaining_days <> lb.total_allocated - COALESCE(agg.approved_days, 0))`,
    [syntheticParam],
  );
  await add(
    "leave_balance.unpaid-untouched",
    `SELECT COUNT(*) FROM leave_balance lb
     INNER JOIN leave_types lt ON lt.leave_type_id = lb.leave_type_id AND lt.is_paid = FALSE
     INNER JOIN users u ON u.user_id = lb.user_id
     WHERE u.email LIKE ? AND (lb.used_days <> 0 OR lb.remaining_days <> lb.total_allocated)`,
    [syntheticParam],
  );
  await add(
    "leave_balance.never-negative",
    `SELECT COUNT(*) FROM leave_balance lb INNER JOIN users u ON u.user_id = lb.user_id
     WHERE u.email LIKE ? AND (lb.used_days < 0 OR lb.remaining_days < 0)`,
    [syntheticParam],
  );

  // Attendance business rules, using the live configured thresholds.
  await add(
    "attendance.weekday-only",
    `SELECT COUNT(*) FROM attendance a INNER JOIN users u ON u.user_id = a.user_id
     WHERE u.email LIKE ? AND WEEKDAY(a.attendance_date) >= 5`,
    [syntheticParam],
  );
  await add(
    "attendance.no-retrospective-checkout",
    `SELECT COUNT(*) FROM attendance a INNER JOIN users u ON u.user_id = a.user_id
     WHERE u.email LIKE ? AND a.check_out_time IS NOT NULL AND a.check_in_time IS NOT NULL
       AND a.check_out_time < a.check_in_time`,
    [syntheticParam],
  );
  await add(
    "attendance.total-hours-matches-worked-minutes",
    `SELECT COUNT(*) FROM attendance a INNER JOIN users u ON u.user_id = a.user_id
     WHERE u.email LIKE ? AND a.worked_minutes IS NOT NULL
       AND ABS(COALESCE(a.total_hours, 0) - a.worked_minutes / 60) > 0.005`,
    [syntheticParam],
  );
  await add(
    "attendance.status-follows-policy",
    `SELECT COUNT(*) FROM attendance a INNER JOIN users u ON u.user_id = a.user_id
     WHERE u.email LIKE ?
       AND a.worked_minutes IS NOT NULL
       AND (
         (a.worked_minutes < ? AND a.status <> 'Half-Day')
         OR (a.worked_minutes >= ? AND a.late_minutes > 0 AND a.status <> 'Late')
         OR (a.worked_minutes >= ? AND a.late_minutes = 0 AND a.status <> 'Present')
       )`,
    [
      syntheticParam,
      attendanceConfig.halfDayThresholdMinutes,
      attendanceConfig.halfDayThresholdMinutes,
      attendanceConfig.halfDayThresholdMinutes,
    ],
  );
  // Payroll snapshot arithmetic.
  await add(
    "payroll.gross-matches-earning-snapshot",
    `SELECT COUNT(*) FROM payroll p
     INNER JOIN users u ON u.user_id = p.user_id
     LEFT JOIN (
       SELECT pd.payroll_id,
              SUM(CASE WHEN sc.component_type = 'Earning' THEN pd.amount ELSE 0 END) AS earnings,
              SUM(CASE WHEN sc.component_type = 'Deduction' THEN pd.amount ELSE 0 END) AS deductions
       FROM payroll_details pd
       INNER JOIN salary_components sc ON sc.component_id = pd.component_id
       GROUP BY pd.payroll_id
     ) agg ON agg.payroll_id = p.payroll_id
     WHERE u.email LIKE ?
       AND (ABS(p.gross_salary - COALESCE(agg.earnings, 0)) > 0.01
            OR ABS(p.total_deductions - COALESCE(agg.deductions, 0)) > 0.01
            OR ABS(p.net_salary - (COALESCE(agg.earnings, 0) - COALESCE(agg.deductions, 0))) > 0.01)`,
    [syntheticParam],
  );
  await add(
    "payroll.net-never-negative",
    `SELECT COUNT(*) FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
     WHERE u.email LIKE ? AND p.net_salary < 0`,
    [syntheticParam],
  );
  await add(
    "payroll.payable-days-within-working-days",
    `SELECT COUNT(*) FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
     WHERE u.email LIKE ?
       AND (p.working_days <= 0 OR p.present_days > p.working_days + 0.001
            OR p.leave_days > p.working_days + 0.001
            OR p.present_days < 0 OR p.leave_days < 0)`,
    [syntheticParam],
  );
  await add(
    "payroll.details-have-components",
    `SELECT COUNT(*) FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
     WHERE u.email LIKE ? AND NOT EXISTS (
       SELECT 1 FROM payroll_details pd WHERE pd.payroll_id = p.payroll_id)`,
    [syntheticParam],
  );
  await add(
    "payroll.generated-by-known-operator",
    `SELECT COUNT(*) FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
     WHERE u.email LIKE ? AND (p.generated_by IS NULL OR NOT EXISTS (
       SELECT 1 FROM users g WHERE g.user_id = p.generated_by))`,
    [syntheticParam],
  );

  // Working-day counts must equal the Monday-Friday calendar the engine uses.
  const [periods] = await connection.query(
    `SELECT DISTINCT p.year, p.month FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
     WHERE u.email LIKE ?`,
    [syntheticParam],
  );
  const wrongWorkingDays = [];
  for (const period of periods) {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS total FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
       WHERE u.email LIKE ? AND p.year = ? AND p.month = ? AND p.working_days <> ?`,
      [syntheticParam, period.year, period.month, countWorkingDays(period.year, period.month)],
    );
    if (Number(row.total) > 0) {
      wrongWorkingDays.push(`${period.year}-${String(period.month).padStart(2, "0")}`);
    }
  }
  checks.push({
    name: "payroll.working-days-match-calendar",
    ok: wrongWorkingDays.length === 0,
    violations: wrongWorkingDays.length,
    detail: wrongWorkingDays.join(", ") || `${periods.length} periods verified`,
  });

  if (options.expectedPeriods) {
    const allowed = new Set(options.expectedPeriods);
    const outside = periods
      .map((p) => `${p.year}-${String(p.month).padStart(2, "0")}`)
      .filter((label) => !allowed.has(label));
    checks.push({
      name: "payroll.no-unsupported-periods",
      ok: outside.length === 0,
      violations: outside.length,
      detail: outside.join(", ") || `${allowed.size} approved periods only`,
    });
  }

  // Coverage: every generated employee must be usable in the existing screens.
  await add(
    "coverage.employees-complete",
    `SELECT COUNT(*) FROM users u WHERE u.email LIKE ? AND (
       NOT EXISTS (SELECT 1 FROM attendance a WHERE a.user_id = u.user_id)
       OR NOT EXISTS (SELECT 1 FROM payroll p WHERE p.user_id = u.user_id)
       OR NOT EXISTS (SELECT 1 FROM leave_applications la WHERE la.user_id = u.user_id)
       OR NOT EXISTS (SELECT 1 FROM employee_salary_structure ess WHERE ess.user_id = u.user_id)
       OR NOT EXISTS (SELECT 1 FROM leave_balance lb WHERE lb.user_id = u.user_id))`,
    [syntheticParam],
  );
  if (options.requireDemoCoverage !== false) {
    await add(
      "coverage.demo-employee-has-payroll",
      `SELECT 1 - (CASE WHEN EXISTS (
         SELECT 1 FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
         WHERE u.email = 'employee@workzen.demo') THEN 1 ELSE 0 END)`,
    );
  }

  const ok = checks.every((check) => check.ok);
  return {
    ok,
    schema,
    counts,
    checks,
    failed: checks.filter((check) => !check.ok),
  };
};
