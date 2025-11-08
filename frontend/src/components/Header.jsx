import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Header = ({ title = "Dashboard" }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="dashboard-header">
      <div className="header-left">
        <h2 className="header-title">{title}</h2>
      </div>
      <div className="header-center"></div>
      <div className="header-right">
        <button className="btn-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default Header;
