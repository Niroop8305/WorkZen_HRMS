import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import EmployeePayroll from "../components/payroll/EmployeePayroll";
import AdminPayroll from "../components/payroll/AdminPayroll";
import SalaryComponentsPanel from "../components/payroll/SalaryComponentsPanel";
import SalaryStructuresPanel from "../components/payroll/SalaryStructuresPanel";
import "../styles/App.css";
import "../styles/PayrollPage.css";

// Role-aware payroll orchestrator (M5). The signed-in user's role selects the
// experience: Admin / Payroll Officer get the management workspace (overview,
// salary components, salary structures); everyone else - including Employee and
// HR Officer - gets the personal "My Payroll" view. This is a navigation/UX
// choice only; the backend RBAC middleware is the real security boundary, so an
// HR Officer still cannot reach org-wide payroll even if they navigated there.
const TABS = [
  { id: "overview", label: "Overview", component: AdminPayroll },
  { id: "components", label: "Salary Components", component: SalaryComponentsPanel },
  { id: "structures", label: "Salary Structures", component: SalaryStructuresPanel },
];

const PayrollPage = () => {
  const { user } = useAuth();
  const isPayrollAdmin = user?.role === "Admin" || user?.role === "Payroll Officer";
  const [activeTab, setActiveTab] = useState("overview");

  const ActivePanel = TABS.find((t) => t.id === activeTab)?.component || AdminPayroll;

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="payroll" />

      <main className="dashboard-main">
        <Header title="Payroll" />

        <div className="payroll-shell">
          {isPayrollAdmin ? (
            <>
              <div className="payroll-tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <ActivePanel />
            </>
          ) : (
            <EmployeePayroll />
          )}
        </div>
      </main>
    </div>
  );
};

export default PayrollPage;
