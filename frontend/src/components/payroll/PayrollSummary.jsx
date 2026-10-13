import { formatCurrency } from "./format";

// Summary cards for a payroll list. Every number is a display-only roll-up of
// values the backend already calculated and returned (counting rows and summing
// gross/deductions/net). This component never determines salary - it only
// totals the rows currently on screen so the cards match the filtered table.
const PayrollSummary = ({ rows, showStatusCounts = false }) => {
  const totals = rows.reduce(
    (acc, item) => {
      acc.gross += Number(item.gross_salary || 0);
      acc.deductions += Number(item.total_deductions || 0);
      acc.net += Number(item.net_salary || 0);
      return acc;
    },
    { gross: 0, deductions: 0, net: 0 },
  );

  const countByStatus = (status) => rows.filter((r) => r.payment_status === status).length;

  return (
    <div className="payroll-summary">
      <div className="summary-card">
        <span className="summary-label">Total Records</span>
        <span className="summary-value">{rows.length}</span>
      </div>
      {showStatusCounts && (
        <>
          <div className="summary-card">
            <span className="summary-label">Pending</span>
            <span className="summary-value">{countByStatus("Pending")}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">Processed</span>
            <span className="summary-value">{countByStatus("Processed")}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">Paid</span>
            <span className="summary-value">{countByStatus("Paid")}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">On Hold</span>
            <span className="summary-value">{countByStatus("On Hold")}</span>
          </div>
        </>
      )}
      <div className="summary-card">
        <span className="summary-label">Total Gross</span>
        <span className="summary-value">{formatCurrency(totals.gross)}</span>
      </div>
      <div className="summary-card">
        <span className="summary-label">Total Deductions</span>
        <span className="summary-value">{formatCurrency(totals.deductions)}</span>
      </div>
      <div className="summary-card">
        <span className="summary-label">Total Net</span>
        <span className="summary-value">{formatCurrency(totals.net)}</span>
      </div>
    </div>
  );
};

export default PayrollSummary;
