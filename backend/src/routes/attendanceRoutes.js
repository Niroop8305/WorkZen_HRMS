import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import {
  markAttendance,
  getMyAttendance,
  getAttendanceByDay,
  getAllAttendance,
  getMonthlySummary,
  getPayableDays,
  updateAttendance,
  deleteAttendance,
  checkIn,
  checkOut,
  getAttendanceStatus,
  getAllEmployeesAttendanceStatus,
  getTodayAttendance,
  exportAttendance,
} from "../controllers/attendanceController.js";

const router = express.Router();

// Check-in/Check-out routes
router.post("/check-in", protect, checkIn);
router.post("/check-out", protect, checkOut);
router.get("/status", protect, getAttendanceStatus);
router.get("/today", protect, getTodayAttendance);

// Org-wide presence map. Mirrors the employee-directory policy: staff roles
// only. An Employee reads their own status from /status above.
router.get(
  "/all-status",
  protect,
  authorize("Admin", "HR Officer", "Payroll Officer"),
  getAllEmployeesAttendanceStatus
);

// Employee routes
router.post("/mark", protect, markAttendance);
router.get("/my-logs", protect, getMyAttendance);
router.get("/summary", protect, getMonthlySummary);

// Admin/HR routes
router.get(
  "/day",
  protect,
  authorize("Admin", "HR Officer", "Payroll Officer"),
  getAttendanceByDay
);
router.get(
  "/export",
  protect,
  // D-9: the UI offers this view/export to the Payroll Officer, so the read
  // follows. Read-only; attendance writes stay Admin/HR(-only).
  authorize("Admin", "HR Officer", "Payroll Officer"),
  exportAttendance
);
router.get(
  "/all",
  protect,
  // D-9: same read-only grant for the Payroll Officer.
  authorize("Admin", "HR Officer", "Payroll Officer"),
  getAllAttendance
);
router.get(
  "/payable-days",
  protect,
  authorize("Admin", "HR Officer", "Payroll Officer"),
  getPayableDays
);
router.put(
  "/:attendanceId",
  protect,
  authorize("Admin", "HR Officer"),
  updateAttendance
);
router.delete("/:attendanceId", protect, authorize("Admin"), deleteAttendance);

export default router;
