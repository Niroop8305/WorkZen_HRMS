import pool from "../config/database.js";

export const getLeaveTypes = async () => {
  const [rows] = await pool.query(
    `SELECT leave_type_id, leave_type_name, description,
            default_days_per_year, is_paid, requires_approval
     FROM leave_types
     ORDER BY leave_type_id`,
  );
  return rows;
};

export const getLeaveTypeById = async (leaveTypeId, connection = pool) => {
  const [rows] = await connection.query(
    `SELECT leave_type_id, leave_type_name, description,
            default_days_per_year, is_paid, requires_approval
     FROM leave_types
     WHERE leave_type_id = ?`,
    [leaveTypeId],
  );
  return rows[0] || null;
};

export const getBalanceByUser = async (userId, year) => {
  const [rows] = await pool.query(
    `SELECT lb.balance_id, lb.user_id, lb.leave_type_id, lb.year,
            lt.leave_type_name, lt.description, lt.is_paid,
            lt.requires_approval, lb.total_allocated,
            lb.used_days, lb.remaining_days
     FROM leave_balance lb
     INNER JOIN leave_types lt ON lb.leave_type_id = lt.leave_type_id
     WHERE lb.user_id = ? AND lb.year = ?
     ORDER BY lb.leave_type_id`,
    [userId, year],
  );
  return rows;
};

export const getBalanceForUpdate = async (
  connection,
  userId,
  leaveTypeId,
  year,
) => {
  const [rows] = await connection.query(
    `SELECT balance_id, user_id, leave_type_id, year,
            total_allocated, used_days, remaining_days
     FROM leave_balance
     WHERE user_id = ? AND leave_type_id = ? AND year = ?
     FOR UPDATE`,
    [userId, leaveTypeId, year],
  );
  return rows[0] || null;
};

export const findOverlappingApplications = async (
  connection,
  userId,
  startDate,
  endDate,
) => {
  const [rows] = await connection.query(
    `SELECT leave_id, leave_type_id, start_date, end_date, total_days, status
     FROM leave_applications
     WHERE user_id = ?
       AND status IN ('Pending', 'Approved')
       AND start_date <= ?
       AND end_date >= ?
     LIMIT 1`,
    [userId, endDate, startDate],
  );
  return rows[0] || null;
};

export const createLeaveApplication = async (connection, application) => {
  const [result] = await connection.query(
    `INSERT INTO leave_applications
      (user_id, leave_type_id, start_date, end_date, total_days, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
    [
      application.userId,
      application.leaveTypeId,
      application.startDate,
      application.endDate,
      application.totalDays,
      application.reason,
    ],
  );
  return result.insertId;
};

export const getApplicationsByUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT la.leave_id, la.user_id, la.leave_type_id,
            lt.leave_type_name, lt.is_paid,
            DATE_FORMAT(la.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(la.end_date, '%Y-%m-%d') AS end_date,
            la.total_days, la.reason, la.status,
            la.applied_date, la.approved_by, la.approved_date,
            la.rejection_reason
     FROM leave_applications la
     INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
     WHERE la.user_id = ?
     ORDER BY la.start_date DESC, la.leave_id DESC`,
    [userId],
  );
  return rows;
};

export const getApplicationForUpdate = async (connection, leaveId) => {
  const [rows] = await connection.query(
    `SELECT la.leave_id, la.user_id, la.leave_type_id,
            la.start_date, la.end_date, la.total_days,
            la.status, la.approved_by, la.approved_date,
            lt.leave_type_name, lt.is_paid
     FROM leave_applications la
     INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
     WHERE la.leave_id = ?
     FOR UPDATE`,
    [leaveId],
  );
  return rows[0] || null;
};

export const updateApplicationStatus = async (
  connection,
  leaveId,
  status,
  reviewerId,
  rejectionReason,
) => {
  await connection.query(
    `UPDATE leave_applications
     SET status = ?, approved_by = ?, approved_date = CURRENT_TIMESTAMP,
         rejection_reason = ?
     WHERE leave_id = ?`,
    [status, reviewerId, rejectionReason, leaveId],
  );
};

export const cancelApplication = async (connection, leaveId) => {
  await connection.query(
    `UPDATE leave_applications
     SET status = 'Cancelled'
     WHERE leave_id = ?`,
    [leaveId],
  );
};

export const createLeaveAudit = async (connection, audit) => {
  await connection.query(
    `INSERT INTO audit_logs
      (user_id, action, table_name, record_id, old_value, new_value, ip_address, user_agent)
     VALUES (?, ?, 'leave_applications', ?, ?, ?, ?, ?)`,
    [
      audit.actorId,
      audit.action,
      audit.recordId,
      audit.oldValue ? JSON.stringify(audit.oldValue) : null,
      audit.newValue ? JSON.stringify(audit.newValue) : null,
      audit.ipAddress || null,
      audit.userAgent || null,
    ],
  );
};

export const getOrganizationLeaveRequests = async ({
  whereSql,
  params,
  limit,
  offset,
}) => {
  const from = `
    FROM leave_applications la
    INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
    INNER JOIN users u ON la.user_id = u.user_id
    LEFT JOIN employee_profiles ep ON la.user_id = ep.user_id
  `;
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total ${from} ${whereSql}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT
       la.leave_id,
       la.user_id AS employee_id,
       ep.employee_code,
       CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
       ep.department,
       la.leave_type_id,
       lt.leave_type_name AS leave_type,
       DATE_FORMAT(la.start_date, '%Y-%m-%d') AS start_date,
       DATE_FORMAT(la.end_date, '%Y-%m-%d') AS end_date,
       la.total_days,
       la.reason,
       la.status,
       la.applied_date,
       la.approved_by,
       la.approved_date,
       la.rejection_reason,
       u.email
     ${from}
     ${whereSql}
     ORDER BY la.start_date DESC, la.leave_id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { rows, total: Number(countRows[0]?.total || 0) };
};

export const getActiveLeaveApplications = async () => {
  const [rows] = await pool.query(
    `SELECT
       la.leave_id, la.user_id AS employee_id, ep.employee_code,
       CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
       ep.department, lt.leave_type_name AS leave_type,
       DATE_FORMAT(la.start_date, '%Y-%m-%d') AS start_date,
       DATE_FORMAT(la.end_date, '%Y-%m-%d') AS end_date,
       la.total_days, u.email
     FROM leave_applications la
     INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
     INNER JOIN users u ON la.user_id = u.user_id
     LEFT JOIN employee_profiles ep ON la.user_id = ep.user_id
     WHERE la.status = 'Approved'
       AND la.start_date <= CURRENT_DATE
       AND la.end_date >= CURRENT_DATE
     ORDER BY ep.employee_code, la.leave_id`,
  );
  return rows;
};

export const getLeaveNotificationRecipients = async (connection, leaveId) => {
  const [rows] = await connection.query(
    `SELECT
       la.leave_id, la.status, la.start_date, la.end_date, la.total_days,
       la.reason, la.rejection_reason,
       employee.email AS employee_email,
       CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS employee_name,
       lt.leave_type_name,
       GROUP_CONCAT(DISTINCT CASE WHEN r.role_name IN ('Admin', 'HR Officer') THEN u.email END) AS hr_emails
     FROM leave_applications la
     INNER JOIN leave_types lt ON la.leave_type_id = lt.leave_type_id
     INNER JOIN users employee ON la.user_id = employee.user_id
     LEFT JOIN employee_profiles ep ON la.user_id = ep.user_id
     LEFT JOIN users u ON u.is_active = TRUE
     LEFT JOIN roles r ON u.role_id = r.role_id
     WHERE la.leave_id = ?
     GROUP BY la.leave_id, employee.email, ep.first_name, ep.last_name, lt.leave_type_name`,
    [leaveId],
  );
  return rows[0] || null;
};

export const getLeaveAuditLogs = async ({ whereSql, params, limit, offset }) => {
  const from = `
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.user_id
    LEFT JOIN employee_profiles ep ON al.user_id = ep.user_id
  `;
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total ${from} ${whereSql}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT al.log_id, al.action, al.table_name, al.record_id,
            al.old_value, al.new_value, al.created_at,
            al.user_id AS actor_id, u.email AS actor_email,
            CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) AS actor_name
     ${from}
     ${whereSql}
     ORDER BY al.created_at DESC, al.log_id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { rows, total: Number(countRows[0]?.total || 0) };
};
