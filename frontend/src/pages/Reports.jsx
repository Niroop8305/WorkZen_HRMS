import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import "../styles/App.css";
import "../styles/Reports.css";

const Reports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const hasReportAccess =
    user?.role === "Admin" || user?.role === "Payroll Officer";

  useEffect(() => {
    if (!hasReportAccess) {
      navigate("/unauthorized");
    }
  }, [hasReportAccess, navigate]);

  if (!hasReportAccess) {
    return null;
  }

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="reports" />

      <main className="dashboard-main">
        <Header title="Reports" />

        <div className="reports-container">
          <div className="report-card">
            <div className="report-header">
              <div className="report-title-section">
                <h2 className="report-name">Salary Statement Report</h2>
              </div>
            </div>

            <div className="report-form">
              <div className="error-message">
                <span>ℹ️</span>
                <span>
                  Salary statement reporting is temporarily unavailable while the
                  payroll architecture is consolidated. It will return in a
                  future payroll milestone.
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Reports;
