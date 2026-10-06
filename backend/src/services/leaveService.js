import pool from "../config/database.js";
import {
  createLeaveApplication,
  findOverlappingApplications,
  getApplicationsByUser,
  getBalanceForUpdate,
  getBalanceByUser,
  getLeaveTypeById,
  getLeaveTypes,
  getApplicationForUpdate,
  cancelApplication,
  createLeaveAudit,
  getActiveLeaveApplications,
  getOrganizationLeaveRequests as getOrganizationLeaveRows,
  getLeaveAuditLogs as getLeaveAuditRows,
  getLeaveNotificationRecipients,
  updateApplicationStatus,
} from "../models/leaveModel.js";
import { sendLeaveNotification } from "./emailService.js";

const notifyLeave = async (leaveId, action) => {
  try {
    const recipients = await getLeaveNotificationRecipients(pool, leaveId);
    if (!recipients) return;
    await sendLeaveNotification({
      recipients: action === "Created" ? recipients.hr_emails?.split(",") : [],
      employeeEmail: action === "Created" ? null : recipients.employee_email,
      employeeName: recipients.employee_name,
      action,
      leaveType: recipients.leave_type_name,
      startDate: recipients.start_date,
      endDate: recipients.end_date,
      totalDays: recipients.total_days,
      rejectionReason: recipients.rejection_reason,
    });
  } catch (error) {
    console.error("Leave notification lookup failed:", error.message);
  }
};

export const leaveRules = Object.freeze({
  countsWeekends: false,
  considersHolidays: false,
  supportsPartialDays: false,
  requiresSingleCalendarYear: true,
});

const parseDate = (value, fieldName) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${fieldName} is not a valid date`);
  }
  return date;
};

export const calculateLeaveDays = (startDate, endDate) => {
  const start = parseDate(startDate, "start_date");
  const end = parseDate(endDate, "end_date");
  if (start > end) throw new Error("start_date cannot be after end_date");
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    throw new Error("Leave dates must be within one calendar year");
  }

  let totalDays = 0;
  for (
    const date = new Date(start);
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) totalDays += 1;
  }
  if (totalDays <= 0) {
    throw new Error("Leave period must include at least one weekday");
  }
  return totalDays;
};

const parseLeaveTypeId = (value) => {
  const leaveTypeId = Number(value);
  if (!Number.isInteger(leaveTypeId) || leaveTypeId < 1) {
    throw new Error("leave_type_id must be a positive integer");
  }
  return leaveTypeId;
};

export const listLeaveTypes = () => getLeaveTypes();

export const getEmployeeBalance = (
  userId,
  year = new Date().getUTCFullYear(),
) => getBalanceByUser(userId, year);

export const applyLeave = async ({
  userId,
  leaveTypeId: rawLeaveTypeId,
  startDate,
  endDate,
  reason,
  ipAddress,
  userAgent,
}) => {
  const leaveTypeId = parseLeaveTypeId(rawLeaveTypeId);
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("reason is required");
  }
  const totalDays = calculateLeaveDays(startDate, endDate);
  const year = Number(startDate.slice(0, 4));
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const leaveType = await getLeaveTypeById(leaveTypeId, connection);
    if (!leaveType) throw new Error("Invalid leave type");

    const overlap = await findOverlappingApplications(
      connection,
      userId,
      startDate,
      endDate,
    );
    if (overlap) {
      throw new Error(
        "Leave period overlaps an existing pending or approved application",
      );
    }

    if (leaveType.is_paid) {
      const balance = await getBalanceForUpdate(
        connection,
        userId,
        leaveTypeId,
        year,
      );
      if (!balance) {
        throw new Error("Leave balance is not initialized for this year");
      }
      if (Number(balance.remaining_days) < totalDays) {
        throw new Error(
          `Insufficient leave balance. Available: ${balance.remaining_days} days`,
        );
      }
    }

    const leaveId = await createLeaveApplication(connection, {
      userId,
      leaveTypeId,
      startDate,
      endDate,
      totalDays,
      reason: reason.trim(),
    });
    await createLeaveAudit(connection, {
      actorId: userId,
      action: "LEAVE_CREATED",
      recordId: leaveId,
      newValue: {
        status: "Pending",
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
      },
      ipAddress,
      userAgent,
    });
    await connection.commit();
    await notifyLeave(leaveId, "Created");

    return {
      leave_id: leaveId,
      leave_type_id: leaveTypeId,
      leave_type_name: leaveType.leave_type_name,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      status: "Pending",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const getMyLeaveApplications = (userId) =>
  getApplicationsByUser(userId);

export const updateLeaveStatus = async ({
  leaveId: rawLeaveId,
  reviewerId,
  status,
  rejectionReason,
  ipAddress,
  userAgent,
}) => {
  const leaveId = Number(rawLeaveId);
  if (!Number.isInteger(leaveId) || leaveId < 1) {
    throw new Error("leave_id must be a positive integer");
  }
  if (!["Approved", "Rejected"].includes(status)) {
    throw new Error("status must be Approved or Rejected");
  }
  if (status === "Rejected" && (!rejectionReason || !rejectionReason.trim())) {
    throw new Error("rejection_reason is required when rejecting leave");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const application = await getApplicationForUpdate(connection, leaveId);
    if (!application) throw new Error("Leave application not found");
    if (application.status !== "Pending") {
      throw new Error(`Leave application is already ${application.status}`);
    }

    if (status === "Approved" && application.is_paid) {
      const year = new Date(application.start_date).getUTCFullYear();
      const balance = await getBalanceForUpdate(
        connection,
        application.user_id,
        application.leave_type_id,
        year,
      );
      if (!balance) {
        throw new Error("Leave balance is not initialized for this year");
      }
      if (Number(balance.remaining_days) < Number(application.total_days)) {
        throw new Error(
          `Insufficient leave balance. Available: ${balance.remaining_days} days`,
        );
      }
    }

    // The existing after_leave_approval trigger is the sole balance writer.
    await updateApplicationStatus(
      connection,
      leaveId,
      status,
      reviewerId,
      status === "Rejected" ? rejectionReason.trim() : null,
    );
    await createLeaveAudit(connection, {
      actorId: reviewerId,
      action: status === "Approved" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      recordId: leaveId,
      oldValue: {
        status: application.status,
        total_days: application.total_days,
      },
      newValue: {
        status,
        rejection_reason: status === "Rejected" ? rejectionReason.trim() : null,
      },
      ipAddress,
      userAgent,
    });
    await connection.commit();
    await notifyLeave(leaveId, status);

    return {
      leave_id: leaveId,
      status,
      approved_by: reviewerId,
      rejection_reason: status === "Rejected" ? rejectionReason.trim() : null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const cancelLeave = async ({
  leaveId: rawLeaveId,
  requesterId,
  requesterRole,
  ipAddress,
  userAgent,
}) => {
  const leaveId = Number(rawLeaveId);
  if (!Number.isInteger(leaveId) || leaveId < 1) {
    throw new Error("leave_id must be a positive integer");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const application = await getApplicationForUpdate(connection, leaveId);
    if (!application) throw new Error("Leave application not found");

    const isPrivileged = ["Admin", "HR Officer"].includes(requesterRole);
    if (application.user_id !== requesterId && !isPrivileged) {
      const error = new Error("You are not authorized to cancel this leave");
      error.statusCode = 403;
      throw error;
    }
    if (!["Pending", "Approved"].includes(application.status)) {
      throw new Error(`Leave application is already ${application.status}`);
    }

    if (application.status === "Approved" && application.is_paid) {
      const year = new Date(application.start_date).getUTCFullYear();
      const balance = await getBalanceForUpdate(
        connection,
        application.user_id,
        application.leave_type_id,
        year,
      );
      if (!balance) {
        throw new Error("Leave balance is not initialized for this year");
      }
      if (Number(balance.used_days) < Number(application.total_days)) {
        throw new Error("Leave balance cannot restore more used days than recorded");
      }
    }

    // The trigger is the sole balance writer for approved paid cancellation.
    await cancelApplication(connection, leaveId);
    await createLeaveAudit(connection, {
      actorId: requesterId,
      action: "LEAVE_CANCELLED",
      recordId: leaveId,
      oldValue: {
        status: application.status,
        total_days: application.total_days,
      },
      newValue: { status: "Cancelled" },
      ipAddress,
      userAgent,
    });
    await connection.commit();
    await notifyLeave(leaveId, "Cancelled");
    return { leave_id: leaveId, status: "Cancelled" };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const parsePositiveInteger = (value, fallback, maximum) => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Pagination values must be positive integers");
  }
  return Math.min(parsed, maximum);
};

const validateFilterDate = (value, field) => {
  if (value === undefined || value === "") return null;
  parseDate(value, field);
  return value;
};

export const getOrganizationLeaveRequests = async (query = {}) => {
  const page = parsePositiveInteger(query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInteger(query.limit, 20, 100);
  const startDate = validateFilterDate(query.startDate, "startDate");
  const endDate = validateFilterDate(query.endDate, "endDate");
  if (startDate && endDate && startDate > endDate) {
    throw new Error("startDate cannot be after endDate");
  }
  const clauses = [];
  const params = [];
  if (query.search?.trim()) {
    clauses.push(
      `(ep.employee_code LIKE ? OR CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) LIKE ? OR u.email LIKE ?)`,
    );
    const search = `%${query.search.trim()}%`;
    params.push(search, search, search);
  }
  if (query.status) {
    if (!["Pending", "Approved", "Rejected", "Cancelled"].includes(query.status)) {
      throw new Error("Invalid leave status");
    }
    clauses.push("la.status = ?");
    params.push(query.status);
  }
  if (query.leave_type_id) {
    const leaveTypeId = Number(query.leave_type_id);
    if (!Number.isInteger(leaveTypeId) || leaveTypeId < 1) {
      throw new Error("leave_type_id must be a positive integer");
    }
    clauses.push("la.leave_type_id = ?");
    params.push(leaveTypeId);
  }
  if (query.department?.trim()) {
    clauses.push("ep.department = ?");
    params.push(query.department.trim());
  }
  if (query.employee_id !== undefined && query.employee_id !== "") {
    const employeeId = Number(query.employee_id);
    if (!Number.isInteger(employeeId) || employeeId < 1) {
      throw new Error("employee_id must be a positive integer");
    }
    clauses.push("la.user_id = ?");
    params.push(employeeId);
  }
  if (startDate) {
    clauses.push("la.start_date >= ?");
    params.push(startDate);
  }
  if (endDate) {
    clauses.push("la.end_date <= ?");
    params.push(endDate);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await getOrganizationLeaveRows({
    whereSql,
    params,
    limit,
    offset: (page - 1) * limit,
  });
  return {
    rows: result.rows,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit),
    },
  };
};

export const getActiveLeaves = async () => getActiveLeaveApplications();

export const getLeaveAuditReport = async (query = {}) => {
  const page = parsePositiveInteger(query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInteger(query.limit, 20, 100);
  const clauses = ["al.table_name = 'leave_applications'"];
  const params = [];
  if (query.action) {
    clauses.push("al.action = ?");
    params.push(query.action);
  }
  if (query.record_id) {
    const recordId = Number(query.record_id);
    if (!Number.isInteger(recordId) || recordId < 1) throw new Error("record_id must be a positive integer");
    clauses.push("al.record_id = ?");
    params.push(recordId);
  }
  if (query.search?.trim()) {
    clauses.push("(u.email LIKE ? OR CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) LIKE ?)");
    const search = `%${query.search.trim()}%`;
    params.push(search, search);
  }
  const result = await getLeaveAuditRows({
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params,
    limit,
    offset: (page - 1) * limit,
  });
  return {
    rows: result.rows,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit),
    },
  };
};
