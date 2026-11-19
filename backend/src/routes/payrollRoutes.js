import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import {
  getMyPayroll,
  getPayslipDetails,
  getPayslipPdf,
  getAllPayroll,
  generatePayroll,
  updatePayrollStatus,
} from "../controllers/payrollController.js";
import {
  getSalaryComponents,
  createSalaryComponentHandler,
  updateSalaryComponentHandler,
  setSalaryComponentStatusHandler,
  getEmployeeSalaryStructure,
  getSalaryStructureAsOfHandler,
  assignSalaryStructureHandler,
  updateSalaryStructureHandler,
  removeSalaryStructureHandler,
} from "../controllers/salaryController.js";

const router = express.Router();

// Employee routes
router.get("/my-payroll", protect, getMyPayroll);
router.get("/payslip/:payrollId", protect, getPayslipDetails);
router.get("/payslip/:payrollId/pdf", protect, getPayslipPdf);

// Admin/Payroll Officer routes
router.get(
  "/all",
  protect,
  authorize("Admin", "Payroll Officer"),
  getAllPayroll,
);
router.post(
  "/generate",
  protect,
  authorize("Admin", "Payroll Officer"),
  generatePayroll,
);
router.put(
  "/:payrollId/status",
  protect,
  authorize("Admin", "Payroll Officer"),
  updatePayrollStatus,
);

// Salary component configuration (Milestone 2)
router.get(
  "/components",
  protect,
  authorize("Admin", "Payroll Officer"),
  getSalaryComponents,
);
router.post(
  "/components",
  protect,
  authorize("Admin", "Payroll Officer"),
  createSalaryComponentHandler,
);
router.put(
  "/components/:componentId",
  protect,
  authorize("Admin", "Payroll Officer"),
  updateSalaryComponentHandler,
);
router.patch(
  "/components/:componentId/status",
  protect,
  authorize("Admin", "Payroll Officer"),
  setSalaryComponentStatusHandler,
);

// Employee salary structures (Milestone 2, effective-dated).
// Version mutations key on structure_id because a single user+component can
// hold multiple non-overlapping effective-dated versions.
router.get(
  "/salary-structure/:userId/as-of",
  protect,
  // T-011 visibility: an Employee may read their OWN structure; staff roles
  // may read any. The self-check lives in the controller, which knows the
  // requester's id.
  authorize("Admin", "HR Officer", "Payroll Officer", "Employee"),
  getSalaryStructureAsOfHandler,
);
router.get(
  "/salary-structure/:userId",
  protect,
  authorize("Admin", "HR Officer", "Payroll Officer", "Employee"),
  getEmployeeSalaryStructure,
);
router.post(
  "/salary-structure/:userId",
  protect,
  authorize("Admin", "Payroll Officer"),
  assignSalaryStructureHandler,
);
router.put(
  "/salary-structure/version/:structureId",
  protect,
  authorize("Admin", "Payroll Officer"),
  updateSalaryStructureHandler,
);
router.delete(
  "/salary-structure/version/:structureId",
  protect,
  authorize("Admin", "Payroll Officer"),
  removeSalaryStructureHandler,
);

export default router;
