import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navigation = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const isActive = (path) => {
    return location.pathname === path ? 'nav-link active' : 'nav-link';
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', roles: ['Admin', 'HR Officer', 'Payroll Officer', 'Employee'] },
    { path: '/payroll', label: 'Payroll', roles: ['Admin', 'Payroll Officer', 'Employee'] },
    { path: '/attendance', label: 'Attendance', roles: ['Admin', 'HR Officer', 'Employee'] },
    { path: '/leave', label: 'Leave', roles: ['Admin', 'HR Officer', 'Employee'] },
  ];

  const filteredNavItems = navItems.filter(item => 
    item.roles.includes(user?.roleName)
  );

  return (
    <nav className="main-navigation">
      <div className="nav-container">
        <div className="nav-brand">
          <h2 style={{ color: 'var(--odoo-purple)', margin: 0 }}>
            <span style={{ fontWeight: 700 }}>Work</span>
            <span style={{ fontWeight: 300 }}>Zen</span>
          </h2>
        </div>
        
        <div className="nav-links">
          {filteredNavItems.map(item => (
            <Link key={item.path} to={item.path} className={isActive(item.path)}>
              {item.label}
            </Link>
          ))}
        </div>

        <div className="nav-user">
          <span className="user-info">
            {user?.profile?.full_name || user?.email}
            <span className="user-role">{user?.roleName}</span>
          </span>
          <button onClick={logout} className="btn-logout">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
