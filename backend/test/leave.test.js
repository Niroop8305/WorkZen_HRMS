import { assertScratchDatabase } from "./support/dbGuard.js";

// T-007 tripwire: this suite writes to the database; it must never run
// against a protected application schema. Fails closed before any test
// registers.
assertScratchDatabase("leave");

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pool from "../src/config/database.js";
import { authorize, protect } from "../src/middleware/auth.js";
import {
  applyLeave,
  cancelLeave,
  calculateLeaveDays,
  getEmployeeBalance,
  getActiveLeaves,
  getLeaveAuditReport,
  getMyLeaveApplications,
  getOrganizationLeaveRequests,
  leaveRules,
  listLeaveTypes,
  updateLeaveStatus,
} from "../src/services/leaveService.js";

let testUserId;
let testLeaveTypeId;
let testEmail;
const testYear = new Date().getUTCFullYear();

before(async () => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = 'Employee' LIMIT 1",
  );
  const [types] = await pool.query(
    "SELECT leave_type_id FROM leave_types WHERE is_paid = TRUE ORDER BY leave_type_id LIMIT 1",
  );
  assert.equal(roles.length, 1);
  assert.equal(types.length, 1);
  testLeaveTypeId = types[0].leave_type_id;

  testEmail = `leave-test-${Date.now()}@example.test`;
  const [userResult] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, 'leave-test', TRUE)`,
    [roles[0].role_id, testEmail],
  );
  testUserId = userResult.insertId;
  await pool.query(
    `INSERT INTO employee_profiles
      (user_id, employee_code, first_name, last_name, department, designation)
     VALUES (?, ?, 'Leave', 'Test', 'Engineering', 'Tester')`,
    [testUserId, `LEAVE-${testUserId}`],
  );
  await pool.query(
    `INSERT INTO leave_balance
      (user_id, leave_type_id, year, total_allocated, used_days, remaining_days)
     VALUES (?, ?, ?, 10, 0, 10)`,
    [testUserId, testLeaveTypeId, testYear],
  );
});

after(async () => {
  if (testUserId) {
    const [applications] = await pool.query(
      "SELECT leave_id FROM leave_applications WHERE user_id = ?",
      [testUserId],
    );
    const applicationIds = applications.map((row) => row.leave_id);
    if (applicationIds.length > 0) {
      await pool.query(
        "DELETE FROM audit_logs WHERE table_name = 'leave_applications' AND record_id IN (?)",
        [applicationIds],
      );
    }
    await pool.query("DELETE FROM leave_applications WHERE user_id = ?", [testUserId]);
    await pool.query("DELETE FROM leave_balance WHERE user_id = ?", [testUserId]);
    await pool.query("DELETE FROM users WHERE user_id = ?", [testUserId]);
  }
  await pool.end();
});

describe("Leave rules and read APIs", () => {
  it("uses weekday-only inclusive leave days", () => {
    assert.equal(leaveRules.countsWeekends, false);
    assert.equal(calculateLeaveDays("2026-10-05", "2026-10-09"), 5);
    assert.throws(
      () => calculateLeaveDays("2026-10-10", "2026-10-11"),
      /at least one weekday/,
    );
  });

  it("retrieves database-backed types and an isolated employee balance", async () => {
    const types = await listLeaveTypes();
    assert.ok(types.length > 0);
    assert.ok(Object.hasOwn(types[0], "leave_type_id"));
    assert.ok(Object.hasOwn(types[0], "requires_approval"));

    const balances = await getEmployeeBalance(testUserId, testYear);
    assert.equal(balances.length, 1);
    assert.equal(Number(balances[0].remaining_days), 10);
  });
});

describe("Leave application workflow", () => {
  it("creates a pending application with server-calculated days", async () => {
    const result = await applyLeave({
      userId: testUserId,
      leaveTypeId: testLeaveTypeId,
      startDate: "2026-11-02",
      endDate: "2026-11-04",
      reason: "Personal work",
    });
    assert.equal(result.total_days, 3);
    assert.equal(result.status, "Pending");
    const [audit] = await pool.query(
      "SELECT action, record_id FROM audit_logs WHERE table_name = 'leave_applications' AND record_id = ?",
      [result.leave_id],
    );
    assert.equal(audit.at(-1).action, "LEAVE_CREATED");
  });

  it("rejects invalid types, dates, insufficient balance, and overlap", async () => {
    await assert.rejects(
      () => applyLeave({ userId: testUserId, leaveTypeId: 999999, startDate: "2026-12-01", endDate: "2026-12-01", reason: "Test" }),
      /Invalid leave type/,
    );
    await assert.rejects(
      () => applyLeave({ userId: testUserId, leaveTypeId: testLeaveTypeId, startDate: "2026-12-02", endDate: "2026-12-01", reason: "Test" }),
      /cannot be after/,
    );
    await assert.rejects(
      () => applyLeave({ userId: testUserId, leaveTypeId: testLeaveTypeId, startDate: "2026-12-01", endDate: "2026-12-31", reason: "Test" }),
      /Insufficient leave balance/,
    );
    await assert.rejects(
      () => applyLeave({ userId: testUserId, leaveTypeId: testLeaveTypeId, startDate: "2026-11-03", endDate: "2026-11-05", reason: "Overlap" }),
      /overlaps/,
    );
  });

  it("returns only the authenticated employee's history", async () => {
    const own = await getMyLeaveApplications(testUserId);
    assert.equal(own.length, 1);
    assert.equal(own[0].user_id, testUserId);

    const [otherUsers] = await pool.query(
      "SELECT user_id FROM users WHERE user_id <> ? LIMIT 1",
      [testUserId],
    );
    if (otherUsers.length > 0) {
      const otherHistory = await getMyLeaveApplications(otherUsers[0].user_id);
      assert.equal(otherHistory.some((row) => row.user_id === testUserId), false);
    }
  });
});

describe("Leave approval and rejection", () => {
  let reviewerId;
  let approvedLeaveId;

  before(async () => {
    const [reviewers] = await pool.query(
      `SELECT u.user_id
       FROM users u
       INNER JOIN roles r ON u.role_id = r.role_id
       WHERE r.role_name = 'HR Officer' AND u.is_active = TRUE
       LIMIT 1`,
    );
    assert.equal(reviewers.length, 1);
    reviewerId = reviewers[0].user_id;
  });

  it("approves a pending application and updates balance once", async () => {
    const beforeBalance = (await getEmployeeBalance(testUserId, testYear)).find(
      (balance) => balance.leave_type_id === testLeaveTypeId,
    );
    const applications = await getMyLeaveApplications(testUserId);
    approvedLeaveId = applications[0].leave_id;

    const result = await updateLeaveStatus({
      leaveId: approvedLeaveId,
      reviewerId,
      status: "Approved",
    });
    assert.equal(result.status, "Approved");

    const [row] = await pool.query(
      "SELECT status, approved_by, approved_date FROM leave_applications WHERE leave_id = ?",
      [approvedLeaveId],
    );
    const afterBalance = (await getEmployeeBalance(testUserId, testYear)).find(
      (balance) => balance.leave_type_id === testLeaveTypeId,
    );
    assert.equal(row[0].status, "Approved");
    assert.equal(row[0].approved_by, reviewerId);
    assert.ok(row[0].approved_date);
    const [audit] = await pool.query(
      "SELECT action FROM audit_logs WHERE table_name = 'leave_applications' AND record_id = ? ORDER BY log_id DESC LIMIT 1",
      [approvedLeaveId],
    );
    assert.equal(audit[0].action, "LEAVE_APPROVED");
    assert.equal(Number(afterBalance.used_days), Number(beforeBalance.used_days) + 3);
    assert.equal(Number(afterBalance.remaining_days), Number(beforeBalance.remaining_days) - 3);
    await assert.rejects(
      () => updateLeaveStatus({ leaveId: approvedLeaveId, reviewerId, status: "Approved" }),
      /already Approved/,
    );
  });

  it("rejects a pending application with a reason without changing balance", async () => {
    const beforeBalance = (await getEmployeeBalance(testUserId, testYear)).find(
      (balance) => balance.leave_type_id === testLeaveTypeId,
    );
    const pending = await applyLeave({
      userId: testUserId,
      leaveTypeId: testLeaveTypeId,
      startDate: "2026-11-09",
      endDate: "2026-11-11",
      reason: "Rejection test",
    });
    const result = await updateLeaveStatus({
      leaveId: pending.leave_id,
      reviewerId,
      status: "Rejected",
      rejectionReason: "Insufficient staffing",
    });
    assert.equal(result.status, "Rejected");

    const [row] = await pool.query(
      "SELECT status, rejection_reason FROM leave_applications WHERE leave_id = ?",
      [pending.leave_id],
    );
    const afterBalance = (await getEmployeeBalance(testUserId, testYear)).find(
      (balance) => balance.leave_type_id === testLeaveTypeId,
    );
    assert.equal(row[0].status, "Rejected");
    assert.equal(row[0].rejection_reason, "Insufficient staffing");
    const [audit] = await pool.query(
      "SELECT action FROM audit_logs WHERE table_name = 'leave_applications' AND record_id = ? ORDER BY log_id DESC LIMIT 1",
      [pending.leave_id],
    );
    assert.equal(audit[0].action, "LEAVE_REJECTED");
    assert.equal(Number(afterBalance.remaining_days), Number(beforeBalance.remaining_days));
    await assert.rejects(
      () => updateLeaveStatus({ leaveId: pending.leave_id, reviewerId, status: "Rejected", rejectionReason: "Again" }),
      /already Rejected/,
    );
  });

  it("rejects approval when balance becomes insufficient after application", async () => {
    const [beforeRows] = await pool.query(
      "SELECT used_days, remaining_days FROM leave_balance WHERE user_id = ? AND leave_type_id = ? AND year = ?",
      [testUserId, testLeaveTypeId, testYear],
    );
    const pending = await applyLeave({
      userId: testUserId,
      leaveTypeId: testLeaveTypeId,
      startDate: "2026-12-01",
      endDate: "2026-12-03",
      reason: "Balance race test",
    });
    try {
      await pool.query(
        "UPDATE leave_balance SET remaining_days = 0 WHERE user_id = ? AND leave_type_id = ? AND year = ?",
        [testUserId, testLeaveTypeId, testYear],
      );
      await assert.rejects(
        () => updateLeaveStatus({ leaveId: pending.leave_id, reviewerId, status: "Approved" }),
        /Insufficient leave balance/,
      );
      const [applicationRows] = await pool.query(
        "SELECT status FROM leave_applications WHERE leave_id = ?",
        [pending.leave_id],
      );
      assert.equal(applicationRows[0].status, "Pending");
    } finally {
      await pool.query(
        "UPDATE leave_balance SET used_days = ?, remaining_days = ? WHERE user_id = ? AND leave_type_id = ? AND year = ?",
        [beforeRows[0].used_days, beforeRows[0].remaining_days, testUserId, testLeaveTypeId, testYear],
      );
    }
  });

  it("rejects missing rejection reasons and unknown applications", async () => {
    await assert.rejects(
      () => updateLeaveStatus({ leaveId: 999999, reviewerId, status: "Approved" }),
      /Leave application not found/,
    );
    const pending = await applyLeave({
      userId: testUserId,
      leaveTypeId: testLeaveTypeId,
      startDate: "2026-12-21",
      endDate: "2026-12-23",
      reason: "Missing reason test",
    });
    await assert.rejects(
      () => updateLeaveStatus({ leaveId: pending.leave_id, reviewerId, status: "Rejected" }),
      /rejection_reason is required/,
    );
  });

  it("rolls back status when the approver foreign key is invalid", async () => {
    const pending = await applyLeave({
      userId: testUserId,
      leaveTypeId: testLeaveTypeId,
      startDate: "2026-12-28",
      endDate: "2026-12-30",
      reason: "Rollback test",
    });
    await assert.rejects(
      () => updateLeaveStatus({ leaveId: pending.leave_id, reviewerId: 999999, status: "Approved" }),
    );
    const [row] = await pool.query(
      "SELECT status FROM leave_applications WHERE leave_id = ?",
      [pending.leave_id],
    );
    assert.equal(row[0].status, "Pending");
    const [audit] = await pool.query(
      "SELECT action FROM audit_logs WHERE table_name = 'leave_applications' AND record_id = ? AND action = 'LEAVE_APPROVED'",
      [pending.leave_id],
    );
    assert.equal(audit.length, 0);
  });
});

describe("Leave authorization", () => {
  it("rejects requests without a JWT before controller access", () => {
    let statusCode;
    const response = {
      status(code) {
        statusCode = code;
        return { json() {} };
      },
    };
    protect({ headers: {} }, response, () => {});
    assert.equal(statusCode, 401);
  });

  it("allows HR/Admin and rejects Employee/Payroll approval roles", () => {
    const response = { status: () => ({ json() {} }) };
    let nextCalled = false;
    authorize("Admin", "HR Officer")(
      { user: { roleName: "HR Officer" } },
      response,
      () => { nextCalled = true; },
    );
    assert.equal(nextCalled, true);

    for (const roleName of ["Employee", "Payroll Officer"]) {
      nextCalled = false;
      authorize("Admin", "HR Officer")(
        { user: { roleName } },
        response,
        () => { nextCalled = true; },
      );
      assert.equal(nextCalled, false);
    }
  });
});

describe("Leave cancellation and restoration", () => {
  let reviewerId;

  before(async () => {
    const [reviewers] = await pool.query(
      `SELECT u.user_id
       FROM users u
       INNER JOIN roles r ON u.role_id = r.role_id
       WHERE r.role_name = 'HR Officer' AND u.is_active = TRUE
       LIMIT 1`,
    );
    reviewerId = reviewers[0].user_id;
  });

  it("cancels an own pending request without changing balance", async () => {
    const beforeBalance = (await getEmployeeBalance(testUserId, testYear)).find(
      (balance) => balance.leave_type_id === testLeaveTypeId,
    );
    const pending = await applyLeave({
      userId: testUserId,
      leaveTypeId: testLeaveTypeId,
      startDate: "2026-10-19",
      endDate: "2026-10-21",
      reason: "Pending cancellation",
    });

    await assert.rejects(
      () => cancelLeave({ leaveId: pending.leave_id, requesterId: reviewerId, requesterRole: "Employee" }),
      /not authorized/,
    );
    const result = await cancelLeave({
      leaveId: pending.leave_id,
      requesterId: testUserId,
      requesterRole: "Employee",
    });
    assert.equal(result.status, "Cancelled");
    const [audit] = await pool.query(
      "SELECT action FROM audit_logs WHERE table_name = 'leave_applications' AND record_id = ? ORDER BY log_id DESC LIMIT 1",
      [pending.leave_id],
    );
    assert.equal(audit[0].action, "LEAVE_CANCELLED");
    await assert.rejects(
      () => cancelLeave({ leaveId: pending.leave_id, requesterId: testUserId, requesterRole: "Employee" }),
      /already Cancelled/,
    );

    const afterBalance = (await getEmployeeBalance(testUserId, testYear)).find(
      (balance) => balance.leave_type_id === testLeaveTypeId,
    );
    assert.equal(Number(afterBalance.used_days), Number(beforeBalance.used_days));
    assert.equal(Number(afterBalance.remaining_days), Number(beforeBalance.remaining_days));
  });

  it("restores approved paid balance exactly once and rolls back inconsistent cancellation", async () => {
    const pending = await applyLeave({
      userId: testUserId,
      leaveTypeId: testLeaveTypeId,
      startDate: "2026-10-26",
      endDate: "2026-10-28",
      reason: "Approved cancellation",
    });
    await updateLeaveStatus({ leaveId: pending.leave_id, reviewerId, status: "Approved" });
    const [approvedBalanceRows] = await pool.query(
      "SELECT used_days, remaining_days FROM leave_balance WHERE user_id = ? AND leave_type_id = ? AND year = ?",
      [testUserId, testLeaveTypeId, testYear],
    );
    const approvedBalance = approvedBalanceRows[0];

    await pool.query(
      "UPDATE leave_balance SET used_days = 0 WHERE user_id = ? AND leave_type_id = ? AND year = ?",
      [testUserId, testLeaveTypeId, testYear],
    );
    await assert.rejects(
      () => cancelLeave({ leaveId: pending.leave_id, requesterId: testUserId, requesterRole: "Employee" }),
      /cannot restore/,
    );
    const [stillApproved] = await pool.query(
      "SELECT status FROM leave_applications WHERE leave_id = ?",
      [pending.leave_id],
    );
    assert.equal(stillApproved[0].status, "Approved");

    await pool.query(
      "UPDATE leave_balance SET used_days = ?, remaining_days = ? WHERE user_id = ? AND leave_type_id = ? AND year = ?",
      [approvedBalance.used_days, approvedBalance.remaining_days, testUserId, testLeaveTypeId, testYear],
    );
    await cancelLeave({ leaveId: pending.leave_id, requesterId: testUserId, requesterRole: "Employee" });
    const [restored] = await pool.query(
      "SELECT used_days, remaining_days FROM leave_balance WHERE user_id = ? AND leave_type_id = ? AND year = ?",
      [testUserId, testLeaveTypeId, testYear],
    );
    assert.equal(Number(restored[0].used_days), Number(approvedBalance.used_days) - 3);
    assert.equal(Number(restored[0].remaining_days), Number(approvedBalance.remaining_days) + 3);
    await assert.rejects(
      () => cancelLeave({ leaveId: pending.leave_id, requesterId: testUserId, requesterRole: "Employee" }),
      /already Cancelled/,
    );
  });

  it("keeps unpaid leave balance-neutral through approval and cancellation", async () => {
    const [unpaidTypes] = await pool.query(
      "SELECT leave_type_id FROM leave_types WHERE is_paid = FALSE LIMIT 1",
    );
    assert.equal(unpaidTypes.length, 1);
    const beforeBalance = await getEmployeeBalance(testUserId, testYear);
    const pending = await applyLeave({
      userId: testUserId,
      leaveTypeId: unpaidTypes[0].leave_type_id,
      startDate: "2026-11-16",
      endDate: "2026-11-18",
      reason: "Unpaid leave behavior",
    });
    await updateLeaveStatus({ leaveId: pending.leave_id, reviewerId, status: "Approved" });
    await cancelLeave({ leaveId: pending.leave_id, requesterId: testUserId, requesterRole: "Employee" });
    const afterBalance = await getEmployeeBalance(testUserId, testYear);
    const paidBefore = beforeBalance.find((row) => row.leave_type_id === testLeaveTypeId);
    const paidAfter = afterBalance.find((row) => row.leave_type_id === testLeaveTypeId);
    assert.equal(Number(paidAfter.used_days), Number(paidBefore.used_days));
    assert.equal(Number(paidAfter.remaining_days), Number(paidBefore.remaining_days));
  });
});

describe("Organization-wide Leave queries", () => {
  it("supports pagination, search, filters, and active-leave retrieval", async () => {
    const result = await getOrganizationLeaveRequests({
      page: 1,
      limit: 1,
      search: testEmail,
      status: "Approved",
      leave_type_id: testLeaveTypeId,
      department: "Engineering",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
    assert.equal(result.rows.length, 1);
    assert.equal(result.pagination.limit, 1);
    assert.equal(result.pagination.total >= 1, true);
    assert.equal(result.rows[0].employee_code, `LEAVE-${testUserId}`);
    assert.equal(result.rows[0].department, "Engineering");

    const active = await getActiveLeaves();
    assert.ok(Array.isArray(active));
    const audit = await getLeaveAuditReport({ page: 1, limit: 1, action: "LEAVE_CREATED", search: testEmail });
    assert.equal(audit.pagination.limit, 1);
    assert.ok(audit.pagination.total >= 1);
  });
});