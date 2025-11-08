import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  getMyPayroll,
  getPayslipDetails,
  getAllPayroll,
  generatePayroll,
  updatePayrollStatus,
  getSalaryComponents,
  getEmployeeSalaryStructure,
  getSalaryStatement
} from '../controllers/payrollController.js';

const router = express.Router();

// Employee routes
router.get('/my-payroll', protect, getMyPayroll);
router.get('/payslip/:payrollId', protect, getPayslipDetails);

// Admin/Payroll Officer routes
router.get('/all', protect, authorize('Admin', 'Payroll Officer'), getAllPayroll);
router.post('/generate', protect, authorize('Admin', 'Payroll Officer'), generatePayroll);
router.put('/:payrollId/status', protect, authorize('Admin', 'Payroll Officer'), updatePayrollStatus);
router.get('/components', protect, authorize('Admin', 'Payroll Officer'), getSalaryComponents);
router.get('/salary-structure/:userId', protect, authorize('Admin', 'Payroll Officer'), getEmployeeSalaryStructure);
router.get('/salary-statement', protect, authorize('Admin', 'Payroll Officer'), getSalaryStatement);

export default router;
