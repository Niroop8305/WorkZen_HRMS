import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import pool from "../src/config/database.js";
import { attendanceConfig } from "../src/config/attendance.js";
import dashboardRoutes from "../src/routes/dashboardRoutes.js";

// The /stats handler is inline in the router, so it is taken from the route
// stack. That also keeps this test honest about the middleware the route
// actually carries, instead of re-declaring it here.
const routeOf = (path) => {
  const layer = dashboardRoutes.stack.find((entry) => entry.route?.path === path);
  assert.ok(layer, `router must still mount ${path}`);
  return layer.route;
};

const lastHandler = (path) => {
  const route = routeOf(path);
  return route.stack[route.stack.length - 1].handle;
};

// 18:30-24:00 UTC is 00:00-05:30 IST, so the UTC calendar date still names the
// previous business day there. Expectations are hand-written: computing them
// from the helper under test would prove nothing.
const boundaries = [
  { utc: "2026-10-16T18:29:59.000Z", businessDate: "2026-10-16" },
  { utc: "2026-10-16T18:30:00.000Z", businessDate: "2026-10-17" },
  { utc: "2026-10-16T19:00:00.000Z", businessDate: "2026-10-17" },
  { utc: "2026-10-16T21:30:00.000Z", businessDate: "2026-10-17" },
  { utc: "2026-10-16T23:59:59.000Z", businessDate: "2026-10-17" },
  { utc: "2026-10-17T00:00:00.000Z", businessDate: "2026-10-17" },
];
const shiftWindow = boundaries.filter((entry) => entry.businessDate !== entry.utc.slice(0, 10));

const cannedRows = (sql) => {
  if (/COUNT\(\*\) as total FROM users/.test(sql)) return [{ total: 5 }];
  if (/COUNT\(DISTINCT department\)/.test(sql)) return [{ total: 2 }];
  if (/COUNT\(\*\) as present FROM attendance/.test(sql)) return [{ present: 3 }];
  if (/COUNT\(\*\) as pending/.test(sql)) return [{ pending: 1 }];
  if (/FROM attendance/.test(sql)) {
    return [{ total_employees: 5, total_present: 3, total_absent: 0, total_on_leave: 0 }];
  }
  if (/department, COUNT\(\*\)/.test(sql)) return [{ department: "QA", count: 5 }];
  return [];
};

const runStats = async (utc) => {
  const queries = [];
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const originalQuery = pool.query;
  pool.query = (sql, values = []) => {
    queries.push({ sql, values });
    return Promise.resolve([cannedRows(sql), []]);
  };
  mock.timers.enable({ apis: ["Date"], now: new Date(utc).getTime() });
  try {
    await lastHandler("/stats")({ user: { userId: 1, roleName: "Admin" } }, response);
  } finally {
    pool.query = originalQuery;
    mock.timers.reset();
  }
  return { queries, response };
};

const attendanceDateQuery = (queries) => {
  const target = queries.find((entry) => /COUNT\(\*\) as present FROM attendance/.test(entry.sql));
  assert.ok(target, "/stats still counts the day's attendance");
  return target.values[0];
};

const monthlyQuery = (queries) => {
  const target = queries.find((entry) => /COUNT\(DISTINCT user_id\)/.test(entry.sql));
  assert.ok(target, "/stats still aggregates the month's attendance");
  return target;
};

const periodOf = (queries) => {
  const { values } = monthlyQuery(queries);
  assert.equal(
    values.length,
    2,
    "the monthly period must be bound, not resolved by the database clock",
  );
  return { month: values[0], year: values[1] };
};

// Month and year transitions, hand-written in the same frame as the table
// above: the UTC instant, the business period in attendanceConfig.timeZone
// (Asia/Kolkata by default), and the period a UTC-derived clock names instead.
// The shifted hours are 18:30-23:59:59Z, and they only change the *period* on
// the last day of a month, which is why every row below sits at a month end.
const periodBoundaries = [
  { utc: "2026-10-31T18:29:59.000Z", month: 10, year: 2026, utcMonth: 10, utcYear: 2026 },
  { utc: "2026-10-31T18:30:00.000Z", month: 11, year: 2026, utcMonth: 10, utcYear: 2026 },
  { utc: "2026-10-31T23:59:59.000Z", month: 11, year: 2026, utcMonth: 10, utcYear: 2026 },
  { utc: "2026-11-01T00:00:00.000Z", month: 11, year: 2026, utcMonth: 11, utcYear: 2026 },
  { utc: "2026-12-31T18:29:59.000Z", month: 12, year: 2026, utcMonth: 12, utcYear: 2026 },
  { utc: "2026-12-31T18:30:00.000Z", month: 1, year: 2027, utcMonth: 12, utcYear: 2026 },
  { utc: "2027-01-01T00:00:00.000Z", month: 1, year: 2027, utcMonth: 1, utcYear: 2027 },
];
const periodShift = periodBoundaries.filter(
  (entry) => entry.month !== entry.utcMonth || entry.year !== entry.utcYear,
);

const runMyStats = async (utc) => {
  const queries = [];
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const originalQuery = pool.query;
  pool.query = (sql, values = []) => {
    queries.push({ sql, values });
    return Promise.resolve([cannedRows(sql), []]);
  };
  mock.timers.enable({ apis: ["Date"], now: new Date(utc).getTime() });
  try {
    await lastHandler("/my-stats")({ user: { userId: 42, roleName: "Employee" } }, response);
  } finally {
    pool.query = originalQuery;
    mock.timers.reset();
  }
  return { queries, response };
};

const myStatsPeriod = (queries) => {
  const target = queries.find((entry) => /FROM view_monthly_attendance/.test(entry.sql));
  assert.ok(target, "/my-stats still reads the monthly attendance view");
  return { userId: target.values[0], month: target.values[1], year: target.values[2] };
};

const myStatsBalanceYear = (queries) => {
  const target = queries.find((entry) => /FROM leave_balance lb/.test(entry.sql));
  assert.ok(target, "/my-stats still reads the leave balance");
  return { userId: target.values[0], year: target.values[1] };
};

describe("dashboard business-date rule", () => {
  it("binds the IST business date on both sides of 18:30 UTC", async () => {
    for (const { utc, businessDate } of boundaries) {
      const { queries } = await runStats(utc);
      assert.equal(attendanceDateQuery(queries), businessDate, `/stats date at ${utc}`);
    }
  });

  it("never falls back to the UTC calendar date inside the shift window", async () => {
    assert.ok(shiftWindow.length >= 3, "the shift window must be exercised");
    for (const { utc, businessDate } of shiftWindow) {
      const { queries } = await runStats(utc);
      const bound = attendanceDateQuery(queries);
      assert.notEqual(bound, utc.slice(0, 10), `/stats used the UTC day at ${utc}`);
      assert.equal(bound, businessDate);
    }
  });

  it("follows the same rule as the attendance endpoints it feeds", async () => {
    // /attendance/status is the reference for "today"; the dashboard card and
    // that endpoint must never describe two different days.
    const { getAttendanceStatus } = await import("../src/controllers/attendanceController.js");
    for (const { utc, businessDate } of boundaries) {
      const dashboard = await runStats(utc);
      const statusQueries = [];
      const originalQuery = pool.query;
      const res = {
        statusCode: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      pool.query = (sql, values = []) => {
        statusQueries.push(values);
        return Promise.resolve([[], []]);
      };
      mock.timers.enable({ apis: ["Date"], now: new Date(utc).getTime() });
      try {
        await getAttendanceStatus({ user: { userId: 1 } }, res);
      } finally {
        pool.query = originalQuery;
        mock.timers.reset();
      }
      assert.equal(attendanceDateQuery(dashboard.queries), businessDate);
      assert.equal(statusQueries[0][1], businessDate, `/attendance/status disagrees at ${utc}`);
    }
  });

  it("keeps the documented response shape", async () => {
    const { response } = await runStats(shiftWindow[0].utc);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.deepEqual(Object.keys(response.body.data).sort(), [
      "department_stats",
      "monthly_attendance",
      "overview",
      "recent_leaves",
    ]);
    assert.deepEqual(response.body.data.overview, {
      total_employees: 5,
      total_departments: 2,
      today_present: 3,
      pending_leaves: 1,
    });
  });

  it("keeps /stats restricted to Admin and HR Officer", () => {
    const route = routeOf("/stats");
    assert.equal(route.stack.length, 3, "protect, authorize, handler");
    const gate = route.stack[1].handle;
    const decide = (req) => {
      let nextCalled = false;
      const res = {
        statusCode: null,
        status(code) { this.statusCode = code; return this; },
        json() { return this; },
      };
      gate(req, res, () => { nextCalled = true; });
      return { allowed: nextCalled, status: res.statusCode };
    };

    for (const role of ["Admin", "HR Officer"]) {
      assert.deepEqual(decide({ user: { roleName: role } }), { allowed: true, status: null }, role);
    }
    for (const role of ["Employee", "Payroll Officer"]) {
      assert.deepEqual(decide({ user: { roleName: role } }), { allowed: false, status: 403 }, role);
    }
    assert.deepEqual(decide({}), { allowed: false, status: 401 }, "an unauthenticated request");
  });

  it("leaves /my-stats self-scoped and untouched", () => {
    const route = routeOf("/my-stats");
    assert.equal(route.stack.length, 2, "protect, handler");
  });
});

describe("dashboard business month/year rule", () => {
  it("runs these boundary tables against the zone they are written for", () => {
    // Every expectation below is hand-written for the documented default. A
    // deployment that sets APP_TIMEZONE must update the tables, not silently
    // assert a different zone's boundaries.
    assert.equal(attendanceConfig.timeZone, "Asia/Kolkata");
  });

  it("binds the business period at month and year boundaries", async () => {
    for (const entry of periodBoundaries) {
      const { month, year } = periodOf((await runStats(entry.utc)).queries);
      assert.deepEqual({ month, year }, { month: entry.month, year: entry.year }, entry.utc);
    }
  });

  it("never names the UTC-derived period inside the shift window", async () => {
    assert.ok(periodShift.length >= 2, "the month-end shift window must be exercised");
    for (const entry of periodShift) {
      const { month, year } = periodOf((await runStats(entry.utc)).queries);
      assert.notDeepEqual(
        { month, year },
        { month: entry.utcMonth, year: entry.utcYear },
        `/stats/month named the UTC period at ${entry.utc}`,
      );
    }
  });

  it("agrees with the day it reports in the same response", async () => {
    for (const entry of periodBoundaries) {
      const { queries } = await runStats(entry.utc);
      const { month, year } = periodOf(queries);
      const businessMonth = attendanceDateQuery(queries).slice(0, 7);
      assert.equal(
        `${year}-${String(month).padStart(2, "0")}`,
        businessMonth,
        `/stats day and month described different periods at ${entry.utc}`,
      );
    }
  });

  it("binds the business period for /my-stats attendance and leave balance", async () => {
    for (const entry of periodBoundaries) {
      const { queries } = await runMyStats(entry.utc);
      const period = myStatsPeriod(queries);
      assert.equal(period.userId, 42, "/my-stats stays self-scoped");
      assert.deepEqual(
        { month: period.month, year: period.year },
        { month: entry.month, year: entry.year },
        `/my-stats attendance period at ${entry.utc}`,
      );
      const balance = myStatsBalanceYear(queries);
      assert.equal(balance.userId, 42, "/my-stats stays self-scoped");
      assert.equal(balance.year, entry.year, `/my-stats leave balance year at ${entry.utc}`);
    }
  });

  it("reports the business period on a UTC-hosted process", async () => {
    // A container with no TZ set resolves the host clock in UTC, which is the
    // deployment this defect was written for. Forcing the process zone makes
    // the host-clock version measurable on any machine, including an IST one.
    const originalTZ = process.env.TZ;
    const hostZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = "UTC";
    try {
      for (const entry of periodShift) {
        const { queries } = await runMyStats(entry.utc);
        const period = myStatsPeriod(queries);
        assert.deepEqual(
          { month: period.month, year: period.year },
          { month: entry.month, year: entry.year },
          `/my-stats on a UTC host at ${entry.utc}`,
        );
        assert.equal(myStatsBalanceYear(queries).year, entry.year, `balance year at ${entry.utc}`);
      }
    } finally {
      // Deleting TZ does not restore the system zone in Node; assigning it does.
      process.env.TZ = originalTZ === undefined ? hostZone : originalTZ;
    }
  });

  it("keeps the documented /my-stats response shape", async () => {
    const { queries, response } = await runMyStats(periodShift[0].utc);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.deepEqual(Object.keys(response.body.data).sort(), [
      "attendance_summary",
      "leave_balance",
      "pending_leaves",
      "recent_payroll",
    ]);
    assert.deepEqual(response.body.data.attendance_summary, {});
    for (const entry of queries) assert.equal(entry.values[0], 42, "every query is user-scoped");
  });

  it("takes the period from the configured business zone, not a host clock", async () => {
    // The same pinned instant, two configured business zones. A deployment that
    // names a different zone must report a different current period, which no
    // host- or database-derived month can express.
    const instant = "2026-10-31T19:00:00.000Z";
    const previous = process.env.APP_TIMEZONE;
    const cases = [
      { zone: "Asia/Kolkata", date: "2026-11-01", month: 11, year: 2026 },
      { zone: "Asia/Dubai", date: "2026-10-31", month: 10, year: 2026 },
    ];
    try {
      for (const expected of cases) {
        process.env.APP_TIMEZONE = expected.zone;
        const { getBusinessNow: zoneNow } = await import(
          `../src/config/attendance.js?zone=${expected.zone}`
        );
        mock.timers.enable({ apis: ["Date"], now: new Date(instant).getTime() });
        let at;
        try {
          at = zoneNow();
        } finally {
          mock.timers.reset();
        }
        assert.deepEqual(
          { date: at.date, month: at.month, year: at.year },
          { date: expected.date, month: expected.month, year: expected.year },
          `${expected.zone} at ${instant}`,
        );
      }
    } finally {
      if (previous === undefined) delete process.env.APP_TIMEZONE;
      else process.env.APP_TIMEZONE = previous;
    }
  });
});
