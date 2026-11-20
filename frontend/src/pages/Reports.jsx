// Reports: real, role-scoped summaries backed by live endpoints. The page is
// reachable by Admin and Payroll Officer (route guard), so every dataset here
// comes from an endpoint both roles may call:
//   Daily Attendance  — /attendance/day?date=YYYY-MM-DD (Admin/HR/Payroll)
//   Monthly Summary   — /attendance/all over a month range (Admin/HR/Payroll)
//   Payroll Summary   — /payroll/all?month&year (Admin/HR/Payroll)
// Each report renders KPI summary cards, a styled dark table with semantic
// status pills, and exports exactly the rows it rendered as CSV.
//
// Field mappings below are pinned to the ACTUAL backend payloads
// (attendanceService.getAttendanceByDay / getAdminAttendance return rows with
// userName, employee_code, check_in_time, worked_minutes, late_minutes,
// status; payroll rows carry month/year/gross_salary/net_salary). A mapping
// against a field the API never sends is how "#undefined" used to render.

import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { BarChart3, Download, PlayCircle } from "lucide-react";
import "../styles/App.css";
import "../styles/Reports.css";
import { todayLocalKey } from "../utils/dates";
import {
  formatTime12,
  formatDateLabel,
  formatHoursFromMinutes,
  statusTone,
} from "../utils/format";

const REPORT_TYPES = [
  { id: "daily", label: "Daily Attendance" },
  { id: "monthly", label: "Monthly Attendance Summary" },
  { label: "Payroll Summary", id: "payroll" },
];

const MONTHS_BACK = 0; // default month = current business month

const toCsv = (rows, columns) => {
  const header = columns.map((c) => c.label).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = c.value(row) ?? "";
        const text = String(value);
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

/** "2026-10-30 08:46:00" | "08:46" -> "08:46 AM"; "--:--" when absent. */
const StatusPill = ({ status }) => (
  <span className={`status-pill ${statusTone(status)}`}>{status ?? "—"}</span>
);

const KpiCard = ({ label, value, tone = "" }) => (
  <div className={`report-kpi wz-card ${tone}`}>
    <span className="report-kpi-value">{value}</span>
    <span className="report-kpi-label">{label}</span>
  </div>
);

const Reports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const hasReportAccess =
    user?.role === "Admin" || user?.role === "Payroll Officer";

  const businessNow = new Date();
  const [reportType, setReportType] = useState("daily");
  const [dayDate, setDayDate] = useState(todayLocalKey());
  const [monthValue, setMonthValue] = useState(
    `${businessNow.getFullYear()}-${String(businessNow.getMonth() + 1).padStart(2, "0")}`,
  );
  const [rows, setRows] = useState(null); // null = not yet run
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const runReport = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      if (reportType === "daily") {
        const response = await api.get("/attendance/day", {
          params: { date: dayDate, page: 1, limit: 1000 },
        });
        setRows(Array.isArray(response.data.data) ? response.data.data : []);
      } else if (reportType === "monthly") {
        const [year, month] = monthValue.split("-").map(Number);
        const first = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const last = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        const response = await api.get("/attendance/all", {
          params: {
            page: 1,
            limit: 1000,
            startDate: first,
            endDate: last,
          },
        });
        setRows(Array.isArray(response.data.data) ? response.data.data : []);
      } else {
        const [year, month] = monthValue.split("-").map(Number);
        const response = await api.get("/payroll/all", {
          params: { month, year },
        });
        setRows(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (err) {
      setError(err.response?.data?.message ?? "The report failed.");
      setRows(null);
    } finally {
      setRunning(false);
    }
  }, [reportType, dayDate, monthValue]);

  if (!hasReportAccess) {
    navigate("/unauthorized");
    return null;
  }

  const attendanceColumns =
    reportType === "monthly"
      ? [
          // /attendance/all rows carry employee_name + full check_in_time
          // datetimes (no checkIn/checkOut aliases like the /day endpoint).
          { label: "EMPLOYEE", value: (r) => `${r.employee_name ?? r.userName ?? "Unknown"}${r.employee_code ? ` · ${r.employee_code}` : ""}` },
          { label: "DATE", value: (r) => formatDateLabel(r.attendance_date) },
          { label: "CHECK IN", value: (r) => formatTime12(r.check_in_time) },
          { label: "CHECK OUT", value: (r) => formatTime12(r.check_out_time) },
          { label: "WORK HOURS", value: (r) => formatHoursFromMinutes(r.worked_minutes) },
          { label: "LATE", value: (r) => `${r.late_minutes ?? 0} min` },
          { label: "STATUS", value: (r) => r.status ?? "—" },
        ]
      : [
          { label: "EMPLOYEE", value: (r) => `${r.userName ?? "Unknown"}${r.employee_code ? ` · ${r.employee_code}` : ""}` },
          { label: "DATE", value: (r) => formatDateLabel(r.attendance_date) },
          { label: "CHECK IN", value: (r) => formatTime12(r.checkIn ?? r.check_in_time) },
          { label: "CHECK OUT", value: (r) => formatTime12(r.checkOut ?? r.check_out_time) },
          { label: "WORK HOURS", value: (r) => formatHoursFromMinutes(r.worked_minutes) },
          { label: "EXTRA HOURS", value: (r) => {
              const extra = Number(r.total_hours ?? 0) - Number((r.worked_minutes ?? 0) / 60);
              return extra > 0 ? `+${extra.toFixed(2)} hrs` : "--";
            } },
          { label: "STATUS", value: (r) => r.status ?? "—" },
        ];

  const payrollColumns = [
    { label: "EMPLOYEE", value: (r) => `${r.userName ?? r.employee_name ?? "Unknown"}${r.employee_code ? ` · ${r.employee_code}` : ""}` },
    { label: "PERIOD", value: (r) => `${String(r.month).padStart(2, "0")}/${r.year}` },
    { label: "GROSS", value: (r) => r.gross_salary ?? r.gross_pay ?? "—" },
    { label: "DEDUCTIONS", value: (r) => r.total_deductions ?? r.deductions ?? "—" },
    { label: "NET", value: (r) => r.net_salary ?? r.net_pay ?? "—" },
    { label: "STATUS", value: (r) => r.payment_status ?? r.status ?? "—" },
  ];

  const columns = reportType === "payroll" ? payrollColumns : attendanceColumns;
  const isAttendance = reportType !== "payroll";
  const presentCount = (rows ?? []).filter((r) => /present/i.test(r.status ?? "")).length;
  const lateCount = (rows ?? []).filter((r) => /late/i.test(r.status ?? "")).length;
  const pendingPayroll = (rows ?? []).filter(
    (r) => !/paid/i.test(r.payment_status ?? r.status ?? ""),
  ).length;
  const netTotal = (rows ?? []).reduce(
    (sum, r) => sum + Number(r.net_salary ?? r.net_pay ?? 0),
    0,
  );

  const filename =
    reportType === "daily"
      ? `attendance_daily_${dayDate}.csv`
      : reportType === "monthly"
        ? `attendance_monthly_${monthValue}.csv`
        : `payroll_${monthValue}.csv`;

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="reports" />

      <main className="dashboard-main">
        <Header
          title="Reports & Analytics"
          subtitle="Role-scoped operational reports with CSV export"
        />

        <div className="reports-container">
          <div className="report-card">
            <div className="report-header">
              <div className="report-title-section">
                <div className="report-title-block">
                  <span className="report-title-icon" aria-hidden="true">
                    <BarChart3 size={18} />
                  </span>
                  <div>
                    <h2 className="report-name">
                      {REPORT_TYPES.find((t) => t.id === reportType)?.label}
                    </h2>
                    <p className="report-name-sub">
                      Server-computed data, exported as rendered.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="report-controls-bar">
              <div className="report-field">
                <label>Report type</label>
                <select
                  value={reportType}
                  onChange={(e) => {
                    setReportType(e.target.value);
                    setRows(null);
                    setError(null);
                  }}
                >
                  {REPORT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="report-field">
                <label>{reportType === "daily" ? "Date" : "Month"}</label>
                {reportType === "daily" ? (
                  <input
                    type="date"
                    value={dayDate}
                    onChange={(e) => setDayDate(e.target.value)}
                  />
                ) : (
                  <input
                    type="month"
                    value={monthValue}
                    onChange={(e) => setMonthValue(e.target.value)}
                  />
                )}
              </div>
              <button
                className="report-run-btn"
                onClick={runReport}
                disabled={running}
              >
                <PlayCircle size={15} aria-hidden="true" />
                {running ? "Running…" : "Run Report"}
              </button>
              {Array.isArray(rows) && rows.length > 0 && (
                <button
                  className="report-export-btn"
                  onClick={() => downloadCsv(filename, toCsv(rows, columns))}
                >
                  <Download size={15} aria-hidden="true" /> Export CSV
                </button>
              )}
            </div>

            {error && <div className="error-message"><span>{error}</span></div>}

            {Array.isArray(rows) && rows.length > 0 && (
              <div className="report-kpis">
                {isAttendance ? (
                  <>
                    <KpiCard label="Records" value={rows.length} />
                    <KpiCard label="Present" value={presentCount} tone="kpi-positive" />
                    <KpiCard label="Late" value={lateCount} tone="kpi-warning" />
                    <KpiCard
                      label="Total work hours"
                      value={formatHoursFromMinutes(
                        rows.reduce((sum, r) => sum + Number(r.worked_minutes ?? 0), 0),
                      )}
                    />
                  </>
                ) : (
                  <>
                    <KpiCard label="Payroll rows" value={rows.length} />
                    <KpiCard label="Awaiting payment" value={pendingPayroll} tone="kpi-warning" />
                    <KpiCard
                      label="Total net"
                      value={
                        new Intl.NumberFormat("en-IN", {
                          maximumFractionDigits: 0,
                        }).format(netTotal)
                      }
                      tone="kpi-positive"
                    />
                  </>
                )}
              </div>
            )}

            {Array.isArray(rows) ? (
              rows.length > 0 ? (
                <>
                  <div className="reports-table-wrap">
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
                          <tr key={row.attendance_id ?? row.payroll_id ?? index}>
                            {columns.map((c) => {
                              const value = c.value(row);
                              const isStatus =
                                c.label === "STATUS";
                              return (
                                <td key={c.label}>
                                  {isStatus ? (
                                    <StatusPill status={value} />
                                  ) : (
                                    value
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.length > 200 && (
                    <p className="report-note">
                      Showing the first 200 of {rows.length} rows; the CSV export
                      contains every row.
                    </p>
                  )}
                </>
              ) : (
                <div className="report-empty">
                  <p>No records matched this report.</p>
                  <p className="report-empty-sub">
                    Try a different date or month — the data must exist for the
                    period you selected.
                  </p>
                </div>
              )
            ) : (
              <div className="report-empty">
                <p>Run the report to see results.</p>
                <p className="report-empty-sub">
                  Pick a report type and period above, then press Run Report.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Reports;
