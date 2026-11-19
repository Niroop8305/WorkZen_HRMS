import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import mysql from "mysql2/promise";

// Login-throttling Step 1 suite: the `auth_throttle` schema foundation.
//
// It proves three things without touching a database:
//
//   1. the DDL in schema.sql and the DDL in migrate-auth-throttle.js converge on
//      the same table, so a fresh clone and an older migrated database cannot end
//      up with different throttle shapes;
//   2. the migration is additive: it reads INFORMATION_SCHEMA first, issues at
//      most one CREATE TABLE, never ALTERs/DROPs/TRUNCATEs, reports
//      `created: false` when the table is already there, and emits that CREATE
//      conditionally so a second process that also observed absence is a no-op
//      rather than error 1050;
//   3. the fresh-clone setup path registers the step and `verifyEffectiveSchema`
//      fails loudly when the table or one of its counter/lockout/retention
//      members is missing, which is what stops a new installation from coming up
//      with a login path that would fail closed.
//
// LIMITATION, stated because it is easy to over-read: everything here runs against
// doubles. A double proves what SQL the code emits, never what InnoDB does with
// it, so no case in this file is evidence about concurrent counter writes, gap
// locks or deadlocks. `npm run test:throttle:concurrency` is the measurement suite
// for that, and it refuses to run until an isolated scratch schema is approved.
//
// The driver entry points are replaced with tripwires before the modules under
// test are imported, so a regression that turns this suite into a live connection
// fails loudly instead of reaching workzen_hrms.

const connectionAttempts = [];
const realCreateConnection = mysql.createConnection;
const realCreatePool = mysql.createPool;

const tripwire = (label) => (...args) => {
  connectionAttempts.push(label);
  throw new Error(`Database access is forbidden in the schema foundation suite (${label})`);
};

mysql.createConnection = tripwire("mysql.createConnection");
mysql.createPool = tripwire("mysql.createPool");

const schemaSetup = await import("../src/database/setup/schemaSetup.js");
const { migrateAuthThrottle } = await import("../src/database/migrate-auth-throttle.js");

const databaseDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/database");
const schemaSql = fs.readFileSync(path.join(databaseDir, "schema.sql"), "utf8");
const migrationSql = fs.readFileSync(
  path.join(databaseDir, "migrate-auth-throttle.js"),
  "utf8",
);

const THROTTLE_COLUMNS = [
  "bucket",
  "window_start",
  "attempts",
  "locked_until",
  "last_attempt_at",
];
const THROTTLE_INDEXES = ["PRIMARY", "idx_last_attempt", "idx_locked_until"];

// Pull the auth_throttle CREATE TABLE out of each file: its guard clause, its
// body (normalised for whitespace and trailing commas) and its engine trailer, so
// the comparison is about the definition and not about indentation.
const CREATE_PATTERN =
  /CREATE TABLE (IF NOT EXISTS\s+)?auth_throttle \(([\s\S]*?)\)\s*(ENGINE[^;`]*)(?:;|`)/i;

const throttleDefinitions = (source) => {
  const match = CREATE_PATTERN.exec(source);
  assert.ok(match, "the auth_throttle CREATE TABLE statement was not found");
  const [, guard, body, trailer] = match;
  const lines = body
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim().replace(/,+$/, ""))
    .filter(Boolean);
  return { guard: (guard || "").trim(), lines, trailer: trailer.replace(/\s+/g, " ").trim() };
};

const fromSchemaFile = throttleDefinitions(schemaSql);
const fromMigrationFile = throttleDefinitions(migrationSql);

// A connection double that only answers the two statements the migration issues.
const migrationDouble = ({ tableExists }) => {
  const queries = [];
  return {
    queries,
    query: async (sql) => {
      queries.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("INFORMATION_SCHEMA.TABLES")) {
        return [tableExists ? [{ TABLE_NAME: "auth_throttle" }] : []];
      }
      if (/^\s*CREATE TABLE/i.test(sql)) return [{ affectedRows: 0 }];
      throw new Error(`The migration issued unexpected SQL: ${sql}`);
    },
  };
};

const wellFormedSchema = () => ({
  tables: [
    "roles",
    "users",
    "employee_profiles",
    "attendance",
    "leave_types",
    "leave_balance",
    "leave_applications",
    "salary_components",
    "employee_salary_structure",
    "payroll",
    "payroll_details",
    "audit_logs",
    "password_reset_codes",
    "user_sessions",
    "auth_throttle",
  ],
  attendanceColumns: ["worked_minutes", "late_minutes", "early_checkout_minutes"],
  attendanceIndexes: ["unique_user_attendance_date"],
  salaryColumns: ["calculation_type"],
  throttleColumns: [...THROTTLE_COLUMNS],
  throttleIndexes: [...THROTTLE_INDEXES],
  triggers: [
    { name: "after_leave_approval", body: "IF NEW.status = 'Cancelled' THEN UPDATE leave_balance SET " },
    { name: "before_attendance_insert", body: "SIGNAL" },
    { name: "before_attendance_update", body: "SIGNAL" },
  ],
  views: ["view_user_details", "view_monthly_attendance", "view_leave_summary"],
  referenceRows: 99,
});

// Answers the fixed INFORMATION_SCHEMA probes that verifyEffectiveSchema runs from
// an in-memory description of the target, so the verification logic is exercised
// without a server.
const verifierDouble = (state) => ({
  query: async (sql) => {
    const oneLine = sql.replace(/\s+/g, " ");

    if (oneLine.includes("INFORMATION_SCHEMA.TABLES")) {
      return [state.tables.map((name) => ({ name }))];
    }

    if (oneLine.includes("INFORMATION_SCHEMA.COLUMNS")) {
      const table = /TABLE_NAME = '(\w+)'/.exec(oneLine)[1];
      const key = {
        attendance: "attendanceColumns",
        salary_components: "salaryColumns",
        auth_throttle: "throttleColumns",
      }[table];
      assert.ok(key, `unexpected COLUMNS probe for ${table}`);
      let names = state[key];
      const single = /AND COLUMN_NAME = '(\w+)'/.exec(oneLine);
      if (single) names = names.filter((name) => name === single[1]);
      return [names.map((name) => ({ name }))];
    }

    if (oneLine.includes("INFORMATION_SCHEMA.STATISTICS")) {
      const table = /TABLE_NAME = '(\w+)'/.exec(oneLine)[1];
      const key = table === "attendance" ? "attendanceIndexes" : "throttleIndexes";
      let names = state[key];
      const single = /AND INDEX_NAME = '(\w+)'/.exec(oneLine);
      if (single) names = names.filter((name) => name === single[1]);
      return [names.map((name) => ({ name }))];
    }

    if (oneLine.includes("INFORMATION_SCHEMA.TRIGGERS")) {
      return [state.triggers.map(({ name, body }) => ({ name, body }))];
    }

    if (oneLine.includes("INFORMATION_SCHEMA.VIEWS")) {
      return [state.views.map((name) => ({ name }))];
    }

    if (oneLine.includes("COUNT(*)")) return [[{ total: state.referenceRows }]];

    throw new Error(`The verifier issued unexpected SQL: ${oneLine}`);
  },
});

const findCheck = (verification, name) => {
  const check = verification.checks.find((entry) => entry.name === name);
  assert.ok(check, `verifyEffectiveSchema reported ${name}`);
  return check;
};

const verify = (state) =>
  schemaSetup.verifyEffectiveSchema(verifierDouble(state), "any_schema");

describe("auth_throttle schema definition", () => {
  it("is a base-schema table with two-counter columns, a durable lockout and retention", () => {
    assert.deepEqual(
      fromSchemaFile.lines,
      [
        "bucket VARBINARY(96) NOT NULL",
        "window_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "attempts INT UNSIGNED NOT NULL DEFAULT 0",
        "locked_until TIMESTAMP NULL DEFAULT NULL",
        "last_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "PRIMARY KEY (bucket)",
        "INDEX idx_last_attempt (last_attempt_at)",
        "INDEX idx_locked_until (locked_until)",
      ],
      `unexpected definition: ${JSON.stringify(fromSchemaFile.lines)}`,
    );
    assert.match(fromSchemaFile.trailer, /ENGINE=InnoDB/i, "InnoDB, because the counters update in place");
    assert.match(fromSchemaFile.trailer, /COLLATE=utf8mb4_bin/i, "bytewise bucket ordering, not collation-collapsed");
    assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS auth_throttle/i, "reapplying schema.sql is a no-op");
    assert.equal(
      fromSchemaFile.lines.some((line) => /FOREIGN KEY/i.test(line)),
      false,
      "no foreign key: a throttle row must never lock a user row",
    );
  });

  it("converges with the migration DDL, guard clause included, so fresh and upgraded databases match", () => {
    assert.equal(
      fromSchemaFile.guard,
      "IF NOT EXISTS",
      "schema.sql must stay re-appliable, so a setup rerun cannot fail on its own table",
    );
    assert.equal(
      fromMigrationFile.guard,
      fromSchemaFile.guard,
      "the migration must be no less re-appliable than the base schema it mirrors",
    );
    assert.deepEqual(
      fromMigrationFile.lines,
      fromSchemaFile.lines,
      "migrate-auth-throttle.js must create exactly the table schema.sql creates",
    );
    assert.equal(fromMigrationFile.trailer, fromSchemaFile.trailer);
  });

  it("keeps the approved policy expressible: one durable row per bucket, no sequence growth", () => {
    const joined = fromSchemaFile.lines.join(" ");
    assert.match(joined, /attempts INT UNSIGNED NOT NULL DEFAULT 0/, "a counter that cannot go negative, so nothing can refund it");
    assert.match(joined, /window_start/, "the fixed window the model resets");
    assert.match(joined, /locked_until/, "the lockout survives a restart because it is stored");
    assert.match(joined, /last_attempt_at/, "the idle marker the retention sweep reads");

    const primaryKey = fromSchemaFile.lines.filter((line) => /^PRIMARY KEY/.test(line));
    assert.deepEqual(
      primaryKey,
      ["PRIMARY KEY (bucket)"],
      "one row per bucket, so arbitrary emails cannot create unbounded rows of PII",
    );
    assert.ok(
      !fromSchemaFile.lines.some((line) => /AUTO_INCREMENT/i.test(line)),
      "no ever-growing sequence: the table stays bounded by the retention sweep",
    );
  });
});

describe("auth_throttle migration idempotency", () => {
  it("creates nothing and reports no change when the table already exists", async () => {
    const connection = migrationDouble({ tableExists: true });
    const result = await migrateAuthThrottle(connection, "any_schema");

    assert.deepEqual(result, { created: false });
    assert.equal(connection.queries.length, 1, "only the existence probe ran");
    assert.match(connection.queries[0], /INFORMATION_SCHEMA\.TABLES/);
    assert.match(connection.queries[0], /TABLE_SCHEMA = \?/, "the target schema is bound, not interpolated");
    assert.ok(
      !connection.queries.some((sql) => /CREATE|ALTER|DROP|TRUNCATE|DELETE|UPDATE/i.test(sql)),
      "a rerun mutates nothing",
    );
  });

  it("issues one additive CREATE TABLE for the bound schema when it is missing", async () => {
    const connection = migrationDouble({ tableExists: false });
    const result = await migrateAuthThrottle(connection, "any_schema");

    assert.deepEqual(result, { created: true });
    assert.equal(connection.queries.length, 2);
    const create = connection.queries[1];
    assert.match(create, /^CREATE TABLE IF NOT EXISTS auth_throttle /);
    for (const fragment of [
      "bucket VARBINARY(96) NOT NULL",
      "PRIMARY KEY (bucket)",
      "idx_last_attempt",
      "idx_locked_until",
      "ENGINE=InnoDB",
      "COLLATE=utf8mb4_bin",
    ]) {
      assert.ok(create.includes(fragment), `CREATE is missing "${fragment}"`);
    }
    assert.ok(
      !connection.queries.some((sql) => /DROP|TRUNCATE|DELETE|ALTER/i.test(sql)),
      "the migration is additive only",
    );
  });

  it("creates once when run twice sequentially - which is not yet a statement about concurrency", async () => {
    const state = { tableExists: false };
    const first = await migrateAuthThrottle(
      {
        query: async (sql) => {
          if (sql.includes("INFORMATION_SCHEMA.TABLES")) {
            return [state.tableExists ? [{ TABLE_NAME: "auth_throttle" }] : []];
          }
          state.tableExists = true;
          return [{}];
        },
      },
      "any_schema",
    );
    const second = await migrateAuthThrottle(
      {
        query: async (sql) => {
          if (sql.includes("INFORMATION_SCHEMA.TABLES")) {
            return [state.tableExists ? [{ TABLE_NAME: "auth_throttle" }] : []];
          }
          throw new Error(`a rerun tried to create again: ${sql}`);
        },
      },
      "any_schema",
    );

    assert.deepEqual(first, { created: true });
    assert.deepEqual(second, { created: false });
    assert.equal(state.tableExists, true);
  });

  // Two setup runs (or a setup racing `npm run migrate:auth-throttle`) can both
  // answer the existence probe with "absent" before either reaches the DDL, so the
  // probe cannot be the guard. This case models MySQL's documented conditional-
  // create contract: a CREATE that carries IF NOT EXISTS is a no-op for the loser,
  // and an unconditional CREATE raises error 1050 and aborts the whole setup. The
  // double therefore throws 1050 for any statement that lost the guard, so the
  // regression surfaces as the real symptom. Measuring the server's actual behavior
  // is the gated suite's job, not this file's.
  it("cannot turn a concurrent observation of absence into a failed setup", async () => {
    const server = { tableExists: false };
    const racingConnection = () => {
      const queries = [];
      return {
        queries,
        query: async (sql) => {
          const oneLine = sql.replace(/\s+/g, " ").trim();
          queries.push(oneLine);
          if (oneLine.includes("INFORMATION_SCHEMA.TABLES")) {
            // Frozen "absent" answer: both callers observe the same empty state.
            return [[]];
          }
          if (/^CREATE TABLE IF NOT EXISTS auth_throttle /.test(oneLine)) {
            server.tableExists = true;
            return [{}];
          }
          throw Object.assign(new Error("Table 'auth_throttle' already exists"), {
            code: "ER_TABLE_EXISTS_ERROR",
            errno: 1050,
          });
        },
      };
    };

    const first = racingConnection();
    const second = racingConnection();
    const outcomes = await Promise.allSettled([
      migrateAuthThrottle(first, "any_schema"),
      migrateAuthThrottle(second, "any_schema"),
    ]);

    for (const outcome of outcomes) {
      assert.equal(
        outcome.status,
        "fulfilled",
        `a racing migration must not reject: ${outcome.reason?.message}`,
      );
    }
    assert.equal(server.tableExists, true, "the table ends up present");
    // Documented semantics: `created` means "this run found the table absent and
    // emitted the creating DDL", so both runs may report it. Nothing may read the
    // flag as proof of winning the create.
    assert.deepEqual(
      outcomes.map((outcome) => outcome.value),
      [{ created: true }, { created: true }],
    );
    for (const connection of [first, second]) {
      assert.equal(connection.queries.length, 2, "one probe plus one DDL per run");
      assert.match(
        connection.queries[1],
        /^CREATE TABLE IF NOT EXISTS auth_throttle /,
        "the emitted DDL must be conditional",
      );
    }
  });
});

describe("fresh-clone setup wiring", () => {
  it("registers the auth-throttle step with no dependency gate", () => {
    const ids = schemaSetup.migrationSteps.map((step) => step.id);
    assert.ok(ids.includes("auth-throttle"), `auth-throttle is in the setup steps: ${ids.join(", ")}`);

    const step = schemaSetup.migrationSteps.find((entry) => entry.id === "auth-throttle");
    assert.deepEqual(step.requires, [], "auth_throttle has no foreign key, so nothing gates it");
    assert.match(step.title, /auth_throttle/);
  });

  it("reports what the step did, and never claims it won the create", async () => {
    const step = schemaSetup.migrationSteps.find((entry) => entry.id === "auth-throttle");

    const created = await step.run(migrationDouble({ tableExists: false }), "any_schema");
    assert.deepEqual(
      created,
      { detail: "create issued" },
      "a conditional DDL is emitted, so the honest wording is that the create was issued",
    );

    const present = await step.run(migrationDouble({ tableExists: true }), "any_schema");
    assert.deepEqual(present, { detail: "already present" });
  });

  it("expects the table in the post-setup verification list", () => {
    assert.ok(
      schemaSetup.EXPECTED_TABLES.includes("auth_throttle"),
      `EXPECTED_TABLES must list it: ${schemaSetup.EXPECTED_TABLES.join(", ")}`,
    );
  });
});

describe("effective schema verification", () => {
  it("passes a complete schema including the throttle table", async () => {
    const verification = await verify(wellFormedSchema());

    assert.equal(
      verification.ok,
      true,
      `unexpected failures: ${JSON.stringify(verification.checks.filter((c) => !c.ok))}`,
    );
    assert.equal(findCheck(verification, "auth_throttle.counters-and-retention").ok, true);
  });

  it("fails loudly when a fresh clone is missing the throttle table", async () => {
    const state = wellFormedSchema();
    state.tables = state.tables.filter((name) => name !== "auth_throttle");
    state.throttleColumns = [];
    state.throttleIndexes = [];

    const verification = await verify(state);
    assert.equal(verification.ok, false, "a missing throttle table is not a passing setup");
    assert.match(findCheck(verification, "tables").detail, /auth_throttle/);

    const throttle = findCheck(verification, "auth_throttle.counters-and-retention");
    assert.equal(throttle.ok, false);
    for (const column of THROTTLE_COLUMNS) {
      assert.match(throttle.detail, new RegExp(column), `detail names the missing ${column}`);
    }
  });

  it("fails when the table exists with a stale shape", async () => {
    const missingLockout = wellFormedSchema();
    missingLockout.throttleColumns = missingLockout.throttleColumns.filter(
      (name) => name !== "locked_until",
    );
    const lockout = findCheck(
      await verify(missingLockout),
      "auth_throttle.counters-and-retention",
    );
    assert.equal(lockout.ok, false);
    assert.match(lockout.detail, /locked_until/);

    const missingIndex = wellFormedSchema();
    missingIndex.throttleIndexes = missingIndex.throttleIndexes.filter(
      (name) => name !== "idx_last_attempt",
    );
    const sweep = findCheck(
      await verify(missingIndex),
      "auth_throttle.counters-and-retention",
    );
    assert.equal(sweep.ok, false, "an unindexed retention column would make the sweep a table scan");
    assert.match(sweep.detail, /idx_last_attempt/);

    const counters = wellFormedSchema();
    counters.throttleColumns = counters.throttleColumns.filter((name) => name !== "attempts");
    assert.equal(
      findCheck(
        await verify(counters),
        "auth_throttle.counters-and-retention",
      ).ok,
      false,
    );
  });
});

after(() => {
  mysql.createConnection = realCreateConnection;
  mysql.createPool = realCreatePool;
  assert.deepEqual(
    connectionAttempts,
    [],
    "no connection or pool was created: this suite never reaches a database",
  );
});
