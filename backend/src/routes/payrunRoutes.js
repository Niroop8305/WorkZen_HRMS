import express from "express";
import {
  runPayrun,
  getAllPayruns,
  getPayrunById,
  getPayslipById,
  updatePayrunStatus,
} from "../controllers/payrunController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// @route   POST /api/payrun/run
// @desc    Generate payrun for all employees
// @access  Private (Admin, Payroll Officer)
router.post("/run", protect, authorize("Admin", "Payroll Officer"), runPayrun);

// @route   GET /api/payrun/list
// @desc    Get all payruns
// @access  Private (Admin, Payroll Officer)
router.get(
  "/list",
  protect,
  authorize("Admin", "Payroll Officer"),
  getAllPayruns,
);

// @route   GET /api/payrun/:id
// @desc    Get payrun by ID with payslips
// @access  Private (Admin, Payroll Officer)
router.get(
  "/:id",
  protect,
  authorize("Admin", "Payroll Officer"),
  getPayrunById,
);

// @route   PATCH /api/payrun/:id/status
// @desc    Update payrun status
// @access  Private (Admin, Payroll Officer)
router.patch(
  "/:id/status",
  protect,
  authorize("Admin", "Payroll Officer"),
  updatePayrunStatus,
);

// @route   GET /api/payslip/:id
// @desc    Get single payslip
// @access  Private (Admin, Payroll Officer)
router.get(
  "/payslip/:id",
  protect,
  authorize("Admin", "Payroll Officer"),
  getPayslipById,
);

export default router;
