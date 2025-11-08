import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import CreateUserModal from "../components/CreateUserModal";

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("employees");
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
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
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("workzen_token");
      const response = await axios.get("http://localhost:5000/api/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setEmployees(response.data.data || []);
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

  // Get user status (will be fetched from API in production)
  const getUserStatus = () => {
    // This would come from attendance/leave API
    // For now, default to 'online' when logged in
    return "online"; // Can be 'online', 'offline', or 'leave'
  };

  const userStatus = getUserStatus();

  // Render status indicator
  const renderStatusIndicator = (status) => {
    if (status === "leave") {
      return <span className="status-icon status-leave">✈</span>;
    }
    return <span className={`status-dot status-${status}`}></span>;
  };

  const navItems = [
    { id: "employees", label: "Employees", hasSubItems: false },
    { id: "attendance", label: "Attendance", hasSubItems: false },
    { id: "timeoff", label: "Time Off", hasSubItems: false },
    { id: "payroll", label: "Payroll", hasSubItems: false },
    { id: "reports", label: "Reports", hasSubItems: false },
    { id: "settings", label: "Settings", hasSubItems: false },
  ];

  return (
    <div className="dashboard-layout">
      {/* Left Sidebar Navigation */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-company">
            <img
              src="/odoo-logo.svg"
              alt="Company Logo"
              className="sidebar-logo"
            />
            <span className="company-name">
              {user?.profile?.company_name || "Odoo India"}
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${
                activeSection === item.id ? "active" : ""
              }`}
              onClick={() => setActiveSection(item.id)}
            >
              <span>{item.label}</span>
              {item.hasSubItems && <span className="nav-arrow">▼</span>}
            </button>
          ))}
        </nav>
      </aside>

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
            <div
              className="btn-icon btn-status"
              title={`Status: ${userStatus}`}
            >
              {renderStatusIndicator(userStatus)}
            </div>
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
                  {renderStatusIndicator(
                    employee.is_active ? "online" : "offline"
                  )}
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
