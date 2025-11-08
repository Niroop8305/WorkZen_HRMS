import pool from "../config/database.js";

export const User = {
  // Create a new user
  create: async (userData) => {
    const { role_id, email, password_hash } = userData;
    const [result] = await pool.query(
      "INSERT INTO users (role_id, email, password_hash) VALUES (?, ?, ?)",
      [role_id, email, password_hash]
    );
    return result.insertId;
  },

  // Find user by email
  findByEmail: async (email) => {
    const [rows] = await pool.query(
      `SELECT u.*, r.role_name 
       FROM users u 
       INNER JOIN roles r ON u.role_id = r.role_id 
       WHERE u.email = ?`,
      [email]
    );
    return rows[0];
  },

  // Find user by ID
  findById: async (userId) => {
    const [rows] = await pool.query(
      `SELECT u.*, r.role_name 
       FROM users u 
       INNER JOIN roles r ON u.role_id = r.role_id 
       WHERE u.user_id = ?`,
      [userId]
    );
    return rows[0];
  },

  // Update last login
  updateLastLogin: async (userId) => {
    await pool.query(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?",
      [userId]
    );
  },

  // Get all users with profiles
  findAll: async () => {
    const [rows] = await pool.query("SELECT * FROM view_user_details");
    return rows;
  },

  // Get all users with full profile information
  findAllWithProfiles: async () => {
    const [rows] = await pool.query(`
      SELECT 
        u.user_id,
        u.email,
        u.is_active,
        u.last_login,
        u.created_at,
        r.role_name,
        ep.employee_code,
        ep.company_name,
        ep.first_name,
        ep.last_name,
        CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, '')) as full_name,
        ep.phone,
        ep.department,
        ep.designation,
        ep.date_of_joining
      FROM users u
      INNER JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
      ORDER BY u.created_at DESC
    `);
    return rows;
  },

  // Find user by ID with profile
  findByIdWithProfile: async (userId) => {
    const [rows] = await pool.query(`
      SELECT 
        u.user_id,
        u.email,
        u.is_active,
        u.last_login,
        u.created_at,
        r.role_name,
        ep.*
      FROM users u
      INNER JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN employee_profiles ep ON u.user_id = ep.user_id
      WHERE u.user_id = ?
    `, [userId]);
    return rows[0];
  },

  // Delete user
  delete: async (userId) => {
    // Foreign key constraints will handle cascade delete of profile
    await pool.query('DELETE FROM users WHERE user_id = ?', [userId]);
  },

  // Update user status
  updateStatus: async (userId, isActive) => {
    await pool.query("UPDATE users SET is_active = ? WHERE user_id = ?", [
      isActive,
      userId,
    ]);
  },

  // Update user password
  updatePassword: async (userId, newPasswordHash) => {
    await pool.query(
      "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
      [newPasswordHash, userId]
    );
  },
};

export const Role = {
  // Get all roles
  findAll: async () => {
    const [rows] = await pool.query("SELECT * FROM roles");
    return rows;
  },

  // Find role by name
  findByName: async (roleName) => {
    const [rows] = await pool.query("SELECT * FROM roles WHERE role_name = ?", [
      roleName,
    ]);
    return rows[0];
  },

  // Find role by ID
  findById: async (roleId) => {
    const [rows] = await pool.query("SELECT * FROM roles WHERE role_id = ?", [
      roleId,
    ]);
    return rows[0];
  },
};

export default { User, Role };
