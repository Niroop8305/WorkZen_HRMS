import express from "express";
import EmployeeController from "../controllers/employeeController.js";

const router = express.Router();

// @route   GET /api/employees
// @desc    Get all employees
// @access  Public (should be protected in production)
router.get("/", EmployeeController.getAllEmployees);

// @route   GET /api/employees/months
// @desc    Get available months with attendance data
// @access  Public
router.get("/months", EmployeeController.getAvailableMonths);

// @route   GET /api/employees/with-attendance
// @desc    Get all employees with attendance data
// @access  Public
router.get(
  "/with-attendance",
  EmployeeController.getAllEmployeesWithAttendance
);

// @route   GET /api/employees/:id
// @desc    Get employee by ID
// @access  Public
router.get("/:id", EmployeeController.getEmployeeById);

// @route   GET /api/employees/:id/summary
// @desc    Get employee with attendance summary
// @access  Public
router.get("/:id/summary", EmployeeController.getEmployeeWithAttendanceSummary);

// @route   GET /api/employees/:id/attendance
// @desc    Get employee attendance for specific month
// @access  Public
router.get("/:id/attendance", EmployeeController.getEmployeeAttendance);

// @route   GET /api/employees/:id/attendance-history
// @desc    Get all attendance records for employee
// @access  Public
router.get(
  "/:id/attendance-history",
  EmployeeController.getEmployeeAttendanceHistory
);

export default router;
