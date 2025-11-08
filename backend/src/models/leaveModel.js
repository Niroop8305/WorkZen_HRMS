import pool from "../config/database.js";

export class LeaveRequest {
  // Create a new leave request
  static async create(leaveData) {
    const {
      user_id,
      start_date,
      end_date,
      leave_type,
      days_requested,
      reason,
    } = leaveData;

    const [result] = await pool.query(
      `INSERT INTO leave_requests 
       (user_id, start_date, end_date, leave_type, days_requested, reason, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [user_id, start_date, end_date, leave_type, days_requested, reason]
    );

    return result.insertId;
  }

  // Get leave requests by user ID
  static async findByUserId(userId) {
    const [rows] = await pool.query(
      `SELECT * FROM leave_requests_view 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  }

  // Get all leave requests (for admin/HR)
  static async findAll(filters = {}) {
    let query = "SELECT * FROM leave_requests_view WHERE 1=1";
    const params = [];

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }

    if (filters.leave_type) {
      query += " AND leave_type = ?";
      params.push(filters.leave_type);
    }

    if (filters.search) {
      query += " AND (employee_name LIKE ? OR employee_code LIKE ?)";
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += " ORDER BY created_at DESC";

    const [rows] = await pool.query(query, params);
    return rows;
  }

  // Get leave request by ID
  static async findById(requestId) {
    const [rows] = await pool.query(
      "SELECT * FROM leave_requests_view WHERE id = ?",
      [requestId]
    );
    return rows[0];
  }

  // Update leave request status (approve/reject)
  static async updateStatus(requestId, status, reviewedBy) {
    const [result] = await pool.query(
      `UPDATE leave_requests 
       SET status = ?, reviewed_by = ?, reviewed_at = NOW() 
       WHERE id = ?`,
      [status, reviewedBy, requestId]
    );
    return result.affectedRows > 0;
  }

  // Delete leave request
  static async delete(requestId) {
    const [result] = await pool.query(
      "DELETE FROM leave_requests WHERE id = ?",
      [requestId]
    );
    return result.affectedRows > 0;
  }
}

export class LeaveBalance {
  // Get leave balance for a user
  static async findByUserId(userId) {
    const [rows] = await pool.query(
      `SELECT * FROM leave_balances 
       WHERE user_id = ?`,
      [userId]
    );

    // If no balance exists for this user, create one
    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO leave_balances (user_id, paid_time_off, sick_time_off) 
         VALUES (?, 24.00, 7.00)`,
        [userId]
      );
      return {
        user_id: userId,
        paid_time_off: 24.0,
        sick_time_off: 7.0,
      };
    }

    return rows[0];
  }

  // Update leave balance after approval
  static async deductBalance(userId, leaveType, days) {
    const field =
      leaveType === "Paid Time Off" ? "paid_time_off" : "sick_time_off";

    const [result] = await pool.query(
      `UPDATE leave_balances 
       SET ${field} = ${field} - ? 
       WHERE user_id = ?`,
      [days, userId]
    );

    return result.affectedRows > 0;
  }

  // Restore leave balance after rejection (if previously approved)
  static async restoreBalance(userId, leaveType, days) {
    const field =
      leaveType === "Paid Time Off" ? "paid_time_off" : "sick_time_off";

    const [result] = await pool.query(
      `UPDATE leave_balances 
       SET ${field} = ${field} + ? 
       WHERE user_id = ?`,
      [days, userId]
    );

    return result.affectedRows > 0;
  }

  // Get all balances (for admin reporting)
  static async findAll() {
    const [rows] = await pool.query(
      `SELECT lb.*, 
              CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) as employee_name,
              ep.employee_code
       FROM leave_balances lb
       LEFT JOIN employee_profiles ep ON lb.user_id = ep.user_id
       ORDER BY ep.first_name`
    );
    return rows;
  }

  // Allocate additional leave days (with max threshold check)
  static async allocateLeave(
    userId,
    leaveType,
    days,
    allocatedBy,
    reason = null
  ) {
    const field =
      leaveType === "Paid Time Off" ? "paid_time_off" : "sick_time_off";
    const maxField =
      leaveType === "Paid Time Off" ? "paid_time_off_max" : "sick_time_off_max";

    // Get current balance and max threshold
    const [balances] = await pool.query(
      `SELECT ${field} as current_balance, ${maxField} as max_threshold 
       FROM leave_balances WHERE user_id = ?`,
      [userId]
    );

    if (balances.length === 0) {
      throw new Error("User leave balance not found");
    }

    const { current_balance, max_threshold } = balances[0];
    const newBalance = parseFloat(current_balance) + parseFloat(days);

    // Check if new balance exceeds maximum threshold
    if (newBalance > max_threshold) {
      throw new Error(
        `Cannot allocate ${days} days. Maximum threshold is ${max_threshold} days. Current balance: ${current_balance} days.`
      );
    }

    // Update balance
    const [result] = await pool.query(
      `UPDATE leave_balances 
       SET ${field} = ${field} + ? 
       WHERE user_id = ?`,
      [days, userId]
    );

    // Record allocation in history
    await pool.query(
      `INSERT INTO leave_allocations 
       (user_id, leave_type, days_allocated, reason, allocated_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, leaveType, days, reason, allocatedBy]
    );

    return result.affectedRows > 0;
  }

  // Get allocation history for a user
  static async getAllocationHistory(userId) {
    const [rows] = await pool.query(
      `SELECT la.*, 
              CONCAT(allocator.first_name, ' ', COALESCE(allocator.last_name, '')) as allocated_by_name
       FROM leave_allocations la
       LEFT JOIN employee_profiles allocator ON la.allocated_by = allocator.user_id
       WHERE la.user_id = ?
       ORDER BY la.created_at DESC`,
      [userId]
    );
    return rows;
  }

  // Get all allocations (for admin)
  static async getAllAllocations() {
    const [rows] = await pool.query(
      `SELECT la.*, 
              CONCAT(emp.first_name, ' ', COALESCE(emp.last_name, '')) as employee_name,
              CONCAT(allocator.first_name, ' ', COALESCE(allocator.last_name, '')) as allocated_by_name
       FROM leave_allocations la
       LEFT JOIN employee_profiles emp ON la.user_id = emp.user_id
       LEFT JOIN employee_profiles allocator ON la.allocated_by = allocator.user_id
       ORDER BY la.created_at DESC`
    );
    return rows;
  }
}
