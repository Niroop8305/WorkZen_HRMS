import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Header = ({ title = "Dashboard", subtitle = "" }) => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const displayName = user?.profile?.full_name || user?.email || "User";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="dashboard-header">
      <div className="header-left">
        <div>
          <h2 className="header-title">{title}</h2>
          {subtitle ? <p className="header-subtitle">{subtitle}</p> : null}
        </div>
      </div>
      <div className="header-center"></div>
      <div className="header-right">
        <div className="header-user">
          <div className="header-avatar" aria-hidden>
            {initials}
          </div>
          <div className="header-user-info">
            <span className="header-user-name">{displayName}</span>
            <span className="header-user-role">{user?.role || ""}</span>
          </div>
        </div>
        <button className="btn-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default Header;
