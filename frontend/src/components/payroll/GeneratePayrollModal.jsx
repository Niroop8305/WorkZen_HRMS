import { useState } from "react";
import { generatePayroll, parseApiError } from "../../services/payrollApi";
import { MONTHS, PAYMENT_METHODS, yearOptions, formatCurrency } from "./format";

// Generate Payroll dialog for Admin / Payroll Officer (Step 8). The form submits
// ONLY selection inputs - employee, month, year, optional payment method and
// remarks. It never sends gross/net/component/payable amounts: the server is the
// sole calculation authority. Duplicate-period (409), missing-structure (400)
// and inactive-employee (409) errors are surfaced verbatim from the backend.
const GeneratePayrollModal = ({ employees, onClose, onGenerated }) => {
  const [form, setForm] = useState({
    user_id: "",
    month: "",
    year: String(new Date().getFullYear()),
    payment_method: "Bank Transfer",
    remarks: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const activeEmployees = employees.filter((e) => e.is_active !== false && e.is_active !== 0);
  const years = yearOptions(6);

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.user_id) return setError("Please select an employee.");
    if (!form.month) return setError("Please select a month.");
    if (!form.year) return setError("Please select a year.");

    setSubmitting(true);
    try {
      const payload = {
        user_id: Number(form.user_id),
        month: Number(form.month),
        year: Number(form.year),
      };
      if (form.payment_method) payload.payment_method = form.payment_method;
      if (form.remarks.trim()) payload.remarks = form.remarks.trim();

      const response = await generatePayroll(payload);
      setResult(response.data);
      onGenerated?.();
    } catch (err) {
      setError(await parseApiError(err, "Failed to generate payroll"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="payslip-modal-overlay" onClick={onClose}>
      <div className="payslip-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Generate Payroll</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          {result ? (
            <div className="generate-result">
              <div className="payroll-state success">
                Payroll generated for {result.period}. Status: {result.payment_status}.
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Working Days</label>
                  <span>{result.working_days}</span>
                </div>
                <div className="form-group">
                  <label>Present Days</label>
                  <span>{result.present_days}</span>
                </div>
                <div className="form-group">
                  <label>Leave Days</label>
                  <span>{result.leave_days}</span>
                </div>
                <div className="form-group">
                  <label>Payable Days</label>
                  <span>{result.payable_days}</span>
                </div>
                <div className="form-group">
                  <label>Gross Salary</label>
                  <span>{formatCurrency(result.gross_salary)}</span>
                </div>
                <div className="form-group">
                  <label>Total Deductions</label>
                  <span>{formatCurrency(result.total_deductions)}</span>
                </div>
                <div className="form-group">
                  <label>Net Salary</label>
                  <span>{formatCurrency(result.net_salary)}</span>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-view-payslip" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <div className="payroll-state error">{error}</div>}

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="gen-employee">Employee</label>
                  <select
                    id="gen-employee"
                    value={form.user_id}
                    onChange={(e) => update({ user_id: e.target.value })}
                    disabled={submitting}
                  >
                    <option value="">Select an employee…</option>
                    {activeEmployees.map((emp) => (
                      <option key={emp.user_id} value={emp.user_id}>
                        {emp.full_name || emp.email}
                        {emp.employee_code ? ` (${emp.employee_code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="gen-month">Month</label>
                  <select
                    id="gen-month"
                    value={form.month}
                    onChange={(e) => update({ month: e.target.value })}
                    disabled={submitting}
                  >
                    <option value="">Select month…</option>
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="gen-year">Year</label>
                  <select
                    id="gen-year"
                    value={form.year}
                    onChange={(e) => update({ year: e.target.value })}
                    disabled={submitting}
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="gen-method">Payment Method</label>
                  <select
                    id="gen-method"
                    value={form.payment_method}
                    onChange={(e) => update({ payment_method: e.target.value })}
                    disabled={submitting}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="gen-remarks">Remarks (optional)</label>
                <textarea
                  id="gen-remarks"
                  rows={2}
                  value={form.remarks}
                  onChange={(e) => update({ remarks: e.target.value })}
                  disabled={submitting}
                />
              </div>

              <p className="payroll-hint">
                Salary amounts are calculated by the server from the employee's effective salary
                structure and frozen attendance. This form does not accept any salary values.
              </p>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-view-payslip" disabled={submitting}>
                  {submitting ? "Generating…" : "Generate Payroll"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeneratePayrollModal;
