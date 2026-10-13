import PayrollStatusBadge from "./PayrollStatusBadge";
import { formatCurrency, formatMonth, formatDate } from "./format";

// Shared payroll records table. `showEmployee` adds the employee identity column
// for the Admin / Payroll Officer overview; the employee experience omits it
// because every row belongs to the signed-in user. `renderRowActions` lets the
// admin overview inject the status-management control alongside View Payslip.
// All figures are backend-calculated values rendered verbatim.
const PayrollTable = ({ rows, showEmployee = false, onViewPayslip, renderRowActions }) => (
  <div className="payroll-table-wrapper">
    <table className="payroll-table">
      <thead>
        <tr>
          <th>Period</th>
          {showEmployee && <th>Employee</th>}
          <th className="text-right">Working</th>
          <th className="text-right">Present</th>
          <th className="text-right">Leave</th>
          <th className="text-right">Gross</th>
          <th className="text-right">Deductions</th>
          <th className="text-right">Net</th>
          <th>Status</th>
          <th>Payment Date</th>
          <th className="text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => (
          <tr key={item.payroll_id}>
            <td>
              {formatMonth(item.month)} {item.year}
            </td>
            {showEmployee && (
              <td>
                <div className="employee-cell">
                  <span className="employee-name">{item.employee_name || "-"}</span>
                  <span className="employee-sub">
                    {[item.employee_code, item.department].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </td>
            )}
            <td className="text-right">{item.working_days ?? "-"}</td>
            <td className="text-right">{item.present_days ?? "-"}</td>
            <td className="text-right">{item.leave_days ?? "-"}</td>
            <td className="text-right">{formatCurrency(item.gross_salary)}</td>
            <td className="text-right">{formatCurrency(item.total_deductions)}</td>
            <td className="text-right">{formatCurrency(item.net_salary)}</td>
            <td>
              <PayrollStatusBadge status={item.payment_status} />
            </td>
            <td>{formatDate(item.payment_date)}</td>
            <td className="text-right">
              <div className="row-actions">
                <button type="button" className="btn-view-payslip" onClick={() => onViewPayslip(item.payroll_id)}>
                  View Payslip
                </button>
                {renderRowActions ? renderRowActions(item) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default PayrollTable;
