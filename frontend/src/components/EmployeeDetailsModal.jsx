import React, { useState, useEffect } from "react";
import axios from "axios";
import "../styles/EmployeeDetailsModal.css";

const EmployeeDetailsModal = ({ isOpen, onClose, employee }) => {
  const [detailedInfo, setDetailedInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");

  useEffect(() => {
    if (isOpen && employee) {
      fetchDetailedInfo();
    }
  }, [isOpen, employee]);

  const fetchDetailedInfo = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("workzen_token");

      // Fetch user details
      const userResponse = await axios.get(
        `http://localhost:5000/api/users/${employee.user_id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Fetch attendance summary
      const attendanceResponse = await axios
        .get(
          `http://localhost:5000/api/attendance/user/${employee.user_id}/summary`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        .catch(() => ({ data: { data: null } }));

      // Fetch leave balance
      const leaveResponse = await axios
        .get(
          `http://localhost:5000/api/leave/user/${employee.user_id}/balance`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        .catch(() => ({ data: { data: null } }));

      setDetailedInfo({
        user: userResponse.data.data || employee,
        attendance: attendanceResponse.data.data,
        leave: leaveResponse.data.data,
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

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target.className === "employee-details-overlay") {
      onClose();
    }
  };

  const renderPersonalInfo = () => {
    const user = detailedInfo?.user || employee;
    return (
      <div className="details-section">
        <div className="detail-row">
          <div className="detail-label">Full Name</div>
          <div className="detail-value">{user.full_name || "Not provided"}</div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Email</div>
          <div className="detail-value">{user.email}</div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Employee Code</div>
          <div className="detail-value">
            {user.employee_code || "Not assigned"}
          </div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Phone Number</div>
          <div className="detail-value">
            {user.phone_number || "Not provided"}
          </div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Department</div>
          <div className="detail-value">
            {user.department || "Not assigned"}
          </div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Designation</div>
          <div className="detail-value">
            {user.designation || "Not assigned"}
          </div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Manager</div>
          <div className="detail-value">{user.manager || "Not assigned"}</div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Date of Joining</div>
          <div className="detail-value">
            {user.date_of_joining
              ? new Date(user.date_of_joining).toLocaleDateString("en-IN")
              : "Not provided"}
          </div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Date of Birth</div>
          <div className="detail-value">
            {user.date_of_birth
              ? new Date(user.date_of_birth).toLocaleDateString("en-IN")
              : "Not provided"}
          </div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Gender</div>
          <div className="detail-value">{user.gender || "Not provided"}</div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Address</div>
          <div className="detail-value">{user.address || "Not provided"}</div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Emergency Contact</div>
          <div className="detail-value">
            {user.emergency_contact || "Not provided"}
          </div>
        </div>
        <div className="detail-row">
          <div className="detail-label">Blood Group</div>
          <div className="detail-value">
            {user.blood_group || "Not provided"}
          </div>
        </div>
        <div className="detail-row">
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
        <div className="detail-row">
          <div className="detail-label">Account Status</div>
          <div className="detail-value">
            <span
              className={`status-badge status-${
                user.is_active ? "active" : "inactive"
              }`}
            >
              {user.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderAttendanceInfo = () => {
    const attendance = detailedInfo?.attendance;

    if (!attendance) {
      return (
        <div className="no-data-message">
          <p>No attendance data available</p>
        </div>
      );
    }

    return (
      <div className="details-section">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <div className="stat-label">Present Days</div>
              <div className="stat-value">{attendance.total_present || 0}</div>
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
              <svg width="80" height="80" viewBox="0 0 85 85">
                <rect width="85" height="85" fill="#714b67" rx="8" />
                <circle cx="42.5" cy="33" r="13" fill="white" />
                <path
                  d="M 25 62 Q 25 50 42.5 50 Q 60 50 60 62 L 60 75 L 25 75 Z"
                  fill="white"
                />
              </svg>
            </div>
            <div className="header-info">
              <h2>{employee?.full_name || employee?.email || "Employee"}</h2>
              <p className="employee-email">{employee?.email}</p>
              {employee?.employee_code && (
                <p className="employee-code-display">
                  ID: {employee.employee_code}
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
