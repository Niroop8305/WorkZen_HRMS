import * as payrollService from "../services/payrollService.js";
import * as payslipService from "../services/payslipService.js";

// Thin payroll controllers. All calculation, transaction, validation and audit
// logic lives in payrollService (M3). These handlers only translate HTTP
// requests into service calls and map service results/errors back to responses.

const auditContext = (req) => ({
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
});

const handleError = (res, error, fallbackMessage) => {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({
    success: false,
    message: status >= 500 ? fallbackMessage : error.message,
  });
};

// Get my payroll (authenticated employee)
export const getMyPayroll = async (req, res) => {
  try {
    const rows = await payrollService.getMyPayroll(req.user.userId, req.query);
    res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    handleError(res, error, "Error fetching payroll");
  }
};

// Get payslip details (immutable historical snapshot). Authorization, integrity
// verification and snapshot assembly all live in payslipService (M4). The
// handler only maps the service result to the HTTP response envelope.
export const getPayslipDetails = async (req, res) => {
  try {
    const { payrollId } = req.params;
    const payslip = await payslipService.getPayslipDetails(payrollId, req.user);
    res.status(200).json({ success: true, data: payslip });
  } catch (error) {
    handleError(res, error, "Error fetching payslip");
  }
};

// Download a server-generated payslip PDF. Uses the exact same authorization and
// snapshot source as getPayslipDetails; the PDF is rendered server-side with
// pdfkit and never recalculates salary. A PAYSLIP_DOWNLOADED audit event is
// recorded best-effort inside the service.
export const getPayslipPdf = async (req, res) => {
  try {
    const { payrollId } = req.params;
    const { buffer, filename } = await payslipService.getPayslipPdf(
      payrollId,
      req.user,
      auditContext(req),
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.status(200).send(buffer);
  } catch (error) {
    handleError(res, error, "Error generating payslip PDF");
  }
};

// Get all payroll (Admin/Payroll Officer only)
export const getAllPayroll = async (req, res) => {
  try {
    const rows = await payrollService.getAllPayroll(req.query);
    res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    handleError(res, error, "Error fetching payroll records");
  }
};

// Generate payroll for one employee and period (Admin/Payroll Officer only).
// The authoritative calculation runs inside a single transaction in the service.
export const generatePayroll = async (req, res) => {
  try {
    const { user_id, month, year, payment_method, remarks } = req.body;

    const result = await payrollService.generatePayroll({
      userId: user_id,
      month,
      year,
      paymentMethod: payment_method,
      remarks,
      generatedBy: req.user.userId,
      ...auditContext(req),
    });

    res.status(201).json({
      success: true,
      message: "Payroll generated successfully",
      data: result,
    });
  } catch (error) {
    handleError(res, error, "Error generating payroll");
  }
};

// Update payroll payment status (Admin/Payroll Officer only). Enforces the
// payroll status state machine and writes a transactional audit event.
export const updatePayrollStatus = async (req, res) => {
  try {
    const { payrollId } = req.params;
    const { payment_status, payment_date } = req.body;

    const result = await payrollService.updatePayrollStatus({
      payrollId,
      status: payment_status,
      paymentDate: payment_date,
      actorId: req.user.userId,
      ...auditContext(req),
    });

    res.status(200).json({
      success: true,
      message: "Payroll status updated successfully",
      data: result,
    });
  } catch (error) {
    handleError(res, error, "Error updating payroll status");
  }
};

// Salary component and employee salary-structure configuration handlers live in
// salaryController.js, backed by salaryService.js (Milestone 2).
// The authoritative payroll calculation engine lives in payrollService.js (M3).
