import pool from "../config/database.js";
import {
  listComponents,
  getComponentById,
  getComponentByName,
  createComponent,
  updateComponent,
  setComponentActive,
  getUserById,
  listStructuresByUser,
  getStructureForUpdate,
  findOverlappingStructures,
  createStructure,
  updateStructure,
  deactivateStructure,
  resolveStructureAsOf,
  createSalaryAudit,
} from "../models/salaryModel.js";

const COMPONENT_TYPES = Object.freeze(["Earning", "Deduction"]);
const CALCULATION_TYPES = Object.freeze(["FIXED", "PERCENTAGE"]);
const COMPONENT_TABLE = "salary_components";
const STRUCTURE_TABLE = "employee_salary_structure";

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const parseDate = (value, fieldName) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${fieldName} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail(`${fieldName} is not a valid date`);
  }
  return value;
};

const parsePositiveInteger = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    fail(`${fieldName} must be a positive integer`);
  }
  return parsed;
};

// =====================================================
// Salary components
// =====================================================

export const listSalaryComponents = ({ includeInactive = false } = {}) =>
  listComponents({ includeInactive: includeInactive === true || includeInactive === "true" });

const normalizeComponentPayload = (payload, { partial = false } = {}) => {
  const fields = {};

  if (!partial || payload.component_name !== undefined) {
    if (typeof payload.component_name !== "string" || payload.component_name.trim().length === 0) {
      fail("component_name is required");
    }
    if (payload.component_name.trim().length > 100) {
      fail("component_name must be 100 characters or fewer");
    }
    fields.componentName = payload.component_name.trim();
  }

  if (!partial || payload.component_type !== undefined) {
    if (!COMPONENT_TYPES.includes(payload.component_type)) {
      fail("component_type must be Earning or Deduction");
    }
    fields.componentType = payload.component_type;
  }

  if (!partial || payload.calculation_type !== undefined) {
    if (!CALCULATION_TYPES.includes(payload.calculation_type)) {
      fail("calculation_type must be FIXED or PERCENTAGE");
    }
    fields.calculationType = payload.calculation_type;
  }

  if (payload.description !== undefined) {
    if (payload.description !== null && typeof payload.description !== "string") {
      fail("description must be a string");
    }
    fields.description = payload.description?.trim() || null;
  } else if (!partial) {
    fields.description = null;
  }

  if (!partial || payload.is_taxable !== undefined) {
    fields.isTaxable = Boolean(payload.is_taxable);
  }

  return fields;
};

export const createSalaryComponent = async (payload, audit) => {
  const fields = normalizeComponentPayload(payload);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const existing = await getComponentByName(fields.componentName, connection);
    if (existing) {
      fail("A salary component with this name already exists", 409);
    }

    const componentId = await createComponent(connection, fields);
    await createSalaryAudit(connection, {
      actorId: audit.actorId,
      action: "SALARY_COMPONENT_CREATED",
      tableName: COMPONENT_TABLE,
      recordId: componentId,
      newValue: fields,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await connection.commit();

    return { component_id: componentId, ...fields };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const updateSalaryComponent = async (rawComponentId, payload, audit) => {
  const componentId = parsePositiveInteger(rawComponentId, "component_id");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const current = await getComponentById(componentId, connection);
    if (!current) fail("Salary component not found", 404);

    const merged = {
      component_name: payload.component_name ?? current.component_name,
      component_type: payload.component_type ?? current.component_type,
      calculation_type: payload.calculation_type ?? current.calculation_type,
      description: payload.description !== undefined ? payload.description : current.description,
      is_taxable: payload.is_taxable !== undefined ? payload.is_taxable : Boolean(current.is_taxable),
    };
    const fields = normalizeComponentPayload(merged);

    if (fields.componentName !== current.component_name) {
      const clash = await getComponentByName(fields.componentName, connection);
      if (clash && clash.component_id !== componentId) {
        fail("A salary component with this name already exists", 409);
      }
    }

    await updateComponent(connection, componentId, fields);
    await createSalaryAudit(connection, {
      actorId: audit.actorId,
      action: "SALARY_COMPONENT_UPDATED",
      tableName: COMPONENT_TABLE,
      recordId: componentId,
      oldValue: {
        component_name: current.component_name,
        component_type: current.component_type,
        calculation_type: current.calculation_type,
        description: current.description,
        is_taxable: Boolean(current.is_taxable),
      },
      newValue: fields,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await connection.commit();

    return { component_id: componentId, ...fields };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const setSalaryComponentStatus = async (rawComponentId, rawIsActive, audit) => {
  const componentId = parsePositiveInteger(rawComponentId, "component_id");
  if (typeof rawIsActive !== "boolean") {
    fail("is_active must be a boolean");
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const current = await getComponentById(componentId, connection);
    if (!current) fail("Salary component not found", 404);

    await setComponentActive(connection, componentId, rawIsActive);
    await createSalaryAudit(connection, {
      actorId: audit.actorId,
      action: rawIsActive ? "SALARY_COMPONENT_ACTIVATED" : "SALARY_COMPONENT_DEACTIVATED",
      tableName: COMPONENT_TABLE,
      recordId: componentId,
      oldValue: { is_active: Boolean(current.is_active) },
      newValue: { is_active: rawIsActive },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await connection.commit();

    return { component_id: componentId, is_active: rawIsActive };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// =====================================================
// Employee salary structures
// =====================================================

export const getEmployeeSalaryStructures = (rawUserId, { includeInactive = false } = {}) => {
  const userId = parsePositiveInteger(rawUserId, "user_id");
  return listStructuresByUser(userId, {
    includeInactive: includeInactive === true || includeInactive === "true",
  });
};

export const getSalaryStructureAsOf = (rawUserId, rawPayrollDate) => {
  const userId = parsePositiveInteger(rawUserId, "user_id");
  const payrollDate = parseDate(rawPayrollDate, "payroll_date");
  return resolveStructureAsOf(userId, payrollDate);
};

// Validates and normalises a structure assignment. `amount` is a currency value
// for FIXED components and a 0-100 percentage for PERCENTAGE components; the
// actual percentage base is resolved by the payroll engine (Milestone 3).
const validateStructureFields = ({ amount, effectiveFrom, effectiveTo }, calculationType) => {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
    fail("amount must be a non-negative number");
  }
  if (calculationType === "PERCENTAGE" && parsedAmount > 100) {
    fail("amount must be between 0 and 100 for a PERCENTAGE component");
  }

  const from = parseDate(effectiveFrom, "effective_from");
  let to = null;
  if (effectiveTo !== undefined && effectiveTo !== null && effectiveTo !== "") {
    to = parseDate(effectiveTo, "effective_to");
    if (to < from) fail("effective_to cannot be before effective_from");
  }

  return { amount: parsedAmount, effectiveFrom: from, effectiveTo: to };
};

export const assignSalaryStructure = async (payload, audit) => {
  const userId = parsePositiveInteger(payload.user_id, "user_id");
  const componentId = parsePositiveInteger(payload.component_id, "component_id");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const user = await getUserById(userId, connection);
    if (!user) fail("Employee not found", 404);

    const component = await getComponentById(componentId, connection);
    if (!component) fail("Salary component not found", 404);
    if (!component.is_active) fail("Cannot assign an inactive salary component", 409);

    const fields = validateStructureFields(
      {
        amount: payload.amount,
        effectiveFrom: payload.effective_from,
        effectiveTo: payload.effective_to,
      },
      component.calculation_type,
    );

    const overlap = await findOverlappingStructures(connection, {
      userId,
      componentId,
      effectiveFrom: fields.effectiveFrom,
      effectiveTo: fields.effectiveTo,
    });
    if (overlap) {
      fail(
        `Salary structure overlaps an existing assignment (structure_id ${overlap.structure_id}) for this component`,
        409,
      );
    }

    const structureId = await createStructure(connection, {
      userId,
      componentId,
      ...fields,
    });
    await createSalaryAudit(connection, {
      actorId: audit.actorId,
      action: "SALARY_STRUCTURE_CREATED",
      tableName: STRUCTURE_TABLE,
      recordId: structureId,
      newValue: { user_id: userId, component_id: componentId, ...fields },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await connection.commit();

    return { structure_id: structureId, user_id: userId, component_id: componentId, ...fields };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const updateSalaryStructure = async (rawStructureId, payload, audit) => {
  const structureId = parsePositiveInteger(rawStructureId, "structure_id");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const current = await getStructureForUpdate(connection, structureId);
    if (!current) fail("Salary structure not found", 404);

    const componentId =
      payload.component_id !== undefined
        ? parsePositiveInteger(payload.component_id, "component_id")
        : current.component_id;

    const component = await getComponentById(componentId, connection);
    if (!component) fail("Salary component not found", 404);
    if (!component.is_active) fail("Cannot assign an inactive salary component", 409);

    const currentFrom = current.effective_from;
    const currentTo = current.effective_to || null;

    const fields = validateStructureFields(
      {
        amount: payload.amount !== undefined ? payload.amount : current.amount,
        effectiveFrom: payload.effective_from !== undefined ? payload.effective_from : currentFrom,
        effectiveTo: payload.effective_to !== undefined ? payload.effective_to : currentTo,
      },
      component.calculation_type,
    );

    const overlap = await findOverlappingStructures(connection, {
      userId: current.user_id,
      componentId,
      effectiveFrom: fields.effectiveFrom,
      effectiveTo: fields.effectiveTo,
      excludeStructureId: structureId,
    });
    if (overlap) {
      fail(
        `Salary structure overlaps an existing assignment (structure_id ${overlap.structure_id}) for this component`,
        409,
      );
    }

    await updateStructure(connection, structureId, { componentId, ...fields });
    await createSalaryAudit(connection, {
      actorId: audit.actorId,
      action: "SALARY_STRUCTURE_UPDATED",
      tableName: STRUCTURE_TABLE,
      recordId: structureId,
      oldValue: {
        component_id: current.component_id,
        amount: Number(current.amount),
        effective_from: currentFrom,
        effective_to: currentTo,
      },
      newValue: { component_id: componentId, ...fields },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await connection.commit();

    return { structure_id: structureId, user_id: current.user_id, component_id: componentId, ...fields };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const removeSalaryStructure = async (rawStructureId, audit) => {
  const structureId = parsePositiveInteger(rawStructureId, "structure_id");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const current = await getStructureForUpdate(connection, structureId);
    if (!current) fail("Salary structure not found", 404);
    if (!current.is_active) fail("Salary structure is already removed", 409);

    await deactivateStructure(connection, structureId);
    await createSalaryAudit(connection, {
      actorId: audit.actorId,
      action: "SALARY_STRUCTURE_REMOVED",
      tableName: STRUCTURE_TABLE,
      recordId: structureId,
      oldValue: {
        user_id: current.user_id,
        component_id: current.component_id,
        amount: Number(current.amount),
        effective_from: current.effective_from,
        effective_to: current.effective_to || null,
        is_active: true,
      },
      newValue: { is_active: false },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await connection.commit();

    return { structure_id: structureId, is_active: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
