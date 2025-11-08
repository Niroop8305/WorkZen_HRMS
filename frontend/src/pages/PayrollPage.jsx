import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/PayrollPage.css';

const PayrollPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' or 'payrun'
  
  // Initial static payrun data - loaded by default
  const [payrunResults, setPayrunResults] = useState([
    {
      id: 1,
      period: '[Oct 2025]',
      employee: 'Rajesh Kumar',
      employerCost: 50000,
      basicWage: 25000,
      grossWage: 50000,
      netWage: 43800,
      status: 'Done'
    },
    {
      id: 2,
      period: '[Oct 2025]',
      employee: 'Priya Sharma',
      employerCost: 50000,
      basicWage: 25000,
      grossWage: 50000,
      netWage: 43800,
      status: 'Done'
    },
    {
      id: 3,
      period: '[Oct 2025]',
      employee: 'Amit Patel',
      employerCost: 50000,
      basicWage: 25000,
      grossWage: 50000,
      netWage: 43800,
      status: 'Done'
    }
  ]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [employerCostView, setEmployerCostView] = useState('monthly'); // 'monthly' or 'annually'
  const [employeeCountView, setEmployeeCountView] = useState('monthly'); // 'monthly' or 'annually'

  const handleGeneratePayrun = async () => {
    setIsGenerating(true);
    
    // Simulate loading
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock payrun data
    const mockData = [
      {
        id: 1,
        period: '[Oct 2025]',
        employee: 'Rajesh Kumar',
        employerCost: 50000,
        basicWage: 25000,
        grossWage: 50000,
        netWage: 43800,
        status: 'Done'
      },
      {
        id: 2,
        period: '[Oct 2025]',
        employee: 'Priya Sharma',
        employerCost: 50000,
        basicWage: 25000,
        grossWage: 50000,
        netWage: 43800,
        status: 'Done'
      },
      {
        id: 3,
        period: '[Oct 2025]',
        employee: 'Amit Patel',
        employerCost: 50000,
        basicWage: 25000,
        grossWage: 50000,
        netWage: 43800,
        status: 'Done'
      }
    ];
    
    setPayrunResults(mockData);
    setIsGenerating(false);
  };

  const formatCurrency = (amount) => {
    return `₹ ${amount.toLocaleString('en-IN')}`;
  };

  return (
    <div className="payroll-page">
      {/* Header Tabs */}
      <div className="payroll-header">
        <button 
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button 
          className="tab-btn"
          onClick={() => navigate('/payrun')}
        >
          Payrun
        </button>
      </div>

      {/* Dashboard View */}
      {activeTab === 'dashboard' && (
        <div className="dashboard-view">
          <div className="dashboard-grid">
            {/* Warning Section */}
            <div className="dashboard-card warning-card">
              <div className="card-header">
                <h3>⚠️ Warning</h3>
              </div>
              <div className="card-content">
                <div className="warning-item">
                  <div className="warning-badge">1</div>
                  <span className="warning-text">Employee without Bank A/c</span>
                </div>
                <div className="warning-item">
                  <div className="warning-badge">1</div>
                  <span className="warning-text">Employee without Manager</span>
                </div>
              </div>
            </div>

            {/* Payrun Section */}
            <div className="dashboard-card payrun-list-card">
              <div className="card-header">
                <h3>📋 Payrun</h3>
              </div>
              <div className="card-content">
                <div className="payrun-item">
                  <span className="payrun-title">Payrun For Oct 2025</span>
                  <span className="payrun-badge">3 Payslips</span>
                </div>
                <div className="payrun-item">
                  <span className="payrun-title">Payrun For Sept 2025</span>
                  <span className="payrun-badge">3 Payslips</span>
                </div>
              </div>
            </div>

            {/* Employer Cost Chart */}
            <div className="dashboard-card chart-card">
              <div className="chart-header">
                <h3>💰 Employer cost</h3>
                <div className="chart-toggle">
                  <button 
                    className={`toggle-btn ${employerCostView === 'annually' ? 'active' : ''}`}
                    onClick={() => setEmployerCostView('annually')}
                  >
                    Annually
                  </button>
                  <button 
                    className={`toggle-btn ${employerCostView === 'monthly' ? 'active' : ''}`}
                    onClick={() => setEmployerCostView('monthly')}
                  >
                    Monthly
                  </button>
                </div>
              </div>
              <div className="chart-content">
                <div className="chart-bars">
                  <div className="bar-group">
                    <div className="bar-container">
                      <div className="bar employer-bar" style={{height: employerCostView === 'monthly' ? '60%' : '75%'}}></div>
                    </div>
                    <span className="bar-label">Jan 2025</span>
                  </div>
                  <div className="bar-group">
                    <div className="bar-container">
                      <div className="bar employer-bar" style={{height: employerCostView === 'monthly' ? '75%' : '65%'}}></div>
                    </div>
                    <span className="bar-label">Feb 2025</span>
                  </div>
                  <div className="bar-group">
                    <div className="bar-container">
                      <div className="bar employer-bar" style={{height: employerCostView === 'monthly' ? '90%' : '85%'}}></div>
                    </div>
                    <span className="bar-label">Mar 2025</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Employee Count Chart */}
            <div className="dashboard-card chart-card">
              <div className="chart-header">
                <h3>👥 Employee Count</h3>
                <div className="chart-toggle">
                  <button 
                    className={`toggle-btn ${employeeCountView === 'annually' ? 'active' : ''}`}
                    onClick={() => setEmployeeCountView('annually')}
                  >
                    Annually
                  </button>
                  <button 
                    className={`toggle-btn ${employeeCountView === 'monthly' ? 'active' : ''}`}
                    onClick={() => setEmployeeCountView('monthly')}
                  >
                    Monthly
                  </button>
                </div>
              </div>
              <div className="chart-content">
                <div className="chart-bars">
                  <div className="bar-group">
                    <div className="bar-container">
                      <div className="bar employee-bar" style={{height: employeeCountView === 'monthly' ? '55%' : '70%'}}></div>
                    </div>
                    <span className="bar-label">Jan 2025</span>
                  </div>
                  <div className="bar-group">
                    <div className="bar-container">
                      <div className="bar employee-bar" style={{height: employeeCountView === 'monthly' ? '70%' : '60%'}}></div>
                    </div>
                    <span className="bar-label">Feb 2025</span>
                  </div>
                  <div className="bar-group">
                    <div className="bar-container">
                      <div className="bar employee-bar" style={{height: employeeCountView === 'monthly' ? '85%' : '80%'}}></div>
                    </div>
                    <span className="bar-label">Mar 2025</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PayrollPage;
