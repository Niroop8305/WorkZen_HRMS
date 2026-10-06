import {
  listSalaryComponents,
  createSalaryComponent,
  updateSalaryComponent,
  setSalaryComponentStatus,
  getEmployeeSalaryStructures,
  getSalaryStructureAsOf,
  assignSalaryStructure,
  updateSalaryStructure,
  removeSalaryStructure,
} from "../services/salaryService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (statusCode === 500) {
    console.error(fallbackMessage, error);
    return res.status(500).json({ success: false, message: fallbackMessage });
  }
  return res.status(statusCode).json({ success: false, message: error.message });
};

const auditContext = (req) => ({
  actorId: req.user.userId,
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
});

// =====================================================
// Salary components
// =====================================================

export const getSalaryComponents = async (req, res) => {
  try {
    const data = await listSalaryComponents({
      includeInactive: req.query.include_inactive,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to fetch salary components");
  }
};

export const createSalaryComponentHandler = async (req, res) => {
  try {
    const data = await createSalaryComponent(req.body, auditContext(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to create salary component");
  }
};

export const updateSalaryComponentHandler = async (req, res) => {
  try {
    const data = await updateSalaryComponent(
      req.params.componentId,
      req.body,
      auditContext(req),
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to update salary component");
  }
};

export const setSalaryComponentStatusHandler = async (req, res) => {
  try {
    const data = await setSalaryComponentStatus(
      req.params.componentId,
      req.body.is_active,
      auditContext(req),
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to update salary component status");
  }
};

// =====================================================
// Employee salary structures
// =====================================================

export const getEmployeeSalaryStructure = async (req, res) => {
  try {
    const data = await getEmployeeSalaryStructures(req.params.userId, {
      includeInactive: req.query.include_inactive,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to fetch employee salary structure");
  }
};

export const getSalaryStructureAsOfHandler = async (req, res) => {
  try {
    const components = await getSalaryStructureAsOf(
      req.params.userId,
      req.query.date,
    );
    // Totals cover FIXED (currency) components only; PERCENTAGE components are
    // resolved against a base by the payroll engine in a later milestone.
    const fixed = components.filter((c) => c.calculation_type === "FIXED");
    const fixedEarnings = fixed
      .filter((c) => c.component_type === "Earning")
      .reduce((sum, c) => sum + Number(c.amount), 0);
    const fixedDeductions = fixed
      .filter((c) => c.component_type === "Deduction")
      .reduce((sum, c) => sum + Number(c.amount), 0);

    res.status(200).json({
      success: true,
      data: {
        as_of: req.query.date,
        components,
        totals: {
          fixed_earnings: fixedEarnings,
          fixed_deductions: fixedDeductions,
          net_fixed: fixedEarnings - fixedDeductions,
        },
      },
    });
  } catch (error) {
    handleError(res, error, "Unable to resolve salary structure");
  }
};

export const assignSalaryStructureHandler = async (req, res) => {
  try {
    const data = await assignSalaryStructure(
      { ...req.body, user_id: req.params.userId },
      auditContext(req),
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to assign salary structure");
  }
};

export const updateSalaryStructureHandler = async (req, res) => {
  try {
    const data = await updateSalaryStructure(
      req.params.structureId,
      req.body,
      auditContext(req),
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to update salary structure");
  }
};

export const removeSalaryStructureHandler = async (req, res) => {
  try {
    const data = await removeSalaryStructure(
      req.params.structureId,
      auditContext(req),
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to remove salary structure");
  }
};
