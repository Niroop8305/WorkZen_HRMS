import pool from "../config/database.js";
import {
  attendanceConfig,
  calculateAttendanceMetrics,
  calculateOpenAttendanceMetrics,
  formatAttendanceDateTime,
  getBusinessNow,
} from "../config/attendance.js";

const MAX_PAGE_SIZE = 100;
const ATTENDANCE_STATUSES = new Set([
  "Present",
  "Absent",
  "Half-Day",
  "Late",
  "On Leave",
]);

const getActiveUser = async (connection, userId) => {
  const [rows] = await connection.query(
    "SELECT user_id FROM users WHERE user_id = ? AND is_active = TRUE",
    [userId],
  );
  return rows[0];
};

export const checkIn = async (userId) => {
  const connection = await pool.getConnection();
  try {
    const user = await getActiveUser(connection, userId);
    if (!user) {
      return { statusCode: 403, body: { success: false, message: "Active employee account required" } };
    }

    const businessNow = getBusinessNow();
    const [existing] = await connection.query(
      `SELECT attendance_id, check_in_time, check_out_time
       FROM attendance
       WHERE user_id = ? AND attendance_date = ?
       LIMIT 1`,
      [userId, businessNow.date],
    );

    if (existing.length > 0) {
      return {
        statusCode: 409,
        body: {
          success: false,
          message: existing[0].check_out_time
            ? "Attendance is already completed for today"
            : "You are already checked in",
          data: existing[0],
        },
      };
    }

    const [result] = await connection.query(
      `INSERT INTO attendance
        (user_id, attendance_date, check_in_time, status)
       VALUES (?, ?, ?, 'Present')`,
      [userId, businessNow.date, businessNow.datetime],
    );

    return {
      statusCode: 201,
      body: {
        success: true,
        message: "Checked in successfully",
        data: {
          attendance_id: result.insertId,
          attendance_date: businessNow.date,
          check_in_time: businessNow.datetime,
          status: "checked_in",
          time_zone: attendanceConfig.timeZone,
        },
      },
    };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return {
        statusCode: 409,
        body: { success: false, message: "Attendance is already recorded for today" },
      };
    }
    throw error;
  } finally {
    connection.release();
  }
};

export const checkOut = async (userId) => {
  const connection = await pool.getConnection();
  try {
    const user = await getActiveUser(connection, userId);
    if (!user) {
      return { statusCode: 403, body: { success: false, message: "Active employee account required" } };
    }

    const businessNow = getBusinessNow();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT attendance_id, attendance_date,
              DATE_FORMAT(check_in_time, '%Y-%m-%d %H:%i:%s') AS check_in_time,
              DATE_FORMAT(check_out_time, '%Y-%m-%d %H:%i:%s') AS check_out_time
       FROM attendance
       WHERE user_id = ? AND attendance_date = ?
       FOR UPDATE`,
      [userId, businessNow.date],
    );

    if (rows.length === 0) {
      await connection.rollback();
      return { statusCode: 400, body: { success: false, message: "You need to check in first" } };
    }

    const attendance = rows[0];
    if (!attendance.check_in_time) {
      await connection.rollback();
      return { statusCode: 400, body: { success: false, message: "You need to check in first" } };
    }
    if (attendance.check_out_time) {
      await connection.rollback();
      return { statusCode: 409, body: { success: false, message: "You are already checked out" } };
    }

    const metrics = calculateAttendanceMetrics({
      attendanceDate: businessNow.date,
      checkInTime: attendance.check_in_time,
      checkOutTime: businessNow.datetime,
    });

    await connection.query(
      `UPDATE attendance
       SET check_out_time = ?, total_hours = ?, worked_minutes = ?,
           late_minutes = ?, early_checkout_minutes = ?, status = ?
       WHERE attendance_id = ?`,
      [
        businessNow.datetime,
        metrics.totalHours,
        metrics.workedMinutes,
        metrics.lateMinutes,
        metrics.earlyCheckoutMinutes,
        metrics.status,
        attendance.attendance_id,
      ],
    );
    await connection.commit();

    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Checked out successfully",
        data: {
          attendance_id: attendance.attendance_id,
          attendance_date: businessNow.date,
          check_in_time: attendance.check_in_time,
          check_out_time: businessNow.datetime,
          ...metrics,
          time_zone: attendanceConfig.timeZone,
        },
      },
    };
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

const validateDate = (value, fieldName) => {
  if (value === undefined || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format`);
  }
  return value;
};

export const normalizeAdminFilters = (query = {}) => {
  const page = parsePositiveInteger(query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInteger(query.limit, 20, MAX_PAGE_SIZE);
  const startDate = validateDate(query.startDate, "startDate");
  const endDate = validateDate(query.endDate, "endDate");

  if (startDate && endDate && startDate > endDate) {
    throw new Error("startDate cannot be after endDate");
  }
  if (query.status && !ATTENDANCE_STATUSES.has(query.status)) {
    throw new Error("Invalid attendance status");
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    search: query.search?.trim() || null,
    status: query.status || null,
    startDate,
    endDate,
    department: query.department?.trim() || null,
    employee: query.employee || null,
  };
};

const buildAdminAttendanceWhere = (filters) => {
  const clauses = [];
  const params = [];

  if (filters.search) {
    clauses.push(
      `(ep.employee_code LIKE ? OR CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) LIKE ? OR u.email LIKE ?)`,
    );
    const search = `%${filters.search}%`;
    params.push(search, search, search);
  }
  if (filters.status) {
    clauses.push("a.status = ?");
    params.push(filters.status);
  }
  if (filters.startDate) {
    clauses.push("a.attendance_date >= ?");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    clauses.push("a.attendance_date <= ?");
    params.push(filters.endDate);
  }
  if (filters.department) {
    clauses.push("ep.department = ?");
    params.push(filters.department);
  }
  if (filters.employee) {
    clauses.push("a.user_id = ?");
    params.push(filters.employee);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
};

const adminAttendanceFrom = `
  FROM attendance a
  INNER JOIN users u ON a.user_id = u.user_id
  LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
`;

export const getAdminAttendance = async (query) => {
  const filters = normalizeAdminFilters(query);
  const where = buildAdminAttendanceWhere(filters);
  const connection = await pool.getConnection();

  try {
    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS total ${adminAttendanceFrom} ${where.sql}`,
      where.params,
    );
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await connection.query(
      `SELECT
         a.attendance_id,
         a.user_id,
         DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
         DATE_FORMAT(a.check_in_time, '%Y-%m-%d %H:%i:%s') AS check_in_time,
         DATE_FORMAT(a.check_out_time, '%Y-%m-%d %H:%i:%s') AS check_out_time,
         a.total_hours,
         a.worked_minutes,
         a.late_minutes,
         a.early_checkout_minutes,
         a.status,
         a.remarks,
         CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
         ep.employee_code,
         ep.department,
         ep.designation,
         u.email
       ${adminAttendanceFrom}
       ${where.sql}
       ORDER BY a.attendance_date DESC, ep.employee_code ASC, a.attendance_id DESC
       LIMIT ? OFFSET ?`,
      [...where.params, filters.limit, filters.offset],
    );

    return {
      rows,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
      },
    };
  } finally {
    connection.release();
  }
};

export const streamAdminAttendanceExport = async (query) => {
  const filters = normalizeAdminFilters({ ...query, page: 1, limit: MAX_PAGE_SIZE });
  const where = buildAdminAttendanceWhere(filters);
  const connection = await pool.getConnection();
  const stream = connection.connection.query(
    `SELECT
       ep.employee_code,
       CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
       ep.department,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
       DATE_FORMAT(a.check_in_time, '%Y-%m-%d %H:%i:%s') AS check_in_time,
       DATE_FORMAT(a.check_out_time, '%Y-%m-%d %H:%i:%s') AS check_out_time,
       a.total_hours,
       a.worked_minutes,
       a.late_minutes,
       a.early_checkout_minutes,
       a.status
     ${adminAttendanceFrom}
     ${where.sql}
     ORDER BY a.attendance_date DESC, ep.employee_code ASC, a.attendance_id DESC`,
    where.params,
  ).stream();

  return { stream, release: () => connection.release() };
};

const normalizeHistoryFilters = (query = {}) => {
  const page = parsePositiveInteger(query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInteger(query.limit, 20, MAX_PAGE_SIZE);
  const startDate = validateDate(query.start_date || query.startDate, "start_date");
  const endDate = validateDate(query.end_date || query.endDate, "end_date");
  if (startDate && endDate && startDate > endDate) {
    throw new Error("start_date cannot be after end_date");
  }
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    startDate,
    endDate,
    month: query.month || null,
    year: query.year || null,
  };
};

export const getMyAttendance = async (userId, query) => {
  const filters = normalizeHistoryFilters(query);
  const clauses = ["a.user_id = ?"];
  const params = [userId];

  if (filters.startDate && filters.endDate) {
    clauses.push("a.attendance_date BETWEEN ? AND ?");
    params.push(filters.startDate, filters.endDate);
  } else if (filters.month && filters.year) {
    clauses.push("MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?");
    params.push(filters.month, filters.year);
  }

  const where = clauses.join(" AND ");
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM attendance a WHERE ${where}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT
       a.attendance_id,
       DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
       DATE_FORMAT(a.check_in_time, '%Y-%m-%d %H:%i:%s') AS check_in_time,
       DATE_FORMAT(a.check_out_time, '%Y-%m-%d %H:%i:%s') AS check_out_time,
       a.total_hours,
       a.worked_minutes,
       a.late_minutes,
       a.early_checkout_minutes,
       a.status,
       a.remarks,
       DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS date,
       TIME_FORMAT(a.check_in_time, '%H:%i') AS checkIn,
       TIME_FORMAT(a.check_out_time, '%H:%i') AS checkOut
     FROM attendance a
     WHERE ${where}
     ORDER BY a.attendance_date DESC, a.attendance_id DESC
     LIMIT ? OFFSET ?`,
    [...params, filters.limit, filters.offset],
  );

  const total = Number(countRows[0]?.total || 0);
  return {
    rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
    },
  };
};

export const getAttendanceByDay = async (query) => {
  const date = validateDate(query.date, "date");
  if (!date) throw new Error("Date parameter is required");
  const filters = normalizeAdminFilters({ ...query, startDate: date, endDate: date });
  const where = buildAdminAttendanceWhere(filters);
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total ${adminAttendanceFrom} ${where.sql}`,
    where.params,
  );
  const [rows] = await pool.query(
    `SELECT
       a.attendance_id,
       a.user_id AS userId,
       DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
       DATE_FORMAT(a.check_in_time, '%Y-%m-%d %H:%i:%s') AS check_in_time,
       DATE_FORMAT(a.check_out_time, '%Y-%m-%d %H:%i:%s') AS check_out_time,
       a.total_hours, a.worked_minutes, a.late_minutes,
       a.early_checkout_minutes, a.status, a.remarks,
       CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS userName,
       ep.employee_code, ep.department, ep.designation,
       DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS date,
       TIME_FORMAT(a.check_in_time, '%H:%i') AS checkIn,
       TIME_FORMAT(a.check_out_time, '%H:%i') AS checkOut
     ${adminAttendanceFrom}
     ${where.sql}
     ORDER BY ep.employee_code ASC, a.attendance_id DESC
     LIMIT ? OFFSET ?`,
    [...where.params, filters.limit, filters.offset],
  );
  const total = Number(countRows[0]?.total || 0);
  return {
    rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
    },
  };
};

export const updateAttendance = async ({ attendanceId, actor, changes }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT attendance_id, user_id,
              DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
              DATE_FORMAT(check_in_time, '%Y-%m-%d %H:%i:%s') AS check_in_time,
              DATE_FORMAT(check_out_time, '%Y-%m-%d %H:%i:%s') AS check_out_time,
              total_hours, worked_minutes, late_minutes,
              early_checkout_minutes, status, remarks
       FROM attendance WHERE attendance_id = ? FOR UPDATE`,
      [attendanceId],
    );
    if (rows.length === 0) return { statusCode: 404, body: { success: false, message: "Attendance record not found" } };

    const current = rows[0];
    const attendanceDate = changes.attendance_date ?? current.attendance_date;
    const checkInTime = changes.check_in_time === undefined
      ? current.check_in_time
      : formatAttendanceDateTime(attendanceDate, changes.check_in_time);
    const checkOutTime = changes.check_out_time === undefined
      ? current.check_out_time
      : formatAttendanceDateTime(attendanceDate, changes.check_out_time);

    let metrics = { workedMinutes: null, totalHours: null, lateMinutes: 0, earlyCheckoutMinutes: 0, status: "Present" };
    if (checkInTime && checkOutTime) {
      metrics = calculateAttendanceMetrics({ attendanceDate, checkInTime, checkOutTime });
    } else if (checkInTime) {
      metrics = calculateOpenAttendanceMetrics({ attendanceDate, checkInTime });
    }

    await connection.query(
      `UPDATE attendance
       SET attendance_date = ?, check_in_time = ?, check_out_time = ?,
           total_hours = ?, worked_minutes = ?, late_minutes = ?,
           early_checkout_minutes = ?, status = ?, remarks = ?
       WHERE attendance_id = ?`,
      [
        attendanceDate,
        checkInTime,
        checkOutTime,
        metrics.totalHours,
        metrics.workedMinutes,
        metrics.lateMinutes,
        metrics.earlyCheckoutMinutes,
        metrics.status,
        changes.remarks === undefined ? current.remarks : changes.remarks,
        attendanceId,
      ],
    );

    await connection.query(
      `INSERT INTO audit_logs
        (user_id, action, table_name, record_id, old_value, new_value, ip_address, user_agent)
       VALUES (?, 'ATTENDANCE_CORRECTION', 'attendance', ?, ?, ?, ?, ?)`,
      [
        actor.userId,
        attendanceId,
        JSON.stringify(current),
        JSON.stringify({ attendance_date: attendanceDate, check_in_time: checkInTime, check_out_time: checkOutTime, ...metrics }),
        actor.ipAddress || null,
        actor.userAgent || null,
      ],
    );
    await connection.commit();
    return { statusCode: 200, body: { success: true, message: "Attendance updated successfully", data: { attendance_id: attendanceId, ...metrics } } };
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      return { statusCode: 409, body: { success: false, message: "Attendance already exists for this employee and date" } };
    }
    throw error;
  } finally {
    connection.release();
  }
};