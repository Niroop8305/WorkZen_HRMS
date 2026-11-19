// Reports: real, role-scoped summaries backed by live endpoints. The page is
// reachable by Admin and Payroll Officer (route guard), so every dataset here
// comes from an endpoint both roles may call:
//   Attendance day report  — /attendance/day?date=YYYY-MM-DD (Admin/HR/Payroll)
//   Payroll period report  — /payroll/all?month&year (Admin/HR/Payroll)
//   Leave report           — /leave/requests (Admin/HR only): shown to Admin,
//                            and for a Payroll Officer the page states the
//                            scope honestly instead of firing a 403.
// Every report exports the rows it rendered as CSV (D-18-style client export).

import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import "../styles/App.css";
import "../styles/Reports.css";
import { todayLocalKey } from "../utils/dates";

const toCsv = (rows, columns) => {
  const header = columns.map((c) => c.label).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = c.value(row) ?? "";
        const text = String(value);
        // RFC 4180: quote anything containing a comma, quote or newline.
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(","),
  );
  return [header, ...lines].join("\n");
};

const downloadCsv = (filename, csv) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
};

const ReportCard = ({
  title,
  description,
  children,
  // null = the report has not run yet; [] = ran and found nothing.
  rows,
  columns,
  filename,
  emptyText,
}) => {
  return (
    <div className="report-card">
      <div className="report-header">
        <div className="report-title-section">
          <h2 className="report-name">{title}</h2>
          <p className="report-description">{description}</p>
        </div>
      </div>
      <div className="report-form">{children}</div>
      {Array.isArray(rows) ? (
        rows.length > 0 ? (
          <>
            <table className="reports-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.label}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((row, index) => (
                  <tr key={index}>
                    {columns.map((c) => (
                      <td key={c.label}>{c.value(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && (
              <p className="report-note">
                Showing the first 200 of {rows.length} rows; the CSV export
                contains every row.
              </p>
            )}
            <button
              className="btn btn-primary"
              onClick={() => downloadCsv(filename, toCsv(rows, columns))}
            >
              Export CSV
            </button>
          </>
        ) : (
          <p className="report-note">{emptyText}</p>
        )
      ) : (
        <p className="report-note">Run the report to see results.</p>
      )}
    </div>
  );
};

const Reports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const hasReportAccess =
    user?.role === "Admin" || user?.role === "Payroll Officer";
  const canSeeLeaveReport = user?.role === "Admin";

  const [dayDate, setDayDate] = useState(todayLocalKey());
  const [dayRows, setDayRows] = useState(null);
  const [dayError, setDayError] = useState(null);
  const [payrollMonth, setPayrollMonth] = useState(new Date().getMonth() + 1);
  const [payrollYear, setPayrollYear] = useState(new Date().getFullYear());
  const [payrollRows, setPayrollRows] = useState(null);
  const [payrollError, setPayrollError] = useState(null);
  const [leaveStatus, setLeaveStatus] = useState("");
  const [leaveRows, setLeaveRows] = useState(null);
  const [leaveError, setLeaveError] = useState(null);

  const runDayReport = useCallback(async () => {
    setDayError(null);
    try {
      const response = await api.get("/attendance/day", {
        params: { date: dayDate, page: 1, limit: 1000 },
      });
      const data = response.data.data ?? [];
      setDayRows(Array.isArray(data) ? data : []);
    } catch (error) {
      setDayError(error.response?.data?.message ?? "The report failed.");
    }
  }, [dayDate]);

  const runPayrollReport = useCallback(async () => {
    setPayrollError(null);
    try {
      const response = await api.get("/payroll/all", {
        params: { month: payrollMonth, year: payrollYear },
      });
      const data = response.data.data ?? [];
      setPayrollRows(Array.isArray(data) ? data : []);
    } catch (error) {
      setPayrollError(error.response?.data?.message ?? "The report failed.");
    }
  }, [payrollMonth, payrollYear]);

  const runLeaveReport = useCallback(async () => {
    setLeaveError(null);
    try {
      const response = await api.get("/leave/requests", {
        params: leaveStatus ? { status: leaveStatus, limit: 1000 } : { limit: 1000 },
      });
      const data = response.data.data ?? [];
      setLeaveRows(Array.isArray(data) ? data : []);
    } catch (error) {
      setLeaveError(error.response?.data?.message ?? "The report failed.");
    }
  }, [leaveStatus]);

  if (!hasReportAccess) {
    navigate("/unauthorized");
    return null;
  }

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="reports" />

      <main className="dashboard-main">
        <Header title="Reports" subtitle="Role-scoped operational reports" />

        <div className="reports-container">
          <ReportCard
            title="Attendance Day Report"
            description="Every attendance record for one business date."
            rows={dayRows}
            columns={[
              { label: "Employee", value: (r) => r.employee_name ?? r.full_name ?? `#${r.user_id}` },
              { label: "Check In", value: (r) => String(r.check_in_time ?? "").slice(0, 5) },
              { label: "Check Out", value: (r) => String(r.check_out_time ?? "").slice(0, 5) },
              { label: "Worked Minutes", value: (r) => r.worked_minutes ?? "" },
              { label: "Late Minutes", value: (r) => r.late_minutes ?? 0 },
              { label: "Status", value: (r) => r.status ?? "" },
            ]}
            filename={`attendance_day_${dayDate}.csv`}
            emptyText="No attendance records for that date."
          >
            <div className="report-controls">
              <input
                type="date"
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
              />
              <button className="btn btn-primary" onClick={runDayReport}>
                Run Report
              </button>
            </div>
            {dayError && <div className="error-message"><span>{dayError}</span></div>}
          </ReportCard>

          <ReportCard
            title="Payroll Period Report"
            description="Payroll for one month, including payment status."
            rows={payrollRows}
            columns={[
              { label: "Employee", value: (r) => r.employee_name ?? r.full_name ?? `#${r.user_id}` },
              { label: "Month", value: (r) => r.month },
              { label: "Year", value: (r) => r.year },
              { label: "Gross Pay", value: (r) => r.gross_pay ?? "" },
              { label: "Deductions", value: (r) => r.total_deductions ?? "" },
              { label: "Net Pay", value: (r) => r.net_pay ?? "" },
              { label: "Status", value: (r) => r.payment_status ?? "" },
            ]}
            filename={`payroll_${payrollYear}_${String(payrollMonth).padStart(2, "0")}.csv`}
            emptyText="No payroll rows for that period."
          >
            <div className="report-controls">
              <select
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={payrollYear}
                min="2000"
                max="2100"
                onChange={(e) => setPayrollYear(Number(e.target.value))}
              />
              <button className="btn btn-primary" onClick={runPayrollReport}>
                Run Report
              </button>
            </div>
            {payrollError && (
              <div className="error-message"><span>{payrollError}</span></div>
            )}
          </ReportCard>

          {canSeeLeaveReport ? (
            <ReportCard
              title="Leave Report"
              description="Organization leave applications, optionally filtered by status."
              rows={leaveRows}
              columns={[
                { label: "Employee", value: (r) => r.employee_name ?? r.full_name ?? `#${r.user_id}` },
                { label: "Type", value: (r) => r.leave_type_name ?? r.leave_type ?? "" },
                { label: "From", value: (r) => r.start_date },
                { label: "To", value: (r) => r.end_date },
                { label: "Days", value: (r) => r.days ?? r.total_days ?? "" },
                { label: "Status", value: (r) => r.status },
              ]}
              filename={`leave_report_${todayLocalKey()}.csv`}
              emptyText="No leave applications match the filter."
            >
              <div className="report-controls">
                <select
                  value={leaveStatus}
                  onChange={(e) => setLeaveStatus(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
                <button className="btn btn-primary" onClick={runLeaveReport}>
                  Run Report
                </button>
              </div>
              {leaveError && (
                <div className="error-message"><span>{leaveError}</span></div>
              )}
            </ReportCard>
          ) : (
            <div className="report-card">
              <div className="report-header">
                <div className="report-title-section">
                  <h2 className="report-name">Leave Report</h2>
                  <p className="report-description">
                    Leave reports are Admin/HR scope. Ask an HR Officer or the
                    Admin for organization leave data.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Reports;
