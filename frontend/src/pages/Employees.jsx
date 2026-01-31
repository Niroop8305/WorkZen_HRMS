import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import CreateUserModal from "../components/CreateUserModal";
import EmployeeDetailsModal from "../components/EmployeeDetailsModal";
import { Users, UserPlus, Search, Filter, Download, Eye } from "lucide-react";
import "../styles/App.css";
import "../styles/Employees.css";

const Employees = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("employees");
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [departments, setDepartments] = useState([]);

  const isAdminOrHR = user?.role === "Admin" || user?.role === "HR Officer";

  useEffect(() => {
    if (!isAdminOrHR) {
      navigate("/dashboard");
      return;
    }
    fetchEmployees();
  }, []);

  useEffect(() => {
    filterEmployees();
  }, [searchQuery, departmentFilter, statusFilter, employees]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await api.get("/users");

      const employeeList = response.data.data || [];
      setEmployees(employeeList);
      setFilteredEmployees(employeeList);

      // Extract unique departments
      const uniqueDepts = [
        ...new Set(employeeList.map((e) => e.department).filter(Boolean)),
      ];
      setDepartments(uniqueDepts);
    } catch (error) {
      console.error("Error fetching employees:", error);
      setEmployees([]);
      setFilteredEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const filterEmployees = () => {
    let filtered = [...employees];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (emp) =>
          emp.full_name?.toLowerCase().includes(query) ||
          emp.email?.toLowerCase().includes(query) ||
          emp.employee_code?.toLowerCase().includes(query) ||
          emp.department?.toLowerCase().includes(query) ||
          emp.designation?.toLowerCase().includes(query),
      );
    }

    // Department filter
    if (departmentFilter) {
      filtered = filtered.filter((emp) => emp.department === departmentFilter);
    }

    // Status filter
    if (statusFilter) {
      const isActive = statusFilter === "active";
      filtered = filtered.filter((emp) => emp.is_active === isActive);
    }

    setFilteredEmployees(filtered);
  };

  const handleEmployeeClick = (employee) => {
    setSelectedEmployee(employee);
    setShowDetailsModal(true);
  };

  const handleUserCreated = () => {
    setShowCreateModal(false);
    fetchEmployees();
  };

  const handleExportEmployees = () => {
    // Create CSV content
    const headers = [
      "Employee Code",
      "Name",
      "Email",
      "Department",
      "Designation",
      "Phone",
      "Status",
      "Joining Date",
    ];

    const csvContent = [
      headers.join(","),
      ...filteredEmployees.map((emp) =>
        [
          emp.employee_code || "",
          emp.full_name || "",
          emp.email || "",
          emp.department || "",
          emp.designation || "",
          emp.phone || "",
          emp.is_active ? "Active" : "Inactive",
          emp.date_of_joining || "",
        ].join(","),
      ),
    ].join("\n");

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workzen_employees_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusBadge = (isActive) => {
    return isActive ? (
      <span className="status-badge active">Active</span>
    ) : (
      <span className="status-badge inactive">Inactive</span>
    );
  };

  const getDepartmentColor = (department) => {
    const colors = {
      Engineering: "#4CAF50",
      Design: "#2196F3",
      Product: "#FF9800",
      Sales: "#9C27B0",
      Marketing: "#E91E63",
      Support: "#00BCD4",
      Finance: "#FFC107",
      "Human Resources": "#714B67",
      IT: "#607D8B",
    };
    return colors[department] || "#878787";
  };

  return (
    <div className="dashboard-container">
      <Sidebar activeSection={activeSection} />

      <main className="dashboard-main">
        <Header />

        <div className="employees-content">
          {/* Page Header */}
          <div className="employees-header">
            <div className="header-left">
              <Users className="page-icon" size={32} />
              <div>
                <h1 className="page-title">Employee Management</h1>
                <p className="page-subtitle">
                  Manage your organization's workforce
                </p>
              </div>
            </div>

            <div className="header-actions">
              <button
                className="btn-secondary"
                onClick={handleExportEmployees}
                disabled={filteredEmployees.length === 0}
              >
                <Download size={18} />
                Export CSV
              </button>

              {isAdminOrHR && (
                <button
                  className="btn-primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  <UserPlus size={18} />
                  Add Employee
                </button>
              )}
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div
                className="stat-icon"
                style={{ background: "rgba(76, 175, 80, 0.1)" }}
              >
                <Users size={24} style={{ color: "#4CAF50" }} />
              </div>
              <div className="stat-details">
                <p className="stat-label">Total Employees</p>
                <h3 className="stat-value">{employees.length}</h3>
              </div>
            </div>

            <div className="stat-card">
              <div
                className="stat-icon"
                style={{ background: "rgba(33, 150, 243, 0.1)" }}
              >
                <Users size={24} style={{ color: "#2196F3" }} />
              </div>
              <div className="stat-details">
                <p className="stat-label">Active Employees</p>
                <h3 className="stat-value">
                  {employees.filter((e) => e.is_active).length}
                </h3>
              </div>
            </div>

            <div className="stat-card">
              <div
                className="stat-icon"
                style={{ background: "rgba(255, 152, 0, 0.1)" }}
              >
                <Users size={24} style={{ color: "#FF9800" }} />
              </div>
              <div className="stat-details">
                <p className="stat-label">Departments</p>
                <h3 className="stat-value">{departments.length}</h3>
              </div>
            </div>

            <div className="stat-card">
              <div
                className="stat-icon"
                style={{ background: "rgba(113, 75, 103, 0.1)" }}
              >
                <Filter size={24} style={{ color: "#714B67" }} />
              </div>
              <div className="stat-details">
                <p className="stat-label">Filtered Results</p>
                <h3 className="stat-value">{filteredEmployees.length}</h3>
              </div>
            </div>
          </div>

          {/* Filters Section */}
          <div className="filters-section">
            <div className="search-box">
              <Search size={20} />
              <input
                type="text"
                placeholder="Search by name, email, code, department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            {(searchQuery || departmentFilter || statusFilter) && (
              <button
                className="btn-clear-filters"
                onClick={() => {
                  setSearchQuery("");
                  setDepartmentFilter("");
                  setStatusFilter("");
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Employees Table */}
          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading employees...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="empty-state">
              <Users size={64} className="empty-icon" />
              <h3>No employees found</h3>
              <p>
                {searchQuery || departmentFilter || statusFilter
                  ? "Try adjusting your filters"
                  : "Get started by adding your first employee"}
              </p>
              {isAdminOrHR && !searchQuery && !departmentFilter && (
                <button
                  className="btn-primary"
                  onClick={() => setShowCreateModal(true)}
                  style={{ marginTop: "1rem" }}
                >
                  <UserPlus size={18} />
                  Add Employee
                </button>
              )}
            </div>
          ) : (
            <div className="employees-table-container">
              <table className="employees-table">
                <thead>
                  <tr>
                    <th>Employee Code</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((employee) => (
                    <tr key={employee.user_id}>
                      <td>
                        <span className="employee-code">
                          {employee.employee_code || "N/A"}
                        </span>
                      </td>
                      <td>
                        <div className="employee-name-cell">
                          <div
                            className="employee-avatar"
                            style={{
                              background: getDepartmentColor(
                                employee.department,
                              ),
                            }}
                          >
                            {employee.full_name?.charAt(0)?.toUpperCase() ||
                              "?"}
                          </div>
                          <span className="employee-name">
                            {employee.full_name || "Unknown"}
                          </span>
                        </div>
                      </td>
                      <td className="email-cell">{employee.email}</td>
                      <td>
                        <span
                          className="department-badge"
                          style={{
                            background: `${getDepartmentColor(employee.department)}20`,
                            color: getDepartmentColor(employee.department),
                          }}
                        >
                          {employee.department || "Not Set"}
                        </span>
                      </td>
                      <td className="designation-cell">
                        {employee.designation || "Not Set"}
                      </td>
                      <td className="phone-cell">{employee.phone || "N/A"}</td>
                      <td>{getStatusBadge(employee.is_active)}</td>
                      <td>
                        <button
                          className="btn-action"
                          onClick={() => handleEmployeeClick(employee)}
                          title="View Details"
                        >
                          <Eye size={18} />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onUserCreated={handleUserCreated}
        />
      )}

      {showDetailsModal && selectedEmployee && (
        <EmployeeDetailsModal
          employee={selectedEmployee}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedEmployee(null);
          }}
          onUpdate={fetchEmployees}
        />
      )}
    </div>
  );
};

export default Employees;
