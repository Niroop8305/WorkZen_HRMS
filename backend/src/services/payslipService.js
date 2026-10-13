import {
  getPayrollSummaryById,
  getPayrollDetailRows,
  getPayslipAttendanceBreakdown,
  createPayslipAudit,
} from "../models/payrollModel.js";
import { renderPayslipPdf, buildPayslipFilename } from "./payslipPdf.js";

// Payslip service (Milestone 4).
//
// A payslip is a READ of the historical payroll snapshot. It NEVER recalculates
// salary: every figure is taken verbatim from the stored `payroll` and
// `payroll_details` rows produced by the M3 generation engine. Future salary
// structure changes therefore cannot alter an existing payslip.

// Payroll RBAC established in M3: Admin and Payroll Officer may view the whole
// organization. HR Officer is intentionally excluded (no automatic access).
const PAYROLL_ROLES = Object.freeze(["Admin", "Payroll Officer"]);

// Status behavior (Step 13). A payslip is a read of an existing payroll
// snapshot, so it is viewable/downloadable in EVERY status (Pending, Processed,
// Paid, On Hold) by an authorized requester. There is deliberately no
// status-based read gate: the M3 status machine governs transitions, not reads.
// Honesty requirement: the snapshot's stored `payment_status` is surfaced
// verbatim and `payment_date` is shown only when present, so a Pending payroll
// is never presented as "Paid".

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const periodLabel = (payroll) =>
  `${payroll.year}-${String(payroll.month).padStart(2, "0")}`;

// Employee: own payslip only. Admin/Payroll Officer: any. Everyone else: 403.
// A missing payroll is 404 (checked before authorization so unknown ids never
// leak as 403).
const assertPayslipAccess = (payroll, requester) => {
  if (requester && requester.userId === payroll.user_id) return;
  if (requester && PAYROLL_ROLES.includes(requester.roleName)) return;
  fail("Not authorized to view this payslip", 403);
};

// Integrity guard (Step 6): confirm the stored payroll totals still match the
// historical payroll_details snapshot. Discrepancies are REPORTED, never used to
// silently recalculate or repair historical payroll.
const verifyIntegrity = (payroll, details) => {
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const sum = (type) =>
    round2(
      details
        .filter((d) => d.component_type === type)
        .reduce((s, d) => s + Number(d.amount || 0), 0),
    );

  const detailsGross = sum("Earning");
  const detailsDeductions = sum("Deduction");
  const detailsNet = round2(detailsGross - detailsDeductions);

  const storedGross = Number(payroll.gross_salary);
  const storedDeductions = Number(payroll.total_deductions);
  const storedNet = Number(payroll.net_salary);

  const discrepancies = [];
  if (Math.abs(storedGross - detailsGross) > 0.01) {
    discrepancies.push(
      `gross_salary ${storedGross} does not match earnings snapshot sum ${detailsGross}`,
    );
  }
  if (Math.abs(storedDeductions - detailsDeductions) > 0.01) {
    discrepancies.push(
      `total_deductions ${storedDeductions} does not match deductions snapshot sum ${detailsDeductions}`,
    );
  }
  if (Math.abs(storedNet - detailsNet) > 0.01) {
    discrepancies.push(
      `net_salary ${storedNet} does not match (earnings - deductions) snapshot ${detailsNet}`,
    );
  }

  return {
    consistent: discrepancies.length === 0,
    discrepancies,
    snapshot_sums: {
      gross: detailsGross,
      deductions: detailsDeductions,
      net: detailsNet,
    },
  };
};

const buildEmployee = (payroll) => ({
  employee_id: payroll.user_id,
  employee_code: payroll.employee_code || null,
  name: (payroll.employee_name || "").trim() || null,
  department: payroll.department || null,
  designation: payroll.designation || null,
  email: payroll.email || null,
});

// Load and authorize a complete, immutable payslip snapshot.
export const getPayslipDetails = async (payrollId, requester) => {
  const id = Number(payrollId);
  if (!Number.isInteger(id) || id < 1) {
    fail("Invalid payroll id", 400);
  }

  const payroll = await getPayrollSummaryById(id);
  if (!payroll) {
    fail("Payslip not found", 404);
  }
  assertPayslipAccess(payroll, requester);

  const [details, attendance] = await Promise.all([
    getPayrollDetailRows(id),
    getPayslipAttendanceBreakdown(payroll.user_id, payroll.month, payroll.year),
  ]);

  return {
    payroll,
    employee: buildEmployee(payroll),
    details,
    attendance: attendance || {},
    integrity: verifyIntegrity(payroll, details),
  };
};

// Render the authorized payslip snapshot to a server-generated PDF.
export const getPayslipPdf = async (payrollId, requester, meta = {}) => {
  const payslip = await getPayslipDetails(payrollId, requester);
  const buffer = await renderPayslipPdf(payslip);
  const filename = buildPayslipFilename(payslip);

  // Low-noise audit: record downloads only (not every in-app view). Best effort;
  // an audit failure must not block a legitimate, authorized download.
  try {
    await createPayslipAudit({
      actorId: requester?.userId ?? null,
      action: "PAYSLIP_DOWNLOADED",
      recordId: payslip.payroll.payroll_id,
      newValue: {
        payroll_id: payslip.payroll.payroll_id,
        user_id: payslip.payroll.user_id,
        period: periodLabel(payslip.payroll),
        filename,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  } catch (error) {
    console.error("Payslip download audit failed:", error.message);
  }

  return { buffer, filename, payslip };
};
