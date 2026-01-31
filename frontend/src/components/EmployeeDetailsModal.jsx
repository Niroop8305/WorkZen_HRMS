import React, { useState, useEffect } from "react";
import api from "../services/api";
import "../styles/EmployeeDetailsModal.css";

const EmployeeDetailsModal = ({ isOpen, onClose, employee }) => {
  const [detailedInfo, setDetailedInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const [liveStatus, setLiveStatus] = useState(null);

  const getInitials = (name, email) => {
    if (name) {
      return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
    }

    if (email) {
      return email.slice(0, 2).toUpperCase();
    }

    return "";
  };

  const summarizeAttendance = (logs = []) => {
    if (!Array.isArray(logs) || logs.length === 0) {
      return null;
    }

    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLeaves = 0;
    let currentMonthPresent = 0;
    let currentMonthAbsent = 0;

    let lastCheckIn = null;
    let lastCheckOut = null;

    logs.forEach((record) => {
      const status = (record.status || "").toLowerCase();
      const recordDate = record.attendance_date
        ? new Date(record.attendance_date)
        : null;

      if (status === "present" || status === "late" || status === "half-day") {
        totalPresent += status === "half-day" ? 0.5 : 1;
      } else if (status === "absent") {
        totalAbsent += 1;
      } else if (status === "on leave" || status === "leave") {
        totalLeaves += 1;
      }

      if (
        recordDate &&
        recordDate.getFullYear() === year &&
        recordDate.getMonth() === month
      ) {
        if (
          status === "present" ||
          status === "late" ||
          status === "half-day"
        ) {
          currentMonthPresent += status === "half-day" ? 0.5 : 1;
        } else if (status === "absent") {
          currentMonthAbsent += 1;
        }
      }

      if (record.check_in_time && record.attendance_date) {
        const checkInDate = new Date(
          `${record.attendance_date}T${record.check_in_time}`,
        );
        if (!lastCheckIn || checkInDate > lastCheckIn) {
          lastCheckIn = checkInDate;
        }
      }

      if (record.check_out_time && record.attendance_date) {
        const checkOutDate = new Date(
          `${record.attendance_date}T${record.check_out_time}`,
        );
        if (!lastCheckOut || checkOutDate > lastCheckOut) {
          lastCheckOut = checkOutDate;
        }
      }
    });

    const totalDays = totalPresent + totalAbsent + totalLeaves;
    const attendanceRate = totalDays
      ? Math.round((totalPresent / totalDays) * 100)
      : 0;

    return {
      total_present: totalPresent,
      total_absent: totalAbsent,
      total_leaves: totalLeaves,
      attendance_rate: attendanceRate,
      current_month_present: currentMonthPresent,
      current_month_absent: currentMonthAbsent,
      last_check_in: lastCheckIn,
      last_check_out: lastCheckOut,
    };
  };

  const getActivityStatus = (summary, user, realtimeStatus) => {
    if (realtimeStatus) {
      if (realtimeStatus.status === "checked_in") {
        return {
          label: "Checked In",
          tone: "active",
          hint: "Checked in today",
        };
      }

      if (realtimeStatus.status === "checked_out") {
        return {
          label: "Checked Out",
          tone: "idle",
          hint: "Checked out today",
        };
      }

      if (realtimeStatus.status === "not_checked_in") {
        return {
          label: "Not Checked In",
          tone: user?.is_active ? "recent" : "inactive",
          hint: "No check-in recorded today",
        };
      }
    }

    if (!summary || (!summary.last_check_in && !summary.last_check_out)) {
      return {
        label: user?.is_active ? "Active" : "Inactive",
        tone: user?.is_active ? "active" : "inactive",
        hint: "No recent activity recorded",
      };
    }

    const now = new Date();
    const lastCheckIn = summary.last_check_in
      ? new Date(summary.last_check_in)
      : null;
    const lastCheckOut = summary.last_check_out
      ? new Date(summary.last_check_out)
      : null;

    const isToday = (date) =>
      date &&
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (
      lastCheckIn &&
      (!lastCheckOut || lastCheckOut < lastCheckIn) &&
      isToday(lastCheckIn)
    ) {
      return {
        label: "Checked In",
        tone: "active",
        hint: `Last check-in ${lastCheckIn.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      };
    }

    if (lastCheckOut && isToday(lastCheckOut)) {
      return {
        label: "Checked Out",
        tone: "idle",
        hint: `Last check-out ${lastCheckOut.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      };
    }

    const lastSeen = lastCheckOut || lastCheckIn;
    const daysSince = lastSeen
      ? Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24))
      : null;

    if (daysSince !== null && daysSince <= 7) {
      return {
        label: "Recently Active",
        tone: "recent",
        hint: `Last active ${lastSeen.toLocaleDateString("en-IN")}`,
      };
    }

    return {
      label: user?.is_active ? "Active" : "Inactive",
      tone: user?.is_active ? "active" : "inactive",
      hint: lastSeen
        ? `Last active ${lastSeen.toLocaleDateString("en-IN")}`
        : "No recent activity recorded",
    };
  };

  const normalizeLeaveSummary = (balance, requests = []) => {
    if (!balance && (!requests || requests.length === 0)) {
      return null;
    }

    const paidRemaining = Number(
      balance?.paid_time_off_balance ??
        balance?.paid_time_off ??
        balance?.paid_time_off_remaining ??
        0,
    );
    const sickRemaining = Number(
      balance?.sick_time_off_balance ??
        balance?.sick_time_off ??
        balance?.sick_time_off_remaining ??
        0,
    );

    const paidMax = Number(
      balance?.paid_time_off_max ??
        balance?.paid_time_off_total ??
        balance?.paid_time_off_allocated ??
        24,
    );
    const sickMax = Number(
      balance?.sick_time_off_max ??
        balance?.sick_time_off_total ??
        balance?.sick_time_off_allocated ??
        7,
    );

    const usedByType = {
      paid: 0,
      sick: 0,
    };
    let pendingRequests = 0;

    requests.forEach((request) => {
      const status = (request.status || "").toLowerCase();
      const days = Number(request.days_requested ?? request.total_days ?? 0);
      const type = (request.leave_type || "").toLowerCase();

      if (status === "pending") {
        pendingRequests += 1;
      }

      if (status === "approved") {
        if (type.includes("paid")) {
          usedByType.paid += days;
        } else if (type.includes("sick")) {
          usedByType.sick += days;
        }
      }
    });

    const paidAllocated = Math.max(paidRemaining + usedByType.paid, paidMax);
    const sickAllocated = Math.max(sickRemaining + usedByType.sick, sickMax);

    const breakdown = [
      {
        leave_type: "Paid Time Off",
        allocated: paidAllocated,
        used: usedByType.paid,
        remaining: paidRemaining,
      },
      {
        leave_type: "Sick Time Off",
        allocated: sickAllocated,
        used: usedByType.sick,
        remaining: sickRemaining,
      },
    ];

    const totalAllocated = paidAllocated + sickAllocated;
    const remainingLeaves = paidRemaining + sickRemaining;
    const usedLeaves = Math.max(totalAllocated - remainingLeaves, 0);

    return {
      total_allocated: totalAllocated,
      used_leaves: usedLeaves,
      remaining_leaves: remainingLeaves,
      pending_requests: pendingRequests,
      breakdown,
    };
  };

  useEffect(() => {
    if (isOpen && employee) {
      fetchDetailedInfo();
    }
  }, [isOpen, employee]);

  useEffect(() => {
    if (!isOpen || !employee?.user_id) {
      return undefined;
    }

    const refreshStatus = () => fetchLiveStatus();
    refreshStatus();

    const interval = setInterval(refreshStatus, 60000);
    return () => clearInterval(interval);
  }, [isOpen, employee?.user_id]);

  const fetchDetailedInfo = async () => {
    try {
      setLoading(true);

      const userPromise = api.get(`/users/${employee.user_id}`);
      const attendancePromise = api
        .get("/attendance/all", {
          params: { userId: employee.user_id },
        })
        .catch(() => ({ data: { data: [] } }));
      const leaveBalancesPromise = api
        .get("/leave/employees")
        .catch(() => ({ data: { data: [] } }));
      const leaveRequestsPromise = api
        .get("/leave/requests")
        .catch(() => ({ data: { data: [] } }));
      const liveStatusPromise = api
        .get("/attendance/all-status")
        .catch(() => ({ data: { data: {} } }));

      const [
        userResponse,
        attendanceResponse,
        leaveBalancesResponse,
        leaveRequestsResponse,
        liveStatusResponse,
      ] = await Promise.all([
        userPromise,
        attendancePromise,
        leaveBalancesPromise,
        leaveRequestsPromise,
        liveStatusPromise,
      ]);

      const attendanceLogs = attendanceResponse.data.data || [];
      const attendanceSummary = summarizeAttendance(attendanceLogs);

      const balances = leaveBalancesResponse.data.data || [];
      const userBalance = balances.find(
        (balance) => balance.user_id === employee.user_id,
      );

      const requests = (leaveRequestsResponse.data.data || []).filter(
        (request) => request.user_id === employee.user_id,
      );

      const leaveSummary = normalizeLeaveSummary(userBalance, requests);

      const statusMap = liveStatusResponse.data.data || {};
      const statusValue = statusMap[employee.user_id];

      if (statusValue) {
        setLiveStatus({ status: statusValue });
      }

      setDetailedInfo({
        user: userResponse.data.data || employee,
        attendance: attendanceSummary,
        attendanceLogs,
        leave: leaveSummary,
      });
    } catch (error) {
      console.error("Error fetching detailed info:", error);
      setDetailedInfo({
        user: employee,
        attendance: null,
        leave: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveStatus = async () => {
    try {
      const response = await api.get("/attendance/all-status");
      const statusMap = response.data.data || {};
      const statusValue = statusMap[employee.user_id];

      if (statusValue) {
        setLiveStatus({ status: statusValue });
      }
    } catch (error) {
      console.error("Error fetching live status:", error);
    }
  };

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target.className === "employee-details-overlay") {
      onClose();
    }
  };

  const renderPersonalInfo = () => {
    const user = detailedInfo?.user || employee;
    const activityStatus = getActivityStatus(
      detailedInfo?.attendance,
      user,
      liveStatus,
    );
    return (
      <div className="details-section">
        <div className="details-grid">
          <div className="detail-item">
            <div className="detail-label">Full Name</div>
            <div className="detail-value">
              {user.full_name || "Not provided"}
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Email</div>
            <div className="detail-value">{user.email}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Employee Code</div>
            <div className="detail-value">
              {user.employee_code || "Not assigned"}
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Phone Number</div>
            <div className="detail-value">
              {user.phone_number || "Not provided"}
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Department</div>
            <div className="detail-value">
              {user.department || "Not assigned"}
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Designation</div>
            <div className="detail-value">
              {user.designation || "Not assigned"}
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Manager</div>
            <div className="detail-value">{user.manager || "Not assigned"}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Date of Joining</div>
            <div className="detail-value">
              {user.date_of_joining
                ? new Date(user.date_of_joining).toLocaleDateString("en-IN")
                : "Not provided"}
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Date of Birth</div>
            <div className="detail-value">
              {user.date_of_birth
                ? new Date(user.date_of_birth).toLocaleDateString("en-IN")
                : "Not provided"}
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Gender</div>
            <div className="detail-value">{user.gender || "Not provided"}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Address</div>
            <div className="detail-value">{user.address || "Not provided"}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Emergency Contact</div>
            <div className="detail-value">
              {user.emergency_contact || "Not provided"}
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Blood Group</div>
            <div className="detail-value">
              {user.blood_group || "Not provided"}
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Role</div>
            <div className="detail-value">
              <span
                className={`role-badge role-${(user.role || "")
                  .toLowerCase()
                  .replace(" ", "-")}`}
              >
                {user.role || "Employee"}
              </span>
            </div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Account Status</div>
            <div className="detail-value">
              <span className={`status-badge status-${activityStatus.tone}`}>
                {activityStatus.label}
              </span>
              <span className="status-hint">{activityStatus.hint}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAttendanceInfo = () => {
    const attendance = detailedInfo?.attendance;
    const logs = detailedInfo?.attendanceLogs || [];

    if (!attendance && logs.length === 0) {
      return (
        <div className="no-data-message">
          <p>No attendance data available</p>
        </div>
      );
    }

    return (
      <div className="details-section">
        {attendance && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-content">
                <div className="stat-label">Present Days</div>
                <div className="stat-value">
                  {attendance.total_present || 0}
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">❌</div>
              <div className="stat-content">
                <div className="stat-label">Absent Days</div>
                <div className="stat-value">{attendance.total_absent || 0}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏖️</div>
              <div className="stat-content">
                <div className="stat-label">Leave Days</div>
                <div className="stat-value">{attendance.total_leaves || 0}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📊</div>
              <div className="stat-content">
                <div className="stat-label">Attendance Rate</div>
                <div className="stat-value">
                  {attendance.attendance_rate || 0}%
                </div>
              </div>
            </div>
          </div>
        )}

        {attendance && (
          <>
            <div className="detail-row">
              <div className="detail-label">Current Month Present</div>
              <div className="detail-value">
                {attendance.current_month_present || 0} days
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Current Month Absent</div>
              <div className="detail-value">
                {attendance.current_month_absent || 0} days
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Last Check In</div>
              <div className="detail-value">
                {attendance.last_check_in
                  ? new Date(attendance.last_check_in).toLocaleString("en-IN")
                  : "Never"}
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Last Check Out</div>
              <div className="detail-value">
                {attendance.last_check_out
                  ? new Date(attendance.last_check_out).toLocaleString("en-IN")
                  : "Never"}
              </div>
            </div>
          </>
        )}

        <h4 className="subsection-title">Recent Attendance Logs</h4>
        {logs.length > 0 ? (
          <div className="attendance-log-list">
            {logs.slice(0, 5).map((log) => (
              <div
                key={`${log.attendance_id || log.attendance_date}-${log.check_in_time || "na"}`}
                className="attendance-log-item"
              >
                <div className="log-date">
                  {log.attendance_date
                    ? new Date(log.attendance_date).toLocaleDateString("en-IN")
                    : "-"}
                </div>
                <div className="log-time">
                  <span>{log.check_in_time ? log.check_in_time : "--:--"}</span>
                  <span className="log-divider">→</span>
                  <span>
                    {log.check_out_time ? log.check_out_time : "--:--"}
                  </span>
                </div>
                <div className="log-status">
                  {(log.status || "-").toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-data-text">No recent attendance logs</p>
        )}
      </div>
    );
  };

  const renderLeaveInfo = () => {
    const leave = detailedInfo?.leave;

    if (!leave) {
      return (
        <div className="no-data-message">
          <p>No leave data available</p>
        </div>
      );
    }

    return (
      <div className="details-section">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📝</div>
            <div className="stat-content">
              <div className="stat-label">Total Allocation</div>
              <div className="stat-value">
                {leave.total_allocated || 0} days
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✓</div>
            <div className="stat-content">
              <div className="stat-label">Used Leaves</div>
              <div className="stat-value">{leave.used_leaves || 0} days</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🎯</div>
            <div className="stat-content">
              <div className="stat-label">Remaining</div>
              <div className="stat-value">
                {leave.remaining_leaves || 0} days
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⏳</div>
            <div className="stat-content">
              <div className="stat-label">Pending Requests</div>
              <div className="stat-value">{leave.pending_requests || 0}</div>
            </div>
          </div>
        </div>

        <h4 className="subsection-title">Leave Balance by Type</h4>
        {leave.breakdown && leave.breakdown.length > 0 ? (
          <div className="leave-breakdown">
            {leave.breakdown.map((item, index) => (
              <div key={index} className="leave-type-row">
                <div className="leave-type-name">{item.leave_type}</div>
                <div className="leave-type-stats">
                  <span className="leave-allocated">
                    {item.allocated} allocated
                  </span>
                  <span className="leave-used">{item.used} used</span>
                  <span className="leave-remaining">
                    {item.remaining} remaining
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-data-text">No leave types allocated</p>
        )}
      </div>
    );
  };

  return (
    <div className="employee-details-overlay" onClick={handleOverlayClick}>
      <div className="employee-details-modal">
        <div className="modal-header">
          <div className="header-content">
            <div className="employee-avatar-large">
              <div className="avatar-initials">
                {getInitials(
                  (detailedInfo?.user || employee)?.full_name,
                  (detailedInfo?.user || employee)?.email,
                )}
              </div>
            </div>
            <div className="header-info">
              <h2>
                {detailedInfo?.user?.full_name ||
                  detailedInfo?.user?.email ||
                  "Employee"}
              </h2>
              <p className="employee-email">{detailedInfo?.user?.email}</p>
              {detailedInfo?.user?.employee_code && (
                <p className="employee-code-display">
                  ID: {detailedInfo.user.employee_code}
                </p>
              )}
            </div>
          </div>
          <button className="close-button" onClick={onClose}>
            <span>✕</span>
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab-button ${activeTab === "personal" ? "active" : ""}`}
            onClick={() => setActiveTab("personal")}
          >
            👤 Personal Info
          </button>
          <button
            className={`tab-button ${
              activeTab === "attendance" ? "active" : ""
            }`}
            onClick={() => setActiveTab("attendance")}
          >
            📊 Attendance
          </button>
          <button
            className={`tab-button ${activeTab === "leave" ? "active" : ""}`}
            onClick={() => setActiveTab("leave")}
          >
            🏖️ Leave Balance
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading employee details...</p>
            </div>
          ) : (
            <>
              {activeTab === "personal" && renderPersonalInfo()}
              {activeTab === "attendance" && renderAttendanceInfo()}
              {activeTab === "leave" && renderLeaveInfo()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeDetailsModal;
