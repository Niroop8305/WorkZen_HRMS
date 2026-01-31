import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import api from "../services/api";
import "../styles/App.css";
import "../styles/PayrollPage.css";

const PayrollPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRunningPayrun, setIsRunningPayrun] = useState(false);
  const [runPayrunMessage, setRunPayrunMessage] = useState("");
  const [runPayrunType, setRunPayrunType] = useState("");
  const [showCreatePayslip, setShowCreatePayslip] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [isSavingPayslip, setIsSavingPayslip] = useState(false);
  const [payslipForm, setPayslipForm] = useState({
    employee_id: "",
    month: "",
    year: new Date().getFullYear().toString(),
    present_days: 0,
    paid_leaves: 0,
    unpaid_leaves: 0,
    total_working_days: 30,
    status: "Done",
  });

  const [filters, setFilters] = useState({
    month: "",
    year: new Date().getFullYear().toString(),
    status: "",
    search: "",
  });

  const isAdminPayroll =
    user?.role === "Admin" || user?.role === "Payroll Officer";

  const months = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const years = Array.from({ length: 6 }, (_, idx) => {
    const year = new Date().getFullYear() - idx;
    return year.toString();
  });

  const fetchPayrolls = async () => {
    try {
      setLoading(true);
      setError("");

      const params = {};
      if (filters.month) {
        const monthLabel =
          months.find((month) => month.value === String(filters.month))
            ?.label || filters.month;
        params.month = isAdminPayroll ? monthLabel : filters.month;
      }
      if (filters.year) params.year = filters.year;
      if (filters.status && isAdminPayroll) params.status = filters.status;

      const endpoint = isAdminPayroll
        ? "/payroll/payslips"
        : "/payroll/my-payroll";
      const response = await api.get(endpoint, { params });
      const rows = response.data.data || [];
      const normalized = isAdminPayroll
        ? rows.map((item) => ({
            ...item,
            payroll_id: item.payroll_id ?? item.id,
            employee_name: item.employee_name,
            employee_code: item.employee_code ?? item.emp_id,
            payment_status: item.payment_status ?? item.status,
            payment_date: item.payment_date ?? item.created_at,
            month: item.month,
          }))
        : rows;

      setPayrolls(normalized);
    } catch (err) {
      console.error("Error fetching payroll:", err);
      setError(err.response?.data?.message || "Failed to load payroll data");
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await api.get("/employees");
      setEmployees(response.data.data || []);
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
  };

  const handleRunPayrun = async () => {
    if (!filters.month || !filters.year) {
      setRunPayrunType("error");
      setRunPayrunMessage("Select month and year to run a payrun.");
      return;
    }

    const monthLabel =
      months.find((month) => month.value === String(filters.month))?.label ||
      filters.month;

    try {
      setIsRunningPayrun(true);
      setRunPayrunMessage("");
      setRunPayrunType("");

      await api.post("/payrun/run", {
        month: monthLabel,
        year: Number(filters.year),
      });

      setRunPayrunType("success");
      setRunPayrunMessage(`Payrun started for ${monthLabel} ${filters.year}.`);
      fetchPayrolls();
    } catch (err) {
      console.error("Error running payrun:", err);
      setRunPayrunType("error");
      setRunPayrunMessage(
        err.response?.data?.message || "Failed to run payrun.",
      );
    } finally {
      setIsRunningPayrun(false);
    }
  };

  useEffect(() => {
    fetchPayrolls();
  }, [filters.month, filters.year, filters.status, isAdminPayroll]);

  useEffect(() => {
    if (isAdminPayroll) {
      fetchEmployees();
    }
  }, [isAdminPayroll]);

  const filteredPayrolls = useMemo(() => {
    if (!filters.search) return payrolls;
    const query = filters.search.toLowerCase();
    return payrolls.filter((item) =>
      [item.employee_name, item.employee_code, item.department, item.email]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [filters.search, payrolls]);

  const totals = useMemo(() => {
    return filteredPayrolls.reduce(
      (acc, item) => {
        acc.totalGross += Number(item.gross_salary || 0);
        acc.totalNet += Number(item.net_salary || 0);
        acc.totalDeductions += Number(item.total_deductions || 0);
        return acc;
      },
      { totalGross: 0, totalNet: 0, totalDeductions: 0 },
    );
  }, [filteredPayrolls]);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
    }).format(amount || 0);

  const formatMonth = (month) => {
    if (!month) return "-";
    if (typeof month === "string" && isNaN(Number(month))) return month;
    return (
      months.find((m) => m.value === String(month))?.label || `Month ${month}`
    );
  };

  const formatDate = (dateString) =>
    dateString ? new Date(dateString).toLocaleDateString("en-IN") : "-";

  const resetPayslipForm = () => {
    setPayslipForm({
      employee_id: "",
      month: "",
      year: new Date().getFullYear().toString(),
      present_days: 0,
      paid_leaves: 0,
      unpaid_leaves: 0,
      total_working_days: 30,
      status: "Done",
    });
  };

  const handleCreatePayslip = async (event) => {
    event.preventDefault();

    if (!payslipForm.employee_id || !payslipForm.month || !payslipForm.year) {
      setRunPayrunType("error");
      setRunPayrunMessage("Fill all required fields before saving payslip.");
      return;
    }

    const monthLabel =
      months.find((month) => month.value === String(payslipForm.month))
        ?.label || payslipForm.month;

    try {
      setIsSavingPayslip(true);
      setRunPayrunMessage("");
      setRunPayrunType("");

      await api.post("/payroll/payslips", {
        employee_id: payslipForm.employee_id,
        month: monthLabel,
        year: Number(payslipForm.year),
        present_days: Number(payslipForm.present_days || 0),
        paid_leaves: Number(payslipForm.paid_leaves || 0),
        unpaid_leaves: Number(payslipForm.unpaid_leaves || 0),
        total_working_days: Number(payslipForm.total_working_days || 30),
        status: payslipForm.status,
      });

      setRunPayrunType("success");
      setRunPayrunMessage("Payslip created successfully.");
      setShowCreatePayslip(false);
      resetPayslipForm();
      fetchPayrolls();
    } catch (err) {
      console.error("Error creating payslip:", err);
      setRunPayrunType("error");
      setRunPayrunMessage(
        err.response?.data?.message || "Failed to create payslip.",
      );
    } finally {
      setIsSavingPayslip(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="payroll" />

      <main className="dashboard-main">
        <Header title="Payroll" />

        <div className="payroll-shell">
          <div className="payroll-toolbar">
            <div className="payroll-title">
              <h1>Payroll Overview</h1>
              <p>Track payroll runs, totals, and employee payouts.</p>
            </div>
            {isAdminPayroll && (
              <div className="payroll-actions">
                <button
                  className="btn-secondary payroll-action"
                  onClick={() => setShowCreatePayslip(true)}
                >
                  Create Payslip
                </button>
                <button
                  className="btn-primary payroll-action"
                  onClick={handleRunPayrun}
                  disabled={isRunningPayrun}
                >
                  {isRunningPayrun ? "Running..." : "Run Payrun"}
                </button>
              </div>
            )}
          </div>

          <div className="payroll-warning">
            Payroll data is available only for June–September 2025.
          </div>

          {runPayrunMessage && (
            <div className={`payroll-state ${runPayrunType}`}>
              {runPayrunMessage}
            </div>
          )}

          <div className="payroll-filters">
            <div className="filter-group">
              <label htmlFor="payroll-month">Month</label>
              <select
                id="payroll-month"
                value={filters.month}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    month: event.target.value,
                  }))
                }
              >
                <option value="">All</option>
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="payroll-year">Year</label>
              <select
                id="payroll-year"
                value={filters.year}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    year: event.target.value,
                  }))
                }
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            {isAdminPayroll && (
              <div className="filter-group">
                <label htmlFor="payroll-status">Status</label>
                <select
                  id="payroll-status"
                  value={filters.status}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="">All</option>
                  <option value="Pending">Pending</option>
                  <option value="Done">Done</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>
            )}
            <div className="filter-group filter-search">
              <label htmlFor="payroll-search">Search</label>
              <input
                id="payroll-search"
                type="text"
                placeholder="Search by name, code, department"
                value={filters.search}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    search: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          {showCreatePayslip && (
            <div className="payslip-modal-overlay">
              <div className="payslip-modal">
                <div className="modal-header">
                  <h2>Create Payslip</h2>
                  <button
                    className="modal-close"
                    onClick={() => {
                      setShowCreatePayslip(false);
                      resetPayslipForm();
                    }}
                  >
                    ✕
                  </button>
                </div>
                <form className="modal-body" onSubmit={handleCreatePayslip}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Employee</label>
                      <select
                        value={payslipForm.employee_id}
                        onChange={(event) =>
                          setPayslipForm((prev) => ({
                            ...prev,
                            employee_id: event.target.value,
                          }))
                        }
                        required
                      >
                        <option value="">Select Employee</option>
                        {employees.map((employee) => (
                          <option key={employee.emp_id} value={employee.emp_id}>
                            {employee.name} ({employee.emp_id})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Month</label>
                      <select
                        value={payslipForm.month}
                        onChange={(event) =>
                          setPayslipForm((prev) => ({
                            ...prev,
                            month: event.target.value,
                          }))
                        }
                        required
                      >
                        <option value="">Select Month</option>
                        {months.map((month) => (
                          <option key={month.value} value={month.value}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Year</label>
                      <select
                        value={payslipForm.year}
                        onChange={(event) =>
                          setPayslipForm((prev) => ({
                            ...prev,
                            year: event.target.value,
                          }))
                        }
                        required
                      >
                        {years.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Total Working Days</label>
                      <input
                        type="number"
                        min="1"
                        value={payslipForm.total_working_days}
                        onChange={(event) =>
                          setPayslipForm((prev) => ({
                            ...prev,
                            total_working_days: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Present Days</label>
                      <input
                        type="number"
                        min="0"
                        value={payslipForm.present_days}
                        onChange={(event) =>
                          setPayslipForm((prev) => ({
                            ...prev,
                            present_days: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Paid Leaves</label>
                      <input
                        type="number"
                        min="0"
                        value={payslipForm.paid_leaves}
                        onChange={(event) =>
                          setPayslipForm((prev) => ({
                            ...prev,
                            paid_leaves: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Unpaid Leaves</label>
                      <input
                        type="number"
                        min="0"
                        value={payslipForm.unpaid_leaves}
                        onChange={(event) =>
                          setPayslipForm((prev) => ({
                            ...prev,
                            unpaid_leaves: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <select
                        value={payslipForm.status}
                        onChange={(event) =>
                          setPayslipForm((prev) => ({
                            ...prev,
                            status: event.target.value,
                          }))
                        }
                      >
                        <option value="Done">Done</option>
                        <option value="Draft">Draft</option>
                      </select>
                    </div>
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setShowCreatePayslip(false);
                        resetPayslipForm();
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={isSavingPayslip}
                    >
                      {isSavingPayslip ? "Saving..." : "Create Payslip"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="payroll-summary">
            <div className="summary-card">
              <span className="summary-label">Total Records</span>
              <span className="summary-value">{filteredPayrolls.length}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Total Gross</span>
              <span className="summary-value">
                {formatCurrency(totals.totalGross)}
              </span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Total Deductions</span>
              <span className="summary-value">
                {formatCurrency(totals.totalDeductions)}
              </span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Total Net</span>
              <span className="summary-value">
                {formatCurrency(totals.totalNet)}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="payroll-state">Loading payroll data...</div>
          ) : error ? (
            <div className="payroll-state error">{error}</div>
          ) : filteredPayrolls.length === 0 ? (
            <div className="payroll-state">
              No payroll records found for the selected filters.
            </div>
          ) : (
            <div className="payroll-table-wrapper">
              <table className="payroll-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    {isAdminPayroll && <th>Employee</th>}
                    <th className="text-right">Gross</th>
                    <th className="text-right">Deductions</th>
                    <th className="text-right">Net</th>
                    <th>Status</th>
                    <th>Payment Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayrolls.map((item) => (
                    <tr key={item.payroll_id}>
                      <td>
                        {formatMonth(item.month)} {item.year}
                      </td>
                      {isAdminPayroll && (
                        <td>
                          <div className="employee-cell">
                            <span className="employee-name">
                              {item.employee_name || "-"}
                            </span>
                            <span className="employee-sub">
                              {item.employee_code || item.department || ""}
                            </span>
                          </div>
                        </td>
                      )}
                      <td className="text-right">
                        {formatCurrency(item.gross_salary)}
                      </td>
                      <td className="text-right">
                        {formatCurrency(item.total_deductions)}
                      </td>
                      <td className="text-right">
                        {formatCurrency(item.net_salary)}
                      </td>
                      <td>
                        <span
                          className={`status-pill status-${
                            item.payment_status
                              ?.toLowerCase()
                              .replace(" ", "-") || "pending"
                          }`}
                        >
                          {item.payment_status || "Pending"}
                        </span>
                      </td>
                      <td>{formatDate(item.payment_date)}</td>
                      <td>
                        {isAdminPayroll && (
                          <button
                            className="btn-link"
                            onClick={() =>
                              navigate(`/payroll/payslip/${item.payroll_id}`)
                            }
                          >
                            View Payslip
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PayrollPage;
