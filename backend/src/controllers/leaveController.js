import { LeaveRequest, LeaveBalance } from "../models/leaveModel.js";

// @desc    Create a new leave request
// @route   POST /api/leave/request
// @access  Private
export const createLeaveRequest = async (req, res) => {
  try {
    const { start_date, end_date, leave_type, reason } = req.body;
    const userId = req.user.userId;

    // Validate input
    if (!start_date || !end_date || !leave_type) {
      return res.status(400).json({
        success: false,
        message: "Please provide start date, end date, and leave type",
      });
    }

    // Calculate total days (business days)
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    // Calculate total days including weekends
    const diffTime = Math.abs(endDate - startDate);
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Check if user has sufficient balance
    const balance = await LeaveBalance.findByUserId(userId);
    const availableDays =
      leave_type === "Paid Time Off"
        ? balance.paid_time_off
        : balance.sick_time_off;

    if (totalDays > availableDays) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${leave_type} balance. Available: ${availableDays} days, Requested: ${totalDays} days`,
      });
    }

    // Create leave request
    const requestId = await LeaveRequest.create({
      user_id: userId,
      start_date,
      end_date,
      leave_type,
      days_requested: totalDays,
      reason: reason || null,
    });

    res.status(201).json({
      success: true,
      message: "Leave request submitted successfully",
      data: { request_id: requestId },
    });
  } catch (error) {
    console.error("Create Leave Request Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating leave request",
      error: error.message,
    });
  }
};

// @desc    Get leave requests (my requests for employee, all for admin/HR)
// @route   GET /api/leave/requests
// @access  Private
export const getLeaveRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.roleName;
    const { search, status, leave_type } = req.query;

    let requests;

    // Admin and HR Officer can see all requests
    if (userRole === "Admin" || userRole === "HR Officer") {
      requests = await LeaveRequest.findAll({ search, status, leave_type });
    } else {
      // Employees can only see their own requests
      requests = await LeaveRequest.findByUserId(userId);
    }

    console.log("Leave Requests Data:", JSON.stringify(requests, null, 2));

    res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    console.error("Get Leave Requests Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching leave requests",
      error: error.message,
    });
  }
};

// @desc    Get leave balance
// @route   GET /api/leave/balance
// @access  Private
export const getLeaveBalance = async (req, res) => {
  try {
    const userId = req.user.userId;
    const balance = await LeaveBalance.findByUserId(userId);

    res.status(200).json({
      success: true,
      data: balance,
    });
  } catch (error) {
    console.error("Get Leave Balance Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching leave balance",
      error: error.message,
    });
  }
};

// @desc    Approve or reject leave request
// @route   PUT /api/leave/request/:id/status
// @access  Private (Admin/HR Officer only)
export const updateLeaveRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const reviewerId = req.user.userId;
    const userRole = req.user.roleName;

    console.log("Update Leave Request - User Role:", userRole);
    console.log("Update Leave Request - Request Body:", req.body);
    console.log("Update Leave Request - Request ID:", id);

    // Check if user has permission
    if (userRole !== "Admin" && userRole !== "HR Officer") {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to approve/reject leave requests",
      });
    }

    // Validate status
    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be Approved or Rejected",
      });
    }

    // Get the leave request
    const request = await LeaveRequest.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    // Check if already reviewed
    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `This request has already been ${request.status.toLowerCase()}`,
      });
    }

    // Update status
    await LeaveRequest.updateStatus(id, status, reviewerId);

    // If approved, deduct from balance
    if (status === "Approved") {
      await LeaveBalance.deductBalance(
        request.user_id,
        request.leave_type,
        request.days_requested
      );
    }

    res.status(200).json({
      success: true,
      message: `Leave request ${status.toLowerCase()} successfully`,
      data: { request_id: id, status },
    });
  } catch (error) {
    console.error("Update Leave Request Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating leave request status",
      error: error.message,
    });
  }
};

// @desc    Delete leave request (only if pending)
// @route   DELETE /api/leave/request/:id
// @access  Private
export const deleteLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.roleName;

    // Get the leave request
    const request = await LeaveRequest.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    // Check permissions: user can delete their own pending requests, admin can delete any
    if (request.user_id !== userId && userRole !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this request",
      });
    }

    // Only allow deletion of pending requests
    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending requests can be deleted",
      });
    }

    await LeaveRequest.delete(id);

    res.status(200).json({
      success: true,
      message: "Leave request deleted successfully",
    });
  } catch (error) {
    console.error("Delete Leave Request Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting leave request",
      error: error.message,
    });
  }
};

// @desc    Allocate leave days to an employee
// @route   POST /api/leave/allocate
// @access  Private (Admin/HR only)
export const allocateLeave = async (req, res) => {
  try {
    const { user_id, leave_type, days_allocated, reason } = req.body;
    const allocatedBy = req.user.userId;

    // Check if user is admin or HR
    if (req.user.roleName !== "Admin" && req.user.roleName !== "HR Officer") {
      return res.status(403).json({
        success: false,
        message: "Only Admin or HR Officer can allocate leave",
      });
    }

    // Validate input
    if (!user_id || !leave_type || !days_allocated) {
      return res.status(400).json({
        success: false,
        message: "Please provide user_id, leave_type, and days_allocated",
      });
    }

    if (days_allocated <= 0) {
      return res.status(400).json({
        success: false,
        message: "Days allocated must be greater than 0",
      });
    }

    // Allocate leave with threshold check
    await LeaveBalance.allocateLeave(
      user_id,
      leave_type,
      days_allocated,
      allocatedBy,
      reason
    );

    res.status(201).json({
      success: true,
      message: `Successfully allocated ${days_allocated} days of ${leave_type}`,
    });
  } catch (error) {
    console.error("Allocate Leave Error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Server error while allocating leave",
    });
  }
};

// @desc    Get all employees with their leave balances
// @route   GET /api/leave/employees
// @access  Private (Admin/HR only)
export const getEmployeesWithBalances = async (req, res) => {
  try {
    // Check if user is admin or HR
    if (req.user.roleName !== "Admin" && req.user.roleName !== "HR Officer") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const balances = await LeaveBalance.findAll();

    res.status(200).json({
      success: true,
      data: balances,
    });
  } catch (error) {
    console.error("Get Employees Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching employees",
      error: error.message,
    });
  }
};

// @desc    Get allocation history
// @route   GET /api/leave/allocations
// @access  Private
export const getAllocationHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const isAdminOrHR =
      req.user.roleName === "Admin" || req.user.roleName === "HR Officer";

    let allocations;
    if (isAdminOrHR) {
      // Admin/HR can see all allocations
      allocations = await LeaveBalance.getAllAllocations();
    } else {
      // Regular users see only their own
      allocations = await LeaveBalance.getAllocationHistory(userId);
    }

    res.status(200).json({
      success: true,
      data: allocations,
    });
  } catch (error) {
    console.error("Get Allocation History Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching allocation history",
      error: error.message,
    });
  }
};
