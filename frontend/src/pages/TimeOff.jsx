import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import "../styles/TimeOff.css";

const TimeOff = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("timeoff");
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "" = All, "Approved", "Rejected", "Pending"
  const [showModal, setShowModal] = useState(false);
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const [newRequest, setNewRequest] = useState({
    start_date: "",
    end_date: "",
    leave_type: "Paid Time Off",
    reason: "",
    allocation: 0,
  });
  const [allocationError, setAllocationError] = useState("");
  const [newAllocation, setNewAllocation] = useState({
    user_id: "",
    leave_type: "Paid Time Off",
    days_allocated: "",
    reason: "",
  });

  const isAdminOrHR = user?.role === "Admin" || user?.role === "HR Officer";

  useEffect(() => {
    fetchLeaveData();
    if (isAdminOrHR) {
      fetchEmployees();
    }
  }, []);

  const fetchLeaveData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("workzen_token");

      // Fetch leave requests
      const requestsResponse = await axios.get(
        "http://localhost:5000/api/leave/requests",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setLeaveRequests(requestsResponse.data.data || []);

      // Fetch leave balance
      const balanceResponse = await axios.get(
        "http://localhost:5000/api/leave/balance",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setLeaveBalance(balanceResponse.data.data);
    } catch (error) {
      console.error("Error fetching leave data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem("workzen_token");
      const response = await axios.get(
        "http://localhost:5000/api/leave/employees",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setEmployees(response.data.data || []);
    } catch (error) {
      console.error("Error fetching employees:", error);
    }
  };

  // Calculate allocation days based on start and end date
  const calculateAllocation = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;
    const diffTime = Math.abs(end - start);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return days;
  };

  // Validate allocation against threshold
  const validateAllocation = (days, leaveType) => {
    if (!leaveBalance) return { valid: true, message: "" };

    const availableDays =
      leaveType === "Paid Time Off"
        ? leaveBalance.paid_time_off
        : leaveBalance.sick_time_off;

    const maxThreshold = leaveType === "Paid Time Off" ? 24.0 : 7.0;

    if (days > availableDays) {
      return {
        valid: false,
        message: `Leave cannot be granted! You only have ${availableDays} days available out of ${maxThreshold} days threshold for ${leaveType}.`,
      };
    }

    return { valid: true, message: "" };
  };

  // Handle date changes and recalculate allocation
  const handleDateChange = (field, value) => {
    const updatedRequest = { ...newRequest, [field]: value };

    if (field === "start_date" || field === "end_date") {
      const days = calculateAllocation(
        field === "start_date" ? value : newRequest.start_date,
        field === "end_date" ? value : newRequest.end_date
      );
      updatedRequest.allocation = days;

      // Validate allocation
      const validation = validateAllocation(days, newRequest.leave_type);
      setAllocationError(validation.valid ? "" : validation.message);
    }

    setNewRequest(updatedRequest);
  };

  // Handle leave type change and revalidate
  const handleLeaveTypeChange = (value) => {
    const updatedRequest = { ...newRequest, leave_type: value };
    setNewRequest(updatedRequest);

    // Revalidate with new leave type
    if (updatedRequest.allocation > 0) {
      const validation = validateAllocation(updatedRequest.allocation, value);
      setAllocationError(validation.valid ? "" : validation.message);
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();

    // Final validation before submission
    if (allocationError) {
      alert(allocationError);
      return;
    }

    if (newRequest.allocation === 0) {
      alert("Please select valid start and end dates.");
      return;
    }

    try {
      const token = localStorage.getItem("workzen_token");
      await axios.post("http://localhost:5000/api/leave/request", newRequest, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setShowModal(false);
      setNewRequest({
        start_date: "",
        end_date: "",
        leave_type: "Paid Time Off",
        reason: "",
        allocation: 0,
      });
      setAllocationError("");
      fetchLeaveData();
      alert("Leave request submitted successfully!");
    } catch (error) {
      console.error("Error submitting request:", error);
      alert(error.response?.data?.message || "Error submitting leave request");
    }
  };

  const handleApproveReject = async (requestId, status) => {
    if (
      !window.confirm(
        `Are you sure you want to ${status.toLowerCase()} this request?`
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("workzen_token");
      await axios.put(
        `http://localhost:5000/api/leave/request/${requestId}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchLeaveData();
      alert(`Request ${status.toLowerCase()} successfully!`);
    } catch (error) {
      console.error("Error updating request:", error);
      alert(error.response?.data?.message || "Error updating request");
    }
  };

  const handleSubmitAllocation = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("workzen_token");
      await axios.post(
        "http://localhost:5000/api/leave/allocate",
        newAllocation,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setShowAllocationModal(false);
      setNewAllocation({
        user_id: "",
        leave_type: "Paid Time Off",
        days_allocated: "",
        reason: "",
      });
      fetchLeaveData();
      fetchEmployees();
      alert("Leave allocation successful!");
    } catch (error) {
      console.error("Error allocating leave:", error);
      alert(error.response?.data?.message || "Error allocating leave");
    }
  };

  const filteredRequests = leaveRequests.filter((req) => {
    // Filter by search query
    const matchesSearch =
      req.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.email?.toLowerCase().includes(searchQuery.toLowerCase());

    // Filter by status
    const matchesStatus = statusFilter === "" || req.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusStyle = (status) => {
    const styles = {
      Pending: { backgroundColor: "#FFA500", color: "#fff" },
      Approved: { backgroundColor: "#28a745", color: "#fff" },
      Rejected: { backgroundColor: "#dc3545", color: "#fff" },
    };
    return styles[status] || {};
  };

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="timeoff" />

      {/* Main Content */}
      <main className="dashboard-main">
        <Header title="Time Off Management" />
        {/* Action Bar */}
        <div className="action-bar">
          <button className="btn-new" onClick={() => setShowModal(true)}>
            NEW
          </button>
          <input
            type="text"
            className="search-bar"
            placeholder="Searchbar"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="header-actions">
            <button
              className={`btn-filter btn-reject ${
                statusFilter === "Rejected" ? "active" : ""
              }`}
              title="Show Rejected"
              onClick={() =>
                setStatusFilter(statusFilter === "Rejected" ? "" : "Rejected")
              }
            >
              REJECT
            </button>
            <button
              className={`btn-filter btn-approve ${
                statusFilter === "Approved" ? "active" : ""
              }`}
              title="Show Approved"
              onClick={() =>
                setStatusFilter(statusFilter === "Approved" ? "" : "Approved")
              }
            >
              APPROVE
            </button>
          </div>
        </div>

        {/* Leave Balance Display */}
        {leaveBalance && (
          <div className="leave-balance-row">
            <div className="balance-card">
              <h3>Paid Time Off</h3>
              <p className="balance-amount">
                {leaveBalance.paid_time_off} Days Available
              </p>
            </div>
            <div className="balance-card">
              <h3>Sick Time Off</h3>
              <p className="balance-amount">
                {leaveBalance.sick_time_off} Days Available
              </p>
            </div>
          </div>
        )}

        {/* Leave Requests Table */}
        <div className="table-container">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="no-data">No leave requests found</div>
          ) : (
            <table className="leave-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Time off Type</th>
                  <th>Allocation</th>
                  <th>Status</th>
                  {isAdminOrHR && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.full_name || "[Emp Name]"}</td>
                    <td>{new Date(request.start_date).toLocaleDateString()}</td>
                    <td>{new Date(request.end_date).toLocaleDateString()}</td>
                    <td>{request.leave_type}</td>
                    <td>{request.days_requested || 0} days</td>
                    <td>
                      <span
                        className="status-badge"
                        style={getStatusStyle(request.status)}
                      >
                        {request.status}
                      </span>
                    </td>
                    {isAdminOrHR && (
                      <td>
                        {request.status === "Pending" && (
                          <div className="action-buttons">
                            <button
                              className="btn-reject-small"
                              onClick={() =>
                                handleApproveReject(request.id, "Rejected")
                              }
                              title="Reject"
                            >
                              ✕
                            </button>
                            <button
                              className="btn-approve-small"
                              onClick={() =>
                                handleApproveReject(request.id, "Approved")
                              }
                              title="Approve"
                            >
                              ✓
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Modal for New Request */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Time Off Request</h2>
              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmitRequest}>
              <div className="form-group">
                <label>Leave Type</label>
                <select
                  value={newRequest.leave_type}
                  onChange={(e) => handleLeaveTypeChange(e.target.value)}
                  required
                >
                  <option value="Paid Time Off">Paid Time Off</option>
                  <option value="Sick Time Off">Sick Time Off</option>
                </select>
                {leaveBalance && (
                  <small
                    style={{
                      color: "#888",
                      marginTop: "5px",
                      display: "block",
                    }}
                  >
                    Available:{" "}
                    {newRequest.leave_type === "Paid Time Off"
                      ? leaveBalance.paid_time_off
                      : leaveBalance.sick_time_off}{" "}
                    days (Threshold:{" "}
                    {newRequest.leave_type === "Paid Time Off"
                      ? "24.00"
                      : "7.00"}{" "}
                    days)
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <input
                  type="date"
                  value={newRequest.start_date}
                  onChange={(e) =>
                    handleDateChange("start_date", e.target.value)
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input
                  type="date"
                  value={newRequest.end_date}
                  onChange={(e) => handleDateChange("end_date", e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Allocation</label>
                <input
                  type="text"
                  value={
                    newRequest.allocation > 0
                      ? `${newRequest.allocation} days`
                      : ""
                  }
                  readOnly
                  placeholder="Select dates to calculate allocation"
                  style={{
                    backgroundColor: "#f5f5f5",
                    cursor: "not-allowed",
                    color: allocationError ? "#f44336" : "#333",
                    fontWeight: allocationError ? "600" : "normal",
                  }}
                />
                {allocationError && (
                  <small
                    style={{
                      color: "#f44336",
                      marginTop: "5px",
                      display: "block",
                      fontWeight: "600",
                    }}
                  >
                    ⚠️ {allocationError}
                  </small>
                )}
                {!allocationError && newRequest.allocation > 0 && (
                  <small
                    style={{
                      color: "#4CAF50",
                      marginTop: "5px",
                      display: "block",
                    }}
                  >
                    ✓ Allocation is within threshold
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Reason (Optional)</label>
                <textarea
                  value={newRequest.reason}
                  onChange={(e) =>
                    setNewRequest({ ...newRequest, reason: e.target.value })
                  }
                  rows="3"
                  placeholder="Enter reason for leave..."
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-submit">
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for New Allocation */}
      {showAllocationModal && isAdminOrHR && (
        <div
          className="modal-overlay"
          onClick={() => setShowAllocationModal(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Allocate Leave Days</h2>
              <button
                className="modal-close"
                onClick={() => setShowAllocationModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmitAllocation}>
              <div className="form-group">
                <label>Employee</label>
                <select
                  value={newAllocation.user_id}
                  onChange={(e) =>
                    setNewAllocation({
                      ...newAllocation,
                      user_id: e.target.value,
                    })
                  }
                  required
                >
                  <option value="">Select Employee</option>
                  {employees.map((emp) => (
                    <option key={emp.user_id} value={emp.user_id}>
                      {emp.employee_name} ({emp.employee_code || "N/A"})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Leave Type</label>
                <select
                  value={newAllocation.leave_type}
                  onChange={(e) =>
                    setNewAllocation({
                      ...newAllocation,
                      leave_type: e.target.value,
                    })
                  }
                  required
                >
                  <option value="Paid Time Off">Paid Time Off</option>
                  <option value="Sick Time Off">Sick Time Off</option>
                </select>
              </div>
              <div className="form-group">
                <label>Days to Allocate</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={newAllocation.days_allocated}
                  onChange={(e) =>
                    setNewAllocation({
                      ...newAllocation,
                      days_allocated: e.target.value,
                    })
                  }
                  placeholder="e.g., 5"
                  required
                />
                <small
                  style={{ color: "#888", marginTop: "5px", display: "block" }}
                >
                  Maximum threshold: Paid Time Off (30 days), Sick Time Off (15
                  days)
                </small>
              </div>
              <div className="form-group">
                <label>Reason (Optional)</label>
                <textarea
                  value={newAllocation.reason}
                  onChange={(e) =>
                    setNewAllocation({
                      ...newAllocation,
                      reason: e.target.value,
                    })
                  }
                  rows="3"
                  placeholder="Reason for allocation (e.g., Bonus leave, Compensation)..."
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowAllocationModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-submit">
                  Allocate Leave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeOff;
