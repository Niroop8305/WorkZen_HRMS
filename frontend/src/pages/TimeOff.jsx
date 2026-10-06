import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { leaveService } from "../services/authService";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import "../styles/TimeOff.css";

const emptyForm = { leave_type_id: "", start_date: "", end_date: "", reason: "" };

const TimeOff = () => {
  const { user } = useAuth();
  const isManager = user?.role === "Admin" || user?.role === "HR Officer";
  const [types, setTypes] = useState([]);
  const [balance, setBalance] = useState([]);
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: "", status: "", leave_type_id: "", department: "", startDate: "", endDate: "" });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const [typesResponse, balanceResponse] = await Promise.all([
        leaveService.getLeaveTypes(),
        leaveService.getLeaveBalance(),
      ]);
      setTypes(typesResponse.data || []);
      setBalance(balanceResponse.data || []);
      if (isManager) {
        const response = await leaveService.getOrganizationRequests({ ...filters, page, limit: 20 });
        setRequests(response.data || []);
        setPagination(response.pagination || pagination);
      } else {
        const response = await leaveService.getMyLeaves();
        setRequests(response.data || []);
        setPagination({ page: 1, limit: response.data?.length || 0, total: response.data?.length || 0, totalPages: 1 });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load leave data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isManager, page, filters]);

  const updateFilter = (field, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const submitLeave = async (event) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      const response = await leaveService.applyLeave(form);
      setMessage(`Leave submitted for ${response.data.total_days} day(s).`);
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to apply for leave");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (request, status) => {
    const rejectionReason = status === "Rejected"
      ? window.prompt("Enter a rejection reason:")?.trim()
      : undefined;
    if (status === "Rejected" && !rejectionReason) return;
    try {
      await leaveService.updateStatus(request.leave_id, status, rejectionReason);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update leave status");
    }
  };

  const cancelRequest = async (request) => {
    try {
      await leaveService.cancel(request.leave_id);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to cancel leave");
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="timeoff" />
      <main className="dashboard-main">
        <Header title="Leave Management" />
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        {!isManager && (
          <button className="btn-new" type="button" onClick={() => setShowForm(true)}>NEW LEAVE</button>
        )}

        {!isManager && (
          <section className="leave-balance-row">
            {balance.map((item) => (
              <div className="balance-card" key={item.balance_id}>
                <h3>{item.leave_type_name}</h3>
                <p>Allocated: {item.total_allocated}</p>
                <p>Used: {item.used_days}</p>
                <p className="balance-amount">Remaining: {item.remaining_days}</p>
              </div>
            ))}
          </section>
        )}

        {isManager && (
          <div className="action-bar">
            <input placeholder="Search employee" value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} />
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              <option value="">All statuses</option>
              {['Pending', 'Approved', 'Rejected', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}
            </select>
            <select value={filters.leave_type_id} onChange={(event) => updateFilter("leave_type_id", event.target.value)}>
              <option value="">All leave types</option>
              {types.map((type) => <option key={type.leave_type_id} value={type.leave_type_id}>{type.leave_type_name}</option>)}
            </select>
            <input placeholder="Department" value={filters.department} onChange={(event) => updateFilter("department", event.target.value)} />
            <input aria-label="Start date" type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} />
            <input aria-label="End date" type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} />
          </div>
        )}

        <div className="table-container">
          {loading ? <div className="loading">Loading...</div> : requests.length === 0 ? <div className="no-data">No leave requests found</div> : (
            <table className="leave-table">
              <thead><tr>
                {isManager && <th>Employee</th>}<th>Leave Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Rejection Reason</th>{isManager && <th>Actions</th>}
              </tr></thead>
              <tbody>{requests.map((request) => (
                <tr key={request.leave_id}>
                  {isManager && <td>{request.employee_name || request.email}<br /><small>{request.employee_code} · {request.department}</small></td>}
                  <td>{request.leave_type_name || request.leave_type}</td>
                  <td>{request.start_date} to {request.end_date}</td>
                  <td>{request.total_days}</td>
                  <td>{request.reason}</td>
                  <td><span className="status-badge">{request.status}</span></td>
                  <td>{request.rejection_reason || "-"}</td>
                  {isManager && <td>{request.status === "Pending" && <><button onClick={() => updateStatus(request, "Approved")}>Approve</button><button onClick={() => updateStatus(request, "Rejected")}>Reject</button></>}</td>}
                  {!isManager && ["Pending", "Approved"].includes(request.status) && <td><button onClick={() => cancelRequest(request)}>Cancel</button></td>}
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {isManager && pagination.totalPages > 0 && <div className="attendance-pagination">
          <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)</span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>}
      </main>

      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><h2>New Leave Request</h2><button onClick={() => setShowForm(false)}>×</button></div>
        <form onSubmit={submitLeave}>
          <label>Leave Type<select required value={form.leave_type_id} onChange={(event) => setForm({ ...form, leave_type_id: event.target.value })}><option value="">Select leave type</option>{types.map((type) => <option key={type.leave_type_id} value={type.leave_type_id}>{type.leave_type_name}</option>)}</select></label>
          <label>Start Date<input required type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></label>
          <label>End Date<input required type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></label>
          <label>Reason<textarea required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
          <button className="btn-submit" disabled={submitting}>{submitting ? "Submitting..." : "Submit Leave"}</button>
        </form>
      </div></div>}
    </div>
  );
};

export default TimeOff;
