import { useEffect, useMemo, useState } from "react";
import { getMyPayroll, parseApiError } from "../../services/payrollApi";
import PayrollFilters from "./PayrollFilters";
import PayrollSummary from "./PayrollSummary";
import PayrollTable from "./PayrollTable";
import PayslipModal from "./PayslipModal";

// Employee "My Payroll" experience (Step 4 + 5). Lists the signed-in user's own
// payroll history from GET /payroll/my-payroll and opens the immutable M4
// payslip snapshot. Every figure comes from the backend verbatim; nothing is
// recalculated in React.
const EmployeePayroll = () => {
  const [filters, setFilters] = useState({
    month: "",
    year: String(new Date().getFullYear()),
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPayrollId, setSelectedPayrollId] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = {};
        if (filters.month && filters.year) {
          params.month = filters.month;
          params.year = filters.year;
        }
        const data = await getMyPayroll(params);
        if (active) setRows(data);
      } catch (err) {
        if (active) setError(await parseApiError(err, "Failed to load your payroll"));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [filters.month, filters.year]);

  const hasMonthYear = Boolean(filters.month && filters.year);

  return (
    <div className="payroll-experience">
      <div className="payroll-toolbar">
        <div className="payroll-title">
          <h1>My Payroll</h1>
          <p>Review your payroll history and download payslips.</p>
        </div>
      </div>

      <PayrollFilters value={filters} onChange={setFilters} />

      {!hasMonthYear && (
        <p className="payroll-hint">Select a month and year together to filter by a specific pay period.</p>
      )}

      {loading ? (
        <div className="payroll-state">Loading your payroll...</div>
      ) : error ? (
        <div className="payroll-state error">{error}</div>
      ) : rows.length === 0 ? (
        <div className="payroll-state">No payroll records found for this employee.</div>
      ) : (
        <>
          <PayrollSummary rows={rows} />
          <PayrollTable rows={rows} onViewPayslip={setSelectedPayrollId} />
        </>
      )}

      {selectedPayrollId && (
        <PayslipModal payrollId={selectedPayrollId} onClose={() => setSelectedPayrollId(null)} />
      )}
    </div>
  );
};

export default EmployeePayroll;
