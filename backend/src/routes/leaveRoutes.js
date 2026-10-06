import express from "express";
import { authorize, protect } from "../middleware/auth.js";
import {
  applyLeaveRequest,
  cancelLeaveApplication,
  getActiveLeaveRecords,
  getLeaveBalance,
  getLeaveAudit,
  getLeaveTypes,
  getMyLeaves,
  getOrganizationLeaves,
  updateLeaveApplicationStatus,
} from "../controllers/leaveController.js";

const router = express.Router();

router.use(protect);

router.get("/types", getLeaveTypes);
router.get("/balance", getLeaveBalance);
router.post("/apply", applyLeaveRequest);
router.get("/my-leaves", getMyLeaves);
router.get(
  "/requests",
  authorize("Admin", "HR Officer"),
  getOrganizationLeaves,
);
router.get(
  "/active-leaves",
  authorize("Admin", "HR Officer"),
  getActiveLeaveRecords,
);
router.get("/audit", authorize("Admin", "HR Officer"), getLeaveAudit);
router.patch("/:id/cancel", cancelLeaveApplication);
router.patch(
  "/:id/status",
  authorize("Admin", "HR Officer"),
  updateLeaveApplicationStatus,
);

export default router;
