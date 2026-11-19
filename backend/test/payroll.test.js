import { assertScratchDatabase } from "./support/dbGuard.js";

// T-007 tripwire: this suite writes to the database; it must never run
// against a protected application schema. Fails closed before any test
// registers.
assertScratchDatabase("payroll");

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pool from "../src/config/database.js";
import {
  payrollPolicy,
  countWorkingDays,
  countWeekdaysInclusive,
  attendancePayableDays,
  paidLeaveDaysForPeriod,
  calculatePayroll,
  generatePayroll,
  updatePayrollStatus,
} from "../src/services/payrollService.js";

// =====================================================
// Pure calculation primitives (no database)
// =====================================================

describe("Working-day calendar (Mon-Fri, no holidays modeled)", () => {
  it("counts a normal month", () => {
    // June 2026 begins Monday, 30 days -> 22 weekdays.
    assert.equal(countWorkingDays(2026, 6), 22);
  });

  it("counts a month beginning on a weekend", () => {
    // August 2026 begins Saturday -> 21 weekdays.
    assert.equal(countWorkingDays(2026, 8), 21);
  });

  it("counts a month ending on a weekend", () => {
    // May 2026 begins Friday and ends Sunday -> 21 weekdays.
    assert.equal(countWorkingDays(2026, 5), 21);
  });

  it("counts a leap-year February", () => {
    // February 2028 begins Tuesday, 29 days -> 21 weekdays.
    assert.equal(countWorkingDays(2028, 2), 21);
  });

  it("counts July 2026 (23 weekdays)", () => {
    assert.equal(countWorkingDays(2026, 7), 23);
  });

  it("counts inclusive weekday ranges and rejects inverted ranges", () => {
    // Mon 2026-06-01 .. Wed 2026-06-03 = 3 weekdays.
    assert.equal(countWeekdaysInclusive("2026-06-01", "2026-06-03"), 3);
    // Sat 2026-05-30 .. Sun 2026-05-31 = 0 weekdays.
    assert.equal(countWeekdaysInclusive("2026-05-30", "2026-05-31"), 0);
    // Inverted range = 0.
    assert.equal(countWeekdaysInclusive("2026-06-05", "2026-06-01"), 0);
  });
});

describe("Attendance weighting policy", () => {
  const w = payrollPolicy.attendanceWeights;

  it("preserves the frozen Attendance semantics", () => {
    assert.equal(w.Present, 1);
    assert.equal(w.Late, 1);
    assert.equal(w["Half-Day"], 0.5);
    assert.equal(w.Absent, 0);
    assert.equal(w["On Leave"], 0);
  });

  it("weights full attendance", () => {
    const rows = Array.from({ length: 5 }, () => ({ status: "Present" }));
    assert.equal(attendancePayableDays(rows), 5);
  });

  it("counts late as a full day", () => {
    assert.equal(attendancePayableDays([{ status: "Late" }]), 1);
  });

  it("counts a half-day as 0.5", () => {
    assert.equal(attendancePayableDays([{ status: "Half-Day" }]), 0.5);
  });

  it("counts absence as zero", () => {
    assert.equal(attendancePayableDays([{ status: "Absent" }]), 0);
  });

  it("handles mixed attendance", () => {
    const rows = [
      { status: "Present" },
      { status: "Present" },
      { status: "Late" },
      { status: "Half-Day" },
      { status: "Absent" },
      { status: "On Leave" },
    ];
    // 1 + 1 + 1 + 0.5 + 0 + 0
    assert.equal(attendancePayableDays(rows), 3.5);
  });

  it("returns zero for no rows", () => {
    assert.equal(attendancePayableDays([]), 0);
  });
});

describe("Paid leave proration by period overlap", () => {
  const paid = (start, end) => ({ start_date: start, end_date: end, is_paid: 1 });
  const unpaid = (start, end) => ({ start_date: start, end_date: end, is_paid: 0 });

  it("counts paid leave fully inside the period", () => {
    const leave = [paid("2026-06-08", "2026-06-10")]; // Mon..Wed
    assert.equal(paidLeaveDaysForPeriod(leave, "2026-06-01", "2026-06-30"), 3);
  });

  it("excludes unpaid leave", () => {
    const leave = [unpaid("2026-06-08", "2026-06-10")];
    assert.equal(paidLeaveDaysForPeriod(leave, "2026-06-01", "2026-06-30"), 0);
  });

  it("returns zero when there is no leave", () => {
    assert.equal(paidLeaveDaysForPeriod([], "2026-06-01", "2026-06-30"), 0);
  });

  it("prorates a cross-month leave (fixes the multi-month bug)", () => {
    // Leave Fri 2026-05-29 .. Wed 2026-06-03.
    const leave = [paid("2026-05-29", "2026-06-03")];
    // May overlap: 05-29 (Fri) only, 05-30/05-31 are weekend -> 1 day.
    assert.equal(paidLeaveDaysForPeriod(leave, "2026-05-01", "2026-05-31"), 1);
    // June overlap: 06-01..06-03 (Mon..Wed) -> 3 days.
    assert.equal(paidLeaveDaysForPeriod(leave, "2026-06-01", "2026-06-30"), 3);
    // Neither month counts the whole leave; total is 4, not 8.
  });

  it("counts leave exactly at the month boundary", () => {
    const leave = [paid("2026-06-01", "2026-06-30")];
    assert.equal(paidLeaveDaysForPeriod(leave, "2026-06-01", "2026-06-30"), 22);
  });

  it("ignores weekend-only leave", () => {
    const leave = [paid("2026-05-30", "2026-05-31")]; // Sat..Sun
    assert.equal(paidLeaveDaysForPeriod(leave, "2026-05-01", "2026-05-31"), 0);
  });

  it("ignores leave outside the period entirely", () => {
    const leave = [paid("2026-04-01", "2026-04-10")];
    assert.equal(paidLeaveDaysForPeriod(leave, "2026-06-01", "2026-06-30"), 0);
  });
});

describe("Authoritative payroll calculation", () => {
  const components = [
    { component_id: 1, component_name: "Basic", component_type: "Earning", calculation_type: "FIXED", amount: 22000 },
    { component_id: 2, component_name: "HRA", component_type: "Earning", calculation_type: "PERCENTAGE", amount: 20 },
    { component_id: 3, component_name: "PF", component_type: "Deduction", calculation_type: "PERCENTAGE", amount: 12 },
  ];

  it("computes full-attendance payroll with a percentage base of prorated fixed earnings", () => {
    const r = calculatePayroll({ workingDays: 22, presentDays: 22, leaveDays: 0, components });
    assert.equal(r.payableDays, 22);
    assert.equal(r.payableRatio, 1);
    // percentageBase = 22000 * 1 = 22000; Basic = 22000, HRA = 4400, PF = 2640.
    assert.equal(r.percentageBase, 22000);
    assert.equal(r.grossSalary, 26400);
    assert.equal(r.totalDeductions, 2640);
    assert.equal(r.netSalary, 23760);
  });

  it("prorates fixed earnings and the percentage base, but not fixed deductions", () => {
    const comps = [
      { component_id: 1, component_name: "Basic", component_type: "Earning", calculation_type: "FIXED", amount: 22000 },
      { component_id: 4, component_name: "Tax", component_type: "Deduction", calculation_type: "FIXED", amount: 1000 },
    ];
    // Half attendance -> ratio 0.5. Basic = 11000, Tax (fixed) stays 1000.
    const r = calculatePayroll({ workingDays: 22, presentDays: 11, leaveDays: 0, components: comps });
    assert.equal(r.payableRatio, 0.5);
    const basic = r.breakdown.find((b) => b.component_id === 1);
    const tax = r.breakdown.find((b) => b.component_id === 4);
    assert.equal(basic.amount, 11000);
    assert.equal(tax.amount, 1000);
    assert.equal(r.grossSalary, 11000);
    assert.equal(r.totalDeductions, 1000);
    assert.equal(r.netSalary, 10000);
  });

  it("adds paid leave days to attendance for payable days", () => {
    // 10.5 attendance + 1.5 leave = 12 payable out of 22.
    const r = calculatePayroll({ workingDays: 22, presentDays: 10.5, leaveDays: 1.5, components });
    assert.equal(r.payableDays, 12);
  });

  it("caps payable days at working days", () => {
    const r = calculatePayroll({ workingDays: 22, presentDays: 30, leaveDays: 5, components });
    assert.equal(r.payableDays, 22);
    assert.equal(r.payableRatio, 1);
  });

  it("never produces negative component amounts", () => {
    const r = calculatePayroll({ workingDays: 22, presentDays: 0, leaveDays: 0, components });
    assert.equal(r.payableRatio, 0);
    assert.equal(r.grossSalary, 0);
    // Fixed deductions still apply but earnings are zero.
    assert.ok(r.breakdown.every((b) => b.amount >= 0));
  });

  it("matches the DB generation result for the same inputs", () => {
    const r = calculatePayroll({ workingDays: 22, presentDays: 10.5, leaveDays: 0, components });
    // ratio = 10.5/22; Basic = 10500, base = 10500, HRA = 2100, PF = 1260.
    assert.equal(r.grossSalary, 12600);
    assert.equal(r.totalDeductions, 1260);
    assert.equal(r.netSalary, 11340);
  });
});

// =====================================================
// Database-backed generation, status and audit tests
// =====================================================

const stamp = Date.now();
const actor = { actorId: null, ipAddress: "127.0.0.1", userAgent: "payroll-test" };

let mainUserId; // partial June + full July (effective-dating)
let leaveUserId; // cross-month leave proration
let noStructureUserId; // missing-structure rejection
let basicCompId;
let hraCompId;
let pfCompId;
const createdPayrollIds = [];
const createdComponentIds = [];

const getEmployeeRoleId = async () => {
  const [rows] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = 'Employee' LIMIT 1",
  );
  assert.equal(rows.length, 1);
  return rows[0].role_id;
};

const createUser = async (roleId, tag) => {
  const [res] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, 'payroll-test', TRUE)`,
    [roleId, `payroll-${tag}-${stamp}@example.test`],
  );
  const userId = res.insertId;
  await pool.query(
    `INSERT INTO employee_profiles
      (user_id, employee_code, first_name, last_name, department, designation)
     VALUES (?, ?, 'Payroll', 'Test', 'Finance', 'Tester')`,
    [userId, `PAY-${tag}-${userId}`],
  );
  return userId;
};

const insertAttendance = async (userId, year, month, dayStatusPairs) => {
  for (const [day, status] of dayStatusPairs) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    await pool.query(
      `INSERT INTO attendance (user_id, attendance_date, status, total_hours)
       VALUES (?, ?, ?, ?)`,
      [userId, date, status, status === "Half-Day" ? 4 : 8],
    );
  }
};

before(async () => {
  const roleId = await getEmployeeRoleId();
  mainUserId = await createUser(roleId, "main");
  leaveUserId = await createUser(roleId, "leave");
  noStructureUserId = await createUser(roleId, "nostruct");
  actor.actorId = mainUserId;

  // Salary components (temp).
  const mk = async (name, type, calc) => {
    const [r] = await pool.query(
      `INSERT INTO salary_components (component_name, component_type, calculation_type, is_taxable, is_active)
       VALUES (?, ?, ?, TRUE, TRUE)`,
      [`${name} ${stamp}`, type, calc],
    );
    createdComponentIds.push(r.insertId);
    return r.insertId;
  };
  basicCompId = await mk("Basic", "Earning", "FIXED");
  hraCompId = await mk("HRA", "Earning", "PERCENTAGE");
  pfCompId = await mk("PF", "Deduction", "PERCENTAGE");

  // Main user structures: Basic has two effective-dated versions.
  const addStructure = async (userId, componentId, amount, from, to) => {
    await pool.query(
      `INSERT INTO employee_salary_structure
        (user_id, component_id, amount, effective_from, effective_to, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [userId, componentId, amount, from, to],
    );
  };
  await addStructure(mainUserId, basicCompId, 22000, "2026-01-01", "2026-06-30");
  await addStructure(mainUserId, basicCompId, 30000, "2026-07-01", null);
  await addStructure(mainUserId, hraCompId, 20, "2026-01-01", null);
  await addStructure(mainUserId, pfCompId, 12, "2026-01-01", null);

  // Leave user: minimal structure so generation succeeds.
  await addStructure(leaveUserId, basicCompId, 21000, "2026-01-01", null);

  // Cross-month approved paid leave for leave user: Fri 05-29 .. Wed 06-03.
  const [paidTypes] = await pool.query(
    "SELECT leave_type_id FROM leave_types WHERE is_paid = TRUE LIMIT 1",
  );
  await pool.query(
    `INSERT INTO leave_applications
      (user_id, leave_type_id, start_date, end_date, total_days, reason, status)
     VALUES (?, ?, '2026-05-29', '2026-06-03', 4, 'cross-month test', 'Approved')`,
    [leaveUserId, paidTypes[0].leave_type_id],
  );

  // June 2026 partial attendance for main user: 10 Present, 1 Half-Day, 1 Absent.
  await insertAttendance(mainUserId, 2026, 6, [
    [1, "Present"], [2, "Present"], [3, "Present"], [4, "Present"], [5, "Present"],
    [8, "Present"], [9, "Present"], [10, "Present"], [11, "Half-Day"], [12, "Absent"],
    [15, "Present"], [16, "Present"],
  ]);

  // July 2026 full attendance for main user (all 23 weekdays Present).
  const julyWeekdays = [];
  for (let d = 1; d <= 31; d += 1) {
    const dow = new Date(Date.UTC(2026, 6, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) julyWeekdays.push([d, "Present"]);
  }
  assert.equal(julyWeekdays.length, countWorkingDays(2026, 7));
  await insertAttendance(mainUserId, 2026, 7, julyWeekdays);
});

after(async () => {
  const userIds = [mainUserId, leaveUserId, noStructureUserId].filter(Boolean);
  if (createdPayrollIds.length > 0) {
    await pool.query(
      "DELETE FROM audit_logs WHERE table_name = 'payroll' AND record_id IN (?)",
      [createdPayrollIds],
    );
    await pool.query("DELETE FROM payroll WHERE payroll_id IN (?)", [createdPayrollIds]);
  }
  if (userIds.length > 0) {
    await pool.query("DELETE FROM payroll WHERE user_id IN (?)", [userIds]);
    await pool.query("DELETE FROM attendance WHERE user_id IN (?)", [userIds]);
    await pool.query("DELETE FROM leave_applications WHERE user_id IN (?)", [userIds]);
    await pool.query("DELETE FROM employee_salary_structure WHERE user_id IN (?)", [userIds]);
    await pool.query("DELETE FROM users WHERE user_id IN (?)", [userIds]);
  }
  if (createdComponentIds.length > 0) {
    await pool.query("DELETE FROM salary_components WHERE component_id IN (?)", [createdComponentIds]);
  }
  await pool.end();
});

describe("Payroll generation (transactional, DB-backed)", () => {
  it("generates payroll with prorated earnings, percentage base and net", async () => {
    const result = await generatePayroll({
      userId: mainUserId,
      month: 6,
      year: 2026,
      generatedBy: mainUserId,
      ...actor,
    });
    createdPayrollIds.push(result.payroll_id);

    assert.equal(result.payment_status, "Pending");
    assert.equal(result.working_days, 22);
    assert.equal(result.present_days, 10.5);
    assert.equal(result.leave_days, 0);
    assert.equal(result.payable_days, 10.5);
    assert.equal(result.gross_salary, 12600);
    assert.equal(result.total_deductions, 1260);
    assert.equal(result.net_salary, 11340);

    // Component breakdown snapshot returned.
    const hra = result.components.find((c) => c.component_id === hraCompId);
    assert.equal(hra.amount, 2100); // 20% of 10500 prorated fixed earnings.
  });

  it("persists an immutable payroll_details snapshot", async () => {
    const [details] = await pool.query(
      "SELECT component_id, amount FROM payroll_details WHERE payroll_id = ?",
      [createdPayrollIds[0]],
    );
    assert.equal(details.length, 3);
    const basic = details.find((d) => d.component_id === basicCompId);
    assert.equal(Number(basic.amount), 10500); // 22000 * (10.5/22)
  });

  it("resolves the effective-dated structure for a later period", async () => {
    // July 2026 uses Basic v2 = 30000; full attendance -> ratio 1.
    const result = await generatePayroll({
      userId: mainUserId,
      month: 7,
      year: 2026,
      generatedBy: mainUserId,
      ...actor,
    });
    createdPayrollIds.push(result.payroll_id);

    assert.equal(result.working_days, 23);
    assert.equal(result.present_days, 23);
    assert.equal(result.payable_ratio, 1);
    // Basic 30000, HRA 20% = 6000 -> gross 36000; PF 12% = 3600 -> net 32400.
    assert.equal(result.gross_salary, 36000);
    assert.equal(result.total_deductions, 3600);
    assert.equal(result.net_salary, 32400);
  });

  it("prorates a cross-month leave into the correct month only", async () => {
    const may = await generatePayroll({
      userId: leaveUserId,
      month: 5,
      year: 2026,
      generatedBy: leaveUserId,
      ...actor,
    });
    createdPayrollIds.push(may.payroll_id);
    assert.equal(may.leave_days, 1); // only Fri 2026-05-29

    const june = await generatePayroll({
      userId: leaveUserId,
      month: 6,
      year: 2026,
      generatedBy: leaveUserId,
      ...actor,
    });
    createdPayrollIds.push(june.payroll_id);
    assert.equal(june.leave_days, 3); // 06-01..06-03 weekdays
  });

  it("rejects a duplicate payroll period with 409", async () => {
    await assert.rejects(
      generatePayroll({
        userId: mainUserId,
        month: 6,
        year: 2026,
        generatedBy: mainUserId,
        ...actor,
      }),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /already generated/i);
        return true;
      },
    );
  });

  it("rejects generation when no salary structure is effective (400)", async () => {
    await assert.rejects(
      generatePayroll({
        userId: noStructureUserId,
        month: 6,
        year: 2026,
        generatedBy: noStructureUserId,
        ...actor,
      }),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /No salary structure/i);
        return true;
      },
    );

    // No false audit event was committed for the failed generation.
    const [audits] = await pool.query(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'PAYROLL_GENERATED' AND user_id = ?",
      [noStructureUserId],
    );
    assert.equal(audits[0].n, 0);
  });

  it("rejects an unknown employee with 404", async () => {
    await assert.rejects(
      generatePayroll({
        userId: 999999,
        month: 6,
        year: 2026,
        generatedBy: mainUserId,
        ...actor,
      }),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });

  it("rejects an inactive employee with 409", async () => {
    await pool.query("UPDATE users SET is_active = FALSE WHERE user_id = ?", [noStructureUserId]);
    await assert.rejects(
      generatePayroll({
        userId: noStructureUserId,
        month: 8,
        year: 2026,
        generatedBy: mainUserId,
        ...actor,
      }),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /inactive/i);
        return true;
      },
    );
    await pool.query("UPDATE users SET is_active = TRUE WHERE user_id = ?", [noStructureUserId]);
  });

  it("validates the payroll period", async () => {
    await assert.rejects(
      generatePayroll({ userId: mainUserId, month: 13, year: 2026, generatedBy: mainUserId, ...actor }),
      /month must be an integer between 1 and 12/,
    );
    await assert.rejects(
      generatePayroll({ userId: mainUserId, month: 6, year: 1800, generatedBy: mainUserId, ...actor }),
      /year must be an integer between 1970 and 2100/,
    );
  });

  it("writes a PAYROLL_GENERATED audit event on success", async () => {
    const [audits] = await pool.query(
      "SELECT action, new_value FROM audit_logs WHERE table_name = 'payroll' AND record_id = ?",
      [createdPayrollIds[0]],
    );
    const generated = audits.find((a) => a.action === "PAYROLL_GENERATED");
    assert.ok(generated, "PAYROLL_GENERATED audit row exists");
    const payload = JSON.parse(generated.new_value);
    assert.equal(payload.period, "2026-06");
  });
});

describe("Payroll status state machine", () => {
  let payrollId;

  before(() => {
    payrollId = createdPayrollIds[0];
  });

  it("allows Pending -> Processed", async () => {
    const r = await updatePayrollStatus({
      payrollId,
      status: "Processed",
      actorId: mainUserId,
      ...actor,
    });
    assert.equal(r.previous_status, "Pending");
    assert.equal(r.payment_status, "Processed");
  });

  it("allows Processed -> Paid and defaults the payment date", async () => {
    const r = await updatePayrollStatus({
      payrollId,
      status: "Paid",
      actorId: mainUserId,
      ...actor,
    });
    assert.equal(r.payment_status, "Paid");
    assert.match(r.payment_date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects an invalid transition from Paid (409)", async () => {
    await assert.rejects(
      updatePayrollStatus({ payrollId, status: "Processed", actorId: mainUserId, ...actor }),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /Invalid status transition/);
        return true;
      },
    );
  });

  it("rejects the same status (409)", async () => {
    await assert.rejects(
      updatePayrollStatus({ payrollId, status: "Paid", actorId: mainUserId, ...actor }),
      (err) => {
        assert.equal(err.statusCode, 409);
        return true;
      },
    );
  });

  it("rejects an unknown status value (400)", async () => {
    await assert.rejects(
      updatePayrollStatus({ payrollId, status: "Refunded", actorId: mainUserId, ...actor }),
      /payment_status must be one of/,
    );
  });

  it("rejects a Pending -> Paid jump (409) on a fresh payroll", async () => {
    // July payroll is still Pending.
    const julyId = createdPayrollIds[1];
    await assert.rejects(
      updatePayrollStatus({ payrollId: julyId, status: "Paid", actorId: mainUserId, ...actor }),
      (err) => {
        assert.equal(err.statusCode, 409);
        return true;
      },
    );
  });

  it("rejects an unknown payroll id (404)", async () => {
    await assert.rejects(
      updatePayrollStatus({ payrollId: 999999, status: "Processed", actorId: mainUserId, ...actor }),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });

  it("writes a PAYROLL_STATUS_CHANGED audit event", async () => {
    const [audits] = await pool.query(
      "SELECT action, old_value, new_value FROM audit_logs WHERE table_name = 'payroll' AND record_id = ? AND action = 'PAYROLL_STATUS_CHANGED'",
      [payrollId],
    );
    assert.ok(audits.length >= 2, "at least Processed and Paid transitions audited");
    const toProcessed = audits.find((a) => JSON.parse(a.new_value).payment_status === "Processed");
    assert.equal(JSON.parse(toProcessed.old_value).payment_status, "Pending");
  });
});
