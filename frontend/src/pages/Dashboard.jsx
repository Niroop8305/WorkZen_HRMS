import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import CreateUserModal from "../components/CreateUserModal";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("employees");
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attendanceStatus, setAttendanceStatus] = useState("not_checked_in");
  const [attendanceData, setAttendanceData] = useState(null);
  const [employeeAttendance, setEmployeeAttendance] = useState({});
  const [activeLeaves, setActiveLeaves] = useState({});
  const profileMenuRef = useRef(null);

  const handleLogout = () => {
    logout();
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
    fetchActiveLeaves();

    // Refresh attendance status every 30 seconds
    const interval = setInterval(() => {
      fetchAttendanceStatus();
      fetchActiveLeaves();
      if (employees.length > 0) {
        fetchAllEmployeesAttendance(employees);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [employees.length]);

  const fetchAttendanceStatus = async () => {
    try {
      const token = localStorage.getItem("workzen_token");
      const response = await axios.get(
        "http://localhost:5000/api/attendance/status",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setAttendanceStatus(response.data.data.status);
      setAttendanceData(response.data.data);
    } catch (error) {
      console.error("Error fetching attendance status:", error);
    }
  };

  const fetchActiveLeaves = async () => {
    try {
      const token = localStorage.getItem("workzen_token");
      const response = await axios.get(
        "http://localhost:5000/api/leave/active-leaves",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      console.log("Active leaves response:", response.data);
      if (response.data.success) {
        console.log("Setting active leaves:", response.data.data);
        setActiveLeaves(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching active leaves:", error);
      setActiveLeaves({});
    }
  };

  const fetchAllEmployeesAttendance = async (employeeList) => {
    try {
      const token = localStorage.getItem("workzen_token");
      const response = await axios.get(
        "http://localhost:5000/api/attendance/all-status",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

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
      const token = localStorage.getItem("workzen_token");
      const endpoint =
        attendanceStatus === "checked_in"
          ? "/api/attendance/check-out"
          : "/api/attendance/check-in";

      const response = await axios.post(
        `http://localhost:5000${endpoint}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

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
      const token = localStorage.getItem("workzen_token");
      const response = await axios.get("http://localhost:5000/api/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
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
      path: null,
      roles: ["Admin", "HR Manager", "Payroll Officer"],
    },
    {
      id: "attendance",
      label: "Attendance",
      hasSubItems: false,
      path: "/attendance",
      roles: ["Admin", "HR Manager", "Payroll Officer", "Employee"],
    },
    {
      id: "timeoff",
      label: "Time Off",
      hasSubItems: false,
      path: null,
      roles: ["Admin", "HR Manager", "Payroll Officer", "Employee"],
    },
    {
      id: "payroll",
      label: "Payroll",
      hasSubItems: false,
      path: null,
      roles: ["Admin", "HR Manager", "Payroll Officer", "Employee"],
    },
    {
      id: "reports",
      label: "Reports",
      hasSubItems: false,
      path: null,
      roles: ["Admin", "HR Manager", "Payroll Officer"],
    },
  ];

  // Filter nav items based on user role
  const navItems = allNavItems.filter((item) =>
    item.roles.includes(user?.role || user?.roleName || "Employee")
  );

  const handleNavClick = (item) => {
    if (item.path) {
      navigate(item.path);
    } else {
      setActiveSection(item.id);
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Left Sidebar Navigation */}
      <Sidebar activeSection={activeSection} />

      {/* Main Content Area */}
      <main className="dashboard-main">
        {/* Top Header Bar */}
        <header className="dashboard-header">
          <div className="header-left">
            {(user?.role === "Admin" || user?.roleName === "Admin") && (
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
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="header-right">
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
          ) : employees.length === 0 ? (
            <div className="no-data-message">No employees found</div>
          ) : (
            employees.map((employee) => (
              <div key={employee.user_id} className="employee-card">
                <div className="employee-status-indicator">
                  {renderStatusIndicator(getEmployeeStatus(employee))}
                </div>
                <div className="employee-avatar">
                  <svg width="85" height="85" viewBox="0 0 85 85">
                    <rect width="85" height="85" fill="#4A90E2" rx="8" />
                    <circle cx="42.5" cy="33" r="13" fill="white" />
                    <path
                      d="M 25 62 Q 25 50 42.5 50 Q 60 50 60 62 L 60 75 L 25 75 Z"
                      fill="white"
                    />
                  </svg>
                </div>
                <div className="employee-info">
                  <span className="employee-name">
                    {employee.full_name || employee.email}
                  </span>
                  {employee.employee_code && (
                    <span className="employee-code">
                      {employee.employee_code}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create User Modal */}
        <CreateUserModal
          isOpen={showCreateUserModal}
          onClose={() => setShowCreateUserModal(false)}
          onUserCreated={handleUserCreated}
        />
      </main>
    </div>
  );
};

export default Dashboard;
