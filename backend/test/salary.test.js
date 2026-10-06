import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pool from "../src/config/database.js";
import {
  listSalaryComponents,
  createSalaryComponent,
  updateSalaryComponent,
  setSalaryComponentStatus,
  getEmployeeSalaryStructures,
  getSalaryStructureAsOf,
  assignSalaryStructure,
  updateSalaryStructure,
  removeSalaryStructure,
} from "../src/services/salaryService.js";

let testUserId;
let fixedComponentId;
let pctComponentId;
const stamp = Date.now();
const audit = { actorId: null, ipAddress: "127.0.0.1", userAgent: "salary-test" };
const createdComponentIds = [];
const createdStructureIds = [];

const trackComponent = (id) => {
  createdComponentIds.push(id);
  return id;
};
const trackStructure = (id) => {
  createdStructureIds.push(id);
  return id;
};

before(async () => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = 'Employee' LIMIT 1",
  );
  assert.equal(roles.length, 1);

  const email = `salary-test-${stamp}@example.test`;
  const [userResult] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, 'salary-test', TRUE)`,
    [roles[0].role_id, email],
  );
  testUserId = userResult.insertId;
  audit.actorId = testUserId;
  await pool.query(
    `INSERT INTO employee_profiles
      (user_id, employee_code, first_name, last_name, department, designation)
     VALUES (?, ?, 'Salary', 'Test', 'Finance', 'Tester')`,
    [testUserId, `SAL-${testUserId}`],
  );
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
  await pool.query(
    "DELETE FROM employee_salary_structure WHERE user_id = ?",
    [testUserId],
  );
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
  if (testUserId) {
    await pool.query("DELETE FROM users WHERE user_id = ?", [testUserId]);
  }
  await pool.end();
});

describe("Salary component configuration", () => {
  it("creates a FIXED component and lists it", async () => {
    const name = `Test Basic ${stamp}`;
    const result = await createSalaryComponent(
      {
        component_name: name,
        component_type: "Earning",
        calculation_type: "FIXED",
        description: "base",
        is_taxable: true,
      },
      audit,
    );
    fixedComponentId = trackComponent(result.component_id);
    assert.equal(result.componentName, name);
    assert.equal(result.calculationType, "FIXED");

    const list = await listSalaryComponents({});
    assert.ok(list.some((c) => c.component_id === fixedComponentId));
  });

  it("creates a PERCENTAGE deduction component", async () => {
    const result = await createSalaryComponent(
      {
        component_name: `Test PF Pct ${stamp}`,
        component_type: "Deduction",
        calculation_type: "PERCENTAGE",
      },
      audit,
    );
    pctComponentId = trackComponent(result.component_id);
    assert.equal(result.componentType, "Deduction");
    assert.equal(result.calculationType, "PERCENTAGE");
  });

  it("rejects a duplicate component name", async () => {
    const [rows] = await pool.query(
      "SELECT component_name FROM salary_components WHERE component_id = ?",
      [fixedComponentId],
    );
    await assert.rejects(
      createSalaryComponent(
        {
          component_name: rows[0].component_name,
          component_type: "Earning",
          calculation_type: "FIXED",
        },
        audit,
      ),
      /already exists/,
    );
  });

  it("rejects an invalid component_type", async () => {
    await assert.rejects(
      createSalaryComponent(
        {
          component_name: `Bad Type ${stamp}`,
          component_type: "Bonus",
          calculation_type: "FIXED",
        },
        audit,
      ),
      /component_type must be Earning or Deduction/,
    );
  });

  it("rejects an invalid calculation_type", async () => {
    await assert.rejects(
      createSalaryComponent(
        {
          component_name: `Bad Calc ${stamp}`,
          component_type: "Earning",
          calculation_type: "RATIO",
        },
        audit,
      ),
      /calculation_type must be FIXED or PERCENTAGE/,
    );
  });

  it("rejects a missing component name", async () => {
    await assert.rejects(
      createSalaryComponent(
        { component_name: "   ", component_type: "Earning", calculation_type: "FIXED" },
        audit,
      ),
      /component_name is required/,
    );
  });

  it("updates a component and deactivates it", async () => {
    const temp = await createSalaryComponent(
      {
        component_name: `Temp Deact ${stamp}`,
        component_type: "Earning",
        calculation_type: "FIXED",
      },
      audit,
    );
    trackComponent(temp.component_id);

    const updated = await updateSalaryComponent(
      temp.component_id,
      { description: "changed", is_taxable: true },
      audit,
    );
    assert.equal(updated.description, "changed");
    assert.equal(updated.isTaxable, true);

    const deactivated = await setSalaryComponentStatus(
      temp.component_id,
      false,
      audit,
    );
    assert.equal(deactivated.is_active, false);

    const activeList = await listSalaryComponents({});
    assert.ok(!activeList.some((c) => c.component_id === temp.component_id));
    const fullList = await listSalaryComponents({ includeInactive: true });
    assert.ok(fullList.some((c) => c.component_id === temp.component_id));
  });
});

describe("Employee salary structure and effective dating", () => {
  it("assigns sequential non-overlapping versions", async () => {
    const v1 = await assignSalaryStructure(
      {
        user_id: testUserId,
        component_id: fixedComponentId,
        amount: 30000,
        effective_from: "2026-01-01",
        effective_to: "2026-06-30",
      },
      audit,
    );
    trackStructure(v1.structure_id);
    assert.equal(Number(v1.amount), 30000);

    const v2 = await assignSalaryStructure(
      {
        user_id: testUserId,
        component_id: fixedComponentId,
        amount: 35000,
        effective_from: "2026-07-01",
        effective_to: null,
      },
      audit,
    );
    trackStructure(v2.structure_id);
    assert.equal(v2.effectiveTo, null);
  });

  it("rejects an overlapping version", async () => {
    await assert.rejects(
      assignSalaryStructure(
        {
          user_id: testUserId,
          component_id: fixedComponentId,
          amount: 999,
          effective_from: "2026-05-01",
          effective_to: "2026-09-30",
        },
        audit,
      ),
      /overlaps an existing assignment/,
    );
  });

  it("rejects overlap into an open-ended version", async () => {
    await assert.rejects(
      assignSalaryStructure(
        {
          user_id: testUserId,
          component_id: fixedComponentId,
          amount: 999,
          effective_from: "2026-08-01",
          effective_to: null,
        },
        audit,
      ),
      /overlaps an existing assignment/,
    );
  });

  it("resolves the correct version as-of a payroll date", async () => {
    const may = await getSalaryStructureAsOf(testUserId, "2026-05-15");
    const mayRow = may.find((c) => c.component_id === fixedComponentId);
    assert.equal(Number(mayRow.amount), 30000);

    const aug = await getSalaryStructureAsOf(testUserId, "2026-08-15");
    const augRow = aug.find((c) => c.component_id === fixedComponentId);
    assert.equal(Number(augRow.amount), 35000);

    const before = await getSalaryStructureAsOf(testUserId, "2025-01-01");
    assert.ok(!before.some((c) => c.component_id === fixedComponentId));
  });

  it("enforces the percentage range on assignment", async () => {
    await assert.rejects(
      assignSalaryStructure(
        {
          user_id: testUserId,
          component_id: pctComponentId,
          amount: 150,
          effective_from: "2026-01-01",
        },
        audit,
      ),
      /between 0 and 100/,
    );

    const ok = await assignSalaryStructure(
      {
        user_id: testUserId,
        component_id: pctComponentId,
        amount: 12,
        effective_from: "2026-01-01",
        effective_to: null,
      },
      audit,
    );
    trackStructure(ok.structure_id);
    assert.equal(Number(ok.amount), 12);
  });

  it("rejects a negative amount and an inverted date range", async () => {
    await assert.rejects(
      assignSalaryStructure(
        {
          user_id: testUserId,
          component_id: fixedComponentId,
          amount: -1,
          effective_from: "2030-01-01",
        },
        audit,
      ),
      /non-negative number/,
    );
    await assert.rejects(
      assignSalaryStructure(
        {
          user_id: testUserId,
          component_id: fixedComponentId,
          amount: 100,
          effective_from: "2030-06-01",
          effective_to: "2030-01-01",
        },
        audit,
      ),
      /effective_to cannot be before effective_from/,
    );
  });

  it("rejects a missing employee and a missing component", async () => {
    await assert.rejects(
      assignSalaryStructure(
        {
          user_id: 999999,
          component_id: fixedComponentId,
          amount: 100,
          effective_from: "2030-01-01",
        },
        audit,
      ),
      /Employee not found/,
    );
    await assert.rejects(
      assignSalaryStructure(
        {
          user_id: testUserId,
          component_id: 999999,
          amount: 100,
          effective_from: "2030-01-01",
        },
        audit,
      ),
      /Salary component not found/,
    );
  });

  it("updates a version without drifting effective dates", async () => {
    const [row] = await pool.query(
      "SELECT structure_id FROM employee_salary_structure WHERE user_id = ? AND component_id = ? AND effective_from = '2026-01-01'",
      [testUserId, fixedComponentId],
    );
    const updated = await updateSalaryStructure(
      row[0].structure_id,
      { amount: 31000 },
      audit,
    );
    assert.equal(Number(updated.amount), 31000);
    assert.equal(updated.effectiveFrom, "2026-01-01");
    assert.equal(updated.effectiveTo, "2026-06-30");
  });

  it("deactivates a version so it no longer resolves", async () => {
    const [rows] = await pool.query(
      "SELECT structure_id FROM employee_salary_structure WHERE user_id = ? AND component_id = ?",
      [testUserId, pctComponentId],
    );
    const targetId = rows[0].structure_id;
    const removed = await removeSalaryStructure(targetId, audit);
    assert.equal(removed.is_active, false);

    const resolved = await getSalaryStructureAsOf(testUserId, "2026-08-15");
    assert.ok(!resolved.some((c) => c.component_id === pctComponentId));
  });

  it("lists only the requesting employee's structures", async () => {
    const rows = await getEmployeeSalaryStructures(testUserId, {});
    assert.ok(rows.every((r) => r.user_id === testUserId));
  });
});

describe("Audit integrity", () => {
  it("records component and structure events in audit_logs", async () => {
    const [componentAudits] = await pool.query(
      "SELECT DISTINCT action FROM audit_logs WHERE table_name = 'salary_components' AND record_id IN (?)",
      [createdComponentIds],
    );
    const componentActions = new Set(componentAudits.map((a) => a.action));
    assert.ok(componentActions.has("SALARY_COMPONENT_CREATED"));
    assert.ok(componentActions.has("SALARY_COMPONENT_UPDATED"));
    assert.ok(componentActions.has("SALARY_COMPONENT_DEACTIVATED"));

    const [structureAudits] = await pool.query(
      "SELECT DISTINCT action FROM audit_logs WHERE table_name = 'employee_salary_structure' AND record_id IN (?)",
      [createdStructureIds],
    );
    const structureActions = new Set(structureAudits.map((a) => a.action));
    assert.ok(structureActions.has("SALARY_STRUCTURE_CREATED"));
    assert.ok(structureActions.has("SALARY_STRUCTURE_UPDATED"));
    assert.ok(structureActions.has("SALARY_STRUCTURE_REMOVED"));
  });

  it("does not write an audit row when a transaction fails", async () => {
    const before = await pool.query(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'SALARY_STRUCTURE_CREATED'",
    );
    await assert.rejects(
      assignSalaryStructure(
        {
          user_id: testUserId,
          component_id: fixedComponentId,
          amount: 500,
          effective_from: "2026-03-01",
          effective_to: "2026-04-01",
        },
        audit,
      ),
      /overlaps an existing assignment/,
    );
    const after = await pool.query(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'SALARY_STRUCTURE_CREATED'",
    );
    assert.equal(before[0][0].n, after[0][0].n);
  });
});
