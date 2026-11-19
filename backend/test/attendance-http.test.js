import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import pool from "../src/config/database.js";

// Attendance HTTP regression suite. Attendance only had unit coverage
// (test/attendance.test.js drives the service layer directly), so the routes,
// their role gates and their HTTP contracts were unverified. This suite covers
// all three against a real server:
//
//   authentication - every route 401s without a token, and after logout
//   authorization  - the exact matrix declared in src/routes/attendanceRoutes.js
//   behavior       - check-in/check-out math, self-scoping, queries, filters,
//                    the CSV export contract and audited manual corrections
//
// Isolation: it creates its own temporary users (one per staff role plus three
// employees) with real logins, writes attendance only for them, and hard-deletes
// the users in teardown; `attendance`, `employee_profiles` and `user_sessions`
// cascade from `users`. Its own ATTENDANCE_CORRECTION audit rows are backed up
// and deleted by primary key, and the teardown asserts that the total correction
// count returns to the value it was before the run. Demo accounts are used to log
// in and read only, and their sessions are logged out instead of left live.
import { requiredBaseUrl, guardExecutedTests } from "./support/httpSuite.js";
import { assertScratchDatabase } from "./support/dbGuard.js";
const base = requiredBaseUrl("ATTENDANCE_API_URL", "test:attendance:http");
// T-007 tripwire: the target server writes to the database; the schema it
// points at must be an approved scratch one. Fails closed before any test
// registers.
assertScratchDatabase("attendance-http");
const stamp = Date.now();
const TEMP_PASSWORD = "Temp@12345";
const STAFF_ROLES = ["Admin", "HR Officer", "Payroll Officer"];

// Weekday dates far enough ahead to stay inside the current period. The temp
// accounts start with no attendance rows, so none of these can collide with
// pre-existing data. FIXTURE_DATE sits in a different month from the December
// probes so the monthly-summary totals stay unambiguous.
const FIXTURE_DATE = "2026-10-20";
const DAY_A = "2026-12-15";
const DAY_B = "2026-12-16";
const DAY_C = "2026-12-22";
// Two dates reserved for the row each RBAC matrix run is allowed to delete, so
// the DELETE case can prove a 200 without destroying the targets the later
// correction and history tests still need.
const RBAC_DELETE_DAY_1 = "2026-12-17";
const RBAC_DELETE_DAY_2 = "2026-12-18";

const tokens = {};
const tempUserIds = [];
const myAttendanceIds = new Set();
let adminUser, hrUser, payrollUser, employeeA, employeeB, employeeC;
let fixtureId, checkInId;
let correctionAuditBaseline = 0;

const call = async (method, path, token, body) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text, headers: response.headers };
};

const login = async (email, password) => {
  const { body } = await call("POST", "/auth/login", null, { email, password });
  return body?.data?.token;
};

const tempKey = (role) => `temp${role.replace(/\s+/g, "")}`;

const createTempUser = async (roleName, tag) => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = ? LIMIT 1",
    [roleName],
  );
  assert.ok(roles.length === 1, `role '${roleName}' is seeded`);

  const email = `wn-attendance-http-${tag}-${stamp}@example.test`;
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
  const [res] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, ?, TRUE)`,
    [roles[0].role_id, email, hash],
  );
  const code = `WNATT${stamp}-${res.insertId}`;
  await pool.query(
    `INSERT INTO employee_profiles (user_id, employee_code, first_name, last_name, department)
     VALUES (?, ?, 'Attendance', 'Probe', 'QA-ATT')`,
    [res.insertId, code],
  );
  tempUserIds.push(res.insertId);
  return { userId: res.insertId, email, code, token: await login(email, TEMP_PASSWORD) };
};

const attendanceRow = async (attendanceId) => {
  const [rows] = await pool.query(
    `SELECT attendance_id, user_id,
            DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
            DATE_FORMAT(check_in_time, '%Y-%m-%d %H:%i:%s') AS check_in_time,
            DATE_FORMAT(check_out_time, '%Y-%m-%d %H:%i:%s') AS check_out_time,
            total_hours, worked_minutes, late_minutes, early_checkout_minutes, status, remarks
     FROM attendance WHERE attendance_id = ?`,
    [attendanceId],
  );
  return rows[0];
};

const rowsForUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT attendance_id, DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
            status, check_in_time
     FROM attendance WHERE user_id = ? ORDER BY attendance_date`,
    [userId],
  );
  return rows;
};

const markAttendance = async (user, date, checkIn) => {
  const { status, body } = await call("POST", "/attendance/mark", user.token, {
    attendance_date: date,
    // The mark contract takes bare clock times (HH:mm or HH:mm:ss) and the
    // date separately (pinned by attendance-mark-time-contract.test.js).
    check_in_time: checkIn,
  });
  assert.equal(status, 200, `mark ${date} for ${user.code}: ${JSON.stringify(body)}`);
  const [rows] = await pool.query(
    "SELECT attendance_id FROM attendance WHERE user_id = ? AND attendance_date = ?",
    [user.userId, date],
  );
  assert.equal(rows.length, 1, "the marked row is readable");
  myAttendanceIds.add(rows[0].attendance_id);
  return rows[0].attendance_id;
};

const correctionAuditRows = async (attendanceIds) => {
  if (attendanceIds.length === 0) return [];
  const placeholders = attendanceIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT log_id, user_id, action, table_name, record_id, old_value, new_value
     FROM audit_logs
     WHERE action = 'ATTENDANCE_CORRECTION' AND table_name = 'attendance'
       AND record_id IN (${placeholders})
     ORDER BY log_id`,
    attendanceIds,
  );
  return rows;
};

const countCorrections = async () => {
  const [rows] = await pool.query(
    "SELECT COUNT(*) n FROM audit_logs WHERE action = 'ATTENDANCE_CORRECTION'",
  );
  return Number(rows[0].n);
};

// Scoped to the primary keys read back from correctionAuditRows, so teardown can
// never widen into audit history it did not read.
const deleteAuditRowsByLogId = async (logIds) => {
  if (logIds.length === 0) return 0;
  const placeholders = logIds.map(() => "?").join(",");
  const [result] = await pool.query(
    `DELETE FROM audit_logs WHERE log_id IN (${placeholders})`,
    logIds,
  );
  return result.affectedRows;
};

const restoreAuditRows = async (rows) => {
  for (const row of rows) {
    await pool.query(
      `INSERT INTO audit_logs
         (log_id, user_id, action, table_name, record_id, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.log_id, row.user_id, row.action, row.table_name, row.record_id,
        row.old_value, row.new_value,
      ],
    );
  }
};

// A previous run that was interrupted before its teardown leaves its fixtures
// behind. Every one of them carries this suite's unique email prefix, so reaping
// them here keeps the audit and attendance counts meaningful without ever
// matching data this suite did not create.
const reapStaleFixtures = async () => {
  const [stale] = await pool.query(
    "SELECT user_id FROM users WHERE email LIKE 'wn-attendance-http-%@example.test' ORDER BY user_id",
  );
  if (stale.length === 0) return 0;

  const ids = stale.map((row) => row.user_id);
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT attendance_id FROM attendance WHERE user_id IN (${placeholders})`, ids,
  );
  const audit = await correctionAuditRows(rows.map((row) => row.attendance_id));
  await deleteAuditRowsByLogId(audit.map((row) => row.log_id));

  const [removed] = await pool.query(
    `DELETE FROM users WHERE user_id IN (${placeholders})`, ids,
  );
  const [left] = await pool.query(
    `SELECT COUNT(*) AS n FROM attendance WHERE user_id IN (${placeholders})`, ids,
  );
  assert.equal(Number(left[0].n), 0, "reaped fixtures cascaded their attendance rows");
  return removed.affectedRows;
};

describe("Attendance HTTP API", () => {
  before(async () => {
    const reaped = await reapStaleFixtures();
    if (reaped > 0) console.log(`Reaped ${reaped} fixture user(s) from an interrupted run.`);

    for (const [email, password, role] of [
      ["admin@workzen.demo", "Admin@123", "Admin"],
      ["hr@workzen.demo", "Hr@123", "HR Officer"],
      ["payroll@workzen.demo", "Payroll@123", "Payroll Officer"],
      ["employee@workzen.demo", "Employee@123", "Employee"],
    ]) {
      tokens[role] = await login(email, password);
      assert.ok(tokens[role], `demo ${role} token issued`);
    }

    adminUser = await createTempUser("Admin", "admin");
    hrUser = await createTempUser("HR Officer", "hr");
    payrollUser = await createTempUser("Payroll Officer", "payroll");
    employeeA = await createTempUser("Employee", "emp-a");
    employeeB = await createTempUser("Employee", "emp-b");
    employeeC = await createTempUser("Employee", "emp-c");
    for (const [role, user] of [
      ["Admin", adminUser],
      ["HR Officer", hrUser],
      ["Payroll Officer", payrollUser],
    ]) {
      tokens[tempKey(role)] = user.token;
      assert.ok(user.token, `temp ${role} token issued`);
    }
    tokens.tempEmployee = employeeA.token;
    tokens.tempEmployee2 = employeeB.token;
    tokens.tempEmployee3 = employeeC.token;

    // One row per test employee up front: employee C exists only so that a
    // correction target can be protected by the RBAC matrix before any
    // lifecycle test runs.
    fixtureId = await markAttendance(employeeC, FIXTURE_DATE, "09:15:00");
    assert.ok(fixtureId);

    // Brand-new accounts must have no history at all; only C's fixture row is
    // allowed to exist, and it must be exactly the row just created.
    for (const user of [employeeA, employeeB]) {
      assert.equal((await rowsForUser(user.userId)).length, 0, `clean start for ${user.code}`);
    }
    const fixtureRows = await rowsForUser(employeeC.userId);
    assert.equal(fixtureRows.length, 1, "employee C holds only the fixture row");
    assert.equal(fixtureRows[0].attendance_id, fixtureId);
    assert.equal(fixtureRows[0].attendance_date, FIXTURE_DATE);
    correctionAuditBaseline = await countCorrections();
  });

  after(async () => {
    let teardownError = null;
    let auditBackup = [];
    try {
      const mine = [...myAttendanceIds];
      auditBackup = await correctionAuditRows(mine);
      const deleted = await deleteAuditRowsByLogId(auditBackup.map((row) => row.log_id));
      assert.equal(deleted, auditBackup.length, "teardown deletes exactly its own audit rows");
      assert.equal((await correctionAuditRows(mine)).length, 0,
        "no audit row may describe a correction of a removed record");

      for (const userId of tempUserIds) {
        await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
      }
      for (const userId of tempUserIds) {
        assert.equal((await rowsForUser(userId)).length, 0, `attendance cascaded for ${userId}`);
      }

      assert.equal(await countCorrections(), correctionAuditBaseline,
        "the correction audit trail outside this run is untouched");

      // Demo accounts were only used to read; release the sessions this suite opened
      // rather than leaving live rows behind in user_sessions.
      for (const role of [...STAFF_ROLES, "Employee"]) {
        await call("POST", "/auth/logout", tokens[role]);
      }
    } catch (error) {
      teardownError = error;
      if (auditBackup.length > 0) {
        try {
          await restoreAuditRows(auditBackup);
          console.error("Attendance HTTP teardown rolled its audit deletions back.");
        } catch (restoreError) {
          console.error("Attendance HTTP teardown could NOT restore its audit backup:", restoreError.message);
        }
      }
      console.error(`Attendance HTTP teardown failed: ${error.message}`);
    }

    await pool.end();
    if (teardownError) throw teardownError;
  });

  describe("1. Authentication", () => {
    // Built when the test runs: `fixtureId` only exists after the before hook.
    const routes = () => [
      ["GET", "/attendance/status"],
      ["GET", "/attendance/today"],
      ["GET", "/attendance/my-logs"],
      ["GET", "/attendance/summary?month=12&year=2026"],
      ["GET", "/attendance/all"],
      ["GET", `/attendance/day?date=${DAY_A}`],
      ["GET", "/attendance/all-status"],
      ["GET", "/attendance/export"],
      ["GET", `/attendance/payable-days?userId=${employeeA.userId}&month=12&year=2026`],
      ["POST", "/attendance/check-in"],
      ["POST", "/attendance/check-out"],
      ["POST", "/attendance/mark"],
      ["PUT", `/attendance/${fixtureId}`],
      ["DELETE", `/attendance/${fixtureId}`],
    ];

    it("rejects every attendance route without a token", async () => {
      for (const [method, path] of routes()) {
        const { status, body } = await call(method, path, null);
        assert.equal(status, 401, `${method} ${path} must require authentication`);
        assert.equal(body.success, false);
      }
    });

    it("rejects a malformed token and a forged one", async () => {
      for (const token of ["not-a-jwt", "Bearer forged", "eyJhbGciOiJub25lIn0.e30.x"]) {
        const { status } = await call("GET", "/attendance/status", token);
        assert.equal(status, 401, `${token.slice(0, 12)} must not authenticate`);
      }
    });

    it("stops accepting a token once its session is logged out", async () => {
      const probe = await createTempUser("Employee", "logout-probe");
      const before = await call("GET", "/attendance/status", probe.token);
      assert.equal(before.status, 200, "the fresh session works");

      assert.equal((await call("POST", "/auth/logout", probe.token)).status, 200);
      assert.equal((await call("GET", "/attendance/status", probe.token)).status, 401,
        "a revoked session must not read attendance");
      assert.equal((await call("POST", "/attendance/check-in", probe.token)).status, 401,
        "a revoked session must not write attendance");

      const [sessions] = await pool.query(
        `SELECT revoked_at FROM user_sessions WHERE user_id = ? ORDER BY session_id DESC LIMIT 1`,
        [probe.userId],
      );
      assert.equal(sessions.length, 1, "the session row still exists");
      assert.notEqual(sessions[0].revoked_at, null, "logout revoked it server-side");
    });
  });

  describe("2. Role-based access", () => {
    // Straight from src/routes/attendanceRoutes.js authorize(...) lists. The
    // mutating rows take their target id as an argument because a DELETE really
    // removes the row, so each matrix run points at its own disposable record.
    const matrix = (deleteTargetId) => [
      ["/attendance/all-status", ["Admin", "HR Officer", "Payroll Officer"]],
      [`/attendance/day?date=${DAY_A}`, ["Admin", "HR Officer", "Payroll Officer"]],
      ["/attendance/all", ["Admin", "HR Officer"]],
      ["/attendance/export", ["Admin", "HR Officer"]],
      [`/attendance/payable-days?userId=${employeeA.userId}&month=12&year=2026`,
        ["Admin", "HR Officer", "Payroll Officer"]],
      [`PUT /attendance/${fixtureId}`, ["Admin", "HR Officer"]],
      [`DELETE /attendance/${deleteTargetId}`, ["Admin"]],
    ];

    const runMatrix = async ({ label, tokenFor, employeeTokens, deleteTargetId }) => {
      for (const [route, allowedRoles] of matrix(deleteTargetId)) {
        const isDelete = route.startsWith("DELETE");
        const isPut = route.startsWith("PUT");
        const path = isPut || isDelete ? route.split(" ")[1] : route;
        const method = isDelete ? "DELETE" : isPut ? "PUT" : "GET";

        const isCsv = path.startsWith("/attendance/export");

        for (const role of STAFF_ROLES) {
          const { status, body, headers } = await call(
            method,
            path,
            tokenFor(role),
            isPut ? { remarks: `matrix ${role}` } : undefined,
          );
          if (allowedRoles.includes(role)) {
            assert.equal(status, 200, `${label} ${role} keeps ${route}`);
            if (isCsv) {
              // The export answers with a CSV stream, not the JSON envelope.
              assert.match(headers.get("content-type"), /text\/csv/);
            } else {
              assert.equal(body.success, true);
            }
          } else {
            assert.equal(status, 403, `${label} ${role} is denied ${route}`);
            assert.equal(body.success, false);
          }
        }

        for (const token of employeeTokens) {
          const { status, body } = await call(
            method,
            path,
            token,
            isPut ? { remarks: `matrix ${label} employee` } : undefined,
          );
          assert.equal(status, 403, `${label} Employee is denied ${route}`);
          assert.equal(body.success, false);
          assert.match(body.message, /not authorized/i);
        }

        assert.equal(
          (await call(method, path, null)).status,
          401,
          `${label} ${route} needs a token`,
        );
      }
    };

    it("serves each staff route to exactly the roles the router allows", async () => {
      const disposable = await markAttendance(employeeB, RBAC_DELETE_DAY_1, "09:05:00");
      await runMatrix({
        label: "temp",
        tokenFor: (role) => tokens[tempKey(role)],
        employeeTokens: [tokens.Employee, tokens.tempEmployee, tokens.tempEmployee2],
        deleteTargetId: disposable,
      });
      assert.equal(await attendanceRow(disposable), undefined,
        "the Admin-only DELETE removed its own row");
      assert.ok(await attendanceRow(fixtureId), "the shared fixture survived the matrix");
    });

    it("agrees with the demo accounts for the same matrix", async () => {
      const disposable = await markAttendance(employeeB, RBAC_DELETE_DAY_2, "09:05:00");
      await runMatrix({
        label: "demo",
        tokenFor: (role) => tokens[role],
        employeeTokens: [tokens.Employee],
        deleteTargetId: disposable,
      });
    });

    it("never leaks attendance data in a denied response", async () => {
      const { status, text } = await call("GET", "/attendance/all", tokens.tempEmployee);
      assert.equal(status, 403);
      assert.ok(!text.includes("check_in_time"), "no record fields in the denial");
      assert.ok(!text.includes(employeeC.code), "no fixture employee code in the denial");

      const csv = await call("GET", "/attendance/export", tokens.tempEmployee);
      assert.equal(csv.status, 403);
      assert.ok(!csv.headers.get("content-type")?.includes("text/csv"), "no CSV stream for a denial");
    });

    it("keeps self-service attendance open to every role", async () => {
      for (const key of ["tempEmployee", "tempPayrollOfficer", "tempAdmin", "Employee"]) {
        const statusRes = await call("GET", "/attendance/status", tokens[key]);
        assert.equal(statusRes.status, 200, `${key} reads own status`);
        assert.equal(statusRes.body.success, true);

        const logs = await call("GET", "/attendance/my-logs", tokens[key]);
        assert.equal(logs.status, 200, `${key} reads own logs`);

        const today = await call("GET", "/attendance/today", tokens[key]);
        assert.equal(today.status, 200, `${key} reads own day`);
        assert.equal(typeof today.body.data.record_count, "number");
      }
    });
  });

  describe("3. Check-in and check-out lifecycle", () => {
    let businessDay;

    it("check-in records the business date and returns the clock-in contract", async () => {
      const { status, body } = await call("POST", "/attendance/check-in", tokens.tempEmployee);
      assert.equal(status, 201);
      assert.equal(body.success, true);
      assert.equal(body.data.status, "checked_in");
      assert.equal(body.data.time_zone, "Asia/Kolkata");
      assert.match(body.data.attendance_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(body.data.check_in_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      businessDay = body.data.attendance_date;
      checkInId = body.data.attendance_id;
      myAttendanceIds.add(checkInId);

      const stored = await attendanceRow(checkInId);
      assert.equal(stored.user_id, employeeA.userId, "check-in wrote a row for the caller");
      assert.equal(stored.attendance_date, businessDay);
      assert.equal(stored.status, "Present", "an open day is Present until the checkout math says otherwise");
      assert.equal(stored.check_out_time, null);
    });

    it("refuses a second check-in for the same business day", async () => {
      const { status, body } = await call("POST", "/attendance/check-in", tokens.tempEmployee);
      assert.equal(status, 409);
      assert.equal(body.success, false);
      assert.match(body.message, /already checked in/i);
    });

    it("reports the open session through the status endpoint", async () => {
      const { status, body } = await call("GET", "/attendance/status", tokens.tempEmployee);
      assert.equal(status, 200);
      assert.equal(body.data.status, "checked_in");
      assert.equal(Number(body.data.attendance_id), checkInId);
      assert.equal(body.data.check_out_time, null);
    });

    it("check-out computes worked, late and early-leave minutes server-side", async () => {
      const { status, body } = await call("POST", "/attendance/check-out", tokens.tempEmployee);
      assert.equal(status, 200);
      assert.equal(body.data.attendance_date, businessDay);
      assert.equal(typeof body.data.workedMinutes, "number");
      assert.ok(body.data.workedMinutes >= 0);
      assert.equal(body.data.totalHours, (body.data.workedMinutes / 60).toFixed(2));
      assert.ok(["Present", "Half-Day", "Late"].includes(body.data.status));

      const stored = await attendanceRow(checkInId);
      assert.equal(Number(stored.worked_minutes), body.data.workedMinutes, "metrics are persisted");
      assert.equal(stored.status, body.data.status);
      assert.equal(stored.check_out_time, body.data.check_out_time);
    });

    it("refuses a second check-out and a re-check-in after the day is closed", async () => {
      assert.equal((await call("POST", "/attendance/check-out", tokens.tempEmployee)).status, 409);
      const again = await call("POST", "/attendance/check-in", tokens.tempEmployee);
      assert.equal(again.status, 409);
      assert.match(again.body.message, /already completed/i);
    });

    it("refuses to check out an employee who never checked in", async () => {
      const { status, body } = await call("POST", "/attendance/check-out", tokens.tempEmployee2);
      assert.equal(status, 400);
      assert.match(body.message, /check in first/i);
      assert.equal((await rowsForUser(employeeB.userId)).length, 0, "no row was created");
    });

    it("shows the closed day in the caller's own history", async () => {
      const { status, body } = await call(
        "GET",
        `/attendance/my-logs?start_date=${businessDay}&end_date=${businessDay}`,
        tokens.tempEmployee,
      );
      assert.equal(status, 200);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].attendance_id, checkInId);
      assert.equal(body.pagination.total, 1);
      assert.ok(body.data[0].checkIn, "the display time alias is still served");
      assert.ok(body.data[0].date, "the display date alias is still served");
    });
  });

  describe("4. Self-scoping", () => {
    it("my-logs never returns another employee's rows", async () => {
      const rowB = await markAttendance(employeeB, DAY_A, "09:15:00");

      const asB = await call(
        "GET",
        `/attendance/my-logs?start_date=${DAY_A}&end_date=${DAY_A}`,
        tokens.tempEmployee2,
      );
      assert.equal(asB.status, 200);
      assert.deepEqual(asB.body.data.map((row) => row.attendance_id), [rowB]);

      const asA = await call(
        "GET",
        `/attendance/my-logs?start_date=${DAY_A}&end_date=${DAY_A}`,
        tokens.tempEmployee,
      );
      assert.equal(asA.body.data.length, 0, "employee A cannot see employee B's row either");
    });

    it("ignores a client-supplied user id and marks the caller only", async () => {
      const { status, body } = await call("POST", "/attendance/mark", tokens.tempEmployee, {
        attendance_date: DAY_B,
        check_in_time: "09:05:00",
        user_id: employeeB.userId,
        userId: employeeB.userId,
      });
      assert.equal(status, 200);
      assert.equal(Number(body.data.userId), employeeA.userId, "the route writes for the authenticated user");

      const [foreign] = await pool.query(
        "SELECT attendance_id FROM attendance WHERE user_id = ? AND attendance_date = ?",
        [employeeB.userId, DAY_B],
      );
      assert.equal(foreign.length, 0, "no row was written for the impersonated user");

      const [mine] = await pool.query(
        "SELECT attendance_id FROM attendance WHERE user_id = ? AND attendance_date = ?",
        [employeeA.userId, DAY_B],
      );
      assert.equal(mine.length, 1);
      myAttendanceIds.add(mine[0].attendance_id);
    });

    it("returns only the caller's rows from /today, on the day /status names", async () => {
      const self = await call("GET", "/attendance/status", tokens.tempEmployee);
      assert.equal(self.status, 200);
      const statusRowId = Number(self.body.data.attendance_id);
      assert.ok(statusRowId > 0, "the caller has a row for the current business day");

      const { status, body } = await call("GET", "/attendance/today", tokens.tempEmployee);
      assert.equal(status, 200);
      assert.ok(Array.isArray(body.data.records), "records is always an array");
      // /status, /today and /all-status must all name the same business day.
      // A UTC-derived date in any of them silently drops the row between
      // 18:30 and 24:00 UTC, so /today has to contain exactly what /status says.
      const ids = body.data.records.map((record) => Number(record.attendance_id));
      assert.ok(ids.includes(statusRowId),
        `/today did not return the business-day row ${statusRowId} that /status reported`);
      assert.equal(Number(body.data.record_count), ids.length, "record_count matches the rows");

      for (const record of body.data.records) {
        const stored = await attendanceRow(record.attendance_id);
        assert.equal(stored.user_id, employeeA.userId, "every /today row belongs to the caller");
      }
    });

    it("counts the caller in the presence map on the same day", async () => {
      const self = await call("GET", "/attendance/status", tokens.tempEmployee);
      const staff = await call("GET", "/attendance/all-status", tokens.Admin);
      assert.equal(staff.status, 200);
      assert.equal(staff.body.data[employeeA.userId], self.body.data.status,
        "the org map and the employee's own status describe the same business day");
    });

    it("exposes no other employee through the org-wide presence map to its subject", async () => {
      const { status } = await call("GET", "/attendance/all-status", tokens.tempEmployee);
      assert.equal(status, 403, "an Employee reads /status, never the org map");
      const self = await call("GET", "/attendance/status", tokens.tempEmployee);
      assert.equal(self.status, 200);
    });
  });

  describe("5. Queries, filters and pagination", () => {
    it("enforces the pagination and filter contract on /all", async () => {
      const capped = await call("GET", "/attendance/all?limit=1000&page=1", tokens.Admin);
      assert.equal(capped.status, 200);
      assert.equal(capped.body.pagination.limit, 100, "page size is capped");

      for (const path of [
        "/attendance/all?page=0",
        "/attendance/all?limit=-5",
        "/attendance/all?page=abc",
        "/attendance/all?status=Bogus",
        "/attendance/all?startDate=2026-12-20&endDate=2026-12-01",
        "/attendance/all?startDate=20-12-2026",
      ]) {
        const { status, body } = await call("GET", path, tokens.Admin);
        assert.equal(status, 400, `${path} must be rejected`);
        assert.equal(body.success, false);
      }
    });

    it("pages /all without losing or duplicating rows", async () => {
      const first = await call("GET", "/attendance/all?page=1&limit=1", tokens.Admin);
      assert.equal(first.status, 200);
      assert.equal(first.body.data.length, 1);
      assert.ok(first.body.pagination.totalPages >= 1);

      const second = await call("GET", "/attendance/all?page=2&limit=1", tokens.Admin);
      assert.equal(second.status, 200);
      if (first.body.pagination.total > 1) {
        assert.notEqual(second.body.data[0].attendance_id, first.body.data[0].attendance_id,
          "page 2 is a different row");
      } else {
        assert.equal(second.body.data.length, 0);
      }
    });

    it("requires a date on /day and scopes the result to it", async () => {
      assert.equal((await call("GET", "/attendance/day", tokens.Admin)).status, 400);
      assert.equal((await call("GET", "/attendance/day?date=15-12-2026", tokens.Admin)).status, 400);

      const day = await call("GET", `/attendance/day?date=${DAY_A}`, tokens.Admin);
      assert.equal(day.status, 200);
      for (const row of day.body.data) {
        assert.equal(row.attendance_date, DAY_A, "every row is the requested day");
        assert.ok("userName" in row && "checkIn" in row, "the day grid contract is unchanged");
      }
    });

    it("filters /day by search term, status and employee id", async () => {
      const byCode = await call(
        "GET",
        `/attendance/day?date=${DAY_A}&search=${employeeB.code}`,
        tokens["HR Officer"],
      );
      assert.equal(byCode.status, 200);
      assert.ok(byCode.body.data.some((row) => row.employee_code === employeeB.code),
        "search by employee code finds the row");
      assert.ok(byCode.body.data.every((row) => row.employee_code !== employeeC.code),
        "search does not return other employees");

      const byEmployee = await call(
        "GET",
        `/attendance/day?date=${DAY_A}&employee=${employeeC.userId}`,
        tokens["HR Officer"],
      );
      assert.equal(byEmployee.status, 200);
      assert.equal(byEmployee.body.data.length, 0, "employee C has no row on this day");

      const byStatus = await call(
        "GET",
        `/attendance/day?date=${DAY_A}&status=Present&employee=${employeeB.userId}`,
        tokens.Admin,
      );
      assert.equal(byStatus.status, 200);
      assert.equal(byStatus.body.data.length, 1);
      assert.equal(byStatus.body.data[0].status, "Present");

      const noMatch = await call(
        "GET",
        `/attendance/day?date=${DAY_A}&status=Absent`,
        tokens.Admin,
      );
      assert.equal(noMatch.status, 200);
      assert.equal(noMatch.body.data.length, 0, "the status filter is applied, not ignored");
    });

    it("validates and totals the monthly summary for the caller", async () => {
      assert.equal((await call("GET", "/attendance/summary", tokens.tempEmployee)).status, 400);
      assert.equal(
        (await call("GET", "/attendance/summary?month=12", tokens.tempEmployee)).status,
        400,
        "year is required too",
      );

      const { status, body } = await call(
        "GET",
        "/attendance/summary?month=12&year=2026",
        tokens.tempEmployee,
      );
      assert.equal(status, 200);
      assert.equal(Number(body.data.user_id), employeeA.userId, "summary is self-scoped");
      assert.equal(Number(body.data.total_days), 1, "only the marked December day counts");
      assert.equal(Number(body.data.present_days), 1);
    });

    it("computes payable days for staff and validates its inputs", async () => {
      assert.equal((await call("GET", "/attendance/payable-days", tokens.Admin)).status, 400);
      assert.equal(
        (await call("GET", `/attendance/payable-days?userId=${employeeA.userId}&month=12`, tokens.Admin)).status,
        400,
      );

      const { status, body } = await call(
        "GET",
        `/attendance/payable-days?userId=${employeeA.userId}&month=12&year=2026`,
        tokens[tempKey("Payroll Officer")],
      );
      assert.equal(status, 200);
      assert.equal(body.data.working_days, 31, "December has 31 days");
      assert.equal(typeof body.data.payable_days, "number");
      assert.ok(body.data.payable_days >= 1, "the marked day counts toward payable days");
      assert.ok(body.data.unpaid_days <= body.data.working_days);
    });

    it("streams the documented CSV contract for Admin and HR", async () => {
      const { status, headers, text } = await call("GET", "/attendance/export", tokens.Admin);
      assert.equal(status, 200);
      assert.match(headers.get("content-type"), /text\/csv/);
      assert.match(headers.get("content-disposition"), /attachment; filename=attendance.csv/);

      const lines = text.trim().split(/\r?\n/);
      const expectedHeader = [
        "Employee ID", "Employee Name", "Department", "Attendance Date", "Check In",
        "Check Out", "Worked Hours", "Worked Minutes", "Late Minutes",
        "Early Checkout Minutes", "Status",
      ].map((h) => `"${h}"`).join(",");
      assert.equal(lines[0], expectedHeader, "the export header is fixed");

      const body = lines.slice(1).filter((line) => line.length > 0);
      for (const line of body) {
        assert.equal(line.split('","').length, 11, `column count is stable: ${line}`);
      }
      assert.ok(body.some((line) => line.includes(employeeC.code)), "this run's rows are exported");
      assert.ok(!text.includes("password_hash") && !text.includes("$2a$"), "no credential material");

      const hr = await call("GET", "/attendance/export", tokens["HR Officer"]);
      assert.equal(hr.status, 200, "HR keeps the export");
    });
  });

  describe("6. Audited manual corrections", () => {
    let targetId;

    it("recomputes status from the clock instead of trusting the client", async () => {
      const rows = await rowsForUser(employeeA.userId);
      targetId = rows.find((row) => row.attendance_date === DAY_B).attendance_id;
      myAttendanceIds.add(targetId);

      const { status, body } = await call("PUT", `/attendance/${targetId}`, tokens[tempKey("HR Officer")], {
        attendance_date: DAY_B,
        check_in_time: "10:00",
        check_out_time: "11:00",
        status: "Present",
        remarks: "QA correction",
      });
      assert.equal(status, 200, JSON.stringify(body));
      assert.equal(body.data.workedMinutes, 60);
      assert.equal(body.data.lateMinutes, 45, "10:00 is 45 minutes past 09:00 plus the 15-minute grace");
      assert.equal(body.data.earlyCheckoutMinutes, 420);
      assert.equal(body.data.totalHours, "1.00");
      assert.equal(body.data.status, "Half-Day", "60 worked minutes is below the 240-minute threshold");

      const stored = await attendanceRow(targetId);
      assert.equal(stored.status, "Half-Day", "the client status claim was overwritten");
      assert.equal(stored.remarks, "QA correction");
      assert.equal(Number(stored.late_minutes), 45);
      assert.equal(stored.check_in_time, `${DAY_B} 10:00:00`);
    });

    it("writes one audit row per correction, attributed to the acting user", async () => {
      const audit = await correctionAuditRows([targetId]);
      assert.equal(audit.length, 1, "exactly one audit row for one correction");
      assert.equal(Number(audit[0].user_id), hrUser.userId, "the acting HR Officer is attributed");
      assert.equal(audit[0].table_name, "attendance");

      const before = JSON.parse(audit[0].old_value);
      const after = JSON.parse(audit[0].new_value);
      assert.equal(Number(before.attendance_id), targetId);
      assert.equal(after.status, "Half-Day");
      assert.notEqual(before.status, after.status, "the change is recorded");
    });

    it("supports an open day correction and keeps one audit row per change", async () => {
      const { status, body } = await call("PUT", `/attendance/${targetId}`, tokens[tempKey("Admin")], {
        attendance_date: DAY_B,
        check_in_time: "10:30",
        check_out_time: null,
      });
      assert.equal(status, 200);
      assert.equal(body.data.workedMinutes, null);
      assert.equal(body.data.totalHours, null);
      assert.equal(body.data.lateMinutes, 75, "10:30 is 75 minutes past the start plus grace");
      assert.equal(body.data.status, "Late");

      const audit = await correctionAuditRows([targetId]);
      assert.equal(audit.length, 2, "the second correction added its own audit row");
    });

    it("rejects malformed times, missing records and duplicate dates without writing", async () => {
      const badTime = await call("PUT", `/attendance/${targetId}`, tokens[tempKey("Admin")], {
        attendance_date: DAY_B,
        check_in_time: "25:00",
      });
      assert.equal(badTime.status, 400);
      assert.match(badTime.body.message, /HH:mm/i);

      const missing = await call("PUT", "/attendance/999999999", tokens[tempKey("Admin")], {
        attendance_date: DAY_B,
        check_in_time: "09:00",
      });
      assert.equal(missing.status, 404);
      assert.match(missing.body.message, /not found/i);

      // Regression lock for the leaked transaction: the 404 path used to return
      // while its `SELECT ... FOR UPDATE` transaction was still open, holding an
      // exclusive record lock on the supremum of the attendance PRIMARY index
      // (TABLE IX + RECORD X, confirmed against performance_schema.data_locks).
      // That lock survives the request on the pooled connection, so every later
      // attendance write blocks until MySQL's lock-wait timeout. A write after a
      // rejected correction must succeed.
      const followUp = await call("POST", "/attendance/check-in", tokens.tempEmployee2);
      assert.equal(followUp.status, 201, "a rejected correction releases its locks");
      myAttendanceIds.add(Number(followUp.body.data.attendance_id));

      const collidesWith = await markAttendance(employeeA, DAY_C, "09:00:00");
      const collision = await call("PUT", `/attendance/${targetId}`, tokens[tempKey("Admin")], {
        attendance_date: DAY_C,
        check_in_time: "09:00",
        check_out_time: "17:00",
      });
      assert.equal(collision.status, 409, "one row per employee per date is enforced");
      assert.match(collision.body.message, /already exists/i);

      const stored = await attendanceRow(targetId);
      assert.equal(stored.attendance_date, DAY_B, "the rejected correction changed nothing");
      assert.equal(stored.check_in_time, `${DAY_B} 10:30:00`, "the open-day state survived the rollback");
      assert.ok(collidesWith);
    });

    it("keeps the presence map well-formed for staff and hidden from employees", async () => {
      const { status, body } = await call("GET", "/attendance/all-status", tokens.Admin);
      assert.equal(status, 200);
      assert.equal(typeof body.data, "object");
      for (const value of Object.values(body.data)) {
        assert.ok(["checked_in", "checked_out", "not_checked_in"].includes(value),
          `unexpected presence value ${value}`);
      }
      assert.equal((await call("GET", "/attendance/all-status", tokens.tempEmployee)).status, 403);
    });

    it("deletes only for Admin and reports a missing record", async () => {
      const extraId = await markAttendance(employeeB, DAY_C, "09:00:00");

      assert.equal((await call("DELETE", `/attendance/${extraId}`, tokens[tempKey("Admin")])).status, 200);
      assert.equal(await attendanceRow(extraId), undefined, "the row is gone");
      assert.equal((await call("DELETE", `/attendance/${extraId}`, tokens[tempKey("Admin")])).status, 404);
    });

    it("holds every audit row it reads back within this run's own record ids", async () => {
      const mine = [...myAttendanceIds];
      assert.ok(mine.length >= 4, "this run created attendance rows");
      for (const employee of [employeeA, employeeB, employeeC]) {
        for (const row of await rowsForUser(employee.userId)) {
          myAttendanceIds.add(row.attendance_id);
        }
      }
      for (const row of await correctionAuditRows([...myAttendanceIds])) {
        assert.ok([...myAttendanceIds].includes(Number(row.record_id)),
          "every audit row read back describes one of this run's ids");
      }
    });
  });

  describe("7. Legacy mark endpoint contract", () => {
    it("requires an attendance date", async () => {
      const { status, body } = await call("POST", "/attendance/mark", tokens.tempEmployee, {
        check_in_time: "09:00:00",
      });
      assert.equal(status, 400);
      assert.match(body.message, /date is required/i);
    });

    it("accepts a bare HH:MM time, converts it and writes the row", async () => {
      const date = "2026-12-24";
      const { status, body } = await call("POST", "/attendance/mark", tokens.tempEmployee, {
        attendance_date: date,
        check_in_time: "09:00",
        check_out_time: "17:30",
      });
      // Regression lock for the working-tree mark contract (pinned by
      // attendance-mark-time-contract.test.js): bare HH:mm clock times are
      // validated and converted to DATETIME by the route, not passed raw to
      // MySQL. The old behavior - the raw string reaching the driver and
      // surfacing as a 500 - is what this test used to hold against.
      assert.equal(status, 200, JSON.stringify(body));
      assert.equal(body.success, true);
      assert.match(body.data.check_in_time, /^\d{4}-\d{2}-\d{2} 09:00:00$/);

      const [rows] = await pool.query(
        "SELECT attendance_id FROM attendance WHERE user_id = ? AND attendance_date = ?",
        [employeeA.userId, date],
      );
      assert.equal(rows.length, 1, "the converted mark wrote exactly one row");
      myAttendanceIds.add(rows[0].attendance_id);
    });
  });
});

guardExecutedTests("ATTENDANCE_API_URL", 35);
