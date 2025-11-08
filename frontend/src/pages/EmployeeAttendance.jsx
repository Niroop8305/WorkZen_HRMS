import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import "../styles/App.css";
import "../styles/EmployeeAttendance.css";

function formatDateISO(date) {
  return date.toISOString().split("T")[0];
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

const EmployeeAttendance = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(() => new Date());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState("attendance");
  const [summary, setSummary] = useState({
    presentDays: 0,
    leavesCount: 0,
    totalWorkingDays: 0,
  });

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        // Fetch attendance records
        const resp = await api.get(
          `/attendance/my-logs?month=${month}&year=${year}`
        );
        const attendanceData = resp.data?.data || [];
        setRecords(attendanceData);

        // Calculate summary
        const presentDays = attendanceData.filter(
          (r) => r.check_in_time || r.checkIn
        ).length;

        // Try to fetch leaves count
        let leavesCount = 0;
        try {
          const leavesResp = await api.get(
            `/leave/my-leaves?month=${month}&year=${year}`
          );
          leavesCount =
            leavesResp.data?.data?.filter((l) => l.status === "Approved")
              .length || 0;
        } catch (err) {
          console.log("Could not fetch leaves data");
        }

        // Calculate working days in month (excluding weekends)
        const firstDay = startOfMonth(date);
        const lastDay = endOfMonth(date);
        let workingDays = 0;
        for (
          let d = new Date(firstDay);
          d <= lastDay;
          d.setDate(d.getDate() + 1)
        ) {
          const dayOfWeek = d.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            workingDays++;
          }
        }

        setSummary({
          presentDays,
          leavesCount,
          totalWorkingDays: workingDays,
        });
      } catch (err) {
        console.error("Error fetching attendance:", err);
        setError(
          err.response?.data?.message || "Failed to load attendance data"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [date, user]);

  const gotoPrevMonth = () => {
    setDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const gotoNextMonth = () => {
    setDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const onMonthChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [year, month] = val.split("-");
    setDate(new Date(parseInt(year), parseInt(month) - 1, 1));
  };

  // Generate all days of the month
  const monthDays = () => {
    const firstDay = startOfMonth(date);
    const lastDay = endOfMonth(date);
    const days = [];

    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const iso = formatDateISO(d);
      const record = records.find((r) =>
        (r.date || r.day || "").startsWith(iso)
      );
      days.push({
        date: new Date(d),
        record: record || null,
      });
    }

    return days;
  };

  const monthYearString = () => {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const monthInputValue = () => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    return `${year}-${month}`;
  };

  // Navigation items - always visible
  const navItems = React.useMemo(
    () => [
      { id: "employees", label: "Employees", path: "/employee/dashboard" },
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
      <div className="employee-attendance-page">
        {/* Top Header */}
        <Header title="My Attendance" />

        {/* Navigation Bar */}
        <div className="ea-nav-bar">
          <button className="ea-nav-btn" onClick={gotoPrevMonth}>
            ←
          </button>
          <button className="ea-nav-btn" onClick={gotoNextMonth}>
            →
          </button>
          <input
            type="month"
            className="ea-month-picker"
            value={monthInputValue()}
            onChange={onMonthChange}
          />
        </div>

        {/* Summary Cards */}
        <div className="ea-summary-cards">
          <div className="ea-card">
            <div className="ea-card-title">Count of days present</div>
            <div className="ea-card-value">{summary.presentDays}</div>
          </div>
          <div className="ea-card">
            <div className="ea-card-title">Leaves count</div>
            <div className="ea-card-value">{summary.leavesCount}</div>
          </div>
          <div className="ea-card">
            <div className="ea-card-title">Total working days</div>
            <div className="ea-card-value">{summary.totalWorkingDays}</div>
          </div>
        </div>

        {/* Date Heading */}
        <div className="ea-date-heading">{monthYearString()}</div>

        {/* Loading State */}
        {loading && (
          <div className="ea-loading">
            <div className="ea-spinner"></div>
            <p>Loading attendance...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="ea-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Attendance Table */}
        {!loading && (
          <div className="ea-table-wrapper">
            <table className="ea-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Work Hours</th>
                  <th>Extra hours</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td
                      colSpan="5"
                      style={{
                        textAlign: "center",
                        padding: "40px",
                        color: "#999",
                      }}
                    >
                      No attendance records for {monthYearString()}
                    </td>
                  </tr>
                ) : (
                  records.map((record) => {
                    const recordDate = new Date(
                      record.date || record.day || record.attendance_date
                    );
                    const dateStr = recordDate.toLocaleDateString("en-GB"); // DD/MM/YYYY format
                    const checkIn =
                      record.check_in_time || record.checkIn || "--:--";
                    const checkOut =
                      record.check_out_time || record.checkOut || "--:--";
                    const workHours = record.total_hours || 0;
                    const extraHours = Math.max(
                      0,
                      workHours - (record.assigned_hours || 8)
                    );

                    return (
                      <tr key={record.attendance_id || record.id}>
                        <td>{dateStr}</td>
                        <td>{checkIn}</td>
                        <td>{checkOut}</td>
                        <td>
                          {workHours
                            ? parseFloat(workHours).toFixed(2)
                            : "00:00"}
                        </td>
                        <td>
                          {extraHours > 0
                            ? parseFloat(extraHours).toFixed(2)
                            : "00:00"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeAttendance;
