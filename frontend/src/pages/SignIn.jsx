import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

  // Demo quick-fill only in development (or an explicitly enabled production
  // build): baked-in credentials on a deployed login page are an incident.
  const showDemoAccounts =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true";

  const demoAccounts = [
    {
      role: "Admin",
      email: "admin@workzen.demo",
      password: "Admin@123",
    },
    {
      role: "HR Officer",
      email: "hr@workzen.demo",
      password: "Hr@123",
    },
    {
      role: "Payroll Officer",
      email: "payroll@workzen.demo",
      password: "Payroll@123",
    },
    {
      role: "Employee",
      email: "employee@workzen.demo",
      password: "Employee@123",
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
        if (role === "Employee") {
          navigate("/employee/dashboard");
        } else {
          // Admin, HR Officer and Payroll Officer all share the staff directory
          // dashboard; sending a Payroll Officer to the employee dashboard
          // would bounce off its Employee-only guard into the 403 page.
          navigate("/dashboard");
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
          <WorkZenLogo size={44} />
        </div>

        <Link to="/" className="auth-back-home">← Back to Home</Link>
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

        {showDemoAccounts && (
          <div className="demo-accounts">
            <div className="demo-title">Demo Accounts</div>
            <div className="demo-grid">
              {demoAccounts.map((account) => (
                <div className="demo-cell" key={account.role}>
                  <span className="demo-role">{account.role}</span>
                  <span className="demo-cred">{account.email}</span>
                  <button
                    type="button"
                    className="demo-use-btn"
                    onClick={() => handleUseDemo(account)}
                  >
                    Fill
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignIn;
