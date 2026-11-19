import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pool from "../src/config/database.js";

// Payroll Milestone 2 salary-structure HTTP integration suite.
// Exercises the real /api/payroll component and salary-structure endpoints with
// live JWT auth and RBAC. Gated on PAYROLL_API_URL so it is skipped unless a
// server is running. Created components/structures are hard-deleted afterwards
// to leave the demo database pristine.
import { requiredBaseUrl, guardExecutedTests } from "./support/httpSuite.js";
import { assertScratchDatabase } from "./support/dbGuard.js";
const base = requiredBaseUrl("PAYROLL_API_URL", "test:salary:http");
// T-007 tripwire: the target server writes to the database; the schema it
// points at must be an approved scratch one. Fails closed before any test
// registers.
assertScratchDatabase("salary-http");

let adminToken, payrollToken, hrToken, employeeToken, employeeUserId;
const stamp = Date.now();
const createdComponentIds = [];
const createdStructureIds = [];

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

describe("Salary structure HTTP integration", () => {
  let fixedComponentId, pctComponentId, v1Id, pctStructId;

  before(async () => {
    const admin = await login("admin@workzen.demo", "Admin@123");
    const payroll = await login("payroll@workzen.demo", "Payroll@123");
    const hr = await login("hr@workzen.demo", "Hr@123");
    const emp = await login("employee@workzen.demo", "Employee@123");
    adminToken = admin.token;
    payrollToken = payroll.token;
    hrToken = hr.token;
    employeeToken = emp.token;
    employeeUserId = emp.userId;
    assert.ok(adminToken && payrollToken && hrToken && employeeToken && employeeUserId);
  });

  after(async () => {
    if (createdStructureIds.length > 0) {
      await pool.query(
        "DELETE FROM audit_logs WHERE table_name = 'employee_salary_structure' AND record_id IN (?)",
        [createdStructureIds],
      );
      await pool.query(
        "DELETE FROM employee_salary_structure WHERE structure_id IN (?)",
        [createdStructureIds],
      );
    }
    if (createdComponentIds.length > 0) {
      await pool.query(
        "DELETE FROM audit_logs WHERE table_name = 'salary_components' AND record_id IN (?)",
        [createdComponentIds],
      );
      await pool.query(
        "DELETE FROM salary_components WHERE component_id IN (?)",
        [createdComponentIds],
      );
    }
    await pool.end();
  });

  describe("RBAC matrix", () => {
    it("GET /payroll/components: Admin 200, PO 200, HR 403, Employee 403, anon 401", async () => {
      assert.equal((await call("GET", "/payroll/components", adminToken)).status, 200);
      assert.equal((await call("GET", "/payroll/components", payrollToken)).status, 200);
      assert.equal((await call("GET", "/payroll/components", hrToken)).status, 403);
      assert.equal((await call("GET", "/payroll/components", employeeToken)).status, 403);
      assert.equal((await call("GET", "/payroll/components", null)).status, 401);
    });

    it("POST /payroll/components is forbidden to Employee and HR", async () => {
      const payload = {
        component_name: `Denied ${stamp}`,
        component_type: "Earning",
        calculation_type: "FIXED",
      };
      assert.equal((await call("POST", "/payroll/components", employeeToken, payload)).status, 403);
      assert.equal((await call("POST", "/payroll/components", hrToken, payload)).status, 403);
    });
  });

  describe("Component CRUD over HTTP", () => {
    it("creates, duplicates, validates, updates and deactivates", async () => {
      const name = `HTTP Fixed ${stamp}`;
      const created = await call("POST", "/payroll/components", adminToken, {
        component_name: name,
        component_type: "Earning",
        calculation_type: "FIXED",
        description: "http",
        is_taxable: true,
      });
      assert.equal(created.status, 201);
      fixedComponentId = created.body.data.component_id;
      createdComponentIds.push(fixedComponentId);

      const pct = await call("POST", "/payroll/components", adminToken, {
        component_name: `HTTP Pct ${stamp}`,
        component_type: "Deduction",
        calculation_type: "PERCENTAGE",
      });
      assert.equal(pct.status, 201);
      pctComponentId = pct.body.data.component_id;
      createdComponentIds.push(pctComponentId);

      assert.equal(
        (await call("POST", "/payroll/components", adminToken, {
          component_name: name,
          component_type: "Earning",
          calculation_type: "FIXED",
        })).status,
        409,
      );
      assert.equal(
        (await call("POST", "/payroll/components", adminToken, {
          component_name: `X ${stamp}`,
          component_type: "Bonus",
          calculation_type: "FIXED",
        })).status,
        400,
      );
      assert.equal(
        (await call("POST", "/payroll/components", adminToken, {
          component_name: `Y ${stamp}`,
          component_type: "Earning",
          calculation_type: "RATIO",
        })).status,
        400,
      );

      const updated = await call("PUT", `/payroll/components/${fixedComponentId}`, payrollToken, {
        description: "changed by PO",
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.description, "changed by PO");

      const notFound = await call("PUT", "/payroll/components/999999", adminToken, {
        description: "x",
      });
      assert.equal(notFound.status, 404);
    });
  });

  describe("Salary structure over HTTP", () => {
    it("assigns effective-dated versions and resolves as-of", async () => {
      const v1 = await call("POST", `/payroll/salary-structure/${employeeUserId}`, payrollToken, {
        component_id: fixedComponentId,
        amount: 30000,
        effective_from: "2026-01-01",
        effective_to: "2026-06-30",
      });
      assert.equal(v1.status, 201);
      v1Id = v1.body.data.structure_id;
      createdStructureIds.push(v1Id);

      const v2 = await call("POST", `/payroll/salary-structure/${employeeUserId}`, payrollToken, {
        component_id: fixedComponentId,
        amount: 35000,
        effective_from: "2026-07-01",
        effective_to: null,
      });
      assert.equal(v2.status, 201);
      createdStructureIds.push(v2.body.data.structure_id);

      const may = await call(
        "GET",
        `/payroll/salary-structure/${employeeUserId}/as-of?date=2026-05-15`,
        adminToken,
      );
      assert.equal(may.status, 200);
      const mayRow = may.body.data.components.find((c) => c.component_id === fixedComponentId);
      assert.equal(Number(mayRow.amount), 30000);

      const aug = await call(
        "GET",
        `/payroll/salary-structure/${employeeUserId}/as-of?date=2026-08-15`,
        adminToken,
      );
      const augRow = aug.body.data.components.find((c) => c.component_id === fixedComponentId);
      assert.equal(Number(augRow.amount), 35000);
    });

    it("rejects overlaps, bad ranges and missing references", async () => {
      assert.equal(
        (await call("POST", `/payroll/salary-structure/${employeeUserId}`, payrollToken, {
          component_id: fixedComponentId,
          amount: 999,
          effective_from: "2026-05-01",
          effective_to: "2026-09-30",
        })).status,
        409,
      );
      assert.equal(
        (await call("POST", `/payroll/salary-structure/${employeeUserId}`, payrollToken, {
          component_id: fixedComponentId,
          amount: -1,
          effective_from: "2030-01-01",
        })).status,
        400,
      );
      assert.equal(
        (await call("POST", `/payroll/salary-structure/${employeeUserId}`, payrollToken, {
          component_id: pctComponentId,
          amount: 150,
          effective_from: "2030-01-01",
        })).status,
        400,
      );
      assert.equal(
        (await call("POST", "/payroll/salary-structure/999999", payrollToken, {
          component_id: fixedComponentId,
          amount: 100,
          effective_from: "2030-01-01",
        })).status,
        404,
      );
      assert.equal(
        (await call("POST", `/payroll/salary-structure/${employeeUserId}`, payrollToken, {
          component_id: 999999,
          amount: 100,
          effective_from: "2030-01-01",
        })).status,
        404,
      );
    });

    it("accepts a valid percentage assignment", async () => {
      const ok = await call("POST", `/payroll/salary-structure/${employeeUserId}`, payrollToken, {
        component_id: pctComponentId,
        amount: 12,
        effective_from: "2026-01-01",
        effective_to: null,
      });
      assert.equal(ok.status, 201);
      pctStructId = ok.body.data.structure_id;
      createdStructureIds.push(pctStructId);
    });

    it("updates a version without date drift and deactivates a version", async () => {
      const upd = await call("PUT", `/payroll/salary-structure/version/${v1Id}`, payrollToken, {
        amount: 31000,
      });
      assert.equal(upd.status, 200);
      assert.equal(Number(upd.body.data.amount), 31000);
      assert.equal(upd.body.data.effectiveFrom, "2026-01-01");
      assert.equal(upd.body.data.effectiveTo, "2026-06-30");

      const del = await call("DELETE", `/payroll/salary-structure/version/${pctStructId}`, payrollToken);
      assert.equal(del.status, 200);
      assert.equal(del.body.data.is_active, false);

      const afterDel = await call(
        "GET",
        `/payroll/salary-structure/${employeeUserId}/as-of?date=2026-08-15`,
        adminToken,
      );
      assert.ok(!afterDel.body.data.components.some((c) => c.component_id === pctComponentId));
    });

    it("forbids employees from mutating salary structures and from reading others'", async () => {
      // T-011: an Employee may read their OWN structure; the self-read is
      // authorized now, so it must succeed. Everything else stays forbidden.
      assert.equal(
        (await call("GET", `/payroll/salary-structure/${employeeUserId}`, employeeToken)).status,
        200,
      );
      assert.equal(
        (await call("POST", `/payroll/salary-structure/${employeeUserId}`, employeeToken, {
          component_id: fixedComponentId,
          amount: 1,
          effective_from: "2030-01-01",
        })).status,
        403,
      );
      assert.equal(
        (await call("PUT", `/payroll/salary-structure/version/${v1Id}`, employeeToken, {
          amount: 1,
        })).status,
        403,
      );
      assert.equal(
        (await call("DELETE", `/payroll/salary-structure/version/${v1Id}`, employeeToken)).status,
        403,
      );
    });
  });

  describe("Audit over HTTP", () => {
    it("writes salary component and structure audit events", async () => {
      const [compAudits] = await pool.query(
        "SELECT DISTINCT action FROM audit_logs WHERE table_name = 'salary_components' AND record_id IN (?)",
        [createdComponentIds],
      );
      const compActions = new Set(compAudits.map((a) => a.action));
      assert.ok(compActions.has("SALARY_COMPONENT_CREATED"));
      assert.ok(compActions.has("SALARY_COMPONENT_UPDATED"));

      const [structAudits] = await pool.query(
        "SELECT DISTINCT action FROM audit_logs WHERE table_name = 'employee_salary_structure' AND record_id IN (?)",
        [createdStructureIds],
      );
      const structActions = new Set(structAudits.map((a) => a.action));
      assert.ok(structActions.has("SALARY_STRUCTURE_CREATED"));
      assert.ok(structActions.has("SALARY_STRUCTURE_UPDATED"));
      assert.ok(structActions.has("SALARY_STRUCTURE_REMOVED"));
    });
  });

  describe("Component status endpoint", () => {
    it("deactivates a component via PATCH and hides it from the active list", async () => {
      const temp = await call("POST", "/payroll/components", adminToken, {
        component_name: `HTTP Deact ${stamp}`,
        component_type: "Earning",
        calculation_type: "FIXED",
      });
      assert.equal(temp.status, 201);
      const tempId = temp.body.data.component_id;
      createdComponentIds.push(tempId);

      const patched = await call("PATCH", `/payroll/components/${tempId}/status`, adminToken, {
        is_active: false,
      });
      assert.equal(patched.status, 200);
      assert.equal(patched.body.data.is_active, false);

      const active = await call("GET", "/payroll/components", adminToken);
      assert.ok(!active.body.data.some((c) => c.component_id === tempId));
      const all = await call("GET", "/payroll/components?include_inactive=true", adminToken);
      assert.ok(all.body.data.some((c) => c.component_id === tempId));
    });
  });
});

guardExecutedTests("PAYROLL_API_URL", 10);
