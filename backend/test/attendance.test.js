import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pool from "../src/config/database.js";
import {
  attendanceConfig,
  calculateAttendanceMetrics,
  getBusinessNow,
} from "../src/config/attendance.js";
import {
  checkIn,
  checkOut,
  getAdminAttendance,
  getAttendanceByDay,
  getMyAttendance,
  normalizeAdminFilters,
  streamAdminAttendanceExport,
  updateAttendance,
} from "../src/services/attendanceService.js";
import { authorize } from "../src/middleware/auth.js";

let testUserId;
let testEmail;
let testDate;

before(async () => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = 'Employee' LIMIT 1",
  );
  assert.equal(roles.length, 1, "Employee role must exist for attendance tests");

  testEmail = `attendance-test-${Date.now()}@example.test`;
  const [result] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, 'attendance-test', TRUE)`,
    [roles[0].role_id, testEmail],
  );
  testUserId = result.insertId;
  testDate = getBusinessNow().date;
});

after(async () => {
  if (testUserId) {
    await pool.query("DELETE FROM users WHERE user_id = ?", [testUserId]);
  }
  await pool.end();
});

describe("attendance calculations", () => {
  it("calculates worked, late, early checkout, and late status", () => {
    const metrics = calculateAttendanceMetrics({
      attendanceDate: "2026-10-05",
      checkInTime: "2026-10-05 09:20:00",
      checkOutTime: "2026-10-05 17:00:00",
    });

    assert.equal(metrics.workedMinutes, 460);
    assert.equal(metrics.lateMinutes, 5);
    assert.equal(metrics.earlyCheckoutMinutes, 60);
    assert.equal(metrics.status, "Late");
  });

  it("uses the configured half-day threshold", () => {
    const halfDayEndMinutes =
      540 + attendanceConfig.halfDayThresholdMinutes - 10;
    const halfDayHour = String(Math.floor(halfDayEndMinutes / 60)).padStart(2, "0");
    const halfDayMinute = String(halfDayEndMinutes % 60).padStart(2, "0");
    const metrics = calculateAttendanceMetrics({
      attendanceDate: "2026-10-05",
      checkInTime: "2026-10-05 09:00:00",
      checkOutTime: `2026-10-05 ${halfDayHour}:${halfDayMinute}:00`,
    });

    assert.equal(metrics.status, "Half-Day");
  });
});

describe("attendance service", () => {
  it("checks in once and rejects a duplicate check-in", async () => {
    const first = await checkIn(testUserId);
    assert.equal(first.statusCode, 201);

    const duplicate = await checkIn(testUserId);
    assert.equal(duplicate.statusCode, 409);
  });

  it("checks out once and rejects a duplicate checkout", async () => {
    const first = await checkOut(testUserId);
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.data.attendance_date, testDate);
    assert.ok(Number.isInteger(first.body.data.workedMinutes));

    const duplicate = await checkOut(testUserId);
    assert.equal(duplicate.statusCode, 409);
  });

  it("rejects check-in for an inactive user", async () => {
    await pool.query("UPDATE users SET is_active = FALSE WHERE user_id = ?", [testUserId]);
    const result = await checkIn(testUserId);
    assert.equal(result.statusCode, 403);
    await pool.query("UPDATE users SET is_active = TRUE WHERE user_id = ?", [testUserId]);
  });
});

describe("admin attendance queries", () => {
  it("normalizes filters and caps page size", () => {
    const filters = normalizeAdminFilters({ page: "2", limit: "500" });
    assert.equal(filters.page, 2);
    assert.equal(filters.limit, 100);
    assert.equal(filters.offset, 100);
  });

  it("supports search, date filtering, pagination, and export", async () => {
    const result = await getAdminAttendance({
      page: "1",
      limit: "1",
      search: testEmail,
      startDate: testDate,
      endDate: testDate,
    });

    assert.equal(result.pagination.page, 1);
    assert.equal(result.pagination.limit, 1);
    assert.equal(result.pagination.total, 1);
    assert.equal(result.rows.length, 1);

    const exported = await streamAdminAttendanceExport({
      search: testEmail,
      startDate: testDate,
      endDate: testDate,
    });
    const rows = [];
    for await (const row of exported.stream) rows.push(row);
    exported.release();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].attendance_date, testDate);
  });

  it("supports employee history and day pagination", async () => {
    const history = await getMyAttendance(testUserId, {
      page: "1",
      limit: "1",
      start_date: testDate,
      end_date: testDate,
    });
    assert.equal(history.rows.length, 1);
    assert.equal(history.pagination.total, 1);

    const day = await getAttendanceByDay({ date: testDate, page: "1", limit: "1" });
    assert.equal(day.rows.length, 1);
    assert.equal(day.pagination.total >= 1, true);
  });
});

describe("manual attendance correction", () => {
  it("recalculates late, early checkout, worked minutes, and status", async () => {
    const [rows] = await pool.query(
      "SELECT attendance_id FROM attendance WHERE user_id = ? AND attendance_date = ?",
      [testUserId, testDate],
    );
    assert.equal(rows.length, 1);

    const late = await updateAttendance({
      attendanceId: rows[0].attendance_id,
      actor: { userId: testUserId, ipAddress: "127.0.0.1", userAgent: "test" },
      changes: { check_in_time: "09:20", check_out_time: "17:00" },
    });
    assert.equal(late.statusCode, 200);
    assert.equal(late.body.data.workedMinutes, 460);
    assert.equal(late.body.data.lateMinutes, 5);
    assert.equal(late.body.data.earlyCheckoutMinutes, 60);
    assert.equal(late.body.data.status, "Late");

    const halfDay = await updateAttendance({
      attendanceId: rows[0].attendance_id,
      actor: { userId: testUserId },
      changes: { check_in_time: "09:00", check_out_time: "12:50" },
    });
    assert.equal(halfDay.body.data.status, "Half-Day");
    assert.equal(halfDay.body.data.workedMinutes, 230);

    const [auditRows] = await pool.query(
      "SELECT action, record_id FROM audit_logs WHERE table_name = 'attendance' AND record_id = ? ORDER BY log_id DESC LIMIT 2",
      [rows[0].attendance_id],
    );
    assert.equal(auditRows.length, 2);
    assert.equal(auditRows[0].action, "ATTENDANCE_CORRECTION");
  });

  it("rejects invalid manual times and preserves the unique daily record", async () => {
    const [rows] = await pool.query(
      "SELECT attendance_id FROM attendance WHERE user_id = ? AND attendance_date = ?",
      [testUserId, testDate],
    );
    await assert.rejects(
      () => updateAttendance({
        attendanceId: rows[0].attendance_id,
        actor: { userId: testUserId },
        changes: { check_in_time: "invalid" },
      }),
      /Attendance times/,
    );

    await assert.rejects(
      () => pool.query(
        "INSERT INTO attendance (user_id, attendance_date, status) VALUES (?, ?, 'Present')",
        [testUserId, testDate],
      ),
      (error) => error.code === "ER_DUP_ENTRY",
    );
  });
});

describe("attendance authorization", () => {
  it("allows HR and rejects employees for admin access", () => {
    let nextCalled = false;
    const response = { status: () => ({ json: () => {} }) };
    authorize("Admin", "HR Officer")(
      { user: { roleName: "HR Officer" } },
      response,
      () => {
        nextCalled = true;
      },
    );
    assert.equal(nextCalled, true);

    nextCalled = false;
    authorize("Admin", "HR Officer")(
      { user: { roleName: "Employee" } },
      response,
      () => {
        nextCalled = true;
      },
    );
    assert.equal(nextCalled, false);
  });
});