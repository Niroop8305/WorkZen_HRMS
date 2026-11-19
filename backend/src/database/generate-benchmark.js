import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { getBusinessNow } from "../config/attendance.js";
import {
  assertSafeSchemaName,
  connectToServer,
  schemaIsInitialized,
} from "./setup/schemaSetup.js";
import {
  coveredMonths,
  createRandom,
  monthRangeLabel,
  planEmployee,
  planSalaryComponents,
  syntheticEmail,
} from "./benchmark/plan.js";

dotenv.config();

// =====================================================
// Configuration
// =====================================================

const DEFAULTS = Object.freeze({
  seed: 20261001,
  employees: 1000,
  months: 10,
  seniorCount: 150,
  seniorExtraMonths: 1,
  leaveApplications: 12300,
  chunkSize: 500,
});

const SYNTHETIC_PASSWORD = "Benchmark@123";
const SYNTHETIC_EMAIL_SUFFIX = "@workzen.test";
// Kept far from the synthetic index range so demo coverage never collides with a
// benchmark employee's deterministic generator stream.
const DEMO_COVERAGE_INDEX = 9001;

export const parseArgs = (argv = process.argv.slice(2)) => {
  const options = {
    ...DEFAULTS,
    dryRun: false,
    forceReseed: false,
    yes: false,
    coverDemoEmployee: true,
  };
  for (const arg of argv) {
    const match = arg.match(/^--([a-z0-9-]+)(?:=(.*))?$/i);
    if (!match) throw new Error(`Unrecognised argument: ${arg}`);
    const [, key, rawValue] = match;
    const value = rawValue === undefined ? true : rawValue;
    switch (key) {
      case "database":
        options.database = String(value);
        break;
      case "seed":
      case "employees":
      case "months":
      case "senior-count":
      case "senior-extra-months":
      case "leave-applications":
      case "chunk-size":
      case "progress":
        options[
          {
            "senior-count": "seniorCount",
            "senior-extra-months": "seniorExtraMonths",
            "leave-applications": "leaveApplications",
            "chunk-size": "chunkSize",
          }[key] || key
        ] = Number(value);
        break;
      case "end-period":
        options.endPeriod = String(value);
        break;
      case "dry-run":
        options.dryRun = true;
        break;
      case "force-reseed-benchmark":
        options.forceReseed = true;
        break;
      case "yes":
        options.yes = true;
        break;
      case "skip-demo-coverage":
        options.coverDemoEmployee = false;
        break;
      default:
        throw new Error(`Unrecognised option: --${key}`);
    }
  }

  options.database = assertSafeSchemaName(
    options.database || process.env.DB_NAME || "workzen_hrms",
  );
  for (const [name, minimum] of [
    ["employees", 1],
    ["months", 1],
    ["seniorCount", 0],
    ["seniorExtraMonths", 0],
    ["leaveApplications", 0],
    ["chunkSize", 1],
  ]) {
    if (!Number.isInteger(options[name]) || options[name] < minimum) {
      throw new Error(`--${name} must be an integer >= ${minimum}`);
    }
  }
  // Small sizing runs (--employees=5 for a smoke test) must not fail just because
  // the default senior cohort is larger than the employee count.
  options.seniorCount = Math.min(options.seniorCount, options.employees);
  if (options.leaveApplications > options.employees * 40) {
    throw new Error(
      `--leave-applications=${options.leaveApplications} cannot fit ${options.employees} employee calendars`,
    );
  }
  if (options.progress && !Number.isInteger(options.progress)) options.progress = 25;
  options.progress = options.progress || 25;
  return options;
};

// The last complete calendar month, evaluated in the configured business
// timezone so the dataset covers payroll periods that can actually be closed.
const defaultEndPeriod = (businessDate) => {
  const [year, month] = businessDate.split("-").map(Number);
  return month === 1 ? { endYear: year - 1, endMonth: 12 } : { endYear: year, endMonth: month - 1 };
};

export const resolvePeriod = (options, businessDate) => {
  if (!options.endPeriod) return defaultEndPeriod(businessDate);
  const match = options.endPeriod.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error("--end-period must use YYYY-MM format");
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("--end-period month must be 01-12");
  return { endYear: Number(match[1]), endMonth: month };
};

export const leaveTargetForEmployee = (index, options) => {
  const base = Math.floor(options.leaveApplications / options.employees);
  const remainder = options.leaveApplications % options.employees;
  return base + (index <= remainder ? 1 : 0);
};

export const monthsForEmployee = (index, options, period) =>
  coveredMonths({
    endYear: period.endYear,
    endMonth: period.endMonth,
    months:
      options.months +
      (index <= options.seniorCount ? options.seniorExtraMonths : 0),
  });

// Employee streams must not shift when the employee count changes, so each
// employee derives its own deterministic generator from the run seed.
export const rngForEmployee = (seed, index) =>
  createRandom((Number(seed) + index * 7919) >>> 0);

const pad2 = (n) => String(n).padStart(2, "0");

const chunk = (rows, size) => {
  const parts = [];
  for (let i = 0; i < rows.length; i += size) parts.push(rows.slice(i, i + size));
  return parts;
};

// =====================================================
// Planning only (also used by --dry-run)
// =====================================================

export const buildPlanSummary = (options, reference) => {
  const rows = {
    employees: 0,
    attendance: 0,
    leaveApplications: 0,
    payroll: 0,
    payrollDetails: 0,
    leaveBalances: 0,
    statusCounts: {},
    minimumNetSalary: Number.POSITIVE_INFINITY,
    maximumGrossSalary: 0,
  };

  for (let index = 1; index <= options.employees; index += 1) {
    const rng = rngForEmployee(options.seed, index);
    const months = monthsForEmployee(index, options, reference.period);
    const components = planSalaryComponents({
      rng,
      componentsByName: reference.componentsByName,
      ...reference.componentIds,
    });
    const plan = planEmployee({
      index,
      rng,
      leaveTypes: reference.leaveTypes,
      components,
      months,
      leaveTarget: leaveTargetForEmployee(index, options),
    });

    for (const payroll of plan.payroll) {
      if (payroll.result.netSalary < 0) {
        throw new Error(
          `Generated payroll ${payroll.year}-${payroll.month} for ${plan.identity.email} ` +
            "would produce a negative net salary",
        );
      }
      rows.minimumNetSalary = Math.min(rows.minimumNetSalary, payroll.result.netSalary);
      rows.maximumGrossSalary = Math.max(rows.maximumGrossSalary, payroll.result.grossSalary);
    }
    if (plan.applications.length !== leaveTargetForEmployee(index, options)) {
      throw new Error(
        `Leave planner produced ${plan.applications.length} applications for ` +
          `${plan.identity.email}, expected ${leaveTargetForEmployee(index, options)}; ` +
          "the period or balance configuration cannot hold the requested volume",
      );
    }

    rows.employees += 1;
    rows.attendance += plan.attendanceRows.length;
    rows.leaveApplications += plan.applications.length;
    rows.payroll += plan.payroll.length;
    rows.payrollDetails += plan.payroll.length * components.length;
    rows.leaveBalances +=
      reference.leaveTypes.length *
      new Set(plan.payroll.map((payroll) => payroll.year)).size;
    for (const app of plan.applications) {
      rows.statusCounts[app.status] = (rows.statusCounts[app.status] || 0) + 1;
    }
  }

  rows.minimumNetSalary = Number.isFinite(rows.minimumNetSalary)
    ? rows.minimumNetSalary
    : 0;
  return rows;
};

// =====================================================
// Writing
// =====================================================

export const loadReferenceData = async (connection, options, { readOnly = false } = {}) => {
  const [leaveTypes] = await connection.query(
    `SELECT leave_type_id, leave_type_name, default_days_per_year, is_paid, requires_approval
     FROM leave_types ORDER BY leave_type_id`,
  );
  if (leaveTypes.length === 0) {
    throw new Error("leave_types is empty; run npm run setup:demo first");
  }

  const componentNames = ["Basic Salary", "House Rent Allowance", "Provident Fund"];
  const [components] = await connection.query(
    `SELECT component_id, component_name, component_type, calculation_type, is_taxable
     FROM salary_components WHERE component_name IN (?) AND is_active = TRUE`,
    [componentNames],
  );
  const componentsByName = new Map(components.map((c) => [c.component_name, c]));
  for (const name of componentNames) {
    if (!componentsByName.has(name)) {
      throw new Error(`Required salary component missing from schema: ${name}`);
    }
  }

  // HRA is generated as a percentage component, so the component definition must
  // agree: otherwise re-running the live payroll engine for the same period would
  // resolve a different amount than the stored snapshot.
  const hra = componentsByName.get("House Rent Allowance");
  const hraNeedsPercentage = hra.calculation_type !== "PERCENTAGE";
  if (hraNeedsPercentage && !readOnly) {
    await connection.query(
      `UPDATE salary_components SET calculation_type = 'PERCENTAGE' WHERE component_id = ?`,
      [hra.component_id],
    );
  }

  const [roleRows] = await connection.query(
    "SELECT role_id, role_name FROM roles WHERE role_name IN ('Employee','HR Officer','Admin','Payroll Officer')",
  );
  const roleIdByName = new Map(roleRows.map((r) => [r.role_name, r.role_id]));
  for (const role of ["Employee", "HR Officer", "Payroll Officer"]) {
    if (!roleIdByName.has(role)) throw new Error(`Role missing in schema: ${role}`);
  }

  const [approvers] = await connection.query(
    `SELECT u.user_id FROM users u INNER JOIN roles r ON u.role_id = r.role_id
     WHERE r.role_name IN ('HR Officer','Admin') AND u.is_active = TRUE
     ORDER BY FIELD(r.role_name, 'HR Officer', 'Admin'), u.user_id LIMIT 1`,
  );
  const [generators] = await connection.query(
    `SELECT u.user_id FROM users u INNER JOIN roles r ON u.role_id = r.role_id
     WHERE r.role_name IN ('Payroll Officer','Admin') AND u.is_active = TRUE
     ORDER BY FIELD(r.role_name, 'Payroll Officer', 'Admin'), u.user_id LIMIT 1`,
  );
  if (approvers.length === 0 || generators.length === 0) {
    throw new Error(
      "No HR/Admin approver or Payroll officer user found; seed demo users first",
    );
  }

  return {
    leaveTypes,
    componentsByName,
    componentIds: {
      basicComponentId: componentsByName.get("Basic Salary").component_id,
      hraComponentId: componentsByName.get("House Rent Allowance").component_id,
      pfComponentId: componentsByName.get("Provident Fund").component_id,
    },
    employeeRoleId: roleIdByName.get("Employee"),
    approverId: approvers[0].user_id,
    generatorId: generators[0].user_id,
    percentageComponentPending: hraNeedsPercentage,
  };
};

// Resume support: generator-owned emails are identified by the reserved
// @workzen.test domain, so a rerun skips finished employees and never touches
// demo or manually created records.
const loadExistingBenchmark = async (connection) => {
  const [users] = await connection.query(
    `SELECT user_id, email FROM users WHERE email LIKE ?`,
    [`%${SYNTHETIC_EMAIL_SUFFIX}`],
  );
  const [payrollUsers] = await connection.query(
    `SELECT DISTINCT p.user_id FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
     WHERE u.email LIKE ?`,
    [`%${SYNTHETIC_EMAIL_SUFFIX}`],
  );
  const withPayroll = new Set(payrollUsers.map((row) => row.user_id));
  const emails = new Set();
  const incomplete = [];
  for (const user of users) {
    emails.add(user.email);
    if (!withPayroll.has(user.user_id)) incomplete.push(user.email);
  }
  return { emails, incomplete };
};

const deleteBenchmarkEmployees = async (connection) => {
  // Only generator-owned rows (@workzen.test) are removed. Demo accounts,
  // manually created employees and audit history are never touched; the cascade
  // from users handles profiles, balances, leave, attendance and payroll.
  const [rows] = await connection.query(
    `SELECT user_id FROM users WHERE email LIKE ?`,
    [`%${SYNTHETIC_EMAIL_SUFFIX}`],
  );
  if (rows.length === 0) return 0;
  await connection.query(`DELETE FROM users WHERE email LIKE ?`, [
    `%${SYNTHETIC_EMAIL_SUFFIX}`,
  ]);
  return rows.length;
};

const insertBalancesAndStructures = async (connection, userId, plan, components, context) => {
  const { identity, payroll } = plan;

  const years = [...new Set(payroll.map((p) => p.year))].sort();
  const balances = [];
  for (const year of years) {
    for (const type of context.leaveTypes) {
      balances.push([userId, type.leave_type_id, year, type.default_days_per_year, 0, type.default_days_per_year]);
    }
  }
  const balancePlaceholders = balances.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
  await connection.query(
    `INSERT IGNORE INTO leave_balance
      (user_id, leave_type_id, year, total_allocated, used_days, remaining_days)
     VALUES ${balancePlaceholders}`,
    balances.flat(),
  );

  const structureRows = components.map((component) => [
    userId,
    component.component_id,
    component.amount,
    plan.structureEffectiveFrom || identity.date_of_joining,
    null,
    true,
  ]);
  await connection.query(
    `INSERT INTO employee_salary_structure
      (user_id, component_id, amount, effective_from, effective_to, is_active)
     VALUES ${structureRows.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
    structureRows.flat(),
  );
};

const insertEmployee = async (connection, plan, components, context, passwordHash) => {
  const { identity } = plan;

  const [userResult] = await connection.query(
    `INSERT INTO users (role_id, email, password_hash, is_active) VALUES (?, ?, ?, TRUE)`,
    [context.employeeRoleId, identity.email, passwordHash],
  );
  const userId = userResult.insertId;

  await connection.query(
    `INSERT INTO employee_profiles
      (user_id, employee_code, company_name, first_name, last_name, phone,
       date_of_birth, gender, address, city, state, country, postal_code,
       emergency_contact_name, emergency_contact_phone, date_of_joining,
       department, designation)
     VALUES (?, ?, 'WorkZen Technologies', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      identity.employee_code,
      identity.first_name,
      identity.last_name,
      identity.phone,
      identity.date_of_birth,
      identity.gender,
      identity.address,
      identity.city,
      identity.state,
      identity.country,
      identity.postal_code,
      identity.emergency_contact_name,
      identity.emergency_contact_phone,
      identity.date_of_joining,
      identity.department,
      identity.designation,
    ],
  );

  await insertBalancesAndStructures(connection, userId, plan, components, context);
  return userId;
};

const insertLeaveApplications = async (connection, userId, applications, context) => {
  if (applications.length === 0) return;

  const values = applications.map((app) => [
    userId,
    app.leave_type_id,
    app.start_date,
    app.end_date,
    app.total_days,
    app.reason,
  ]);
  await connection.query(
    `INSERT INTO leave_applications
      (user_id, leave_type_id, start_date, end_date, total_days, reason, status)
     VALUES ${values.map(() => "(?, ?, ?, ?, ?, ?, 'Pending')").join(", ")}`,
    values.flat(),
  );

  // The application's AFTER UPDATE trigger maintains paid balances, so the
  // dataset walks the real status transitions instead of writing final states.
  const [ids] = await connection.query(
    `SELECT leave_id FROM leave_applications WHERE user_id = ? ORDER BY leave_id`,
    [userId],
  );
  if (ids.length !== applications.length) {
    throw new Error(
      `Leave id mapping is unstable for user ${userId}: expected ${applications.length} rows, found ${ids.length}`,
    );
  }
  const idsByStatus = new Map();
  applications.forEach((app, index) => {
    const list = idsByStatus.get(app.status) || [];
    list.push(ids[index].leave_id);
    idsByStatus.set(app.status, list);
  });

  const approved = idsByStatus.get("Approved") || [];
  const rejected = idsByStatus.get("Rejected") || [];
  const cancelled = idsByStatus.get("Cancelled") || [];

  const markApproved = async (idsSubset) => {
    if (idsSubset.length === 0) return;
    await connection.query(
      `UPDATE leave_applications
       SET status = 'Approved', approved_by = ?, approved_date = CURRENT_TIMESTAMP
       WHERE leave_id IN (?)`,
      [context.approverId, idsSubset],
    );
  };

  if (rejected.length > 0) {
    await connection.query(
      `UPDATE leave_applications
       SET status = 'Rejected', approved_by = ?, approved_date = CURRENT_TIMESTAMP,
           rejection_reason = 'Team capacity conflict on the requested dates'
       WHERE leave_id IN (?)`,
      [context.approverId, rejected],
    );
  }
  await markApproved(approved);
  // Cancelled records are approved first so the trigger deducts, then cancelled
  // so the same trigger restores the paid balance.
  await markApproved(cancelled);
  if (cancelled.length > 0) {
    await connection.query(
      `UPDATE leave_applications SET status = 'Cancelled' WHERE leave_id IN (?)`,
      [cancelled],
    );
  }
};

const insertAttendance = async (connection, userId, rows, chunkSize) => {
  for (const part of chunk(rows, chunkSize)) {
    const values = part.map((row) => [
      userId,
      row.attendance_date,
      row.check_in_time,
      row.check_out_time,
      row.total_hours,
      row.status,
      row.remarks,
      row.worked_minutes,
      row.late_minutes,
      row.early_checkout_minutes,
    ]);
    await connection.query(
      `INSERT INTO attendance
        (user_id, attendance_date, check_in_time, check_out_time, total_hours,
         status, remarks, worked_minutes, late_minutes, early_checkout_minutes)
       VALUES ${values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
      values.flat(),
    );
  }
};

const insertPayroll = async (connection, userId, payroll, context, chunkSize) => {
  if (payroll.length === 0) return;

  const rows = payroll.map((period, index) => {
    const latest = index === payroll.length - 1;
    const nextMonth = period.month === 12 ? 1 : period.month + 1;
    const nextYear = period.month === 12 ? period.year + 1 : period.year;
    return [
      userId,
      period.month,
      period.year,
      period.result.workingDays,
      period.result.presentDays,
      period.result.leaveDays,
      period.result.grossSalary,
      period.result.totalDeductions,
      period.result.netSalary,
      // The newest period stays Processed so the payroll approval workflow still
      // has work to do; closed periods are marked paid on the 1st of the next month.
      latest ? null : `${nextYear}-${pad2(nextMonth)}-01`,
      latest ? "Processed" : "Paid",
      "Bank Transfer",
      "Benchmark dataset",
      context.generatorId,
    ];
  });

  const placeholders = rows.map(() => `(${Array(14).fill("?").join(", ")})`).join(", ");
  await connection.query(
    `INSERT INTO payroll
      (user_id, month, year, working_days, present_days, leave_days, gross_salary,
       total_deductions, net_salary, payment_date, payment_status, payment_method,
       remarks, generated_by)
     VALUES ${placeholders}`,
    rows.flat(),
  );

  const [stored] = await connection.query(
    `SELECT payroll_id, month, year FROM payroll WHERE user_id = ?`,
    [userId],
  );
  const idByPeriod = new Map(stored.map((r) => [`${r.year}-${r.month}`, r.payroll_id]));

  const detailRows = [];
  payroll.forEach((period) => {
    const payrollId = idByPeriod.get(`${period.year}-${period.month}`);
    if (!payrollId) {
      throw new Error(`Missing payroll id for ${period.year}-${period.month}`);
    }
    for (const item of period.result.breakdown) {
      detailRows.push([payrollId, item.component_id, item.amount]);
    }
  });

  for (const part of chunk(detailRows, chunkSize * 3)) {
    await connection.query(
      `INSERT INTO payroll_details (payroll_id, component_id, amount)
       VALUES ${part.map(() => "(?, ?, ?)").join(", ")}`,
      part.flat(),
    );
  }
};

// The seeded demo Employee account is the login a new developer tries first, so it
// gets the same coverage. Existing rows, profiles and salary configurations are
// left untouched: coverage is skipped when the account already has payroll or
// salary structures, and only missing dates/periods are inserted.
const coverDemoEmployee = async (connection, options, reference, log) => {
  const [demo] = await connection.query(
    `SELECT u.user_id, ep.date_of_joining
     FROM users u
     LEFT JOIN employee_profiles ep ON ep.user_id = u.user_id
     WHERE u.email = 'employee@workzen.demo'`,
  );
  if (demo.length === 0) {
    log({ event: "warning", message: "employee@workzen.demo not found; skipped demo coverage" });
    return null;
  }
  const userId = demo[0].user_id;

  const [[{ payrollRows }]] = await connection.query(
    `SELECT COUNT(*) AS payrollRows FROM payroll WHERE user_id = ?`,
    [userId],
  );
  const [[{ structureRows }]] = await connection.query(
    `SELECT COUNT(*) AS structureRows FROM employee_salary_structure WHERE user_id = ?`,
    [userId],
  );
  if (Number(payrollRows) > 0 || Number(structureRows) > 0) {
    log({
      event: "skipped",
      message: "employee@workzen.demo already has payroll or salary structures",
    });
    return null;
  }

  const months = coveredMonths({ ...reference.period, months: options.months });
  const rng = rngForEmployee(options.seed, DEMO_COVERAGE_INDEX);
  const components = planSalaryComponents({
    rng,
    componentsByName: reference.componentsByName,
    ...reference.componentIds,
  });
  const plan = planEmployee({
    index: DEMO_COVERAGE_INDEX,
    rng,
    leaveTypes: reference.leaveTypes,
    components,
    months,
    leaveTarget: leaveTargetForEmployee(1, options),
  });
  // The seeded profile keeps its own joining date, so the generated structure has
  // to resolve from the first generated payroll period instead.
  plan.structureEffectiveFrom = plan.payroll[0].periodStart;

  const [existingDates] = await connection.query(
    `SELECT DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date
     FROM attendance WHERE user_id = ?`,
    [userId],
  );
  const takenDates = new Set(existingDates.map((row) => row.attendance_date));
  const attendanceRows = plan.attendanceRows.filter(
    (row) => !takenDates.has(row.attendance_date),
  );

  await connection.beginTransaction();
  try {
    await insertBalancesAndStructures(connection, userId, plan, components, reference);
    await insertLeaveApplications(connection, userId, plan.applications, reference);
    await insertAttendance(connection, userId, attendanceRows, options.chunkSize);
    await insertPayroll(connection, userId, plan.payroll, reference, options.chunkSize);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw new Error(`Demo employee coverage failed: ${error.message}`);
  }

  return {
    userId,
    attendance: attendanceRows.length,
    leaveApplications: plan.applications.length,
    payroll: plan.payroll.length,
    payrollDetails: plan.payroll.length * components.length,
  };
};

export const generateBenchmark = async (connection, options, hooks = {}) => {
  const log = hooks.log || (() => {});
  const period = resolvePeriod(options, hooks.businessDate || getBusinessNow().date);
  const reference = await loadReferenceData(connection, options);
  reference.period = period;

  const passwordHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 10);

  let removed = 0;
  if (options.forceReseed) {
    removed = await deleteBenchmarkEmployees(connection);
    log({ event: "cleared", syntheticUsersRemoved: removed });
  }

  const existing = await loadExistingBenchmark(connection);
  for (const email of existing.incomplete) {
    log({ event: "warning", message: `${email} has no payroll rows; left untouched` });
  }

  const totals = {
    generated: 0,
    skipped: 0,
    attendance: 0,
    leaveApplications: 0,
    payroll: 0,
    payrollDetails: 0,
  };
  const started = Date.now();

  for (let index = 1; index <= options.employees; index += 1) {
    const email = syntheticEmail(index);
    if (existing.emails.has(email)) {
      totals.skipped += 1;
      continue;
    }

    const rng = rngForEmployee(options.seed, index);
    const components = planSalaryComponents({
      rng,
      componentsByName: reference.componentsByName,
      ...reference.componentIds,
    });
    const plan = planEmployee({
      index,
      rng,
      leaveTypes: reference.leaveTypes,
      components,
      months: monthsForEmployee(index, options, period),
      leaveTarget: leaveTargetForEmployee(index, options),
    });

    await connection.beginTransaction();
    try {
      const userId = await insertEmployee(
        connection,
        plan,
        components,
        reference,
        passwordHash,
      );
      await insertLeaveApplications(connection, userId, plan.applications, reference);
      await insertAttendance(connection, userId, plan.attendanceRows, options.chunkSize);
      await insertPayroll(connection, userId, plan.payroll, reference, options.chunkSize);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw new Error(`Benchmark generation failed for ${email}: ${error.message}`);
    }

    totals.generated += 1;
    totals.attendance += plan.attendanceRows.length;
    totals.leaveApplications += plan.applications.length;
    totals.payroll += plan.payroll.length;
    totals.payrollDetails += plan.payroll.length * components.length;

    if (index % options.progress === 0 || index === options.employees) {
      const elapsedSeconds = (Date.now() - started) / 1000;
      log({
        event: "progress",
        employees: `${index}/${options.employees}`,
        elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
        rowsPerSecond: Math.round(totals.attendance / elapsedSeconds),
      });
    }
  }

  let demoCoverage = null;
  if (options.coverDemoEmployee) {
    demoCoverage = await coverDemoEmployee(connection, options, reference, log);
  }

  return {
    period,
    totals,
    removed,
    demoCoverage,
    percentageComponentPending: reference.percentageComponentPending,
    elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    seed: options.seed,
    monthsLabel: monthRangeLabel(
      coveredMonths({ ...period, months: options.months }),
    ),
    seniorMonthsLabel: monthRangeLabel(
      coveredMonths({
        ...period,
        months: options.months + options.seniorExtraMonths,
      }),
    ),
    syntheticPassword: SYNTHETIC_PASSWORD,
  };
};

// =====================================================
// CLI
// =====================================================

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const options = parseArgs();

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to generate benchmark data with NODE_ENV=production.");
    process.exitCode = 1;
  } else if (options.forceReseed && !options.yes) {
    console.error(
      "--force-reseed-benchmark deletes generator-owned employees. Add --yes to confirm.",
    );
    process.exitCode = 1;
  } else {
    const connection = await connectToServer();
    try {
      const initialized = await schemaIsInitialized(connection, options.database);
      if (!initialized) {
        throw new Error(
          `Schema "${options.database}" is not initialized. Run npm run setup:demo first.`,
        );
      }
      await connection.query(`USE \`${options.database}\``);
      const businessDate = getBusinessNow().date;

      if (options.dryRun) {
        const period = resolvePeriod(options, businessDate);
        const reference = await loadReferenceData(connection, options, {
          readOnly: true,
        });
        console.log(
          JSON.stringify(
            {
              dryRun: true,
              database: options.database,
              businessDate,
              endPeriod: `${period.endYear}-${pad2(period.endMonth)}`,
              percentageComponentPending: reference.percentageComponentPending,
              planned: buildPlanSummary(options, { ...reference, period }),
            },
            null,
            2,
          ),
        );
      } else {
        const result = await generateBenchmark(connection, options, {
          businessDate,
          log: (entry) => console.log(JSON.stringify(entry)),
        });
        console.log(JSON.stringify({ database: options.database, result }, null, 2));
      }
    } catch (error) {
      console.error("Benchmark generation failed:", error.message);
      process.exitCode = 1;
    } finally {
      await connection.end();
    }
  }
}
