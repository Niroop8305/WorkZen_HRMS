import { statusClass } from "./format";

// Small presentational badge for a payroll payment_status. Reused by the payroll
// tables and the status control so the pill styling stays consistent.
const PayrollStatusBadge = ({ status }) => (
  <span className={`status-pill ${statusClass(status)}`}>{status || "Pending"}</span>
);

export default PayrollStatusBadge;
