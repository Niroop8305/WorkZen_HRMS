// Regression for the reset paths of the full-reset seed scripts. Driven with a
// scripted connection, so nothing here can reach a database: `seedCleanup.js`
// imports no pool and the scripts that use it only connect in their direct-run
// branch.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resetAccountScopedState } from "../src/database/seedCleanup.js";

const connectionOf = (script) => {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const statement = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: statement, params });
      const match = Object.entries(script).find(([fragment]) =>
        statement.includes(fragment),
      );
      if (!match) return [[]];
      const value = match[1];
      return typeof value === "function" ? value(statement) : value;
    },
  };
};

describe("account-scoped reset state", () => {
  it("clears sessions before the accounts they point at are truncated", async () => {
    const connection = connectionOf({
      "TABLE_NAME = 'auth_throttle'": [[{ TABLE_NAME: "auth_throttle" }]],
      "COUNT(*) AS preserved": [[{ preserved: 2 }]],
    });
    const report = await resetAccountScopedState(connection);
    assert.equal(report.sessionsCleared, true);
    assert.deepEqual(
      connection.calls.map((call) => call.sql.split(" ")[0]),
      ["TRUNCATE", "SELECT", "SELECT", "DELETE"],
    );
    assert.equal(
      connection.calls[0].sql,
      "TRUNCATE TABLE user_sessions",
      "the surviving-session window between the two truncates must be zero",
    );
  });

  it("never deletes a lockout that is still running", () => {
    const connection = connectionOf({
      "TABLE_NAME = 'auth_throttle'": [[{ TABLE_NAME: "auth_throttle" }]],
      "COUNT(*) AS preserved": [[{ preserved: 3 }]],
    });
    return resetAccountScopedState(connection).then(() => {
      const purge = connection.calls.find((call) =>
        call.sql.startsWith("DELETE FROM auth_throttle"),
      );
      assert.equal(
        purge.sql,
        "DELETE FROM auth_throttle WHERE locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP",
        "a seed cannot double as a throttle bypass",
      );
    });
  });

  it("warns instead of failing when the throttle table has not been migrated", async () => {
    const connection = connectionOf({ "TABLE_NAME = 'auth_throttle'": [[]] });
    const report = await resetAccountScopedState(connection);
    assert.equal(report.throttleTablePresent, false);
    assert.equal(
      connection.calls.filter((call) => call.sql.includes("auth_throttle") && call.sql.startsWith("DELETE"))
        .length,
      0,
      "no statement may name a table that is not there",
    );
    assert.equal(report.sessionsCleared, true, "the session reset still happens");
  });

  it("is wired into both full-reset seeds, ahead of the user truncate", () => {
    for (const file of ["seed.js", "production-seed.js"]) {
      const source = readFileSync(
        new URL(`../src/database/${file}`, import.meta.url),
        "utf8",
      ).replace(/\s+/g, " ");
      assert.ok(
        source.includes("await resetAccountScopedState(connection)"),
        `${file} must clear account-scoped state`,
      );
      assert.ok(
        source.indexOf("resetAccountScopedState(connection)") <
          source.indexOf("TRUNCATE TABLE users"),
        `${file} must clear sessions before replacing user ids`,
      );
    }
  });

  it("revokes sessions when the demo seed replaces a password", () => {
    const source = readFileSync(
      new URL("../src/database/seed-demo-users.js", import.meta.url),
      "utf8",
    ).replace(/\s+/g, " ");
    assert.ok(
      source.includes(
        "UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL",
      ),
      "a password replaced out from under a session must end it",
    );
    assert.ok(source.includes("if (isExisting)"), "only accounts that had sessions");
  });
});

// T-006 regression: the full-reset seeds must not destroy the nine reference
// salary_components rows. schema.sql seeds them (INSERT ... ON DUPLICATE KEY
// UPDATE) and nothing re-inserts them, so a seed that truncated the table used
// to silently delete the payroll vocabulary that every salary-structure lookup
// depends on. The scripts only connect in their direct-run branch, so these
// assertions read the executed SQL text statically - no database is touched.
const truncateList = (file) => {
  const source = readFileSync(
    new URL(`../src/database/${file}`, import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");
  return [...source.matchAll(/TRUNCATE TABLE ([a-z_]+)/g)].map((m) => m[1]);
};

describe("reference salary_components survive a full reset (T-006)", () => {
  it("seed.js never truncates or deletes from salary_components", () => {
    const source = readFileSync(
      new URL("../src/database/seed.js", import.meta.url),
      "utf8",
    ).replace(/\s+/g, " ");
    assert.ok(
      !/TRUNCATE TABLE salary_components/.test(source),
      "seed.js must not truncate the reference components",
    );
    assert.ok(
      !/DELETE\s+FROM\s+salary_components/.test(source),
      "seed.js must not delete from the reference components",
    );
  });

  it("seed.js truncates exactly the account-scoped transactional tables", () => {
    // schema-seeded reference data (salary_components) and enum-like tables
    // (roles, leave_types) are excluded on purpose.
    assert.deepEqual(truncateList("seed.js"), [
      "password_reset_codes",
      "payroll_details",
      "payroll",
      "employee_salary_structure",
      "leave_applications",
      "leave_balance",
      "attendance",
      "employee_profiles",
      "users",
    ]);
  });

  it("production-seed.js keeps salary_components out of its truncate list", () => {
    const list = truncateList("production-seed.js");
    assert.ok(
      !list.includes("salary_components"),
      "the reference components must survive the production reset too",
    );
    // Same account-scoped set, asserted structurally rather than as one blob.
    for (const table of [
      "password_reset_codes",
      "payroll_details",
      "payroll",
      "employee_salary_structure",
      "leave_applications",
      "leave_balance",
      "attendance",
      "employee_profiles",
      "users",
    ]) {
      assert.ok(list.includes(table), `production reset must still clear ${table}`);
    }
  });

  it("schema.sql still seeds at least nine reference salary_components", () => {
    const source = readFileSync(
      new URL("../src/database/schema.sql", import.meta.url),
      "utf8",
    );
    const insert = source.match(
      /INSERT INTO salary_components[\s\S]*?ON DUPLICATE KEY UPDATE/,
    );
    assert.ok(insert, "schema.sql must seed the reference components");
    // Each reference row opens with a quoted component name: ('Basic Salary', ...
    const rows = insert[0].match(/\(\s*'/g) ?? [];
    assert.ok(
      rows.length >= 9,
      `expected at least 9 seeded components, found ${rows.length}`,
    );
  });
});
