import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { migrateAttendance } from "../migrate-attendance.js";
import { migrateSalaryComponents } from "../migrate-salary-components.js";
import { migrateUserSessions } from "../migrate-user-sessions.js";
import { migrateLeaveCancellation } from "../migrate-leave-cancellation.js";
import { migrateAuthThrottle } from "../migrate-auth-throttle.js";
import { migrateAdditionalFields } from "../migrate-additional-fields.js";
import { migrateResumeFields } from "../migrate-resume-fields.js";
import { migrateManagerField } from "../migrate-manager-field.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(__dirname, "..");

const SCHEMA_NAME = /^[A-Za-z0-9_]{1,64}$/;

// schema.sql and the migrations/ SQL files were written against the hard-coded
// workzen_hrms database. Setup targets an arbitrary (validated) schema, so those
// two statements are removed and the connection selects the target instead.
const stripSchemaBinding = (sql) =>
  sql
    .replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`?\w+`?[^;]*;/i, "")
    .replace(/^\s*USE\s+`?\w+`?\s*;?\s*$/im, "");

const sqlFile = (name) =>
  stripSchemaBinding(fs.readFileSync(path.join(databaseDir, name), "utf8"));

export const assertSafeSchemaName = (schema) => {
  if (!SCHEMA_NAME.test(schema)) {
    throw new Error(
      `Unsafe database name "${schema}". Use letters, digits and underscores only.`,
    );
  }
  return schema;
};

export const connectToServer = async (config = {}) =>
  mysql.createConnection({
    host: config.host ?? process.env.DB_HOST,
    port: config.port ?? process.env.DB_PORT,
    user: config.user ?? process.env.DB_USER,
    password: config.password ?? process.env.DB_PASSWORD,
    multipleStatements: true,
  });

export const createSchemaIfMissing = async (connection, schema) => {
  assertSafeSchemaName(schema);
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${schema}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  // An open connection keeps its own default schema, so point it at the target.
  await connection.query(`USE \`${schema}\``);
};

const assertDependencies = async (connection, schema, requires) => {
  if (requires.length === 0) return;
  const [found] = await connection.query(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)`,
    [schema, requires],
  );
  const present = new Set(found.map((row) => row.name));
  const missing = requires.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(
      `Migration dependencies are not satisfied; missing tables: ${missing.join(", ")}`,
    );
  }
};

// Ordered setup steps. Each step is idempotent: `run` returns a `detail` object
// describing whether work was actually performed, so a rerun reports no-ops
// instead of silently repeating destructive work. `requires` lists the tables a
// step depends on; the orchestrator verifies them before executing the step.
// Exported so the registration of a step can be tested without a database.
export const migrationSteps = [
  {
    id: "attendance-derived-columns-and-unique-date",
    title: "Attendance columns + one-row-per-day uniqueness",
    requires: ["attendance"],
    run: async (connection, schema) => {
      await migrateAttendance(connection, schema);
      return { detail: "columns and unique key ensured" };
    },
  },
  {
    id: "salary-component-calculation-type",
    title: "salary_components.calculation_type",
    requires: ["salary_components"],
    run: async (connection, schema) => {
      const { added } = await migrateSalaryComponents(connection, schema);
      return { detail: added ? "column added" : "already present" };
    },
  },
  {
    id: "user-sessions",
    title: "user_sessions (HIGH-3 session revocation)",
    // users.user_id is referenced, so it must run after schema.sql.
    requires: ["users"],
    run: async (connection, schema) => {
      const { created } = await migrateUserSessions(connection, schema);
      return { detail: created ? "table created" : "already present" };
    },
  },
  {
    id: "auth-throttle",
    title: "auth_throttle (login throttling counters and lockouts)",
    // No foreign key to `users` by design, so nothing here depends on schema.sql
    // having run; the step still runs after it because setup applies schema first.
    requires: [],
    run: async (connection, schema) => {
      const { created } = await migrateAuthThrottle(connection, schema);
      // "create issued" rather than "table created": two setup runs can both find
      // the table absent, and only one of them can win the conditional create.
      return { detail: created ? "create issued" : "already present" };
    },
  },
  {
    id: "leave-cancellation-trigger",
    title: "after_leave_approval (approve + cancel balance handling)",
    requires: ["leave_applications", "leave_types", "leave_balance"],
    run: async (connection, schema) => {
      await migrateLeaveCancellation(connection, schema);
      return { detail: "trigger reinstalled" };
    },
  },
  {
    // Profile/HR columns the application writes (Private Info, Salary Info,
    // Resume tabs). schema.sql does not define them; without these steps a
    // fresh database would 500 on the first profile update.
    id: "employee-profile-additional-fields",
    title: "employee_profiles private/salary info columns",
    requires: ["employee_profiles"],
    run: async (connection, schema) => {
      const { added } = await migrateAdditionalFields(connection);
      return { detail: added.length === 0 ? "already present" : `added: ${added.join(", ")}` };
    },
  },
  {
    id: "employee-profile-resume-fields",
    title: "employee_profiles resume columns (skills JSON init)",
    requires: ["employee_profiles"],
    run: async (connection, schema) => {
      const { added } = await migrateResumeFields(connection);
      return { detail: added.length === 0 ? "already present" : `added: ${added.join(", ")}` };
    },
  },
  {
    id: "employee-profile-manager-field",
    title: "employee_profiles.manager display field",
    requires: ["employee_profiles"],
    run: async (connection, schema) => {
      const { added } = await migrateManagerField(connection);
      return { detail: added ? "column added" : "already present" };
    },
  },
];

export const applySchema = async (connection) => {
  await connection.query(sqlFile("schema.sql"));
};

export const applyProcedures = async (connection) => {
  const proceduresPath = path.join(databaseDir, "procedures.sql");
  if (!fs.existsSync(proceduresPath)) return { skipped: true };
  await connection.query(sqlFile("procedures.sql"));
  return { skipped: false };
};

export const applyTriggers = async (connection) => {
  const triggersPath = path.join(databaseDir, "triggers.sql");
  if (!fs.existsSync(triggersPath)) return { skipped: true };
  await connection.query(sqlFile("triggers.sql"));
  return { skipped: false };
};

export const runMigrations = async (connection, schema, report = () => {}) => {
  const results = [];
  for (const step of migrationSteps) {
    await assertDependencies(connection, schema, step.requires);
    const started = Date.now();
    const { detail } = await step.run(connection, schema);
    const result = {
      id: step.id,
      title: step.title,
      detail,
      ms: Date.now() - started,
    };
    results.push(result);
    report(result);
  }
  return results;
};

// Confirms the target schema matches what the running application expects, so a
// fresh clone cannot come up "half migrated".
export const EXPECTED_TABLES = Object.freeze([
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
]);

const EXPECTED_TRIGGERS = Object.freeze([
  "after_leave_approval",
  "before_attendance_insert",
  "before_attendance_update",
]);

const EXPECTED_VIEWS = Object.freeze([
  "view_user_details",
  "view_monthly_attendance",
  "view_leave_summary",
]);

export const verifyEffectiveSchema = async (connection, schema) => {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  const [tables] = await connection.query(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
    [schema],
  );
  const tableSet = new Set(tables.map((t) => t.name));
  const missingTables = EXPECTED_TABLES.filter((t) => !tableSet.has(t));
  add(
    "tables",
    missingTables.length === 0,
    missingTables.length === 0
      ? `${EXPECTED_TABLES.length} required tables present`
      : `missing: ${missingTables.join(", ")}`,
  );

  const [attendanceColumns] = await connection.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance'`,
    [schema],
  );
  const attendanceColumnSet = new Set(attendanceColumns.map((c) => c.name));
  const missingAttendanceColumns = [
    "worked_minutes",
    "late_minutes",
    "early_checkout_minutes",
  ].filter((c) => !attendanceColumnSet.has(c));
  add(
    "attendance.derived-columns",
    missingAttendanceColumns.length === 0,
    missingAttendanceColumns.length === 0
      ? "worked/late/early_checkout present"
      : `missing: ${missingAttendanceColumns.join(", ")}`,
  );

  const [attendanceIndex] = await connection.query(
    `SELECT DISTINCT INDEX_NAME AS name FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance'
       AND INDEX_NAME = 'unique_user_attendance_date'`,
    [schema],
  );
  add(
    "attendance.unique_user_attendance_date",
    attendanceIndex.length === 1,
    attendanceIndex.length === 1 ? "present" : "missing",
  );

  const [calculationType] = await connection.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'salary_components'
       AND COLUMN_NAME = 'calculation_type'`,
    [schema],
  );
  add(
    "salary_components.calculation_type",
    calculationType.length === 1,
    calculationType.length === 1 ? "present" : "missing",
  );

  // Login reads auth_throttle before it authenticates, so a table that exists with
  // the wrong shape would make every attempt fail closed. Verify the counters, the
  // lockout column and the retention index, not just the table name.
  const [throttleColumnRows] = await connection.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_throttle'`,
    [schema],
  );
  const [throttleIndexRows] = await connection.query(
    `SELECT DISTINCT INDEX_NAME AS name FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_throttle'`,
    [schema],
  );
  const throttleColumns = new Set(throttleColumnRows.map((row) => row.name));
  const throttleIndexes = new Set(throttleIndexRows.map((row) => row.name));
  const missingThrottleColumns = [
    "bucket",
    "window_start",
    "attempts",
    "locked_until",
    "last_attempt_at",
  ].filter((name) => !throttleColumns.has(name));
  const missingThrottleIndexes = ["PRIMARY", "idx_last_attempt", "idx_locked_until"].filter(
    (name) => !throttleIndexes.has(name),
  );
  const throttleShapeOk =
    missingThrottleColumns.length === 0 && missingThrottleIndexes.length === 0;
  add(
    "auth_throttle.counters-and-retention",
    throttleShapeOk,
    throttleShapeOk
      ? "two-counter buckets, durable lockout and retention index present"
      : `missing columns: ${missingThrottleColumns.join(", ") || "none"}; ` +
        `missing indexes: ${missingThrottleIndexes.join(", ") || "none"}; ` +
        "reconcile the table against schema.sql section 15 (migrate:auth-throttle " +
        "no-ops while the table exists)",
  );

  const [triggers] = await connection.query(
    `SELECT TRIGGER_NAME AS name, ACTION_STATEMENT AS body
     FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ?`,
    [schema],
  );
  const triggerMap = new Map(triggers.map((t) => [t.name, t.body]));
  const missingTriggers = EXPECTED_TRIGGERS.filter((t) => !triggerMap.has(t));
  add(
    "triggers",
    missingTriggers.length === 0,
    missingTriggers.length === 0
      ? `${EXPECTED_TRIGGERS.length} triggers present`
      : `missing: ${missingTriggers.join(", ")}`,
  );

  const cancelBranchHandled = (triggerMap.get("after_leave_approval") || "").includes(
    "'Cancelled'",
  );
  add(
    "trigger.after_leave_approval.restores-on-cancel",
    cancelBranchHandled,
    cancelBranchHandled
      ? "Cancelled restores paid balance"
      : "stale trigger: no Cancelled branch; run migrate:leave-cancellation",
  );

  const [views] = await connection.query(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = ?`,
    [schema],
  );
  const viewSet = new Set(views.map((v) => v.name));
  const missingViews = EXPECTED_VIEWS.filter((v) => !viewSet.has(v));
  add(
    "views",
    missingViews.length === 0,
    missingViews.length === 0
      ? `${EXPECTED_VIEWS.length} views present`
      : `missing: ${missingViews.join(", ")}`,
  );

  const referenceCounts = {};
  for (const [table, expected] of [
    ["roles", 4],
    ["leave_types", 6],
    ["salary_components", 9],
  ]) {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS total FROM \`${schema}\`.\`${table}\``,
    );
    referenceCounts[table] = row.total;
    add(
      `reference.${table}`,
      row.total >= expected,
      `${row.total} rows (expected >= ${expected})`,
    );
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
    referenceCounts,
    tableCount: tableSet.size,
  };
};

// Full fresh-clone initialization: database -> tables/seeded reference data ->
// procedures -> triggers -> ordered migrations -> schema verification.
export const initializeTargetSchema = async (connection, schema, report = () => {}) => {
  assertSafeSchemaName(schema);
  await createSchemaIfMissing(connection, schema);

  report({ step: "schema.sql", detail: "tables, views, reference data" });
  await applySchema(connection);

  const procedures = await applyProcedures(connection);
  report({
    step: "procedures.sql",
    detail: procedures.skipped ? "file absent; skipped" : "stored procedures applied",
  });

  const triggers = await applyTriggers(connection);
  report({
    step: "triggers.sql",
    detail: triggers.skipped ? "file absent; skipped" : "triggers applied",
  });

  const migrations = await runMigrations(connection, schema, report);
  const verification = await verifyEffectiveSchema(connection, schema);

  return { migrations, verification };
};

// True when the target already contains the core application tables, so setup can
// avoid blindly reseeding an existing development database.
export const schemaIsInitialized = async (connection, schema) => {
  const [tables] = await connection.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('users','employee_profiles','payroll','attendance')`,
    [schema],
  );
  return tables[0].total >= 4;
};
