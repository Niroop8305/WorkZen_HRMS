import express from "express";
import {
  createLeaveRequest,
  getLeaveRequests,
  getLeaveBalance,
  updateLeaveRequestStatus,
  deleteLeaveRequest,
  allocateLeave,
  getEmployeesWithBalances,
  getAllocationHistory,
} from "../controllers/leaveController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   POST /api/leave/request
// @desc    Create a new leave request
// @access  Private
router.post("/request", createLeaveRequest);

// @route   GET /api/leave/requests
// @desc    Get leave requests (filtered by role)
// @access  Private
router.get("/requests", getLeaveRequests);

// @route   GET /api/leave/balance
// @desc    Get user's leave balance
// @access  Private
router.get("/balance", getLeaveBalance);

// @route   PUT /api/leave/request/:id/status
// @desc    Approve or reject a leave request
// @access  Private (Admin/HR Officer only)
router.put("/request/:id/status", updateLeaveRequestStatus);

// @route   POST /api/leave/allocate
// @desc    Allocate leave days to an employee
// @access  Private (Admin/HR Officer only)
router.post("/allocate", allocateLeave);

// @route   GET /api/leave/employees
// @desc    Get all employees with their leave balances
// @access  Private (Admin/HR Officer only)
router.get("/employees", getEmployeesWithBalances);

// @route   GET /api/leave/allocations
// @desc    Get allocation history
// @access  Private
router.get("/allocations", getAllocationHistory);

// @route   DELETE /api/leave/request/:id
// @desc    Delete a leave request (only pending)
// @access  Private
router.delete("/request/:id", deleteLeaveRequest);

export default router;
