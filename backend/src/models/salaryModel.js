import pool from "../config/database.js";

// Open-ended effective_to is stored as NULL; use a far-future sentinel so that
// interval-overlap comparisons work with plain >= / <= operators.
const OPEN_ENDED_SENTINEL = "9999-12-31";

// =====================================================
// Salary components
// =====================================================

export const listComponents = async ({ includeInactive = false } = {}) => {
  const whereSql = includeInactive ? "" : "WHERE is_active = TRUE";
  const [rows] = await pool.query(
    `SELECT component_id, component_name, component_type, calculation_type,
            description, is_taxable, is_active, created_at, updated_at
     FROM salary_components
     ${whereSql}
     ORDER BY component_type DESC, component_name`,
  );
  return rows;
};

export const getComponentById = async (componentId, connection = pool) => {
  const [rows] = await connection.query(
    `SELECT component_id, component_name, component_type, calculation_type,
            description, is_taxable, is_active
     FROM salary_components
     WHERE component_id = ?`,
    [componentId],
  );
  return rows[0] || null;
};

export const getComponentByName = async (componentName, connection = pool) => {
  const [rows] = await connection.query(
    `SELECT component_id, component_name, component_type, calculation_type,
            description, is_taxable, is_active
     FROM salary_components
     WHERE component_name = ?`,
    [componentName],
  );
  return rows[0] || null;
};

export const createComponent = async (connection, component) => {
  const [result] = await connection.query(
    `INSERT INTO salary_components
      (component_name, component_type, calculation_type, description, is_taxable, is_active)
     VALUES (?, ?, ?, ?, ?, TRUE)`,
    [
      component.componentName,
      component.componentType,
      component.calculationType,
      component.description || null,
      component.isTaxable ? 1 : 0,
    ],
  );
  return result.insertId;
};

export const updateComponent = async (connection, componentId, fields) => {
  await connection.query(
    `UPDATE salary_components
     SET component_name = ?, component_type = ?, calculation_type = ?,
         description = ?, is_taxable = ?
     WHERE component_id = ?`,
    [
      fields.componentName,
      fields.componentType,
      fields.calculationType,
      fields.description || null,
      fields.isTaxable ? 1 : 0,
      componentId,
    ],
  );
};

export const setComponentActive = async (connection, componentId, isActive) => {
  await connection.query(
    `UPDATE salary_components SET is_active = ? WHERE component_id = ?`,
    [isActive ? 1 : 0, componentId],
  );
};

// =====================================================
// Employee salary structures (effective-dated)
// =====================================================

export const getUserById = async (userId, connection = pool) => {
  const [rows] = await connection.query(
    `SELECT user_id, email, is_active FROM users WHERE user_id = ?`,
    [userId],
  );
  return rows[0] || null;
};

export const listStructuresByUser = async (userId, { includeInactive = false } = {}) => {
  const activeClause = includeInactive ? "" : "AND ess.is_active = TRUE";
  const [rows] = await pool.query(
    `SELECT ess.structure_id, ess.user_id, ess.component_id, ess.amount,
            DATE_FORMAT(ess.effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(ess.effective_to, '%Y-%m-%d') AS effective_to,
            ess.is_active,
            sc.component_name, sc.component_type, sc.calculation_type, sc.is_taxable
     FROM employee_salary_structure ess
     INNER JOIN salary_components sc ON ess.component_id = sc.component_id
     WHERE ess.user_id = ? ${activeClause}
     ORDER BY ess.effective_from DESC, sc.component_type DESC, sc.component_name`,
    [userId],
  );
  return rows;
};

export const getStructureById = async (structureId, connection = pool) => {
  const [rows] = await connection.query(
    `SELECT ess.structure_id, ess.user_id, ess.component_id, ess.amount,
            DATE_FORMAT(ess.effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(ess.effective_to, '%Y-%m-%d') AS effective_to,
            ess.is_active
     FROM employee_salary_structure ess
     WHERE ess.structure_id = ?`,
    [structureId],
  );
  return rows[0] || null;
};

export const getStructureForUpdate = async (connection, structureId) => {
  const [rows] = await connection.query(
    `SELECT structure_id, user_id, component_id, amount,
            DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(effective_to, '%Y-%m-%d') AS effective_to,
            is_active
     FROM employee_salary_structure
     WHERE structure_id = ?
     FOR UPDATE`,
    [structureId],
  );
  return rows[0] || null;
};

// Locks and returns any active structure for the same user+component whose
// [effective_from, effective_to] interval overlaps the proposed interval.
// The FOR UPDATE range lock (backed by idx_user_component) serialises
// concurrent assignments so overlap cannot slip through under REPEATABLE-READ.
export const findOverlappingStructures = async (
  connection,
  { userId, componentId, effectiveFrom, effectiveTo, excludeStructureId = 0 },
) => {
  const [rows] = await connection.query(
    `SELECT structure_id,
            DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(effective_to, '%Y-%m-%d') AS effective_to
     FROM employee_salary_structure
     WHERE user_id = ?
       AND component_id = ?
       AND is_active = TRUE
       AND effective_from <= ?
       AND COALESCE(effective_to, '${OPEN_ENDED_SENTINEL}') >= ?
       AND structure_id <> ?
     LIMIT 1
     FOR UPDATE`,
    [
      userId,
      componentId,
      effectiveTo || OPEN_ENDED_SENTINEL,
      effectiveFrom,
      excludeStructureId,
    ],
  );
  return rows[0] || null;
};

export const createStructure = async (connection, structure) => {
  const [result] = await connection.query(
    `INSERT INTO employee_salary_structure
      (user_id, component_id, amount, effective_from, effective_to, is_active)
     VALUES (?, ?, ?, ?, ?, TRUE)`,
    [
      structure.userId,
      structure.componentId,
      structure.amount,
      structure.effectiveFrom,
      structure.effectiveTo || null,
    ],
  );
  return result.insertId;
};

export const updateStructure = async (connection, structureId, fields) => {
  await connection.query(
    `UPDATE employee_salary_structure
     SET component_id = ?, amount = ?, effective_from = ?, effective_to = ?
     WHERE structure_id = ?`,
    [
      fields.componentId,
      fields.amount,
      fields.effectiveFrom,
      fields.effectiveTo || null,
      structureId,
    ],
  );
};

export const deactivateStructure = async (connection, structureId) => {
  await connection.query(
    `UPDATE employee_salary_structure SET is_active = FALSE WHERE structure_id = ?`,
    [structureId],
  );
};

// Resolves the salary components in effect for a user on a given payroll date.
// Overlap prevention guarantees at most one active row per component per date.
export const resolveStructureAsOf = async (userId, payrollDate) => {
  const [rows] = await pool.query(
    `SELECT ess.structure_id, ess.component_id, ess.amount,
            DATE_FORMAT(ess.effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(ess.effective_to, '%Y-%m-%d') AS effective_to,
            sc.component_name, sc.component_type, sc.calculation_type, sc.is_taxable
     FROM employee_salary_structure ess
     INNER JOIN salary_components sc ON ess.component_id = sc.component_id
     WHERE ess.user_id = ?
       AND ess.is_active = TRUE
       AND sc.is_active = TRUE
       AND ess.effective_from <= ?
       AND (ess.effective_to IS NULL OR ess.effective_to >= ?)
     ORDER BY sc.component_type DESC, sc.component_name`,
    [userId, payrollDate, payrollDate],
  );
  return rows;
};

// =====================================================
// Audit (reuses existing audit_logs table)
// =====================================================

export const createSalaryAudit = async (connection, audit) => {
  await connection.query(
    `INSERT INTO audit_logs
      (user_id, action, table_name, record_id, old_value, new_value, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      audit.actorId,
      audit.action,
      audit.tableName,
      audit.recordId,
      audit.oldValue ? JSON.stringify(audit.oldValue) : null,
      audit.newValue ? JSON.stringify(audit.newValue) : null,
      audit.ipAddress || null,
      audit.userAgent || null,
    ],
  );
};
