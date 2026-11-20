// D-2: a role-appropriate dashboard for Employees. The generic Dashboard
// consumed org-wide endpoints (/users, /attendance/all-status,
// /leave/active-leaves) that the RBAC layer denies to Employees, producing a
// console full of 403s on every login. This page consumes ONLY employee-
// authorized endpoints:
//   /dashboard/my-stats        — monthly summary, leave balance, pending leaves, recent payroll
//   /attendance/status         — own check-in state (with check-in/out actions)
//   /attendance/my-logs        — own recent attendance rows
//   /leave/my-leaves           — own applications
//   /payroll/my-payroll        — own payslip history
// Every fetch failure degrades to a visible empty state, never a crash.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { formatLocalDate } from "../utils/dates";
import { formatDateLabel, formatTime12, statusTone } from "../utils/format";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 10 -> "Oct"; backend payroll rows carry numeric months. */
const formatMonthLabel = (month) => MONTH_NAMES[Number(month) - 1] ?? month;

/** Indian-rupee display for payroll amounts (display-only formatting). */
const formatRupees = (value) => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return "-";
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
};

const Card = ({ title, children, loading, error }) => (
  <div className="employee-dashboard-card">
    <h3 className="employee-dashboard-card-title">{title}</h3>
    {loading ? (
      <div className="spinner" style={{ width: "24px", height: "24px" }} />
    ) : error ? (
      <p className="employee-dashboard-empty">{error}</p>
    ) : (
      children
    )}
  </div>
);

const EmptyState = ({ children }) => (
  <p className="employee-dashboard-empty">{children}</p>
);

const EmployeeDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [stats, setStats] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [myLeaves, setMyLeaves] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setStatsError(null);
    const [
      statsResult,
      attendanceResult,
      logsResult,
      leavesResult,
      payrollResult,
    ] = await Promise.allSettled([
      api.get("/dashboard/my-stats"),
      api.get("/attendance/status"),
      api.get("/attendance/my-logs", { params: { page: 1, limit: 7 } }),
      api.get("/leave/my-leaves"),
      api.get("/payroll/my-payroll"),
    ]);

    if (statsResult.status === "fulfilled" && statsResult.value.data.success) {
      setStats(statsResult.value.data.data);
    } else {
      setStatsError("Could not load your summary. Please try again later.");
    }
    if (attendanceResult.status === "fulfilled" && attendanceResult.value.data.success) {
      setAttendance(attendanceResult.value.data.data);
    }
    if (logsResult.status === "fulfilled" && logsResult.value.data.success) {
      setRecentLogs(logsResult.value.data.data ?? []);
    }
    if (leavesResult.status === "fulfilled" && leavesResult.value.data.success) {
      setMyLeaves(leavesResult.value.data.data ?? []);
    }
    if (payrollResult.status === "fulfilled" && payrollResult.value.data.success) {
      setPayroll(payrollResult.value.data.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCheckInOut = async () => {
    const endpoint =
      attendance?.status === "checked_in"
        ? "/attendance/check-out"
        : "/attendance/check-in";
    setActionBusy(true);
    setActionMessage(null);
    try {
      const response = await api.post(endpoint, {});
      if (response.data.success) {
        setAttendance(response.data.data);
        setActionMessage({
          tone: "ok",
          text: response.data.message ?? "Attendance recorded.",
        });
        loadAll();
      }
    } catch (error) {
      setActionMessage({
        tone: "error",
        text: error.response?.data?.message ?? "Attendance action failed.",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const checkedIn = attendance?.status === "checked_in";
  const fullName =
    user?.profile?.full_name ?? user?.email?.split("@")[0] ?? "Employee";

  const attendanceSummary = stats?.attendance_summary ?? {};
  const leaveBalance = stats?.leave_balance ?? [];
  const pendingLeaves = stats?.pending_leaves ?? [];
  const recentPayroll = payroll.length > 0 ? payroll.slice(0, 3) : (stats?.recent_payroll ?? []);

  return (
    <div className="dashboard-container">
      <Sidebar activeSection="dashboard" />
      <div className="dashboard-main">
        <Header title="My Dashboard" subtitle="Your day at a glance — attendance, leave and payslips" />
        <div className="dashboard-content">
          <div className="employee-dashboard-header">
            <div>
              <h1 className="employee-dashboard-title">
                Welcome, {fullName}
              </h1>
              <p className="employee-dashboard-subtitle">
                {formatLocalDate()} — here is your day at a glance.
              </p>
            </div>
            <div className="employee-dashboard-actions">
              <button
                className={`btn ${checkedIn ? "btn-secondary" : "btn-primary"}`}
                onClick={handleCheckInOut}
                disabled={actionBusy}
              >
                {actionBusy
                  ? "Recording…"
                  : checkedIn
                    ? "Check Out"
                    : "Check In"}
              </button>
            </div>
          </div>

          {actionMessage && (
            <div
              className={`alert ${actionMessage.tone === "ok" ? "alert-success" : "alert-error"}`}
            >
              {actionMessage.text}
            </div>
          )}

          {statsError && <div className="alert alert-error">{statsError}</div>}

          <div className="employee-dashboard-grid">
            <Card title="Attendance today" loading={loading && !attendance}>
              {attendance ? (
                <>
                  <p className="employee-dashboard-big">
                    {checkedIn ? "Checked in" : "Not checked in"}
                  </p>
                  <p className="employee-dashboard-detail">
                    {attendance.check_in_time
                      ? `In at ${formatTime12(attendance.checkIn ?? attendance.check_in_time)}`
                      : "No check-in recorded yet today."}
                    {attendance.check_out_time
                      ? ` · Out at ${formatTime12(attendance.checkOut ?? attendance.check_out_time)}`
                      : ""}
                  </p>
                </>
              ) : (
                <EmptyState>Attendance state is unavailable right now.</EmptyState>
              )}
            </Card>

            <Card title="This month" loading={loading && !stats}>
              {attendanceSummary && attendanceSummary.present_days !== undefined ? (
                <>
                  <p className="employee-dashboard-big">
                    {attendanceSummary.present_days} days present
                  </p>
                  <p className="employee-dashboard-detail">
                    {attendanceSummary.worked_minutes
                      ? `${Math.round(attendanceSummary.worked_minutes / 60)} hours worked`
                      : "No hours recorded yet this month."}
                  </p>
                </>
              ) : (
                <EmptyState>
                  No attendance summary for this month yet.
                </EmptyState>
              )}
            </Card>

            <Card title="Leave balance" loading={loading && !stats}>
              {leaveBalance.length > 0 ? (
                <ul className="employee-dashboard-list">
                  {leaveBalance.map((row) => (
                    <li key={row.balance_id ?? row.leave_type_id}>
                      <strong>{row.leave_type_name}</strong>:{" "}
                      {Number(row.remaining_days ?? row.balance_days ?? row.balance ?? 0)}{" "}
                      day(s) left
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>No leave balances configured for this year.</EmptyState>
              )}
            </Card>

            <Card title="Pending leave requests" loading={loading && !stats}>
              {pendingLeaves.length > 0 ? (
                <ul className="employee-dashboard-list">
                  {pendingLeaves.slice(0, 3).map((leave) => (
                    <li key={leave.application_id ?? leave.leave_id}>
                      {leave.leave_type_name}: {formatDateLabel(leave.start_date)} –{" "}
                      {formatDateLabel(leave.end_date)}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>Nothing pending. Apply from Time Off.</EmptyState>
              )}
            </Card>
          </div>

          <div className="employee-dashboard-grid">
            <Card title="Recent attendance" loading={loading && recentLogs.length === 0}>
              {recentLogs.length > 0 ? (
                <table className="employee-dashboard-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>In</th>
                      <th>Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.slice(0, 5).map((row) => (
                      <tr key={row.attendance_id ?? row.business_date}>
                        <td>{formatDateLabel(row.attendance_date ?? row.business_date)}</td>
                        <td>
                          <span className={`status-pill ${statusTone(row.status)}`}>
                            {row.status ?? "—"}
                          </span>
                        </td>
                        <td>
                          {formatTime12(row.checkIn ?? row.check_in_time)}
                        </td>
                        <td>
                          {formatTime12(row.checkOut ?? row.check_out_time)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState>No attendance records yet.</EmptyState>
              )}
            </Card>

            <Card title="My leave applications" loading={loading && myLeaves.length === 0}>
              {myLeaves.length > 0 ? (
                <table className="employee-dashboard-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myLeaves.slice(0, 5).map((leave) => (
                      <tr key={leave.application_id ?? leave.leave_id}>
                        <td>{leave.leave_type_name ?? leave.leave_type}</td>
                        <td>
                          {formatDateLabel(leave.start_date)} – {formatDateLabel(leave.end_date)}
                        </td>
                        <td>
                          <span className={`status-pill ${statusTone(leave.status)}`}>
                            {leave.status ?? "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState>No leave applications on record.</EmptyState>
              )}
            </Card>

            <Card title="Recent payslips" loading={loading && payroll.length === 0}>
              {recentPayroll.length > 0 ? (
                <table className="employee-dashboard-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Net pay</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayroll.map((row) => (
                      <tr key={row.payroll_id}>
                        <td>
                          {formatMonthLabel(row.month)} {row.year}
                        </td>
                        <td>
                          {formatRupees(row.net_salary ?? row.net_pay)}
                        </td>
                        <td>
                          <span
                            className={`status-pill ${statusTone(row.payment_status ?? row.status)}`}
                          >
                            {row.payment_status ?? row.status ?? "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState>No payslips generated yet.</EmptyState>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
