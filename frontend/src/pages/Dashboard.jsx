import { useState, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import CreateUserModal from "../components/CreateUserModal";
import EmployeeDetailsModal from "../components/EmployeeDetailsModal";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

const EMPLOYEES_PAGE_SIZE = 24;


// Initials avatars: deterministic gradient pair per employee so the directory
// no longer renders a wall of identical blue silhouettes.
const AVATAR_TONES = ["indigo", "emerald", "sky", "amber", "rose", "violet"];

const getEmployeeInitials = (employee) => {
  const name = String(employee?.full_name || employee?.email || "?").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const avatarToneIndex = (employee) => {
  const key = String(
    employee?.employee_code || employee?.full_name || employee?.email || "",
  );
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  }
  return hash % AVATAR_TONES.length;
};

const Dashboard = () => {
  const { user, logout } = useAuth();
  // D-2: Employees have their own dashboard; landing here would fire
  // org-wide requests they are not authorized for.
  if (user?.role === "Employee") {
    return <Navigate to="/employee/dashboard" replace />;
  }
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("employees");
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEmployeeDetails, setShowEmployeeDetails] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [attendanceStatus, setAttendanceStatus] = useState("not_checked_in");
  const [attendanceData, setAttendanceData] = useState(null);
  const [employeeAttendance, setEmployeeAttendance] = useState({});
  const [activeLeaves, setActiveLeaves] = useState({});
  const profileMenuRef = useRef(null);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleProfileClick = () => {
    setShowProfileMenu(!showProfileMenu);
  };

  const handleMyProfile = () => {
    setShowProfileMenu(false);
    // Navigate to profile page or open profile modal
    console.log("Navigate to My Profile");
  };

  const getUserInitial = () => {
    return (
      user?.profile?.full_name?.charAt(0)?.toUpperCase() ||
      user?.email?.charAt(0)?.toUpperCase() ||
      "U"
    );
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch employees from API
  useEffect(() => {
    fetchEmployees();
    fetchAttendanceStatus();
    // Org-wide leave indicators are Admin/HR scope; a Payroll Officer must not
    // fire a guaranteed 403 on every dashboard load (same policy as T-016).
    if (user?.role !== "Payroll Officer") {
      fetchActiveLeaves();
    }

    // Refresh attendance status every 30 seconds
    const interval = setInterval(() => {
      fetchAttendanceStatus();
      if (user?.role !== "Payroll Officer") {
        fetchActiveLeaves();
      }
      if (employees.length > 0) {
        fetchAllEmployeesAttendance(employees);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [employees.length]);

  const fetchAttendanceStatus = async () => {
    try {
      const response = await api.get("/attendance/status");
      setAttendanceStatus(response.data.data.status);
      setAttendanceData(response.data.data);
    } catch (error) {
      console.error("Error fetching attendance status:", error);
    }
  };

  const fetchActiveLeaves = async () => {
    try {
      const response = await api.get("/leave/active-leaves");
      if (response.data.success) {
        const activeLeaveMap = (response.data.data || []).reduce(
          (result, leave) => ({ ...result, [leave.employee_id]: leave }),
          {},
        );
        setActiveLeaves(activeLeaveMap);
      }
    } catch (error) {
      console.error("Error fetching active leaves:", error);
      setActiveLeaves({});
    }
  };

  const fetchAllEmployeesAttendance = async (employeeList) => {
    try {
      const response = await api.get("/attendance/all-status");

      console.log("All employees attendance response:", response.data);

      if (response.data.success) {
        // Map the attendance status: checked_in -> online, others -> offline
        const attendanceMap = {};
        Object.keys(response.data.data).forEach((userId) => {
          const status = response.data.data[userId];
          attendanceMap[userId] =
            status === "checked_in" ? "online" : "offline";
        });
        console.log("Setting employee attendance map:", attendanceMap);
        setEmployeeAttendance(attendanceMap);
      }
    } catch (error) {
      console.error("Error fetching employees attendance:", error);
      console.error("Error details:", error.response?.data);
      // Fallback to offline for all
      const attendanceMap = {};
      employeeList.forEach((emp) => {
        attendanceMap[emp.user_id] = "offline";
      });
      setEmployeeAttendance(attendanceMap);
    }
  };

  const handleCheckInOut = async () => {
    try {
      const endpoint =
        attendanceStatus === "checked_in"
          ? "/attendance/check-out"
          : "/attendance/check-in";

      const response = await api.post(endpoint, {});

      if (response.data.success) {
        setAttendanceStatus(response.data.data.status);
        setAttendanceData(response.data.data);
        alert(response.data.message);

        // Refresh all employees' attendance status
        if (employees.length > 0) {
          await fetchAllEmployeesAttendance(employees);
        }
      }
    } catch (error) {
      console.error("Error during check-in/out:", error);
      alert(error.response?.data?.message || "Failed to process attendance");
    }
  };

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await api.get("/users");
      const employeeList = response.data.data || [];
      setEmployees(employeeList);

      // Fetch attendance for employees
      await fetchAllEmployeesAttendance(employeeList);
    } catch (error) {
      console.error("Error fetching employees:", error);
      // If unauthorized, keep empty array
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUserCreated = () => {
    // Refresh the employee list after creating a new user
    fetchEmployees();
  };

  const handleEmployeeCardClick = (employee) => {
    setSelectedEmployee(employee);
    setShowEmployeeDetails(true);
  };

  const handleCloseEmployeeDetails = () => {
    setShowEmployeeDetails(false);
    setSelectedEmployee(null);
  };

  // Get user's attendance status for display
  const getUserAttendanceStatus = () => {
    if (attendanceStatus === "checked_in") {
      return "online"; // Green dot - checked in
    }
    return "offline"; // Yellow dot - checked out or not checked in yet
  };

  const userStatus = getUserAttendanceStatus();

  // Render status indicator with tooltip
  const renderStatusIndicator = (status) => {
    if (status === "leave") {
      return <span className="status-icon status-leave">✈</span>;
    }
    return <span className={`status-dot status-${status}`}></span>;
  };

  // Get status label for tooltip
  const getStatusLabel = () => {
    if (attendanceStatus === "checked_in") {
      return "Checked In - Click to Check Out";
    }
    return "Not Checked In - Click to Check In";
  };

  // Get employee card status (for displaying in employee cards)
  const getEmployeeStatus = (employee) => {
    // Check if employee is on approved leave
    console.log(`Checking employee ${employee.user_id}:`, {
      isOnLeave: !!activeLeaves[employee.user_id],
      activeLeaves: activeLeaves,
      employeeUserId: employee.user_id,
    });

    if (activeLeaves[employee.user_id]) {
      console.log(`Employee ${employee.user_id} is on leave!`);
      return "leave";
    }
    // Check attendance status
    return employeeAttendance[employee.user_id] || "offline";
  };

  // Define navigation items based on user role
  const allNavItems = [
    {
      id: "employees",
      label: "Employees",
      hasSubItems: false,
      path: "/dashboard",
      roles: ["Admin", "HR Officer", "Payroll Officer"],
    },
    {
      id: "attendance",
      label: "Attendance",
      hasSubItems: false,
      path: "/attendance",
      roles: ["Admin", "HR Officer", "Payroll Officer", "Employee"],
    },
    {
      id: "timeoff",
      label: "Time Off",
      hasSubItems: false,
      path: "/timeoff",
      roles: ["Admin", "HR Officer", "Payroll Officer", "Employee"],
    },
    {
      id: "payroll",
      label: "Payroll",
      hasSubItems: false,
      path: "/payroll",
      roles: ["Admin", "HR Officer", "Payroll Officer", "Employee"],
    },
    {
      id: "reports",
      label: "Reports",
      hasSubItems: false,
      path: "/reports",
      roles: ["Admin", "HR Officer", "Payroll Officer"],
    },
  ];

  // Filter nav items based on user role
  const navItems = allNavItems.filter((item) =>
    item.roles.includes(user?.role || "Employee"),
  );

  const handleNavClick = (item) => {
    if (item.path) {
      navigate(item.path);
    } else {
      setActiveSection(item.id);
    }
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredEmployees = query
    ? employees.filter((employee) =>
        [employee.full_name, employee.email, employee.employee_code]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      )
    : employees;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredEmployees.length / EMPLOYEES_PAGE_SIZE)
  );
  // A filter change can leave the stored page past the end of the new list.
  const page = Math.min(currentPage, totalPages);
  const visibleEmployees = filteredEmployees.slice(
    (page - 1) * EMPLOYEES_PAGE_SIZE,
    page * EMPLOYEES_PAGE_SIZE
  );

  return (
    <div className="dashboard-layout">
      {/* Left Sidebar Navigation */}
      <Sidebar activeSection={activeSection} />

      {/* Main Content Area */}
      <main className="dashboard-main">
        {/* Top Header Bar */}
        <header className="dashboard-header">
          <div className="header-left">
            {user?.role === "Admin" && (
              <button
                className="btn-new"
                onClick={() => setShowCreateUserModal(true)}
              >
                NEW
              </button>
            )}
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
          <div className="header-right">
            <div className="header-user-info" style={{ textAlign: "right" }}>
              <span className="header-user-name" style={{ fontSize: "13px" }}>
                {user?.profile?.full_name || user?.email || "User"}
              </span>
              <span className="header-user-role">{user?.role || ""}</span>
            </div>
            <button
              className="btn-icon btn-status"
              onClick={handleCheckInOut}
              title={getStatusLabel()}
            >
              {renderStatusIndicator(userStatus)}
            </button>
            <div className="profile-menu-container" ref={profileMenuRef}>
              <button
                className="btn-icon btn-profile"
                onClick={handleProfileClick}
                title="Profile Menu"
              >
                {getUserInitial()}
              </button>
              {showProfileMenu && (
                <div className="profile-dropdown">
                  <button
                    className="profile-menu-item"
                    onClick={() => {
                      handleMyProfile();
                      navigate("/profile");
                    }}
                  >
                    <span>👤</span> My Profile
                  </button>
                  <button className="profile-menu-item" onClick={handleLogout}>
                    <span>⏻</span> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Employee Cards Grid */}
        <div className="employee-grid">
          {loading ? (
            <div className="loading-message">Loading employees...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="no-data-message">
              {query ? "No employees match this search" : "No employees found"}
            </div>
          ) : (
            visibleEmployees.map((employee) => (
              <div
                key={employee.user_id}
                className="employee-card"
                onClick={() => handleEmployeeCardClick(employee)}
                style={{ cursor: "pointer" }}
              >
                <div className="employee-status-indicator">
                  {renderStatusIndicator(getEmployeeStatus(employee))}
                </div>
                <div
                  className={`employee-avatar avatar-gradient-${avatarToneIndex(employee)}`}
                  aria-hidden="true"
                >
                  {getEmployeeInitials(employee)}
                </div>
                <div className="employee-info">
                  <span className="employee-name">
                    {employee.full_name || employee.email}
                  </span>
                  {employee.employee_code && (
                    <span className="employee-code">
                      {employee.employee_code}
                      {employee.department
                        ? ` · ${employee.department}`
                        : ""}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {!loading && totalPages > 1 && (
          <div className="employee-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setCurrentPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages} ({filteredEmployees.length}{" "}
              {query ? "matching" : "employees"})
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setCurrentPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}

        {/* Create User Modal */}
        <CreateUserModal
          isOpen={showCreateUserModal}
          onClose={() => setShowCreateUserModal(false)}
          onUserCreated={handleUserCreated}
        />

        {/* Employee Details Modal */}
        <EmployeeDetailsModal
          isOpen={showEmployeeDetails}
          onClose={handleCloseEmployeeDetails}
          employee={selectedEmployee}
          onUserUpdated={fetchEmployees}
        />
      </main>
    </div>
  );
};

export default Dashboard;
