import {
  applyLeave,
  getEmployeeBalance,
  getMyLeaveApplications,
  getActiveLeaves,
  getLeaveAuditReport,
  getOrganizationLeaveRequests,
  listLeaveTypes,
  cancelLeave,
  updateLeaveStatus,
} from "../services/leaveService.js";

const handleError = (res, error, fallbackMessage) => {
  const validationMessages = [
    "must use",
    "not a valid date",
    "cannot be after",
    "must be a positive integer",
    "is required",
    "Invalid leave type",
    "overlaps",
    "Insufficient leave balance",
    "Leave balance is not initialized",
    "must include at least one weekday",
    "must be Approved or Rejected",
    "rejection_reason is required",
    "Leave application not found",
    "Leave application is already",
    "Leave balance cannot restore",
    "You are not authorized to cancel",
    "Pagination values must be positive integers",
    "Invalid leave status",
    "startDate cannot be after endDate",
    "record_id must be a positive integer",
  ];
  const isValidationError = validationMessages.some((message) =>
    error.message?.includes(message),
  );
  console.error(fallbackMessage, error);
  res.status(isValidationError ? 400 : 500).json({
    success: false,
    message: isValidationError ? error.message : fallbackMessage,
  });
};

export const getLeaveTypes = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await listLeaveTypes() });
  } catch (error) {
    handleError(res, error, "Unable to fetch leave types");
  }
};

export const getLeaveBalance = async (req, res) => {
  try {
    const requestedId = req.query.employee_id;
    let targetUserId = req.user.userId;
    if (requestedId !== undefined && requestedId !== "") {
      const employeeId = Number(requestedId);
      if (!Number.isInteger(employeeId) || employeeId < 1) {
        return res.status(400).json({
          success: false,
          message: "employee_id must be a positive integer",
        });
      }
      if (!["Admin", "HR Officer"].includes(req.user.roleName)) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to view another employee's leave balance",
        });
      }
      targetUserId = employeeId;
    }
    res.status(200).json({
      success: true,
      data: await getEmployeeBalance(targetUserId),
    });
  } catch (error) {
    handleError(res, error, "Unable to fetch leave balance");
  }
};

export const applyLeaveRequest = async (req, res) => {
  try {
    const data = await applyLeave({
      userId: req.user.userId,
      leaveTypeId: req.body.leave_type_id,
      startDate: req.body.start_date,
      endDate: req.body.end_date,
      reason: req.body.reason,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to apply for leave");
  }
};

export const getMyLeaves = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: await getMyLeaveApplications(req.user.userId),
    });
  } catch (error) {
    handleError(res, error, "Unable to fetch leave history");
  }
};

export const getOrganizationLeaves = async (req, res) => {
  try {
    const result = await getOrganizationLeaveRequests(req.query);
    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: result.pagination,
    });
  } catch (error) {
    handleError(res, error, "Unable to fetch organization leave requests");
  }
};

export const getActiveLeaveRecords = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await getActiveLeaves() });
  } catch (error) {
    handleError(res, error, "Unable to fetch active leave records");
  }
};

export const getLeaveAudit = async (req, res) => {
  try {
    const result = await getLeaveAuditReport(req.query);
    res.status(200).json({ success: true, data: result.rows, pagination: result.pagination });
  } catch (error) {
    handleError(res, error, "Unable to fetch Leave audit records");
  }
};

export const updateLeaveApplicationStatus = async (req, res) => {
  try {
    const data = await updateLeaveStatus({
      leaveId: req.params.id,
      reviewerId: req.user.userId,
      status: req.body.status,
      rejectionReason: req.body.rejection_reason,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleError(res, error, "Unable to update leave application");
  }
};

export const cancelLeaveApplication = async (req, res) => {
  try {
    const data = await cancelLeave({
      leaveId: req.params.id,
      requesterId: req.user.userId,
      requesterRole: req.user.roleName,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.statusCode === 403) {
      return res.status(403).json({ success: false, message: error.message });
    }
    handleError(res, error, "Unable to cancel leave application");
  }
};
