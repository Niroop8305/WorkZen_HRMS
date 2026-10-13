import { useEffect, useState } from "react";
import { getPayslip, downloadPayslipPdf, saveBlob, parseApiError } from "../../services/payrollApi";
import { formatCurrency, formatDate } from "./format";

// Read-only payslip snapshot (M4 flow preserved by M5). Renders exactly the
// values the server returned from the historical payroll / payroll_details
// records and performs NO salary calculation of its own. The PDF is generated
// server-side and downloaded as an authenticated blob.
const PayslipModal = ({ payrollId, onClose }) => {
  const [payslip, setPayslip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getPayslip(payrollId);
        if (active) setPayslip(data);
      } catch (err) {
        if (active) setError(await parseApiError(err, "Failed to load payslip"));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [payrollId]);

  const handleDownload = async () => {
    setDownloading(true);
    setError("");
    try {
      const { blob, filename } = await downloadPayslipPdf(payrollId);
      saveBlob(blob, filename);
    } catch (err) {
      setError(await parseApiError(err, "Failed to download payslip PDF"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="payslip-modal-overlay" onClick={onClose}>
      <div className="payslip-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Payslip</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close payslip">
            &times;
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="payroll-state">Loading payslip...</div>
          ) : error && !payslip ? (
            <div className="payroll-state error">{error}</div>
          ) : payslip ? (
            <PayslipView payslip={payslip} onDownload={handleDownload} downloading={downloading} error={error} />
          ) : null}
        </div>
      </div>
    </div>
  );
};

const PayslipView = ({ payslip, onDownload, downloading, error }) => {
  const { payroll, employee, details, integrity } = payslip;
  const earnings = (details || []).filter((d) => d.component_type === "Earning");
  const deductions = (details || []).filter((d) => d.component_type === "Deduction");
  const monthLabel = formatDate(`${payroll.year}-${String(payroll.month).padStart(2, "0")}-01`);

  return (
    <>
      {integrity && !integrity.consistent && (
        <div className="payroll-state error">
          Snapshot inconsistency detected: {integrity.discrepancies.join("; ")}
        </div>
      )}
      {error && <div className="payroll-state error">{error}</div>}

      <div className="form-grid">
        <div className="form-group">
          <label>Employee</label>
          <span>{employee?.name || "-"}</span>
        </div>
        <div className="form-group">
          <label>Employee Code</label>
          <span>{employee?.employee_code || "-"}</span>
        </div>
        <div className="form-group">
          <label>Department</label>
          <span>{employee?.department || "-"}</span>
        </div>
        <div className="form-group">
          <label>Designation</label>
          <span>{employee?.designation || "-"}</span>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>Pay Period</label>
          <span>
            {monthLabel} {payroll.year}
          </span>
        </div>
        <div className="form-group">
          <label>Working Days</label>
          <span>{payroll.working_days ?? "-"}</span>
        </div>
        <div className="form-group">
          <label>Present Days</label>
          <span>{payroll.present_days ?? "-"}</span>
        </div>
        <div className="form-group">
          <label>Leave Days</label>
          <span>{payroll.leave_days ?? "-"}</span>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>Earnings</label>
          {earnings.length === 0 ? (
            <span>None</span>
          ) : (
            earnings.map((d) => (
              <div key={d.detail_id} className="payslip-line">
                <span>{d.component_name}</span>
                <span>{formatCurrency(d.amount)}</span>
              </div>
            ))
          )}
        </div>
        <div className="form-group">
          <label>Deductions</label>
          {deductions.length === 0 ? (
            <span>None</span>
          ) : (
            deductions.map((d) => (
              <div key={d.detail_id} className="payslip-line">
                <span>{d.component_name}</span>
                <span>{formatCurrency(d.amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>Gross Salary</label>
          <span>{formatCurrency(payroll.gross_salary)}</span>
        </div>
        <div className="form-group">
          <label>Total Deductions</label>
          <span>{formatCurrency(payroll.total_deductions)}</span>
        </div>
        <div className="form-group">
          <label>Net Salary</label>
          <span>{formatCurrency(payroll.net_salary)}</span>
        </div>
        <div className="form-group">
          <label>Payment Status</label>
          <span>{payroll.payment_status || "Pending"}</span>
        </div>
      </div>

      <div className="form-group">
        <label>Payment Date</label>
        <span>{payroll.payment_date ? formatDate(payroll.payment_date) : "Not yet paid"}</span>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn-view-payslip" onClick={onDownload} disabled={downloading}>
          {downloading ? "Preparing PDF..." : "Download PDF"}
        </button>
      </div>
    </>
  );
};

export default PayslipModal;
