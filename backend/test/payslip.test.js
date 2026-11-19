import { assertScratchDatabase } from "./support/dbGuard.js";

// T-007 tripwire: this suite writes to the database; it must never run
// against a protected application schema. Fails closed before any test
// registers.
assertScratchDatabase("payslip");

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pool from "../src/config/database.js";
import { generatePayroll } from "../src/services/payrollService.js";
import { getPayslipDetails, getPayslipPdf } from "../src/services/payslipService.js";
import { renderPayslipPdf, buildPayslipFilename } from "../src/services/payslipPdf.js";

// =====================================================
// Payroll Milestone 4 — Payslip service + PDF unit tests.
//
// A payslip is a READ of the immutable payroll snapshot. These tests prove:
//   * authorization (own / other / Admin / Payroll Officer / HR / anonymous)
//   * 404 for unknown ids, 400 for invalid ids
//   * the returned snapshot matches the stored payroll + payroll_details
//   * NO recalculation: changing the salary structure AFTER generation leaves
//     the existing payslip values untouched (historical integrity)
//   * the server-side PDF renders, is non-empty, valid, and safely named
//
// All data is temporary and hard-deleted in `after`.
// =====================================================

const stamp = Date.now();
const PERIOD_YEAR = 2026;
const PERIOD_MONTH = 9;

let ownerUserId; // the employee the payroll belongs to
let otherUserId; // a second employee used for 403 checks
let basicCompId;
let pfCompId;
let payrollId;
let structureIds = [];
const componentIds = [];

const actor = { actorId: null, ipAddress: "127.0.0.1", userAgent: "payslip-test" };

const getRoleId = async (name) => {
  const [rows] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = ? LIMIT 1",
    [name],
  );
  assert.equal(rows.length, 1, `role ${name} exists`);
  return rows[0].role_id;
};

const createUser = async (roleId, tag) => {
  const [res] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, 'payslip-test', TRUE)`,
    [roleId, `payslip-${tag}-${stamp}@example.test`],
  );
  const userId = res.insertId;
  await pool.query(
    `INSERT INTO employee_profiles
      (user_id, employee_code, first_name, last_name, department, designation)
     VALUES (?, ?, 'Payslip', 'Tester', 'Finance', 'Analyst')`,
    [userId, `PSLIP-${tag}-${userId}`],
  );
  return userId;
};

const addStructure = async (userId, componentId, amount) => {
  const [r] = await pool.query(
    `INSERT INTO employee_salary_structure
      (user_id, component_id, amount, effective_from, effective_to, is_active)
     VALUES (?, ?, ?, '2026-01-01', NULL, TRUE)`,
    [userId, componentId, amount],
  );
  structureIds.push(r.insertId);
  return r.insertId;
};

// Full attendance for every weekday of the period -> payable ratio 1.
const seedFullAttendance = async (userId) => {
  const daysInMonth = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH, 0)).getUTCDate();
  let working = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dow = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH - 1, d)).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    working += 1;
    const date = `${PERIOD_YEAR}-${String(PERIOD_MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    await pool.query(
      `INSERT INTO attendance (user_id, attendance_date, status, total_hours)
       VALUES (?, ?, 'Present', 8)`,
      [userId, date],
    );
  }
  return working;
};

before(async () => {
  const employeeRoleId = await getRoleId("Employee");
  ownerUserId = await createUser(employeeRoleId, "owner");
  otherUserId = await createUser(employeeRoleId, "other");
  actor.actorId = ownerUserId;

  const mkComp = async (name, type, calc) => {
    const [r] = await pool.query(
      `INSERT INTO salary_components (component_name, component_type, calculation_type, is_taxable, is_active)
       VALUES (?, ?, ?, TRUE, TRUE)`,
      [`${name} ${stamp}`, type, calc],
    );
    componentIds.push(r.insertId);
    return r.insertId;
  };
  basicCompId = await mkComp("PSLIP Basic", "Earning", "FIXED");
  pfCompId = await mkComp("PSLIP PF", "Deduction", "PERCENTAGE");

  // Basic 30000 fixed earning, PF 10% deduction.
  await addStructure(ownerUserId, basicCompId, 30000);
  await addStructure(ownerUserId, pfCompId, 10);

  await seedFullAttendance(ownerUserId);

  const result = await generatePayroll({
    userId: ownerUserId,
    month: PERIOD_MONTH,
    year: PERIOD_YEAR,
    generatedBy: ownerUserId,
    ...actor,
  });
  payrollId = result.payroll_id;
  assert.ok(payrollId, "payroll generated for payslip tests");
});

after(async () => {
  if (payrollId) {
    await pool.query(
      "DELETE FROM audit_logs WHERE table_name = 'payroll' AND record_id = ?",
      [payrollId],
    );
  }
  for (const userId of [ownerUserId, otherUserId]) {
    if (!userId) continue;
    await pool.query("DELETE FROM payroll WHERE user_id = ?", [userId]);
    await pool.query(
      "DELETE FROM audit_logs WHERE table_name = 'employee_salary_structure' AND user_id = ?",
      [userId],
    );
    await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
  }
  if (componentIds.length > 0) {
    await pool.query(
      "DELETE FROM salary_components WHERE component_id IN (?)",
      [componentIds],
    );
  }
  await pool.end();
});

describe("payslipService.getPayslipDetails — authorization", () => {
  it("returns the snapshot to the owning employee", async () => {
    const requester = { userId: ownerUserId, roleName: "Employee" };
    const slip = await getPayslipDetails(payrollId, requester);
    assert.equal(slip.payroll.payroll_id, payrollId);
    assert.equal(slip.employee.employee_id, ownerUserId);
  });

  it("rejects a different employee with 403", async () => {
    const requester = { userId: otherUserId, roleName: "Employee" };
    await assert.rejects(
      () => getPayslipDetails(payrollId, requester),
      (err) => err.statusCode === 403,
    );
  });

  it("allows Admin", async () => {
    const requester = { userId: 999999, roleName: "Admin" };
    const slip = await getPayslipDetails(payrollId, requester);
    assert.equal(slip.payroll.payroll_id, payrollId);
  });

  it("allows Payroll Officer", async () => {
    const requester = { userId: 999998, roleName: "Payroll Officer" };
    const slip = await getPayslipDetails(payrollId, requester);
    assert.equal(slip.payroll.payroll_id, payrollId);
  });

  it("rejects HR Officer (no automatic payroll access) with 403", async () => {
    const requester = { userId: 999997, roleName: "HR Officer" };
    await assert.rejects(
      () => getPayslipDetails(payrollId, requester),
      (err) => err.statusCode === 403,
    );
  });

  it("rejects an anonymous/unknown requester with 403", async () => {
    await assert.rejects(
      () => getPayslipDetails(payrollId, null),
      (err) => err.statusCode === 403,
    );
  });
});

describe("payslipService.getPayslipDetails — data + errors", () => {
  // Built lazily: describe bodies run before `before()` populates ownerUserId.
  const owner = () => ({ userId: ownerUserId, roleName: "Employee" });

  it("returns 404 for an unknown payroll id", async () => {
    await assert.rejects(
      () => getPayslipDetails(99999999, { userId: 1, roleName: "Admin" }),
      (err) => err.statusCode === 404,
    );
  });

  it("returns 400 for an invalid payroll id", async () => {
    await assert.rejects(
      () => getPayslipDetails("abc", owner()),
      (err) => err.statusCode === 400,
    );
    await assert.rejects(
      () => getPayslipDetails(0, owner()),
      (err) => err.statusCode === 400,
    );
  });

  it("loads employee, details, attendance and integrity blocks", async () => {
    const slip = await getPayslipDetails(payrollId, owner());
    assert.ok(slip.employee, "employee block present");
    assert.ok(slip.employee.employee_code, "employee code present");
    assert.ok(Array.isArray(slip.details) && slip.details.length === 2);
    assert.ok(slip.attendance, "attendance block present");
    assert.ok(slip.integrity, "integrity block present");
  });

  it("matches the stored payroll totals and reports the snapshot as consistent", async () => {
    const slip = await getPayslipDetails(payrollId, owner());
    // Full attendance: Basic 30000, PF 10% = 3000, net 27000.
    assert.equal(Number(slip.payroll.gross_salary), 30000);
    assert.equal(Number(slip.payroll.total_deductions), 3000);
    assert.equal(Number(slip.payroll.net_salary), 27000);
    assert.equal(slip.integrity.consistent, true);
    assert.deepEqual(slip.integrity.discrepancies, []);
    assert.equal(slip.integrity.snapshot_sums.gross, 30000);
    assert.equal(slip.integrity.snapshot_sums.deductions, 3000);
    assert.equal(slip.integrity.snapshot_sums.net, 27000);
  });

  it("returns every detail amount verbatim from payroll_details (no recalculation)", async () => {
    const slip = await getPayslipDetails(payrollId, owner());
    const [rows] = await pool.query(
      "SELECT component_id, amount FROM payroll_details WHERE payroll_id = ?",
      [payrollId],
    );
    const byComponent = new Map(rows.map((r) => [r.component_id, Number(r.amount)]));
    for (const detail of slip.details) {
      assert.equal(Number(detail.amount), byComponent.get(detail.component_id));
    }
  });
});

describe("Payslip historical integrity (no recalculation after structure change)", () => {
  it("keeps the existing payslip unchanged when the salary structure changes", async () => {
    const owner = { userId: ownerUserId, roleName: "Employee" };
    const before = await getPayslipDetails(payrollId, owner);
    const beforeGross = Number(before.payroll.gross_salary);
    const beforeNet = Number(before.payroll.net_salary);
    const beforeDetails = before.details.map((d) => Number(d.amount));

    // Change the effective salary structure AFTER generation. structureIds[0] is
    // the Basic (FIXED earning) version; bumping it would change any recalculation.
    await pool.query(
      "UPDATE employee_salary_structure SET amount = 99999 WHERE structure_id = ?",
      [structureIds[0]],
    );

    const after = await getPayslipDetails(payrollId, owner);
    assert.equal(Number(after.payroll.gross_salary), beforeGross);
    assert.equal(Number(after.payroll.net_salary), beforeNet);
    assert.deepEqual(
      after.details.map((d) => Number(d.amount)),
      beforeDetails,
    );
    assert.equal(after.integrity.consistent, true);
  });
});

describe("payslipPdf rendering", () => {
  const owner = () => ({ userId: ownerUserId, roleName: "Employee" });

  it("builds a safe, deterministic filename", async () => {
    const slip = await getPayslipDetails(payrollId, owner());
    const filename = buildPayslipFilename(slip);
    assert.match(filename, /^WorkZen-Payslip-2026-09-.+\.pdf$/);
    assert.ok(!/[\\/:*?"<>|\s]/.test(filename), "no unsafe filename characters");
  });

  it("sanitizes a hostile employee code out of the filename", () => {
    const filename = buildPayslipFilename({
      payroll: { year: 2026, month: 9, user_id: 5 },
      employee: { employee_id: 5, employee_code: '../../etc/pa ss"wd' },
    });
    assert.equal(filename, "WorkZen-Payslip-2026-09-etcpasswd.pdf");
  });

  it("falls back to EMP{id} when no employee code exists", () => {
    const filename = buildPayslipFilename({
      payroll: { year: 2026, month: 12, user_id: 42 },
      employee: { employee_id: 42, employee_code: null },
    });
    assert.equal(filename, "WorkZen-Payslip-2026-12-EMP42.pdf");
  });

  it("renders a non-empty, valid PDF buffer from the snapshot", async () => {
    const slip = await getPayslipDetails(payrollId, owner());
    const buffer = await renderPayslipPdf(slip);
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 500, "PDF is non-trivial in size");
    assert.equal(buffer.slice(0, 5).toString(), "%PDF-");
    assert.ok(buffer.slice(-6).toString().includes("%%EOF"));
  });
});

describe("payslipService.getPayslipPdf — authorization + audit", () => {
  it("returns a PDF buffer and safe filename for the owner", async () => {
    const requester = { userId: ownerUserId, roleName: "Employee" };
    const { buffer, filename } = await getPayslipPdf(payrollId, requester, actor);
    assert.ok(Buffer.isBuffer(buffer) && buffer.length > 0);
    assert.equal(buffer.slice(0, 5).toString(), "%PDF-");
    assert.match(filename, /^WorkZen-Payslip-2026-09-.+\.pdf$/);
  });

  it("rejects a different employee's PDF with 403", async () => {
    const requester = { userId: otherUserId, roleName: "Employee" };
    await assert.rejects(
      () => getPayslipPdf(payrollId, requester, actor),
      (err) => err.statusCode === 403,
    );
  });

  it("records a PAYSLIP_DOWNLOADED audit event", async () => {
    const requester = { userId: ownerUserId, roleName: "Employee" };
    await getPayslipPdf(payrollId, requester, actor);
    const [rows] = await pool.query(
      "SELECT action FROM audit_logs WHERE table_name = 'payroll' AND record_id = ? AND action = 'PAYSLIP_DOWNLOADED'",
      [payrollId],
    );
    assert.ok(rows.length >= 1, "download audit recorded");
  });
});
