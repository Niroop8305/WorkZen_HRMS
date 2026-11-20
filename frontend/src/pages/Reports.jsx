// Reports hub: four self-contained report sections, restored from the
// original stacked layout (Attendance Day / Payroll Period / Leave Report)
// and extended with a Monthly Attendance Summary. Each section owns its
// controls, KPI summary, styled table and CSV export of exactly the rows it
// rendered.
//
// Field mappings are pinned to the ACTUAL backend payloads:
//   /attendance/day   -> rows with userName, userId, checkIn/checkOut (HH:mm)
//   /attendance/all   -> rows with employee_name, user_id, full check_in_time
//   /payroll/all      -> rows with employee_name, gross_salary, net_salary,
//                        total_deductions, payment_status
//   /leave/requests   -> rows with employee_name, leave_type, total_days
// A mapping against a field the API never sends is how "#undefined" and
// "Unknown" cells used to render.

import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  Download,
  PlayCircle,
  Wallet,
} from "lucide-react";
import "../styles/App.css";
import "../styles/Reports.css";
import { todayLocalKey } from "../utils/dates";
import {
  formatTime12,
  formatDateLabel,
  formatHoursFromMinutes,
  statusTone,
} from "../utils/format";

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

const StatusPill = ({ status }) => (
  <span className={`status-pill ${statusTone(status)}`}>{status ?? "—"}</span>
);

const KpiCard = ({ label, value, tone = "" }) => (
  <div className={`report-kpi wz-card ${tone}`}>
    <span className="report-kpi-value">{value}</span>
    <span className="report-kpi-label">{label}</span>
  </div>
);

const MAX_TABLE_ROWS = 200;

/**
 * One report section: header + controls + KPIs + results table + export.
 * Purely presentational — every dataset is fetched and held by the page.
 */
const ReportSection = ({
  icon: Icon,
  title,
  description,
  controls,
  runLabel,
  onRun,
  running,
  rows,
  columns,
  filename,
  error,
  emptyTitle = "No records matched this report.",
  emptySub = "Try a different period — the data must exist for the range you selected.",
  kpis,
}) => (
  <section className="report-card report-section">
    <div className="report-header">
      <div className="report-title-block">
        <span className="report-title-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="report-name">{title}</h2>
          <p className="report-name-sub">{description}</p>
        </div>
      </div>
    </div>

    <div className="report-controls-bar">
      {controls}
      <button className="report-run-btn" onClick={onRun} disabled={running} aria-label={runLabel}>
        <PlayCircle size={15} aria-hidden="true" />
        {running ? "Running…" : "Run Report"}
      </button>
      {Array.isArray(rows) && rows.length > 0 && (
        <button
          className="report-export-btn"
          onClick={() => downloadCsv(filename, toCsv(rows, columns))}
          aria-label={`Export ${title} as CSV`}
        >
          <Download size={15} aria-hidden="true" /> Export CSV
        </button>
      )}
    </div>

    {error && (
      <div className="error-message" role="alert">
        <span>{error}</span>
      </div>
    )}

    {Array.isArray(rows) && rows.length > 0 && kpis}

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
                {rows.slice(0, MAX_TABLE_ROWS).map((row, index) => (
                  <tr
                    key={
                      row.attendance_id ?? row.payroll_id ?? row.leave_id ?? index
                    }
                  >
                    {columns.map((c) => {
                      const value = c.value(row);
                      return (
                        <td key={c.label}>
                          {c.label === "STATUS" ? (
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
          {rows.length > MAX_TABLE_ROWS && (
            <p className="report-note">
              Showing the first {MAX_TABLE_ROWS} of {rows.length} rows; the CSV
              export contains every row.
            </p>
          )}
        </>
      ) : (
        <div className="report-empty">
          <p>{emptyTitle}</p>
          <p className="report-empty-sub">{emptySub}</p>
        </div>
      )
    ) : (
      <div className="report-empty">
        <p>Run the report to see results.</p>
        <p className="report-empty-sub">
          Choose the period above, then press Run Report.
        </p>
      </div>
    )}
  </section>
);

const Reports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Route guard: this page is reachable by Admin and Payroll Officer, so every
  // dataset here comes from an endpoint both roles may call.
  const hasReportAccess =
    user?.role === "Admin" || user?.role === "Payroll Officer";

  // /leave/requests is authorize("Admin", "HR Officer") on the backend; on
  // this page only the Admin qualifies, matching the original behaviour.
  const canSeeLeaveReport = user?.role === "Admin";

  const businessNow = new Date();

  // ---- Daily Attendance (/attendance/day) ----
  const [dayDate, setDayDate] = useState(todayLocalKey());
  const [dailyRows, setDailyRows] = useState(null);
  const [dailyError, setDailyError] = useState(null);
  const [dailyRunning, setDailyRunning] = useState(false);

  // ---- Monthly Attendance Summary (/attendance/all over a month) ----
  const [monthValue, setMonthValue] = useState(
    `${businessNow.getFullYear()}-${String(businessNow.getMonth() + 1).padStart(2, "0")}`,
  );
  const [monthlyRows, setMonthlyRows] = useState(null);
  const [monthlyError, setMonthlyError] = useState(null);
  const [monthlyRunning, setMonthlyRunning] = useState(false);

  // ---- Payroll Period Report (/payroll/all) ----
  const [payrollMonth, setPayrollMonth] = useState(businessNow.getMonth() + 1);
  const [payrollYear, setPayrollYear] = useState(businessNow.getFullYear());
  const [payrollRows, setPayrollRows] = useState(null);
  const [payrollError, setPayrollError] = useState(null);
  const [payrollRunning, setPayrollRunning] = useState(false);

  // ---- Leave Report (/leave/requests, Admin-only section) ----
  const [leaveStatus, setLeaveStatus] = useState("");
  const [leaveRows, setLeaveRows] = useState(null);
  const [leaveError, setLeaveError] = useState(null);
  const [leaveRunning, setLeaveRunning] = useState(false);

  const runDaily = useCallback(async () => {
    setDailyRunning(true);
    setDailyError(null);
    try {
      const response = await api.get("/attendance/day", {
        params: { date: dayDate, page: 1, limit: 1000 },
      });
      setDailyRows(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (err) {
      setDailyError(err.response?.data?.message ?? "The report failed.");
      setDailyRows(null);
    } finally {
      setDailyRunning(false);
    }
  }, [dayDate]);

  const runMonthly = useCallback(async () => {
    setMonthlyRunning(true);
    setMonthlyError(null);
    try {
      const [year, month] = monthValue.split("-").map(Number);
      const first = `${year}-${String(month).padStart(2, "0")}-01`;
      const last = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
      const response = await api.get("/attendance/all", {
        params: { page: 1, limit: 1000, startDate: first, endDate: last },
      });
      setMonthlyRows(
        Array.isArray(response.data.data) ? response.data.data : [],
      );
    } catch (err) {
      setMonthlyError(err.response?.data?.message ?? "The report failed.");
      setMonthlyRows(null);
    } finally {
      setMonthlyRunning(false);
    }
  }, [monthValue]);

  const runPayroll = useCallback(async () => {
    setPayrollRunning(true);
    setPayrollError(null);
    try {
      const response = await api.get("/payroll/all", {
        params: { month: payrollMonth, year: payrollYear },
      });
      setPayrollRows(
        Array.isArray(response.data.data) ? response.data.data : [],
      );
    } catch (err) {
      setPayrollError(err.response?.data?.message ?? "The report failed.");
      setPayrollRows(null);
    } finally {
      setPayrollRunning(false);
    }
  }, [payrollMonth, payrollYear]);

  const runLeave = useCallback(async () => {
    setLeaveRunning(true);
    setLeaveError(null);
    try {
      const response = await api.get("/leave/requests", {
        params: leaveStatus ? { status: leaveStatus, limit: 1000 } : { limit: 1000 },
      });
      setLeaveRows(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (err) {
      setLeaveError(err.response?.data?.message ?? "The report failed.");
      setLeaveRows(null);
    } finally {
      setLeaveRunning(false);
    }
  }, [leaveStatus]);

  if (!hasReportAccess) {
    navigate("/unauthorized");
    return null;
  }

  // ---- Column definitions (endpoint-shaped) ----
  const dailyColumns = [
    { label: "EMPLOYEE", value: (r) => `${r.userName ?? "Unknown"}${r.employee_code ? ` · ${r.employee_code}` : ""}` },
    { label: "DATE", value: (r) => formatDateLabel(r.attendance_date) },
    { label: "CHECK IN", value: (r) => formatTime12(r.checkIn ?? r.check_in_time) },
    { label: "CHECK OUT", value: (r) => formatTime12(r.checkOut ?? r.check_out_time) },
    { label: "WORK HOURS", value: (r) => formatHoursFromMinutes(r.worked_minutes) },
    { label: "LATE", value: (r) => `${r.late_minutes ?? 0} min` },
    { label: "STATUS", value: (r) => r.status ?? "—" },
  ];

  const monthlyColumns = [
    // /attendance/all rows carry employee_name + full check_in_time datetimes.
    { label: "EMPLOYEE", value: (r) => `${r.employee_name ?? r.userName ?? "Unknown"}${r.employee_code ? ` · ${r.employee_code}` : ""}` },
    { label: "DATE", value: (r) => formatDateLabel(r.attendance_date) },
    { label: "CHECK IN", value: (r) => formatTime12(r.check_in_time) },
    { label: "CHECK OUT", value: (r) => formatTime12(r.check_out_time) },
    { label: "WORK HOURS", value: (r) => formatHoursFromMinutes(r.worked_minutes) },
    { label: "LATE", value: (r) => `${r.late_minutes ?? 0} min` },
    { label: "STATUS", value: (r) => r.status ?? "—" },
  ];

  const payrollColumns = [
    { label: "EMPLOYEE", value: (r) => `${r.employee_name ?? "Unknown"}${r.employee_code ? ` · ${r.employee_code}` : ""}` },
    { label: "PERIOD", value: (r) => `${String(r.month).padStart(2, "0")}/${r.year}` },
    { label: "GROSS", value: (r) => r.gross_salary ?? "—" },
    { label: "DEDUCTIONS", value: (r) => r.total_deductions ?? "—" },
    { label: "NET", value: (r) => r.net_salary ?? "—" },
    { label: "PAYMENT DATE", value: (r) => formatDateLabel(r.payment_date) || "—" },
    { label: "STATUS", value: (r) => r.payment_status ?? r.status ?? "—" },
  ];

  const leaveColumns = [
    { label: "EMPLOYEE", value: (r) => `${r.employee_name ?? "Unknown"}${r.employee_code ? ` · ${r.employee_code}` : ""}` },
    { label: "TYPE", value: (r) => r.leave_type ?? r.leave_type_name ?? "—" },
    { label: "FROM", value: (r) => formatDateLabel(r.start_date) },
    { label: "TO", value: (r) => formatDateLabel(r.end_date) },
    { label: "DAYS", value: (r) => r.total_days ?? r.days ?? "—" },
    { label: "STATUS", value: (r) => r.status ?? "—" },
  ];

  // ---- Shared KPI builders ----
  const attendanceKpis = (rows) => {
    const presentCount = rows.filter((r) => /present/i.test(r.status ?? "")).length;
    const lateCount = rows.filter((r) => /late/i.test(r.status ?? "")).length;
    const totalMinutes = rows.reduce(
      (sum, r) => sum + Number(r.worked_minutes ?? 0),
      0,
    );
    return (
      <div className="report-kpis">
        <KpiCard label="Records" value={rows.length} />
        <KpiCard label="Present" value={presentCount} tone="kpi-positive" />
        <KpiCard label="Late" value={lateCount} tone="kpi-warning" />
        <KpiCard label="Total work hours" value={formatHoursFromMinutes(totalMinutes)} />
      </div>
    );
  };

  const payrollKpis = (rows) => {
    const pending = rows.filter(
      (r) => !/paid/i.test(r.payment_status ?? r.status ?? ""),
    ).length;
    const netTotal = rows.reduce(
      (sum, r) => sum + Number(r.net_salary ?? 0),
      0,
    );
    return (
      <div className="report-kpis">
        <KpiCard label="Payroll rows" value={rows.length} />
        <KpiCard label="Awaiting payment" value={pending} tone="kpi-warning" />
        <KpiCard
          label="Total net"
          value={
            new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(netTotal)
          }
          tone="kpi-positive"
        />
      </div>
    );
  };

  const leaveKpis = (rows) => {
    const count = (status) =>
      rows.filter((r) => String(r.status ?? "").toLowerCase() === status).length;
    return (
      <div className="report-kpis">
        <KpiCard label="Applications" value={rows.length} />
        <KpiCard label="Pending" value={count("pending")} tone="kpi-warning" />
        <KpiCard label="Approved" value={count("approved")} tone="kpi-positive" />
        <KpiCard label="Rejected" value={count("rejected")} tone="kpi-negative" />
      </div>
    );
  };

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="reports" />

      <main className="dashboard-main">
        <Header
          title="Reports & Analytics"
          subtitle="Role-scoped operational reports with CSV export"
        />

        <div className="reports-container">
          <ReportSection
            icon={CalendarCheck}
            title="Daily Attendance Report"
            description="Every attendance record for one business date."
            controls={
              <div className="report-field">
                <label htmlFor="report-day-date">Report date</label>
                <input
                  id="report-day-date"
                  type="date"
                  value={dayDate}
                  onChange={(e) => setDayDate(e.target.value)}
                />
              </div>
            }
            runLabel="Run daily attendance report"
            onRun={runDaily}
            running={dailyRunning}
            rows={dailyRows}
            columns={dailyColumns}
            filename={`attendance_day_${dayDate}.csv`}
            error={dailyError}
            emptyTitle="No attendance records for that date."
            kpis={attendanceKpis(dailyRows ?? [])}
          />

          <ReportSection
            icon={CalendarClock}
            title="Monthly Attendance Summary"
            description="All attendance records across one calendar month."
            controls={
              <div className="report-field">
                <label htmlFor="report-month-value">Month</label>
                <input
                  id="report-month-value"
                  type="month"
                  value={monthValue}
                  onChange={(e) => setMonthValue(e.target.value)}
                />
              </div>
            }
            runLabel="Run monthly attendance report"
            onRun={runMonthly}
            running={monthlyRunning}
            rows={monthlyRows}
            columns={monthlyColumns}
            filename={`attendance_monthly_${monthValue}.csv`}
            error={monthlyError}
            emptyTitle="No attendance records for that month."
            kpis={attendanceKpis(monthlyRows ?? [])}
          />

          <ReportSection
            icon={Wallet}
            title="Payroll Period Report"
            description="Payroll for one month, including payment status."
            controls={
              <>
                <div className="report-field">
                  <label htmlFor="report-payroll-month">Month</label>
                  <select
                    id="report-payroll-month"
                    value={payrollMonth}
                    onChange={(e) => setPayrollMonth(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="report-field">
                  <label htmlFor="report-payroll-year">Year</label>
                  <input
                    id="report-payroll-year"
                    type="number"
                    min="2000"
                    max="2100"
                    value={payrollYear}
                    onChange={(e) => setPayrollYear(Number(e.target.value))}
                  />
                </div>
              </>
            }
            runLabel="Run payroll period report"
            onRun={runPayroll}
            running={payrollRunning}
            rows={payrollRows}
            columns={payrollColumns}
            filename={`payroll_${payrollYear}_${String(payrollMonth).padStart(2, "0")}.csv`}
            error={payrollError}
            emptyTitle="No payroll rows for that period."
            kpis={payrollKpis(payrollRows ?? [])}
          />

          {canSeeLeaveReport ? (
            <ReportSection
              icon={BarChart3}
              title="Leave Report"
              description="Organization leave applications, optionally filtered by status."
              controls={
                <div className="report-field">
                  <label htmlFor="report-leave-status">Status</label>
                  <select
                    id="report-leave-status"
                    value={leaveStatus}
                    onChange={(e) => setLeaveStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    {["Pending", "Approved", "Rejected", "Cancelled"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              }
              runLabel="Run leave report"
              onRun={runLeave}
              running={leaveRunning}
              rows={leaveRows}
              columns={leaveColumns}
              filename={`leave_report_${todayLocalKey()}.csv`}
              error={leaveError}
              emptyTitle="No leave applications match the filter."
              kpis={leaveKpis(leaveRows ?? [])}
            />
          ) : (
            <section className="report-card">
              <div className="report-header">
                <div className="report-title-block">
                  <span className="report-title-icon" aria-hidden="true">
                    <BarChart3 size={18} />
                  </span>
                  <div>
                    <h2 className="report-name">Leave Report</h2>
                    <p className="report-name-sub">
                      Leave reports are Admin/HR scope. Ask an HR Officer or the
                      Admin for organization leave data.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default Reports;
