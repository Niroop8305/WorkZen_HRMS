import express from 'express';
import PayslipController from '../controllers/payslipController.js';

const router = express.Router();

// 1. Create new payslip (draft)
router.post('/new', PayslipController.createNewPayslip);

// 2. Compute salary
router.post('/compute', PayslipController.computeSalary);

// 3. Save computed payslip
router.put('/:id/save', PayslipController.saveComputedPayslip);

// 4. Get payslip by ID
router.get('/:id', PayslipController.getPayslipById);

// 5. Delete payslip (draft only)
router.delete('/:id', PayslipController.deletePayslip);

// 6. Get all payslips (with filters)
router.get('/', PayslipController.getAllPayslips);

// 7. Validate payslip (mark as Done)
router.post('/:id/validate', PayslipController.validatePayslip);

export default router;
