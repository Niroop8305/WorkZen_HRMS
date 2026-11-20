import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Users,
  CalendarCheck,
  CalendarClock,
  Wallet,
  BarChart3,
  UserRound,
  LayoutDashboard,
} from "lucide-react";
import WorkZenLogo from "./WorkZenLogo";

// Unified authenticated navigation. Every route carries its icon and the roles
// allowed to see it, so the sidebar renders exactly what the logged-in user can
// actually open — no visible-but-403ing entries.
const NAV_ITEMS = [
  {
    id: "employees",
    label: "Employees",
    path: "/dashboard",
    icon: Users,
    roles: ["Admin", "HR Officer", "Payroll Officer"],
  },
  {
    id: "attendance",
    label: "Attendance",
    path: "/attendance",
    icon: CalendarCheck,
    roles: ["Admin", "HR Officer", "Payroll Officer", "Employee"],
  },
  {
    id: "timeoff",
    label: "Time Off",
    path: "/timeoff",
    icon: CalendarClock,
    roles: ["Admin", "HR Officer", "Payroll Officer", "Employee"],
  },
  {
    id: "payroll",
    label: "Payroll",
    path: "/payroll",
    icon: Wallet,
    roles: ["Admin", "HR Officer", "Payroll Officer", "Employee"],
  },
  {
    id: "reports",
    label: "Reports",
    path: "/reports",
    icon: BarChart3,
    roles: ["Admin", "Payroll Officer"],
  },
  {
    id: "profile",
    label: "My Profile",
    path: "/profile",
    icon: UserRound,
    roles: ["Admin", "HR Officer", "Payroll Officer", "Employee"],
  },
];

const Sidebar = ({ activeSection = "" }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const navItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user?.role),
  );

  const handleNavClick = (item) => {
    if (item.path) {
      navigate(item.path);
    }
  };

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-company">
          <WorkZenLogo size={34} />
          <span className="company-name">
            {user?.profile?.company_name || "WorkZen Technologies"}
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon ?? LayoutDashboard;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeSection === item.id ? "active" : ""}`}
              onClick={() => handleNavClick(item)}
            >
              <Icon size={17} strokeWidth={2} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
