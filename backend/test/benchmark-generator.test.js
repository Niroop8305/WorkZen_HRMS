import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateAttendanceMetrics } from "../src/config/attendance.js";
import {
  attendancePayableDays,
  countWeekdaysInclusive,
  countWorkingDays,
} from "../src/services/payrollService.js";
import {
  approvedLeaveWeekdays,
  buildIdentity,
  coveredMonths,
  createRandom,
  planAttendance,
  planEmployee,
  planLeaveApplications,
  planSalaryComponents,
  syntheticCode,
  syntheticEmail,
  weekdaysForMonths,
  weekdaysInMonth,
} from "../src/database/benchmark/plan.js";
import {
  leaveTargetForEmployee,
  parseArgs,
  resolvePeriod,
  rngForEmployee,
} from "../src/database/generate-benchmark.js";

// =====================================================
// Benchmark / demo-dataset generator units.
//
// These exercise the pure planning layer only: no database connection is
// opened, so they run inside `npm test` on any machine. They lock in the
// guarantees the generated dataset relies on — determinism, weekday-only
// calendars, non-overlapping single-year leave windows inside the allocated
// balance, attendance rows that satisfy the live attendance policy, and
// payroll snapshots that reuse the live payroll engine.
// =====================================================

const LEAVE_TYPES = [
  { leave_type_id: 1, leave_type_name: "Casual Leave", is_paid: 1, default_days_per_year: 12 },
  { leave_type_id: 2, leave_type_name: "Sick Leave", is_paid: 1, default_days_per_year: 10 },
  { leave_type_id: 3, leave_type_name: "Earned Leave", is_paid: 1, default_days_per_year: 20 },
  { leave_type_id: 4, leave_type_name: "Maternity Leave", is_paid: 1, default_days_per_year: 180 },
  { leave_type_id: 5, leave_type_name: "Paternity Leave", is_paid: 1, default_days_per_year: 15 },
  { leave_type_id: 6, leave_type_name: "Unpaid Leave", is_paid: 0, default_days_per_year: 0 },
];

// The approved V2 benchmark window: Dec-2025 .. Sep-2026 for the main cohort.
const MONTHS = coveredMonths({ endYear: 2026, endMonth: 9, months: 10 });
const SENIOR_MONTHS = coveredMonths({ endYear: 2026, endMonth: 9, months: 11 });

const isWeekday = (iso) => {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
};

const Components = () =>
  planSalaryComponents({
    rng: createRandom(4242),
    componentsByName: null,
    basicComponentId: 1,
    hraComponentId: 2,
    pfComponentId: 3,
  });

describe("planning primitives", () => {
  it("produces a reproducible stream for a seed and a different one per seed", () => {
    const a = [0, 0, 0, 0, 0].map(() => createRandom(20261001)());
    const b = [0, 0, 0, 0, 0].map(() => createRandom(20261001)());
    assert.deepEqual(a, b);
    const c = [0, 0, 0, 0, 0].map(() => createRandom(7)());
    assert.notDeepEqual(a, c);
  });

  it("derives a stable per-employee stream that differs between employees", () => {
    const first = [0, 0, 0].map(() => rngForEmployee(20261001, 12)());
    const again = [0, 0, 0].map(() => rngForEmployee(20261001, 12)());
    const other = [0, 0, 0].map(() => rngForEmployee(20261001, 13)());
    assert.deepEqual(first, again);
    assert.notDeepEqual(first, other);
  });

  it("lists only Monday-Friday dates per month", () => {
    const september = weekdaysInMonth(2026, 9);
    assert.equal(september.total, 30);
    assert.equal(september.dates.length, 22);
    assert.ok(september.dates.every(isWeekday));
    assert.equal(september.dates[0], "2026-09-01");
    assert.equal(september.dates[september.dates.length - 1], "2026-09-30");
  });

  it("covers the documented 218 working days for the 10-month cohort", () => {
    assert.equal(MONTHS.length, 10);
    assert.deepEqual(MONTHS[0], { year: 2025, month: 12 });
    assert.deepEqual(MONTHS[9], { year: 2026, month: 9 });
    assert.equal(weekdaysForMonths(MONTHS).length, 218);
    assert.equal(weekdaysForMonths(SENIOR_MONTHS).length, 238);
    assert.equal(weekdaysForMonths(MONTHS).every(isWeekday), true);
  });

  it("keeps synthetic identities in the reserved benchmark domain", () => {
    assert.equal(syntheticEmail(1), "emp0001@workzen.test");
    assert.equal(syntheticEmail(1000), "emp1000@workzen.test");
    assert.equal(syntheticCode(42), "WZ-SYN-0042");

    const identity = buildIdentity(7, createRandom(11), {
      referenceDate: "2026-09-30",
      firstCoveredDate: "2025-12-01",
    });
    assert.equal(identity.email, "emp0007@workzen.test");
    assert.match(identity.date_of_birth, /^\d{4}-\d{2}-\d{2}$/);
    // Joining precedes the first payroll period so structures and balances resolve.
    assert.ok(identity.date_of_joining < "2025-12-01");
  });
});

describe("argument and period parsing", () => {
  it("applies the approved V2 defaults", () => {
    const options = parseArgs([]);
    assert.equal(options.seed, 20261001);
    assert.equal(options.employees, 1000);
    assert.equal(options.months, 10);
    assert.equal(options.seniorCount, 150);
    assert.equal(options.seniorExtraMonths, 1);
    assert.equal(options.leaveApplications, 12300);
    assert.equal(options.coverDemoEmployee, true);
  });

  it("clamps the senior cohort and rejects impossible or unsafe input", () => {
    assert.equal(
      parseArgs(["--employees=5", "--leave-applications=60"]).seniorCount,
      5,
    );
    assert.equal(
      parseArgs(["--employees=5", "--senior-count=2", "--leave-applications=60"])
        .seniorCount,
      2,
    );
    assert.throws(() => parseArgs(["--employees=5", "--leave-applications=500"]), /cannot fit/);
    assert.throws(() => parseArgs(["--employees=0"]), /must be an integer >= 1/);
    assert.throws(() => parseArgs(["--bogus=1"]), /Unrecognised/);
    assert.throws(() => parseArgs(["--database=bad name"]), /Unsafe database name/);
  });

  it("resolves the last complete business month and an explicit period", () => {
    assert.deepEqual(resolvePeriod({}, "2026-10-15"), { endYear: 2026, endMonth: 9 });
    assert.deepEqual(resolvePeriod({}, "2026-01-05"), { endYear: 2025, endMonth: 12 });
    assert.deepEqual(resolvePeriod({ endPeriod: "2026-03" }, "2026-10-15"), {
      endYear: 2026,
      endMonth: 3,
    });
    assert.throws(() => resolvePeriod({ endPeriod: "2026-13" }, "2026-10-15"), /01-12/);
    assert.throws(() => resolvePeriod({ endPeriod: "202612" }, "2026-10-15"), /YYYY-MM/);
  });

  it("distributes the exact leave target across employees", () => {
    const options = { leaveApplications: 12300, employees: 1000 };
    let total = 0;
    for (let index = 1; index <= options.employees; index += 1) {
      total += leaveTargetForEmployee(index, options);
    }
    assert.equal(total, 12300);
    assert.equal(leaveTargetForEmployee(1, options), 13);
    assert.equal(leaveTargetForEmployee(301, options), 12);
  });
});

describe("leave planning", () => {
  const dates = weekdaysForMonths(MONTHS);
  const rng = createRandom(909);
  const applications = planLeaveApplications({
    rng,
    dates,
    leaveTypes: LEAVE_TYPES,
    targetCount: 13,
  });

  it("produces exactly the requested number of weekday windows", () => {
    assert.equal(applications.length, 13);
    for (const app of applications) {
      assert.ok(isWeekday(app.start_date), app.start_date);
      assert.ok(isWeekday(app.end_date), app.end_date);
      assert.ok(app.start_date <= app.end_date);
      assert.equal(app.start_date.slice(0, 4), app.end_date.slice(0, 4));
      assert.equal(
        app.total_days,
        countWeekdaysInclusive(app.start_date, app.end_date),
        `${app.start_date}..${app.end_date}`,
      );
      assert.ok(
        ["Approved", "Pending", "Rejected", "Cancelled"].includes(app.status),
        app.status,
      );
    }
  });

  it("never overlaps two windows for the same employee", () => {
    const sorted = [...applications].sort((a, b) =>
      a.start_date < b.start_date ? -1 : 1,
    );
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(
        sorted[i].start_date > sorted[i - 1].end_date,
        `overlap: ${sorted[i - 1].start_date}..${sorted[i - 1].end_date} vs ${sorted[i].start_date}..${sorted[i].end_date}`,
      );
    }
  });

  it("keeps paid leave inside the annual allocation and leaves unpaid types untouched", () => {
    const allocation = new Map(
      LEAVE_TYPES.map((t) => [t.leave_type_id, t.default_days_per_year]),
    );
    const usage = new Map();
    for (const app of applications) {
      if (!app.is_paid) continue;
      const key = `${app.leave_type_id}:${app.year}`;
      usage.set(key, (usage.get(key) || 0) + app.total_days);
    }
    for (const [key, days] of usage) {
      const typeId = Number(key.split(":")[0]);
      assert.ok(
        days <= allocation.get(typeId),
        `${key} used ${days} of ${allocation.get(typeId)}`,
      );
    }
    for (const app of applications) {
      const type = LEAVE_TYPES.find((t) => t.leave_type_id === app.leave_type_id);
      assert.ok(type, `unknown leave type id ${app.leave_type_id}`);
      assert.equal(app.leave_type_name, type.leave_type_name);
      assert.equal(app.is_paid, Boolean(type.is_paid));
    }
  });

  it("marks only approved windows as consuming working days", () => {
    const onLeave = approvedLeaveWeekdays(applications);
    const approved = applications.filter((app) => app.status === "Approved");
    let expected = 0;
    for (const app of approved) expected += app.total_days;
    assert.equal(onLeave.size, expected);
    for (const iso of onLeave) assert.ok(isWeekday(iso));
  });
});

describe("attendance planning", () => {
  const dates = weekdaysForMonths(MONTHS);
  const applications = planLeaveApplications({
    rng: createRandom(77),
    dates,
    leaveTypes: LEAVE_TYPES,
    targetCount: 13,
  });
  const onLeaveDates = approvedLeaveWeekdays(applications);
  const rows = planAttendance({ rng: createRandom(77), dates, onLeaveDates });

  it("creates exactly one row per working day", () => {
    assert.equal(rows.length, dates.length);
    assert.deepEqual(
      rows.map((row) => row.attendance_date),
      dates,
    );
    assert.equal(new Set(rows.map((row) => row.attendance_date)).size, dates.length);
  });

  it("shows approved leave as On Leave without timestamps", () => {
    for (const row of rows) {
      if (onLeaveDates.has(row.attendance_date)) {
        assert.equal(row.status, "On Leave", row.attendance_date);
        assert.equal(row.check_in_time, null);
        assert.equal(row.check_out_time, null);
        assert.equal(row.total_hours, null);
      }
    }
    for (const iso of onLeaveDates) {
      const row = rows.find((r) => r.attendance_date === iso);
      assert.equal(row.status, "On Leave");
    }
  });

  it("drives every timed row through the live attendance policy", () => {
    const allowed = new Set(["Present", "Late", "Half-Day", "Absent", "On Leave"]);
    for (const row of rows) {
      assert.ok(allowed.has(row.status), `${row.attendance_date} -> ${row.status}`);
      if (row.check_in_time === null) {
        assert.equal(row.check_out_time, null);
        assert.equal(row.total_hours, null);
        assert.equal(row.worked_minutes, null);
        assert.ok(["Absent", "On Leave"].includes(row.status));
        continue;
      }
      assert.ok(row.check_in_time.startsWith(row.attendance_date));
      assert.ok(row.check_out_time.startsWith(row.attendance_date));
      assert.ok(row.check_in_time <= row.check_out_time, row.attendance_date);
      const recomputed = calculateAttendanceMetrics({
        attendanceDate: row.attendance_date,
        checkInTime: row.check_in_time,
        checkOutTime: row.check_out_time,
      });
      assert.equal(row.status, recomputed.status, row.attendance_date);
      assert.equal(row.worked_minutes, recomputed.workedMinutes, row.attendance_date);
      assert.equal(row.late_minutes, recomputed.lateMinutes, row.attendance_date);
      assert.equal(
        row.early_checkout_minutes,
        recomputed.earlyCheckoutMinutes,
        row.attendance_date,
      );
      assert.equal(row.total_hours, recomputed.totalHours, row.attendance_date);
    }
  });

  it("weights payable days with the payroll engine's own attendance policy", () => {
    const payable = attendancePayableDays(rows);
    const expected = rows.reduce(
      (sum, row) =>
        sum +
        (row.status === "Present" || row.status === "Late"
          ? 1
          : row.status === "Half-Day"
            ? 0.5
            : 0),
      0,
    );
    assert.equal(payable, expected);
    assert.ok(payable <= rows.length);
  });
});

describe("salary planning", () => {
  it("uses one FIXED earning, one PERCENTAGE earning and one FIXED deduction", () => {
    const components = Components();
    assert.equal(components.length, 3);
    const [basic, hra, pf] = components;
    assert.equal(basic.component_type, "Earning");
    assert.equal(basic.calculation_type, "FIXED");
    assert.ok(basic.amount >= 30000 && basic.amount <= 90000);
    assert.equal(hra.component_type, "Earning");
    assert.equal(hra.calculation_type, "PERCENTAGE");
    assert.ok(hra.amount >= 30 && hra.amount <= 45);
    assert.equal(pf.component_type, "Deduction");
    assert.equal(pf.calculation_type, "FIXED");
    assert.equal(pf.amount, Math.round(basic.amount * 0.12));
  });
});

describe("per-employee plan", () => {
  const build = (index, seed = 20261001) =>
    planEmployee({
      index,
      rng: rngForEmployee(seed, index),
      leaveTypes: LEAVE_TYPES,
      components: planSalaryComponents({
        rng: rngForEmployee(seed, index),
        componentsByName: null,
        basicComponentId: 1,
        hraComponentId: 2,
        pfComponentId: 3,
      }),
      months: MONTHS,
      leaveTarget: 13,
    });

  it("is deterministic for the same index and seed", () => {
    const a = build(31);
    const b = build(31);
    assert.deepEqual(a.attendanceRows, b.attendanceRows);
    assert.deepEqual(a.applications, b.applications);
    assert.deepEqual(a.payroll, b.payroll);
    assert.notDeepEqual(a.attendanceRows, build(32).attendanceRows);
  });

  it("emits one payroll row per covered month with consistent arithmetic", () => {
    const plan = build(50);
    assert.equal(plan.payroll.length, 10);
    assert.equal(plan.dates.length, 218);
    for (const period of plan.payroll) {
      assert.equal(period.workingDays, countWorkingDays(period.year, period.month));
      assert.equal(
        period.attendanceCount,
        weekdaysInMonth(period.year, period.month).dates.length,
      );
      const { result } = period;
      assert.equal(result.workingDays, period.workingDays);
      assert.ok(result.payableDays <= result.workingDays);
      assert.ok(result.presentDays + result.leaveDays >= result.payableDays);
      assert.equal(
        result.grossSalary,
        Math.round(
          result.breakdown
            .filter((b) => b.component_type === "Earning")
            .reduce((sum, b) => sum + b.amount, 0) * 100,
        ) / 100,
      );
      assert.equal(
        result.netSalary,
        Math.round((result.grossSalary - result.totalDeductions) * 100) / 100,
      );
      // Decision 1: the dataset must never contain a negative net salary.
      assert.ok(result.netSalary > 0, `${period.periodStart} net ${result.netSalary}`);
      assert.equal(result.breakdown.length, 3);
    }
  });

  it("never lets approved leave and attendance double-count a day", () => {
    const plan = build(64);
    const onLeave = approvedLeaveWeekdays(plan.applications);
    for (const row of plan.attendanceRows) {
      if (onLeave.has(row.attendance_date)) {
        assert.equal(row.status, "On Leave");
      } else {
        assert.notEqual(row.status, "On Leave");
      }
    }
    for (const period of plan.payroll) {
      assert.ok(
        period.presentDays + period.leaveDays <= period.workingDays,
        `${period.periodStart}: ${period.presentDays}+${period.leaveDays} > ${period.workingDays}`,
      );
    }
  });

  it("reaches the approved attendance volume for both cohorts", () => {
    assert.equal(build(1).attendanceRows.length, 218);
    const senior = planEmployee({
      index: 2,
      rng: rngForEmployee(20261001, 2),
      leaveTypes: LEAVE_TYPES,
      components: Components(),
      months: SENIOR_MONTHS,
      leaveTarget: 13,
    });
    assert.equal(senior.attendanceRows.length, 238);
    // 850 employees x 218 weekdays + 150 senior employees x 238 weekdays.
    assert.equal(850 * 218 + 150 * 238, 221000);
    // The shared demo employee is covered separately with the same 218-day
    // window, so the attendance table itself holds 221,218 rows.
    assert.equal(850 * 218 + 150 * 238 + 218, 221218);
  });
});
