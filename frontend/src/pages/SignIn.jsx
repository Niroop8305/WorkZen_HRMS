import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/App.css";

const SignIn = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const demoAccounts = [
    {
      role: "Admin",
      email: "admin@workzen.com",
      password: "Admin@2025",
    },
    {
      role: "HR Officer",
      email: "sarah.hr@workzen.com",
      password: "Hr@2025",
    },
    {
      role: "Payroll Officer",
      email: "finance@workzen.com",
      password: "Payroll@2025",
    },
    {
      role: "Employee",
      email: "john.dev@workzen.com",
      password: "Employee@2025",
    },
  ];

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.email || !formData.password) {
      setError("Please provide both email and password");
      return;
    }

    setLoading(true);

    try {
      const result = await login(formData);

      if (result.success) {
        // Redirect based on role
        const role = result.data.role;
        if (role === "Admin" || role === "HR Officer") {
          navigate("/dashboard");
        } else {
          navigate("/employee/dashboard");
        }
      } else {
        setError(result.message || "Login failed");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUseDemo = (account) => {
    setFormData({
      email: account.email,
      password: account.password,
    });
    setError("");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img
            src="/odoo-logo.svg"
            alt="Odoo Logo"
            className="auth-logo-image"
          />
          <div className="auth-logo-subtitle">Powered by Odoo India</div>
        </div>

        <h2 className="auth-title">Sign in to WorkZen</h2>
        <p className="auth-subtitle">
          Enter your work email and password to continue.
        </p>

        {error && <div className="alert alert-error">⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              name="email"
              className="form-input"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-with-icon">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                className="form-input"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                autoComplete="current-password"
              />
              <span
                className="input-icon"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </span>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner"></span> Signing In...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="demo-accounts">
          <div className="demo-title">Demo Accounts</div>
          <ul className="demo-list">
            {demoAccounts.map((account) => (
              <li key={account.role}>
                <div className="demo-info">
                  <span className="demo-role">{account.role}</span>
                  <span className="demo-cred">
                    {account.email} / {account.password}
                  </span>
                </div>
                <button
                  type="button"
                  className="demo-use-btn"
                  onClick={() => handleUseDemo(account)}
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
