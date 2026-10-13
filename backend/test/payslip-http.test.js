import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import pool from "../src/config/database.js";

// =====================================================
// Payroll Milestone 4 — Payslip HTTP integration suite.
//
// Exercises the real endpoints over HTTP with live JWT auth + RBAC:
//   GET /api/payroll/my-payroll
//   GET /api/payroll/payslip/:payrollId
//   GET /api/payroll/payslip/:payrollId/pdf
//
// Gated on PAYSLIP_API_URL so it is skipped unless a server is running.
// Isolation: creates its OWN two temporary employees (real logins), salary
// components, effective-dated structures and full attendance, then hard-deletes
// everything. Does not touch the shared demo accounts' payroll data.
// =====================================================

const base = process.env.PAYSLIP_API_URL;

const PERIOD_YEAR = 2026;
const PERIOD_MONTH = 10;
const stamp = Date.now();
const TEMP_PASSWORD = "Temp@12345";

let adminToken, payrollToken, hrToken;
let ownerToken, ownerId;
let otherToken, otherId;
let payrollId;
const componentIds = [];

const jsonCall = async (method, path, token, body) => {
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
  return { status: response.status, body: parsed, headers: response.headers };
};

// Raw fetch that preserves the binary body + headers for the PDF endpoint.
const rawCall = async (path, token) => {
  const response = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, buffer };
};

const login = async (email, password) => {
  const { body } = await jsonCall("POST", "/auth/login", null, { email, password });
  return body?.data?.token;
};

const makeEmployee = async (tag) => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = 'Employee' LIMIT 1",
  );
  const email = `payslip-http-${tag}-${stamp}@example.test`;
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
  const [res] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, ?, TRUE)`,
    [roles[0].role_id, email, hash],
  );
  const userId = res.insertId;
  await pool.query(
    `INSERT INTO employee_profiles
      (user_id, employee_code, first_name, last_name, department, designation)
     VALUES (?, ?, 'Payslip', 'HTTP', 'Finance', 'Tester')`,
    [userId, `PSHTTP-${tag}-${userId}`],
  );
  const token = await login(email, TEMP_PASSWORD);
  return { userId, token };
};

describe("Payslip HTTP integration", { skip: !base }, () => {
  before(async () => {
    adminToken = await login("admin@workzen.demo", "Admin@123");
    payrollToken = await login("payroll@workzen.demo", "Payroll@123");
    hrToken = await login("hr@workzen.demo", "Hr@123");
    assert.ok(adminToken && payrollToken && hrToken, "staff demo tokens issued");

    const owner = await makeEmployee("owner");
    ownerId = owner.userId;
    ownerToken = owner.token;
    const other = await makeEmployee("other");
    otherId = other.userId;
    otherToken = other.token;
    assert.ok(ownerToken && otherToken, "temp employee tokens issued");

    const mkComp = async (name, type, calc) => {
      const [r] = await pool.query(
        `INSERT INTO salary_components (component_name, component_type, calculation_type, is_taxable, is_active)
         VALUES (?, ?, ?, TRUE, TRUE)`,
        [`${name} ${stamp}`, type, calc],
      );
      componentIds.push(r.insertId);
      return r.insertId;
    };
    const basicCompId = await mkComp("PSHTTP Basic", "Earning", "FIXED");
    const pfCompId = await mkComp("PSHTTP PF", "Deduction", "PERCENTAGE");

    const addStructure = async (componentId, amount) => {
      await pool.query(
        `INSERT INTO employee_salary_structure
          (user_id, component_id, amount, effective_from, effective_to, is_active)
         VALUES (?, ?, ?, '2026-01-01', NULL, TRUE)`,
        [ownerId, componentId, amount],
      );
    };
    await addStructure(basicCompId, 25000); // FIXED earning
    await addStructure(pfCompId, 10); // 10% deduction

    // Full attendance for every weekday of the period -> payable ratio 1.
    const daysInMonth = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dow = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH - 1, d)).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const date = `${PERIOD_YEAR}-${String(PERIOD_MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      await pool.query(
        `INSERT INTO attendance (user_id, attendance_date, status, total_hours)
         VALUES (?, ?, 'Present', 8)`,
        [ownerId, date],
      );
    }

    // Generate the payroll under test via the M3 engine endpoint.
    const gen = await jsonCall("POST", "/payroll/generate", payrollToken, {
      user_id: ownerId,
      month: PERIOD_MONTH,
      year: PERIOD_YEAR,
    });
    assert.equal(gen.status, 201, "payroll generated");
    payrollId = gen.body.data.payroll_id;
    assert.ok(payrollId, "payroll id returned");
  });

  after(async () => {
    for (const userId of [ownerId, otherId]) {
      if (!userId) continue;
      await pool.query(
        "DELETE al FROM audit_logs al JOIN payroll p ON al.table_name = 'payroll' AND al.record_id = p.payroll_id WHERE p.user_id = ?",
        [userId],
      );
      await pool.query("DELETE FROM payroll WHERE user_id = ?", [userId]);
      await pool.query("DELETE FROM audit_logs WHERE table_name = 'employee_salary_structure' AND user_id = ?", [userId]);
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

  describe("GET /payroll/my-payroll", () => {
    it("returns the owner's payroll for the period (200)", async () => {
      const r = await jsonCall(
        "GET",
        `/payroll/my-payroll?month=${PERIOD_MONTH}&year=${PERIOD_YEAR}`,
        ownerToken,
      );
      assert.equal(r.status, 200);
      assert.equal(r.body.success, true);
      assert.ok(r.body.data.some((p) => p.payroll_id === payrollId));
    });

    it("does not expose another employee's payroll (200, absent)", async () => {
      const r = await jsonCall(
        "GET",
        `/payroll/my-payroll?month=${PERIOD_MONTH}&year=${PERIOD_YEAR}`,
        otherToken,
      );
      assert.equal(r.status, 200);
      assert.ok(!r.body.data.some((p) => p.payroll_id === payrollId));
    });

    it("requires authentication (401)", async () => {
      const r = await jsonCall("GET", "/payroll/my-payroll", null);
      assert.equal(r.status, 401);
    });
  });

  describe("GET /payroll/payslip/:id", () => {
    it("returns the snapshot to the owning employee (200)", async () => {
      const r = await jsonCall("GET", `/payroll/payslip/${payrollId}`, ownerToken);
      assert.equal(r.status, 200);
      assert.equal(r.body.success, true);
      assert.equal(r.body.data.payroll.payroll_id, payrollId);
      assert.ok(r.body.data.employee, "employee block present");
      assert.equal(r.body.data.employee.employee_id, ownerId);
      assert.ok(Array.isArray(r.body.data.details));
      assert.equal(r.body.data.details.length, 2);
      assert.equal(r.body.data.integrity.consistent, true);
      // Full attendance: Basic 25000, PF 10% = 2500, net 22500.
      assert.equal(Number(r.body.data.payroll.gross_salary), 25000);
      assert.equal(Number(r.body.data.payroll.total_deductions), 2500);
      assert.equal(Number(r.body.data.payroll.net_salary), 22500);
    });

    it("is forbidden to a different employee (403)", async () => {
      const r = await jsonCall("GET", `/payroll/payslip/${payrollId}`, otherToken);
      assert.equal(r.status, 403);
      assert.equal(r.body.success, false);
    });

    it("is allowed for Admin (200)", async () => {
      const r = await jsonCall("GET", `/payroll/payslip/${payrollId}`, adminToken);
      assert.equal(r.status, 200);
    });

    it("is allowed for Payroll Officer (200)", async () => {
      const r = await jsonCall("GET", `/payroll/payslip/${payrollId}`, payrollToken);
      assert.equal(r.status, 200);
    });

    it("is forbidden to HR Officer (403)", async () => {
      const r = await jsonCall("GET", `/payroll/payslip/${payrollId}`, hrToken);
      assert.equal(r.status, 403);
    });

    it("requires authentication (401)", async () => {
      const r = await jsonCall("GET", `/payroll/payslip/${payrollId}`, null);
      assert.equal(r.status, 401);
    });

    it("returns 404 for an unknown payroll id", async () => {
      const r = await jsonCall("GET", "/payroll/payslip/99999999", adminToken);
      assert.equal(r.status, 404);
    });
  });

  describe("GET /payroll/payslip/:id/pdf", () => {
    it("returns a valid PDF to the owning employee (200)", async () => {
      const r = await rawCall(`/payroll/payslip/${payrollId}/pdf`, ownerToken);
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type") || "", /application\/pdf/);
      assert.ok(r.buffer.length > 500, "PDF is non-trivial in size");
      assert.equal(r.buffer.slice(0, 5).toString(), "%PDF-");
      assert.ok(r.buffer.slice(-6).toString().includes("%%EOF"));
    });

    it("sets a safe Content-Disposition filename", async () => {
      const r = await rawCall(`/payroll/payslip/${payrollId}/pdf`, ownerToken);
      const disposition = r.headers.get("content-disposition") || "";
      assert.match(disposition, /attachment; filename="WorkZen-Payslip-2026-10-.+\.pdf"/);
    });

    it("is forbidden to a different employee (403)", async () => {
      const r = await rawCall(`/payroll/payslip/${payrollId}/pdf`, otherToken);
      assert.equal(r.status, 403);
    });

    it("is allowed for Admin (200)", async () => {
      const r = await rawCall(`/payroll/payslip/${payrollId}/pdf`, adminToken);
      assert.equal(r.status, 200);
      assert.equal(r.buffer.slice(0, 5).toString(), "%PDF-");
    });

    it("is allowed for Payroll Officer (200)", async () => {
      const r = await rawCall(`/payroll/payslip/${payrollId}/pdf`, payrollToken);
      assert.equal(r.status, 200);
      assert.equal(r.buffer.slice(0, 5).toString(), "%PDF-");
    });

    it("is forbidden to HR Officer (403)", async () => {
      const r = await rawCall(`/payroll/payslip/${payrollId}/pdf`, hrToken);
      assert.equal(r.status, 403);
    });

    it("requires authentication (401)", async () => {
      const r = await rawCall(`/payroll/payslip/${payrollId}/pdf`, null);
      assert.equal(r.status, 401);
    });

    it("returns 404 for an unknown payroll id", async () => {
      const r = await rawCall("/payroll/payslip/99999999/pdf", adminToken);
      assert.equal(r.status, 404);
    });
  });
});
