import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import "../styles/App.css";
import "../styles/Attendance.css";

const ROLE_ADMIN = "Admin";
const ROLE_HR = "HR Officer";
const ROLE_PAYROLL = "Payroll Officer";

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatDateISO(date) {
  return date.toISOString().split("T")[0];
}

function parseTimeToDate(dateStr, timeStr) {
  if (!timeStr) return null;
  // dateStr like '2025-11-08', timeStr like '09:00' or '09:00:00'
  const d = new Date(dateStr + "T" + timeStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

function msToHHMM(ms) {
  if (ms == null || isNaN(ms)) return "--:--";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function computeWorkAndExtra({
  date,
  checkIn,
  checkOut,
  breaks = [],
  assignedHours = 8 * 60,
}) {
  // assignedHours in minutes (default 8h). Returns { workMinutes, extraMinutes }
  const inDate = parseTimeToDate(date, checkIn);
  const outDate = parseTimeToDate(date, checkOut);
  if (!inDate || !outDate || outDate <= inDate)
    return { workMinutes: 0, extraMinutes: 0 };

  // basic total duration
  let total = (outDate - inDate) / 60000; // minutes

  // subtract breaks
  for (const b of breaks) {
    const bs = parseTimeToDate(date, b.start);
    const be = parseTimeToDate(date, b.end);
    if (!bs || !be || be <= bs) continue;
    total -= (be - bs) / 60000;
  }

  const workMinutes = Math.max(0, Math.round(total));
  const extraMinutes = Math.max(0, workMinutes - assignedHours);
  return { workMinutes, extraMinutes };
}

const Attendance = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState("day"); // 'day' or 'month'
  const [date, setDate] = useState(() => new Date()); // Current date
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState([]);
  const [activeSection, setActiveSection] = useState("attendance");
  const [activeLeaves, setActiveLeaves] = useState({});
  const [adminFilters, setAdminFilters] = useState({
    search: "",
    status: "",
    department: "",
    startDate: "",
    endDate: "",
  });
  const [adminPage, setAdminPage] = useState(1);
  const [adminPagination, setAdminPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const isPrivileged = useMemo(() => {
    const role = user?.role || "";
    return role === ROLE_ADMIN || role === ROLE_HR || role === ROLE_PAYROLL;
  }, [user]);

  // Default behavior: employee -> month view; privileged -> day view
  useEffect(() => {
    if (isPrivileged) setView("day");
    else setView("month");
  }, [isPrivileged]);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        // Active leave indicators are optional and must not block attendance data.
        if (isPrivileged) {
          try {
            const leavesResp = await api.get("/leave/active-leaves");
            setActiveLeaves(leavesResp.data?.data || {});
          } catch {
            setActiveLeaves({});
          }
        }

        if (view === "month" && user) {
          // Fetch month attendance for current user
          const month = date.getMonth() + 1;
          const year = date.getFullYear();
          const resp = await api.get(
            `/attendance/my-logs?month=${month}&year=${year}`
          );
          setRecords(resp.data?.data || []);
        } else if (view === "day") {
          const d = formatDateISO(date);
          if (isPrivileged) {
            const resp = await api.get("/attendance/all", {
              params: {
                page: adminPage,
                limit: adminPagination.limit,
                search: adminFilters.search || undefined,
                status: adminFilters.status || undefined,
                department: adminFilters.department || undefined,
                startDate: adminFilters.startDate || d,
                endDate: adminFilters.endDate || d,
              },
            });
            setRecords(resp.data?.data || []);
            setAdminPagination(
              resp.data?.pagination || {
                page: adminPage,
                limit: adminPagination.limit,
                total: 0,
                totalPages: 0,
              },
            );
          } else if (user) {
            // Employee viewing a single day
            const resp = await api.get(
              `/attendance/my-logs?start_date=${d}&end_date=${d}`
            );
            setRecords(resp.data?.data || []);
          }
        }
      } catch (err) {
        console.error("Error fetching attendance:", err);
        setError(
          err.response?.data?.message || "Failed to load attendance data"
        );
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [date, view, user, isPrivileged, adminFilters, adminPage]);

  const updateAdminFilter = (field, value) => {
    setAdminPage(1);
    setAdminFilters((current) => ({ ...current, [field]: value }));
  };

  const exportAdminAttendance = async () => {
    try {
      const response = await api.get("/attendance/export", {
        params: {
          search: adminFilters.search || undefined,
          status: adminFilters.status || undefined,
          department: adminFilters.department || undefined,
          startDate: adminFilters.startDate || formatDateISO(date),
          endDate: adminFilters.endDate || formatDateISO(date),
        },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "attendance.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to export attendance");
    }
  };

  const gotoPrev = () =>
    setDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  const gotoNext = () =>
    setDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));

  const onDateChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    setDate(new Date(val + "T00:00:00"));
  };

  // When in month view, prepare a list of days in month and group records by date
  const monthDays = useMemo(() => {
    if (view !== "month") return [];
    const first = startOfMonth(date);
    const last = endOfMonth(date);
    const days = [];
    for (let d = first.getDate(); d <= last.getDate(); d++) {
      const dt = new Date(first.getFullYear(), first.getMonth(), d);
      const iso = formatDateISO(dt);
      // find record for that day (user's own attendance)
      const rec = records.find(
        (r) => (r.date || r.day || "").startsWith(iso) || r.date === iso
      );
      days.push({ date: dt, record: rec || null });
    }
    return days;
  }, [view, date, records]);

  // Navigation items - always visible
  const navItems = useMemo(
    () => [
      { id: "employees", label: "Employees", path: "/dashboard" },
      { id: "attendance", label: "Attendance", path: "/attendance" },
      { id: "timeoff", label: "Time Off", path: null },
      { id: "payroll", label: "Payroll", path: null },
      { id: "reports", label: "Reports", path: "/reports" },
    ],
    []
  );

  const handleNavClick = (item) => {
    if (item.path) {
      navigate(item.path);
    } else {
      setActiveSection(item.id);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="dashboard-layout">
      {/* Left Sidebar Navigation */}
      <Sidebar activeSection="attendance" />

      {/* Main Content */}
      <div className="attendance-page">
        {/* Top Header */}
        <Header title="Attendance Management" />

        {/* Controls Bar */}
        <div className="controls-bar">
          <div className="controls-left">
            <button className="arrow-btn" onClick={gotoPrev}>
              ←
            </button>
            <button className="arrow-btn" onClick={gotoNext}>
              →
            </button>
          </div>
          <div className="controls-center">
            <input
              type="date"
              className="date-dropdown"
              value={formatDateISO(date)}
              onChange={onDateChange}
            />
            <select className="day-dropdown">
              <option value="">Day</option>
              <option value="monday">Monday</option>
              <option value="tuesday">Tuesday</option>
              <option value="wednesday">Wednesday</option>
              <option value="thursday">Thursday</option>
              <option value="friday">Friday</option>
              <option value="saturday">Saturday</option>
              <option value="sunday">Sunday</option>
            </select>
          </div>
          {isPrivileged && (
            <div className="attendance-admin-filters">
              <input
                type="search"
                placeholder="Search employee"
                value={adminFilters.search}
                onChange={(event) => updateAdminFilter("search", event.target.value)}
              />
              <select
                value={adminFilters.status}
                onChange={(event) => updateAdminFilter("status", event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Half-Day">Half-Day</option>
                <option value="Absent">Absent</option>
                <option value="On Leave">On Leave</option>
              </select>
              <input
                type="text"
                placeholder="Department"
                value={adminFilters.department}
                onChange={(event) => updateAdminFilter("department", event.target.value)}
              />
              <input
                type="date"
                aria-label="Start date"
                value={adminFilters.startDate}
                onChange={(event) => updateAdminFilter("startDate", event.target.value)}
              />
              <input
                type="date"
                aria-label="End date"
                value={adminFilters.endDate}
                onChange={(event) => updateAdminFilter("endDate", event.target.value)}
              />
              <button type="button" onClick={exportAdminAttendance}>
                Export CSV
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="attendance-content">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {!loading && view === "day" && (
            <div className="data-table-wrapper">
              <div className="date-display">
                {`${date.getDate()}, ${date.toLocaleDateString("en-US", {
                  month: "long",
                })} ${date.getFullYear()}`}
              </div>
              {isPrivileged && (
                <div className="attendance-pagination-summary">
                  {adminPagination.total} records
                </div>
              )}

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Emp</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Work Hours</th>
                    <th>Extra hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr>
                      <td colSpan="6" className="no-data">
                        No records
                      </td>
                    </tr>
                  )}
                  {records.map((r) => {
                    const workHours = r.total_hours || 0;
                    const extraHours = Math.max(
                      0,
                      workHours - (r.assigned_hours || 8)
                    );
                    const empName = isPrivileged
                      ? r.userName || r.employee_name || "[Employee]"
                      : "You";

                    // Check if employee is on leave
                    const onLeave = isPrivileged && activeLeaves[r.user_id];
                    console.log(`Attendance row - Employee ${r.user_id}:`, {
                      isPrivileged,
                      onLeave,
                      activeLeaves,
                      userId: r.user_id,
                    });

                    return (
                      <tr key={r.attendance_id || r.id}>
                        <td className="emp-cell">
                          {onLeave && (
                            <span style={{ marginRight: "5px" }}>✈️</span>
                          )}
                          {empName}
                        </td>
                        <td>{r.checkIn || r.check_in_time || "--:--"}</td>
                        <td>{r.checkOut || r.check_out_time || "--:--"}</td>
                        <td>
                          {workHours
                            ? `${parseFloat(workHours).toFixed(2)}`
                            : "00:00"}
                        </td>
                          <td>{r.status || "-"}</td>
                        <td>
                          {extraHours > 0
                            ? `${parseFloat(extraHours).toFixed(2)}`
                            : "00:00"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {isPrivileged && adminPagination.totalPages > 0 && (
                <div className="attendance-pagination">
                  <button
                    type="button"
                    disabled={adminPage <= 1}
                    onClick={() => setAdminPage((pageNumber) => pageNumber - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {adminPagination.page} of {adminPagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={adminPage >= adminPagination.totalPages}
                    onClick={() => setAdminPage((pageNumber) => pageNumber + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {!loading && view === "month" && (
            <div className="data-table-wrapper">
              <div className="date-display">
                {date.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Work Hours</th>
                    <th>Extra hours</th>
                  </tr>
                </thead>
                <tbody>
                  {monthDays.map(({ date: dt, record }) => {
                    const dayName = dt.toLocaleDateString("en-US", {
                      weekday: "short",
                    });
                    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;

                    if (!record) {
                      return (
                        <tr
                          key={formatDateISO(dt)}
                          className={isWeekend ? "weekend-row" : ""}
                        >
                          <td>{dt.getDate()}</td>
                          <td>{dayName}</td>
                          <td>--:--</td>
                          <td>--:--</td>
                          <td>00:00</td>
                          <td>00:00</td>
                        </tr>
                      );
                    }

                    const workHours = record.total_hours || 0;
                    const extraHours = Math.max(
                      0,
                      workHours - (record.assigned_hours || 8)
                    );

                    return (
                      <tr key={record.attendance_id || formatDateISO(dt)}>
                        <td>{dt.getDate()}</td>
                        <td>{dayName}</td>
                        <td>
                          {record.checkIn || record.check_in_time || "--:--"}
                        </td>
                        <td>
                          {record.checkOut || record.check_out_time || "--:--"}
                        </td>
                        <td>
                          {workHours
                            ? `${parseFloat(workHours).toFixed(2)}`
                            : "00:00"}
                        </td>
                        <td>
                          {extraHours > 0
                            ? `${parseFloat(extraHours).toFixed(2)}`
                            : "00:00"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Attendance;
