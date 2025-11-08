import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Sidebar = ({ activeSection = "" }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const navItems = [
    { id: "employees", label: "Employees", path: "/dashboard" },
    { id: "attendance", label: "Attendance", path: "/attendance" },
    { id: "timeoff", label: "Time Off", path: "/timeoff" },
    { id: "payroll", label: "Payroll", path: "/payroll" },
    { id: "reports", label: "Reports", path: "/reports" },
  ];

  const handleNavClick = (item) => {
    if (item.path) {
      navigate(item.path);
    }
  };

  return (
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
            className={`nav-item ${activeSection === item.id ? "active" : ""}`}
            onClick={() => handleNavClick(item)}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
