import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import pool from "../src/config/database.js";

// Payroll Milestone 3 HTTP integration suite.
// Exercises the real /api/payroll generation, status, list and payslip endpoints
// with live JWT auth and RBAC. Gated on PAYROLL_API_URL so it is skipped unless a
// server is running.
//
// Isolation: this suite creates its OWN temporary employee (with a real login),
// salary components, effective-dated structures and full attendance for November
// 2026, then hard-deletes everything afterwards. It deliberately does NOT touch
// the shared demo accounts so it can run concurrently with the salary-structure
// HTTP suite without cross-test interference.
const base = process.env.PAYROLL_API_URL;

const PERIOD_YEAR = 2026;
const PERIOD_MONTH = 11;
const stamp = Date.now();
const TEMP_PASSWORD = "Temp@12345";

let adminToken, payrollToken, hrToken;
let empToken, tempEmployeeId;
let basicCompId, pfCompId;
const createdStructureIds = [];
const createdComponentIds = [];
const createdPayrollIds = [];

const call = async (method, path, token, body) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
};

const login = async (email, password) => {
  const { body } = await call("POST", "/auth/login", null, { email, password });
  return { token: body?.data?.token, userId: body?.data?.userId };
};

// Weekday dates for the payroll period, computed independently of the service.
const weekdayDates = (year, month) => {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= days; d += 1) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      out.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return out;
};

describe("Payroll generation/status HTTP integration", { skip: !base }, () => {
  let expectedWorkingDays;

  before(async () => {
    adminToken = (await login("admin@workzen.demo", "Admin@123")).token;
    payrollToken = (await login("payroll@workzen.demo", "Payroll@123")).token;
    hrToken = (await login("hr@workzen.demo", "Hr@123")).token;
    assert.ok(adminToken && payrollToken && hrToken, "staff demo tokens issued");

    // Dedicated temporary employee with a real login.
    const [roles] = await pool.query(
      "SELECT role_id FROM roles WHERE role_name = 'Employee' LIMIT 1",
    );
    const email = `payroll-http-${stamp}@example.test`;
    const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
    const [userRes] = await pool.query(
      `INSERT INTO users (role_id, email, password_hash, is_active)
       VALUES (?, ?, ?, TRUE)`,
      [roles[0].role_id, email, hash],
    );
    tempEmployeeId = userRes.insertId;
    await pool.query(
      `INSERT INTO employee_profiles
        (user_id, employee_code, first_name, last_name, department, designation)
       VALUES (?, ?, 'Payroll', 'HTTP', 'Finance', 'Tester')`,
      [tempEmployeeId, `PAYHTTP-${tempEmployeeId}`],
    );
    empToken = (await login(email, TEMP_PASSWORD)).token;
    assert.ok(empToken, "temp employee token issued");

    // Temp salary components.
    const mkComp = async (name, type, calc) => {
      const [r] = await pool.query(
        `INSERT INTO salary_components (component_name, component_type, calculation_type, is_taxable, is_active)
         VALUES (?, ?, ?, TRUE, TRUE)`,
        [`${name} ${stamp}`, type, calc],
      );
      createdComponentIds.push(r.insertId);
      return r.insertId;
    };
    basicCompId = await mkComp("HTTP Basic", "Earning", "FIXED");
    pfCompId = await mkComp("HTTP PF", "Deduction", "PERCENTAGE");

    // Effective-dated structure covering the period.
    const addStructure = async (componentId, amount) => {
      const [r] = await pool.query(
        `INSERT INTO employee_salary_structure
          (user_id, component_id, amount, effective_from, effective_to, is_active)
         VALUES (?, ?, ?, '2026-01-01', NULL, TRUE)`,
        [tempEmployeeId, componentId, amount],
      );
      createdStructureIds.push(r.insertId);
    };
    await addStructure(basicCompId, 20000); // FIXED earning
    await addStructure(pfCompId, 10); // 10% deduction

    // Full attendance for every weekday of the period -> payable ratio 1.
    const dates = weekdayDates(PERIOD_YEAR, PERIOD_MONTH);
    expectedWorkingDays = dates.length;
    for (const date of dates) {
      await pool.query(
        `INSERT INTO attendance (user_id, attendance_date, status, total_hours)
         VALUES (?, ?, 'Present', 8)`,
        [tempEmployeeId, date],
      );
    }
  });

  after(async () => {
    if (createdPayrollIds.length > 0) {
      await pool.query(
        "DELETE FROM audit_logs WHERE table_name = 'payroll' AND record_id IN (?)",
        [createdPayrollIds],
      );
    }
    if (tempEmployeeId) {
      // Cascades remove payroll_details, attendance, leave and structures tied to
      // the user; delete payroll first to clear its own audit references.
      await pool.query("DELETE FROM payroll WHERE user_id = ?", [tempEmployeeId]);
      await pool.query("DELETE FROM audit_logs WHERE table_name = 'employee_salary_structure' AND user_id = ?", [tempEmployeeId]);
      await pool.query("DELETE FROM users WHERE user_id = ?", [tempEmployeeId]);
    }
    if (createdComponentIds.length > 0) {
      await pool.query(
        "DELETE FROM salary_components WHERE component_id IN (?)",
        [createdComponentIds],
      );
    }
    await pool.end();
  });

  describe("POST /payroll/generate RBAC", () => {
    it("is forbidden to Employee (403)", async () => {
      const r = await call("POST", "/payroll/generate", empToken, {
        user_id: tempEmployeeId,
        month: PERIOD_MONTH,
        year: PERIOD_YEAR,
      });
      assert.equal(r.status, 403);
    });

    it("is forbidden to HR Officer (403)", async () => {
      const r = await call("POST", "/payroll/generate", hrToken, {
        user_id: tempEmployeeId,
        month: PERIOD_MONTH,
        year: PERIOD_YEAR,
      });
      assert.equal(r.status, 403);
    });

    it("is forbidden without a token (401)", async () => {
      const r = await call("POST", "/payroll/generate", null, {
        user_id: tempEmployeeId,
        month: PERIOD_MONTH,
        year: PERIOD_YEAR,
      });
      assert.equal(r.status, 401);
    });
  });

  describe("POST /payroll/generate success + duplicates", () => {
    it("generates payroll as Payroll Officer with correct totals (201)", async () => {
      const r = await call("POST", "/payroll/generate", payrollToken, {
        user_id: tempEmployeeId,
        month: PERIOD_MONTH,
        year: PERIOD_YEAR,
      });
      assert.equal(r.status, 201);
      assert.equal(r.body.success, true);
      const d = r.body.data;
      createdPayrollIds.push(d.payroll_id);
      assert.equal(d.payment_status, "Pending");
      assert.equal(d.working_days, expectedWorkingDays);
      assert.equal(d.present_days, expectedWorkingDays);
      assert.equal(d.payable_ratio, 1);
      // Full attendance: Basic 20000, PF 10% of 20000 = 2000, net 18000.
      assert.equal(d.gross_salary, 20000);
      assert.equal(d.total_deductions, 2000);
      assert.equal(d.net_salary, 18000);
    });

    it("rejects a duplicate period with 409 (no raw DB error)", async () => {
      const r = await call("POST", "/payroll/generate", adminToken, {
        user_id: tempEmployeeId,
        month: PERIOD_MONTH,
        year: PERIOD_YEAR,
      });
      assert.equal(r.status, 409);
      assert.equal(r.body.success, false);
      assert.match(r.body.message, /already generated/i);
      assert.ok(!/ER_DUP_ENTRY|Duplicate entry/i.test(r.body.message));
    });

    it("rejects an invalid month with 400", async () => {
      const r = await call("POST", "/payroll/generate", adminToken, {
        user_id: tempEmployeeId,
        month: 13,
        year: PERIOD_YEAR,
      });
      assert.equal(r.status, 400);
    });

    it("rejects generation for an employee with no salary structure (400)", async () => {
      const r = await call("POST", "/payroll/generate", adminToken, {
        user_id: 999999,
        month: PERIOD_MONTH,
        year: PERIOD_YEAR,
      });
      // Unknown employee -> 404 (validated before structure resolution).
      assert.equal(r.status, 404);
    });
  });

  describe("PUT /payroll/:id/status state machine over HTTP", () => {
    it("Employee cannot change status (403)", async () => {
      const r = await call("PUT", `/payroll/${createdPayrollIds[0]}/status`, empToken, {
        payment_status: "Processed",
      });
      assert.equal(r.status, 403);
    });

    it("allows Pending -> Processed (Payroll Officer)", async () => {
      const r = await call("PUT", `/payroll/${createdPayrollIds[0]}/status`, payrollToken, {
        payment_status: "Processed",
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.payment_status, "Processed");
    });

    it("allows Processed -> Paid (Admin)", async () => {
      const r = await call("PUT", `/payroll/${createdPayrollIds[0]}/status`, adminToken, {
        payment_status: "Paid",
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.payment_status, "Paid");
    });

    it("rejects an invalid transition Paid -> Pending (409)", async () => {
      const r = await call("PUT", `/payroll/${createdPayrollIds[0]}/status`, adminToken, {
        payment_status: "Pending",
      });
      assert.equal(r.status, 409);
      assert.match(r.body.message, /Invalid status transition/);
    });

    it("rejects an unknown status value (400)", async () => {
      const r = await call("PUT", `/payroll/${createdPayrollIds[0]}/status`, adminToken, {
        payment_status: "Refunded",
      });
      assert.equal(r.status, 400);
    });

    it("HR Officer cannot change status (403)", async () => {
      const r = await call("PUT", `/payroll/${createdPayrollIds[0]}/status`, hrToken, {
        payment_status: "On Hold",
      });
      assert.equal(r.status, 403);
    });

    it("returns 404 for an unknown payroll id", async () => {
      const r = await call("PUT", "/payroll/999999/status", adminToken, {
        payment_status: "Processed",
      });
      assert.equal(r.status, 404);
    });
  });

  describe("GET list + payslip access", () => {
    it("GET /payroll/my-payroll returns the employee's own payroll (200)", async () => {
      const r = await call(
        "GET",
        `/payroll/my-payroll?month=${PERIOD_MONTH}&year=${PERIOD_YEAR}`,
        empToken,
      );
      assert.equal(r.status, 200);
      assert.equal(r.body.success, true);
      assert.ok(r.body.data.some((p) => p.payroll_id === createdPayrollIds[0]));
    });

    it("GET /payroll/all is forbidden to Employee (403)", async () => {
      const r = await call("GET", "/payroll/all", empToken);
      assert.equal(r.status, 403);
    });

    it("GET /payroll/all is forbidden to HR Officer (403)", async () => {
      const r = await call("GET", "/payroll/all", hrToken);
      assert.equal(r.status, 403);
    });

    it("GET /payroll/all returns organization payroll for Payroll Officer (200)", async () => {
      const r = await call("GET", "/payroll/all", payrollToken);
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body.data));
      assert.ok(r.body.data.some((p) => p.payroll_id === createdPayrollIds[0]));
    });

    it("GET /payroll/payslip/:id is allowed for the owning employee (200)", async () => {
      const r = await call("GET", `/payroll/payslip/${createdPayrollIds[0]}`, empToken);
      assert.equal(r.status, 200);
      assert.equal(r.body.data.payroll.payroll_id, createdPayrollIds[0]);
      assert.ok(Array.isArray(r.body.data.details));
      assert.equal(r.body.data.details.length, 2);
    });

    it("GET /payroll/payslip/:id is allowed for Admin (200)", async () => {
      const r = await call("GET", `/payroll/payslip/${createdPayrollIds[0]}`, adminToken);
      assert.equal(r.status, 200);
    });

    it("GET /payroll/payslip/:id returns 404 for an unknown id", async () => {
      const r = await call("GET", "/payroll/payslip/999999", adminToken);
      assert.equal(r.status, 404);
    });
  });

  describe("Audit over HTTP", () => {
    it("records PAYROLL_GENERATED and PAYROLL_STATUS_CHANGED events", async () => {
      const [audits] = await pool.query(
        "SELECT DISTINCT action FROM audit_logs WHERE table_name = 'payroll' AND record_id = ?",
        [createdPayrollIds[0]],
      );
      const actions = new Set(audits.map((a) => a.action));
      assert.ok(actions.has("PAYROLL_GENERATED"));
      assert.ok(actions.has("PAYROLL_STATUS_CHANGED"));
    });
  });
});
