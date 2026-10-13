import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAllPayroll,
  getEmployees,
  updatePayrollStatus,
  parseApiError,
} from "../../services/payrollApi";
import PayrollFilters from "./PayrollFilters";
import PayrollSummary from "./PayrollSummary";
import PayrollTable from "./PayrollTable";
import PayrollStatusControl from "./PayrollStatusControl";
import GeneratePayrollModal from "./GeneratePayrollModal";
import PayslipModal from "./PayslipModal";

// Admin / Payroll Officer payroll overview (Steps 6, 7, 9). Reads org-wide
// records from GET /payroll/all using only the server-supported filters
// (month + year, status). Search narrows the already-loaded rows client-side;
// the backend offers no pagination or free-text search, so nothing here pretends
// otherwise. Status changes go through PUT /:id/status and the list is refetched
// from the server so displayed values always match the authoritative record.
const AdminPayroll = () => {
  const [filters, setFilters] = useState({
    month: "",
    year: String(new Date().getFullYear()),
    status: "",
    search: "",
  });
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedPayrollId, setSelectedPayrollId] = useState(null);

  const loadPayroll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (filters.month && filters.year) {
        params.month = filters.month;
        params.year = filters.year;
      }
      if (filters.status) params.status = filters.status;
      const data = await getAllPayroll(params);
      setRows(data);
    } catch (err) {
      setError(await parseApiError(err, "Failed to load payroll records"));
    } finally {
      setLoading(false);
    }
  }, [filters.month, filters.year, filters.status]);

  useEffect(() => {
    loadPayroll();
  }, [loadPayroll]);

  useEffect(() => {
    getEmployees()
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  const filteredRows = useMemo(() => {
    if (!filters.search) return rows;
    const query = filters.search.toLowerCase();
    return rows.filter((item) =>
      [item.employee_name, item.employee_code, item.department]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [filters.search, rows]);

  const handleTransition = async (payrollId, status, paymentDate) => {
    setBusyId(payrollId);
    setNotice("");
    try {
      const payload = { payment_status: status };
      if (paymentDate) payload.payment_date = paymentDate;
      await updatePayrollStatus(payrollId, payload);
      await loadPayroll();
      setNotice(`Payroll ${payrollId} marked ${status}.`);
    } catch (err) {
      setError(await parseApiError(err, "Failed to update payroll status"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="payroll-experience">
      <div className="payroll-toolbar">
        <div className="payroll-title">
          <h1>Payroll Overview</h1>
          <p>Track payroll records, totals, and employee payouts.</p>
        </div>
        <button type="button" className="btn-view-payslip" onClick={() => setShowGenerate(true)}>
          Generate Payroll
        </button>
      </div>

      <PayrollFilters value={filters} onChange={setFilters} showStatus showSearch />

      {notice && <div className="payroll-state success">{notice}</div>}

      {loading ? (
        <div className="payroll-state">Loading payroll data...</div>
      ) : error ? (
        <div className="payroll-state error">{error}</div>
      ) : filteredRows.length === 0 ? (
        <div className="payroll-state">No payroll records found for the selected filters.</div>
      ) : (
        <>
          <PayrollSummary rows={filteredRows} showStatusCounts />
          <PayrollTable
            rows={filteredRows}
            showEmployee
            onViewPayslip={setSelectedPayrollId}
            renderRowActions={(row) => (
              <PayrollStatusControl
                row={row}
                busy={busyId === row.payroll_id}
                onTransition={handleTransition}
              />
            )}
          />
        </>
      )}

      {showGenerate && (
        <GeneratePayrollModal
          employees={employees}
          onClose={() => setShowGenerate(false)}
          onGenerated={loadPayroll}
        />
      )}

      {selectedPayrollId && (
        <PayslipModal payrollId={selectedPayrollId} onClose={() => setSelectedPayrollId(null)} />
      )}
    </div>
  );
};

export default AdminPayroll;
