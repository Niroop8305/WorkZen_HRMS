import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import api from "../services/api";
import "../styles/App.css";
import "../styles/PayrollPage.css";

const PayrollPage = () => {
  const { user } = useAuth();
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      if (filters.month) params.month = filters.month;
      if (filters.year) params.year = filters.year;
      if (filters.status && isAdminPayroll) params.status = filters.status;

      const endpoint = isAdminPayroll ? "/payroll/all" : "/payroll/my-payroll";
      const response = await api.get(endpoint, { params });
      const rows = response.data.data || [];

      setPayrolls(rows);
    } catch (err) {
      console.error("Error fetching payroll:", err);
      setError(err.response?.data?.message || "Failed to load payroll data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrolls();
  }, [filters.month, filters.year, filters.status, isAdminPayroll]);

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

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="payroll" />

      <main className="dashboard-main">
        <Header title="Payroll" />

        <div className="payroll-shell">
          <div className="payroll-toolbar">
            <div className="payroll-title">
              <h1>Payroll Overview</h1>
              <p>Track payroll records, totals, and employee payouts.</p>
            </div>
          </div>

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
                  <option value="Processed">Processed</option>
                  <option value="Paid">Paid</option>
                  <option value="On Hold">On Hold</option>
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
