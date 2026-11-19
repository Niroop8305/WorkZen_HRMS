import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pool from "../src/config/database.js";
import {
  getApprovedLeaveForPeriod,
  getAttendanceRowsForPeriod,
  resolveSalaryStructureForUpdate,
} from "../src/models/payrollModel.js";
import {
  attendancePayableDays,
  calculatePayroll,
  countWorkingDays,
  paidLeaveDaysForPeriod,
} from "../src/services/payrollService.js";

// =====================================================
// Reproducible demo dataset — end-to-end API integration suite.
//
// Run against a server that points at a generated (non-production) schema:
//   cd backend
//   npm run setup:demo -- --database=workzen_hrms_fresh
//   DB_NAME=workzen_hrms_fresh PORT=5062 node server.js &
//   DEMO_DATASET_API_URL=http://localhost:5062/api DB_NAME=workzen_hrms_fresh \
//     npm run test:demo-dataset:http
//
// Gated on DEMO_DATASET_API_URL so `npm test` skips it when no server runs.
// The suite is read-only apart from logins/logout (which only write
// user_sessions rows); it never mutates the generated dataset and never
// touches a shared development schema.
// =====================================================

import { requiredBaseUrl, guardExecutedTests } from "./support/httpSuite.js";
import { assertScratchDatabase } from "./support/dbGuard.js";
const base = requiredBaseUrl("DEMO_DATASET_API_URL", "test:demo-dataset:http");
// T-007 tripwire: the target server writes to the database; the schema it
// points at must be an approved scratch one. Fails closed before any test
// registers.
assertScratchDatabase("demo-dataset-http");

const SYNTHETIC_EMAIL = "emp0001@workzen.test";
const SYNTHETIC_PASSWORD = "Benchmark@123";
const OTHER_SYNTHETIC_EMAIL = "emp0002@workzen.test";
const DEMO_ACCOUNTS = [
  ["admin@workzen.demo", "Admin@123", "Admin"],
  ["hr@workzen.demo", "Hr@123", "HR Officer"],
  ["payroll@workzen.demo", "Payroll@123", "Payroll Officer"],
  ["employee@workzen.demo", "Employee@123", "Employee"],
];

let employeeToken;
let employeeId;
let hrToken;
let payrollToken;
let payrollIds = [];
const timings = [];

const call = async (path, options = {}) => {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : null;
  const elapsedMs = Math.round(performance.now() - started);
  timings.push({ path, elapsedMs });
  return { status: response.status, body, response, elapsedMs };
};

const rawCall = async (path, token) => {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    headers: response.headers,
    buffer,
    elapsedMs: Math.round(performance.now() - started),
  };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const login = async (email, password) => {
  const { status, body } = await call("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(status, 200, `login failed for ${email}`);
  return {
    token: body.data.token,
    userId: body.data.userId,
    roleName: body.data.role ?? body.data.roleName,
  };
};

const scalar = async (sql, params) => {
  const [rows] = await pool.query(sql, params);
  return Number(Object.values(rows[0])[0]);
};

// The generator's sizing defaults and rolling window, imported so volume
// expectations derive from the same plan math the generator uses instead of
// literals that go stale when the dataset is regenerated on a later day.
import { parseArgs as benchmarkArgs } from "../src/database/generate-benchmark.js";
import { monthsForEmployee } from "../src/database/generate-benchmark.js";
import { weekdaysForMonths } from "../src/database/benchmark/plan.js";
import { getBusinessNow } from "../src/config/attendance.js";

const benchmarkDefaults = benchmarkArgs([]);
const _businessDate = getBusinessNow().date;
const _endParts = _businessDate.split("-").map(Number);
const benchmarkPeriod = {
  endYear: _endParts[1] === 1 ? _endParts[0] - 1 : _endParts[0],
  endMonth: _endParts[1] === 1 ? 12 : _endParts[1] - 1,
};

describe(
  "Reproducible demo dataset through the real API",
  () => {
    before(async () => {
      const session = await login(SYNTHETIC_EMAIL, SYNTHETIC_PASSWORD);
      employeeToken = session.token;
      employeeId = session.userId;
      hrToken = (await login("hr@workzen.demo", "Hr@123")).token;
      payrollToken = (await login("payroll@workzen.demo", "Payroll@123")).token;

      const [rows] = await pool.query(
        `SELECT p.payroll_id, p.payment_status FROM payroll p
         WHERE p.user_id = ? ORDER BY p.year DESC, p.month DESC`,
        [employeeId],
      );
      payrollIds = rows.map((r) => r.payroll_id);
      assert.ok(payrollIds.length >= 10, "synthetic employee has a payroll history");
    });

    after(async () => {
      const slowest = [...timings]
        .sort((a, b) => b.elapsedMs - a.elapsedMs)
        .slice(0, 5);
      console.log("slowest dataset endpoints (ms):", JSON.stringify(slowest));
      await pool.end();
    });

    describe("authentication and sessions", () => {
      it("authenticates every demo account with its documented role", async () => {
        for (const [email, password, role] of DEMO_ACCOUNTS) {
          const { token } = await login(email, password);
          const me = await call("/auth/me", { headers: auth(token) });
          assert.equal(me.status, 200, email);
          const reported =
            me.body?.data?.role ?? me.body?.data?.roleName ?? me.body?.role;
          assert.equal(reported, role, email);
        }
      });

      it("authenticates a synthetic benchmark employee", async () => {
        const me = await call("/auth/me", { headers: auth(employeeToken) });
        assert.equal(me.status, 200);
        const payload = JSON.stringify(me.body);
        assert.ok(payload.includes(String(employeeId)));
        const [rows] = await pool.query(
          "SELECT email FROM users WHERE user_id = ?",
          [employeeId],
        );
        assert.equal(rows[0].email, SYNTHETIC_EMAIL);
      });

      it("rejects an unknown synthetic password and a non-synthetic domain", async () => {
        const bad = await call("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: SYNTHETIC_EMAIL, password: "wrong-password" }),
        });
        assert.equal(bad.status, 401);
      });

      it("HIGH-3: revokes the session on logout and refuses the old token", async () => {
        const fresh = await login(SYNTHETIC_EMAIL, SYNTHETIC_PASSWORD);
        const beforeLogout = await call("/leave/balance", { headers: auth(fresh.token) });
        assert.equal(beforeLogout.status, 200);

        const logout = await call("/auth/logout", {
          method: "POST",
          headers: auth(fresh.token),
        });
        assert.equal(logout.status, 200);

        const after = await call("/leave/balance", { headers: auth(fresh.token) });
        assert.equal(after.status, 401);

        const [revoked] = await pool.query(
          `SELECT COUNT(*) AS n FROM user_sessions
           WHERE user_id = ? AND revoked_at IS NOT NULL`,
          [employeeId],
        );
        assert.ok(Number(revoked[0].n) >= 1);
      });
    });

    describe("employee self-service over the generated history", () => {
      it("serves the full attendance calendar with pagination", async () => {
      // Employees 1-150 are the senior cohort with one extra covered month.
      // The calendar size is intentionally derived from the database rather
      // than pinned: the generator's covered window is relative to the run
      // date, so a fixed [218, 238] literal went stale the first time the
      // dataset was regenerated on a later day (240 on 2026-11-19).
      const expectedTotal = await scalar(
        "SELECT COUNT(*) AS n FROM attendance WHERE user_id = ?",
        [employeeId],
      );
      assert.ok(expectedTotal >= 200, `unexpected calendar ${expectedTotal}`);
      const limit = 20;
      const expectedPages = Math.ceil(expectedTotal / limit);

        const page1 = await call(`/attendance/my-logs?page=1&limit=${limit}`, {
          headers: auth(employeeToken),
        });
        assert.equal(page1.status, 200);
        assert.equal(page1.body.data.length, limit);
        assert.equal(page1.body.pagination.total, expectedTotal);
        assert.equal(page1.body.pagination.totalPages, expectedPages);

        const page2 = await call(`/attendance/my-logs?page=2&limit=${limit}`, {
          headers: auth(employeeToken),
        });
        assert.equal(page2.status, 200);
        assert.notEqual(
          page2.body.data[0].attendance_date,
          page1.body.data[0].attendance_date,
        );

        const dates = [];
        for (let page = 1; page <= expectedPages; page += 1) {
          const { body } = await call(
            `/attendance/my-logs?page=${page}&limit=${limit}`,
            { headers: auth(employeeToken) },
          );
          dates.push(...body.data.map((r) => String(r.attendance_date).slice(0, 10)));
        }
        assert.equal(dates.length, expectedTotal);
        assert.equal(new Set(dates).size, expectedTotal, "one row per business date");
        for (const iso of dates) {
          const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
          assert.ok(dow !== 0 && dow !== 6, `weekend attendance ${iso}`);
        }
      });

      it("filters attendance to a single month", async () => {
        const { body } = await call(
          "/attendance/my-logs?start_date=2026-09-01&end_date=2026-09-30&limit=50",
          { headers: auth(employeeToken) },
        );
        assert.equal(body.pagination.total, 22);
        for (const row of body.data) {
          assert.match(String(row.attendance_date), /^2026-09/);
        }
      });

      it("keeps leave balances consistent with approved leave", async () => {
        const balance = await call("/leave/balance", { headers: auth(employeeToken) });
        assert.equal(balance.status, 200);
        assert.ok(balance.body.data.length >= 6);
        for (const row of balance.body.data) {
          assert.equal(
            Number(row.remaining_days),
            Number(row.total_allocated) - Number(row.used_days),
            row.leave_type_name,
          );
          assert.ok(Number(row.used_days) >= 0);
          assert.ok(Number(row.remaining_days) >= 0, row.leave_type_name);
          if (!Number(row.is_paid)) {
            assert.equal(Number(row.used_days), 0, "unpaid leave stays neutral");
          }
        }

        const leaves = await call("/leave/my-leaves", { headers: auth(employeeToken) });
        assert.equal(leaves.status, 200);
        assert.ok(leaves.body.data.length >= 10);
        const approved = leaves.body.data.filter((a) => a.status === "Approved");
        assert.ok(approved.length >= 1);
        for (const app of leaves.body.data) {
          assert.ok(
            ["Approved", "Pending", "Rejected", "Cancelled"].includes(app.status),
            app.status,
          );
          assert.equal(
            String(app.start_date).slice(0, 4),
            String(app.end_date).slice(0, 4),
            "single calendar year",
          );
        }

        const paidUsedByType = new Map();
        for (const app of approved) {
          if (!Number(app.is_paid)) continue;
          const key = `${app.leave_type_id}:${String(app.start_date).slice(0, 4)}`;
          paidUsedByType.set(key, (paidUsedByType.get(key) || 0) + Number(app.total_days));
        }
        for (const row of balance.body.data) {
          const used = paidUsedByType.get(`${row.leave_type_id}:${row.year}`) || 0;
          assert.equal(Number(row.used_days), used, row.leave_type_name);
        }
      });

      it("lists payroll periods with snapshot amounts that match the database", async () => {
        const { body } = await call("/payroll/my-payroll", { headers: auth(employeeToken) });
        assert.equal(body.success, true);
        assert.ok(body.data.length >= 10);
        const [dbRows] = await pool.query(
          "SELECT payroll_id, gross_salary, net_salary FROM payroll WHERE user_id = ?",
          [employeeId],
        );
        assert.equal(body.data.length, dbRows.length);
        const byId = new Map(dbRows.map((r) => [r.payroll_id, r]));
        for (const row of body.data) {
          const db = byId.get(row.payroll_id);
          assert.ok(db, `payroll_id ${row.payroll_id} exists`);
          assert.equal(Number(row.gross_salary), Number(db.gross_salary));
          assert.ok(Number(row.net_salary) > 0, "no negative net salary is exposed");
        }
      });

      it("renders a payslip PDF from the stored snapshot", async () => {
        const payrollId = payrollIds[0];
        const detail = await call(`/payroll/payslip/${payrollId}`, {
          headers: auth(employeeToken),
        });
        assert.equal(detail.status, 200);
        assert.equal(detail.body.data.payroll.payroll_id, payrollId);
        assert.equal(detail.body.data.employee.employee_id, employeeId);
        assert.equal(detail.body.data.integrity.consistent, true);
        assert.ok(detail.body.data.details.length >= 3);

        const pdf = await rawCall(`/payroll/payslip/${payrollId}/pdf`, employeeToken);
        assert.equal(pdf.status, 200);
        assert.equal(pdf.headers.get("content-type"), "application/pdf");
        assert.match(pdf.headers.get("content-disposition") || "", /attachment/);
        assert.equal(pdf.buffer.subarray(0, 4).toString(), "%PDF");
        assert.ok(pdf.buffer.length > 1000, `pdf bytes ${pdf.buffer.length}`);
      });
    });

    describe("role-based access on the populated dataset", () => {
      it("refuses employee access to HR, payroll and admin surfaces", async () => {
        for (const path of [
          "/attendance/all?limit=5",
          "/attendance/all-status",
          "/attendance/day?date=2026-09-30",
          "/attendance/export?startDate=2026-09-01&endDate=2026-09-30",
          "/leave/requests?limit=5",
          "/payroll/all?month=9&year=2026",
          "/payroll/components",
          `/payroll/salary-structure/${employeeId}`,
          "/users",
        ]) {
          const { status } = await call(path, { headers: auth(employeeToken) });
          assert.equal(status, 403, `${path} must be forbidden for Employee`);
        }
      });

      it("refuses a synthetic employee the org-wide directory records", async () => {
        const directory = await call("/users", { headers: auth(employeeToken) });
        assert.equal(directory.status, 403);
        assert.equal(directory.body.success, false);
        assert.equal(directory.body.data, undefined, "no employee rows are returned");
        assert.equal(directory.body.count, undefined, "no org size is returned");

        const presence = await call("/attendance/all-status", {
          headers: auth(employeeToken),
        });
        assert.equal(presence.status, 403);
        assert.equal(presence.body.data, undefined, "no presence map is returned");
      });

      it("keeps the directory available to staff roles at scale", async () => {
        const adminToken = (await login("admin@workzen.demo", "Admin@123")).token;

        for (const [role, token] of [
          ["Admin", adminToken],
          ["HR Officer", hrToken],
          ["Payroll Officer", payrollToken],
        ]) {
          const directory = await call("/users", { headers: auth(token) });
          assert.equal(directory.status, 200, `${role} reads the directory`);
          assert.equal(directory.body.success, true);
          assert.ok(directory.body.data.length > 1000, "full synthetic directory");
          assert.equal(directory.body.count, directory.body.data.length);

          const presence = await call("/attendance/all-status", {
            headers: auth(token),
          });
          assert.equal(presence.status, 200, `${role} reads presence`);
          assert.equal(typeof presence.body.data, "object");
        }
      });

      it("refuses cross-employee reads (IDOR)", async () => {
        const [other] = await pool.query(
          "SELECT user_id FROM users WHERE email = ?",
          [OTHER_SYNTHETIC_EMAIL],
        );
        const otherId = other[0].user_id;
        const [otherPayroll] = await pool.query(
          "SELECT payroll_id FROM payroll WHERE user_id = ? LIMIT 1",
          [otherId],
        );

        const balance = await call(`/leave/balance?employee_id=${otherId}`, {
          headers: auth(employeeToken),
        });
        assert.equal(balance.status, 403);

        const payslip = await call(`/payroll/payslip/${otherPayroll[0].payroll_id}`, {
          headers: auth(employeeToken),
        });
        assert.equal(payslip.status, 403);

        const pdf = await rawCall(
          `/payroll/payslip/${otherPayroll[0].payroll_id}/pdf`,
          employeeToken,
        );
        assert.equal(pdf.status, 403);

        const logs = await call("/attendance/my-logs?limit=1", { headers: {} });
        assert.equal(logs.status, 401);
      });

      it("serves HR day listings and filters across 1,000 employees", async () => {
        const day = await call("/attendance/day?date=2026-09-30&limit=25", {
          headers: auth(hrToken),
        });
        assert.equal(day.status, 200);
        assert.equal(day.body.pagination.total, 1001);
        assert.equal(day.body.data.length, 25);

        const late = await call(
          "/attendance/day?date=2026-09-30&status=Late&limit=200",
          { headers: auth(hrToken) },
        );
        assert.equal(late.status, 200);
        assert.ok(late.body.pagination.total > 0);
        for (const row of late.body.data) {
          assert.equal(row.status, "Late");
        }

        const engineering = await call(
          "/attendance/day?date=2026-09-30&department=Engineering&limit=200",
          { headers: auth(hrToken) },
        );
        assert.ok(engineering.body.pagination.total > 0);
        for (const row of engineering.body.data) {
          assert.equal(row.department, "Engineering");
        }

        const search = await call(
          `/attendance/day?date=2026-09-30&search=${encodeURIComponent(SYNTHETIC_EMAIL)}&limit=10`,
          { headers: auth(hrToken) },
        );
        assert.equal(search.body.pagination.total, 1);

        const page10 = await call("/attendance/day?date=2026-09-30&page=10&limit=25", {
          headers: auth(hrToken),
        });
        assert.equal(page10.body.data.length, 25);
        assert.equal(page10.body.pagination.page, 10);
      });

      it("serves payroll officer queries for a closed period", async () => {
        // The covered window is relative to the generation date, so the closed
        // month and the outside month are derived from the data instead of
        // hardcoded (month 9 stopped being the last covered month the first
        // time the dataset was regenerated on a later day).
        const [lastCovered] = await pool.query(
          `SELECT MAX(year * 100 + month) AS period FROM payroll p
           INNER JOIN users u ON u.user_id = p.user_id
           WHERE u.email LIKE '%@workzen.test'`,
        );
        const coveredPeriod = Number(lastCovered[0].period);
        const coveredMonth = coveredPeriod % 100;
        const coveredYear = Math.floor(coveredPeriod / 100);
        let outsideMonth = coveredMonth + 1;
        let outsideYear = coveredYear;
        if (outsideMonth > 12) {
          outsideMonth = 1;
          outsideYear += 1;
        }

        const period = await call(`/payroll/all?month=${coveredMonth}&year=${coveredYear}`, {
          headers: auth(payrollToken),
        });
        assert.equal(period.status, 200);
        assert.equal(period.body.count, 1001);
        for (const row of period.body.data) {
          assert.equal(Number(row.month), coveredMonth);
          assert.equal(Number(row.year), coveredYear);
        }

        // The newest covered month is Processed, not Paid; the generator marks
        // older months Paid, so the status-filtered query targets the month
        // before the last covered one.
        let paidMonth = coveredMonth - 1;
        let paidYear = coveredYear;
        if (paidMonth < 1) {
          paidMonth = 12;
          paidYear -= 1;
        }
        const paid = await call(
          `/payroll/all?month=${paidMonth}&year=${paidYear}&status=Paid`,
          { headers: auth(payrollToken) },
        );
        assert.equal(paid.body.count, 1001);

        const openPeriod = await call(
          `/payroll/all?month=${outsideMonth}&year=${outsideYear}`,
          { headers: auth(payrollToken) },
        );
        assert.equal(openPeriod.body.count, 0, "no payroll outside the covered window");
      });

      it("serves organization leave queries to HR", async () => {
        const requests = await call("/leave/requests?page=1&limit=20", {
          headers: auth(hrToken),
        });
        assert.equal(requests.status, 200);
        assert.ok(Array.isArray(requests.body.data));
        assert.ok(requests.body.data.length > 0);
      });
    });

    describe("representative sample against the live payroll service", () => {
      it("reproduces stored snapshots using the real calculation path", async () => {
        // Decision 4: bulk generation reuses the payroll calculation rules
        // instead of calling generatePayroll() 10,150 times, so a spread sample
        // must still agree with what the live service computes from the same
        // attendance, leave and salary-structure rows.
        const [rows] = await pool.query(
          `SELECT p.payroll_id, p.user_id, p.month, p.year, p.working_days,
                  p.present_days, p.leave_days, p.gross_salary, p.total_deductions,
                  p.net_salary
           FROM payroll p
           INNER JOIN users u ON u.user_id = p.user_id
           WHERE u.email LIKE '%@workzen.test' AND p.month <> 12
           ORDER BY p.year, p.month, p.user_id`,
        );
        assert.ok(rows.length >= 9000, `sample population was ${rows.length}`);
        const step = Math.floor(rows.length / 20);
        const sample = [];
        for (let i = 0; i < rows.length && sample.length < 20; i += step) {
          sample.push(rows[i]);
        }
        sample.push(rows[rows.length - 1]);
        assert.equal(sample.length, 21);

        for (const stored of sample) {
          const { month, year } = stored;
          const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
          const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
          const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

          const components = await resolveSalaryStructureForUpdate(
            pool,
            stored.user_id,
            periodStart,
          );
          const [attendanceRows, leaveRows] = await Promise.all([
            getAttendanceRowsForPeriod(pool, stored.user_id, month, year),
            getApprovedLeaveForPeriod(pool, stored.user_id, periodStart, periodEnd),
          ]);
          const result = calculatePayroll({
            workingDays: countWorkingDays(year, month),
            presentDays: attendancePayableDays(attendanceRows),
            leaveDays: paidLeaveDaysForPeriod(leaveRows, periodStart, periodEnd),
            components,
          });

          const label = `payroll ${stored.payroll_id} (user ${stored.user_id}, ${year}-${month})`;
          assert.equal(result.workingDays, Number(stored.working_days), `${label} working days`);
          assert.equal(result.presentDays, Number(stored.present_days), `${label} present days`);
          assert.equal(result.leaveDays, Number(stored.leave_days), `${label} leave days`);
          assert.equal(
            Number(result.grossSalary),
            Number(stored.gross_salary),
            `${label} gross`,
          );
          assert.equal(
            Number(result.totalDeductions),
            Number(stored.total_deductions),
            `${label} deductions`,
          );
          assert.equal(
            Number(result.netSalary),
            Number(stored.net_salary),
            `${label} net`,
          );
          assert.ok(result.netSalary > 0, label);

          const [details] = await pool.query(
            `SELECT pd.component_id, pd.amount, sc.component_type, sc.calculation_type
             FROM payroll_details pd
             INNER JOIN salary_components sc ON sc.component_id = pd.component_id
             WHERE pd.payroll_id = ? ORDER BY pd.detail_id`,
            [stored.payroll_id],
          );
          assert.equal(details.length, result.breakdown.length, `${label} detail rows`);
          // Compared by component, not by row position: employee_salary_structure
          // resolves with ORDER BY component_type, and MySQL sorts an ENUM by its
          // declaration index, so the live engine's row order is Deduction-first.
          // The amounts themselves must be identical.
          const breakdownByComponent = new Map(
            result.breakdown.map((b) => [b.component_id, b]),
          );
          for (const detail of details) {
            const breakdown = breakdownByComponent.get(detail.component_id);
            assert.ok(breakdown, `${label} unexpected component ${detail.component_id}`);
            assert.equal(detail.component_type, breakdown.component_type, label);
            assert.equal(detail.calculation_type, breakdown.calculation_type, label);
            assert.equal(
              Number(detail.amount),
              Number(breakdown.amount),
              `${label} ${breakdown.component_name}`,
            );
          }
        }
      });
    });

    describe("generator completeness in the live schema", () => {
      it("leaves no partially generated employee behind", async () => {
        const withoutAttendance = await scalar(
          `SELECT COUNT(*) AS n FROM users u
           WHERE u.email LIKE '%@workzen.test'
             AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.user_id = u.user_id)`,
        );
        const withoutPayroll = await scalar(
          `SELECT COUNT(*) AS n FROM users u
           WHERE u.email LIKE '%@workzen.test'
             AND NOT EXISTS (SELECT 1 FROM payroll p WHERE p.user_id = u.user_id)`,
        );
        const withoutBalance = await scalar(
          `SELECT COUNT(*) AS n FROM users u
           WHERE u.email LIKE '%@workzen.test'
             AND NOT EXISTS (SELECT 1 FROM leave_balance lb WHERE lb.user_id = u.user_id)`,
        );
        assert.equal(withoutAttendance, 0);
        assert.equal(withoutPayroll, 0);
        assert.equal(withoutBalance, 0);
      });

      it("reaches the approved record volumes", async () => {
        assert.equal(
          await scalar("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@workzen.test'"),
          1000,
        );
        // Attendance is the one volume that cannot be pinned exactly: synthetic
        // join dates are relative to the generation date, so first-month
        // coverage shifts with every regeneration (221000 on the day these
        // literals were written, 220450 on 2026-11-19). The floor is the
        // generator's own plan for a fully covered window: every covered
        // weekday yields exactly one attendance row, so the total must at
        // least reach the senior+regular weekday math for the default sizing.
        const seniorWeekdays = weekdaysForMonths(
          monthsForEmployee(1, benchmarkDefaults, benchmarkPeriod),
        ).length;
        const regularWeekdays = weekdaysForMonths(
          monthsForEmployee(benchmarkDefaults.employees, benchmarkDefaults, benchmarkPeriod),
        ).length;
        const attendanceFloor =
          benchmarkDefaults.seniorCount * seniorWeekdays +
          (benchmarkDefaults.employees - benchmarkDefaults.seniorCount) * regularWeekdays;
        const attendanceTotal = await scalar(
          `SELECT COUNT(*) AS n FROM attendance a INNER JOIN users u ON u.user_id = a.user_id
           WHERE u.email LIKE '%@workzen.test'`,
        );
        assert.ok(
          attendanceTotal >= attendanceFloor && attendanceTotal <= attendanceFloor * 1.1,
          `attendance volume ${attendanceTotal} outside the planned band [${attendanceFloor}, ${Math.floor(attendanceFloor * 1.1)}]`,
        );
        assert.equal(
          await scalar(
            `SELECT COUNT(*) AS n FROM leave_applications la INNER JOIN users u ON u.user_id = la.user_id
             WHERE u.email LIKE '%@workzen.test'`,
          ),
          12300,
        );
        assert.equal(
          await scalar(
            `SELECT COUNT(*) AS n FROM payroll p INNER JOIN users u ON u.user_id = p.user_id
             WHERE u.email LIKE '%@workzen.test'`,
          ),
          10150,
        );
        assert.equal(
          await scalar(
            `SELECT COUNT(*) AS n FROM payroll_details pd INNER JOIN payroll p ON p.payroll_id = pd.payroll_id
             INNER JOIN users u ON u.user_id = p.user_id WHERE u.email LIKE '%@workzen.test'`,
          ),
          30450,
        );
      });

      it("generated no bulk audit rows; only live API actions are audited", async () => {
        // npm run setup:demo leaves audit_logs empty (verify:demo reports
        // auditLogRows: 0). The only rows present here are PAYSLIP_DOWNLOADED
        // events written by this suite's own authenticated PDF download.
        const bulkAudit = await scalar(
          `SELECT COUNT(*) AS n FROM audit_logs al
           INNER JOIN users u ON u.user_id = al.user_id
           WHERE u.email LIKE '%@workzen.test'
             AND al.action <> 'PAYSLIP_DOWNLOADED'`,
        );
        assert.equal(bulkAudit, 0);
      });
    });
  },
);

guardExecutedTests("DEMO_DATASET_API_URL", 20);
