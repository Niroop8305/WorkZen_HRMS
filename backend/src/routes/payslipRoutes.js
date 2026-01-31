import express from "express";
import PayslipController from "../controllers/payslipController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

// 1. Create new payslip (draft)
router.post(
  "/new",
  authorize("Admin", "Payroll Officer"),
  PayslipController.createNewPayslip,
);

// 2. Compute salary
router.post(
  "/compute",
  authorize("Admin", "Payroll Officer"),
  PayslipController.computeSalary,
);

// 3. Save computed payslip
router.put(
  "/:id/save",
  authorize("Admin", "Payroll Officer"),
  PayslipController.saveComputedPayslip,
);

// 4. Get payslip by ID
router.get("/:id", PayslipController.getPayslipById);

// 5. Delete payslip (draft only)
router.delete(
  "/:id",
  authorize("Admin", "Payroll Officer"),
  PayslipController.deletePayslip,
);

// 6. Get all payslips (with filters)
router.get(
  "/",
  authorize("Admin", "Payroll Officer"),
  PayslipController.getAllPayslips,
);

// 7. Validate payslip (mark as Done)
router.post(
  "/:id/validate",
  authorize("Admin", "Payroll Officer"),
  PayslipController.validatePayslip,
);

export default router;
