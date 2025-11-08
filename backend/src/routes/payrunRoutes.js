import express from 'express';
import {
  runPayrun,
  getAllPayruns,
  getPayrunById,
  getPayslipById,
  updatePayrunStatus
} from '../controllers/payrunController.js';
// import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/payrun/run
// @desc    Generate payrun for all employees
// @access  Public (add protect, authorize('admin', 'hr') for production)
router.post('/run', runPayrun);

// @route   GET /api/payrun/list
// @desc    Get all payruns
// @access  Public (add protect for production)
router.get('/list', getAllPayruns);

// @route   GET /api/payrun/:id
// @desc    Get payrun by ID with payslips
// @access  Public (add protect for production)
router.get('/:id', getPayrunById);

// @route   PATCH /api/payrun/:id/status
// @desc    Update payrun status
// @access  Public (add protect, authorize('admin', 'hr') for production)
router.patch('/:id/status', updatePayrunStatus);

// @route   GET /api/payslip/:id
// @desc    Get single payslip
// @access  Public (add protect for production)
router.get('/payslip/:id', getPayslipById);

export default router;
