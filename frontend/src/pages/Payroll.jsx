import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import axios from 'axios';

const Payroll = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [payrollData, setPayrollData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('10');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeSection, setActiveSection] = useState('payroll');
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' or 'payrun'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [error, setError] = useState('');
  const [payrunResults, setPayrunResults] = useState([]);
  const [isGeneratingPayrun, setIsGeneratingPayrun] = useState(false);
  const [payrunSuccess, setPayrunSuccess] = useState(false);

  const isPayrollOfficer = user?.roleName === 'Payroll Officer' || user?.roleName === 'Admin';

  useEffect(() => {
    fetchPayrollData();
  }, [selectedMonth, selectedYear]);

  const fetchPayrollData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('workzen_token');
      
      let url = isPayrollOfficer 
        ? 'http://localhost:5000/api/payroll/all' 
        : 'http://localhost:5000/api/payroll/my-payroll';
      
      const params = {};
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      setPayrollData(response.data.data || []);
      if (response.data.data && response.data.data.length > 0) {
        setSelectedEmployee(response.data.data[0]);
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch payroll data');
      console.error('Error fetching payroll:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewPayslip = (payroll) => {
    navigate(`/payroll/payslip/${payroll.payroll_id}`);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatMonth = (month) => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthNames[parseInt(month) - 1];
  };

  const months = [
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // Generate chart data for the last 3 months
  const getChartData = () => {
    const chartMonths = ['Jun 2025', 'Feb 2025', 'Apr 2025'];
    const data = payrollData.slice(0, 3).map((p, i) => ({
      month: chartMonths[i] || `${formatMonth(p.month)} ${p.year}`,
      grossSalary: p.gross_salary,
      deductions: p.total_deductions,
      netSalary: p.net_salary
    }));
    return data;
  };

  // Generate Payrun for all employees (using static data)
  const handleGeneratePayrun = async () => {
    console.log('Generate Payrun button clicked!');
    try {
      setIsGeneratingPayrun(true);
      setError('');
      setPayrunSuccess(false);
      
      console.log('Starting payrun generation...');
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log('Payrun generation complete!');
      
      // Static mock data matching the design
      const mockPayrunResults = [
        {
          payroll_id: 1,
          employee_name: 'Rajesh Kumar',
          employee_code: 'EMP001',
          month: selectedMonth,
          year: selectedYear,
          basic_salary: 25000,
          total_allowances: 25000,
          gross_salary: 50000,
          total_deductions: 6200,
          net_salary: 43800,
          payment_status: 'Done'
        },
        {
          payroll_id: 2,
          employee_name: 'Priya Sharma',
          employee_code: 'EMP002',
          month: selectedMonth,
          year: selectedYear,
          basic_salary: 30000,
          total_allowances: 30000,
          gross_salary: 60000,
          total_deductions: 7440,
          net_salary: 52560,
          payment_status: 'Done'
        },
        {
          payroll_id: 3,
          employee_name: 'Amit Patel',
          employee_code: 'EMP003',
          month: selectedMonth,
          year: selectedYear,
          basic_salary: 28000,
          total_allowances: 28000,
          gross_salary: 56000,
          total_deductions: 6936,
          net_salary: 49064,
          payment_status: 'Done'
        },
        {
          payroll_id: 4,
          employee_name: 'Sneha Reddy',
          employee_code: 'EMP004',
          month: selectedMonth,
          year: selectedYear,
          basic_salary: 32000,
          total_allowances: 32000,
          gross_salary: 64000,
          total_deductions: 7904,
          net_salary: 56096,
          payment_status: 'Done'
        },
        {
          payroll_id: 5,
          employee_name: 'Vikram Singh',
          employee_code: 'EMP005',
          month: selectedMonth,
          year: selectedYear,
          basic_salary: 27000,
          total_allowances: 27000,
          gross_salary: 54000,
          total_deductions: 6684,
          net_salary: 47316,
          payment_status: 'Done'
        }
      ];

      setPayrunResults(mockPayrunResults);
      setPayrunSuccess(true);
      console.log('Payrun results set:', mockPayrunResults);
    } catch (err) {
      setError('Failed to generate payrun');
      console.error('Error generating payrun:', err);
    } finally {
      setIsGeneratingPayrun(false);
      console.log('Generate payrun finished');
    }
  };

  // Calculate salary components
  const calculateSalaryComponents = (payroll) => {
    const basicWage = payroll.basic_salary || 0;
    const allowances = payroll.total_allowances || 0;
    const grossWage = basicWage + allowances;
    const deductions = payroll.total_deductions || 0;
    const netWage = grossWage - deductions;
    const employerCost = grossWage; // Monthly wage

    return {
      employerCost,
      basicWage,
      grossWage,
      netWage
    };
  };

  return (
    <div className="page-container">
      <Navigation />
      
      <div className="payroll-layout">
        {/* Left Sidebar */}
        <div className="payroll-sidebar-left">
          <div className="sidebar-section">
            <button 
              className={activeSection === 'employees' ? 'sidebar-btn active' : 'sidebar-btn'}
              onClick={() => setActiveSection('employees')}
            >
              <span className="sidebar-icon">👥</span>
              <span>Employees</span>
            </button>
            
            <button 
              className={activeSection === 'attendance' ? 'sidebar-btn active' : 'sidebar-btn'}
              onClick={() => setActiveSection('attendance')}
            >
              <span className="sidebar-icon">📋</span>
              <span>Attendance</span>
            </button>
            
            <button 
              className={activeSection === 'timeoff' ? 'sidebar-btn active' : 'sidebar-btn'}
              onClick={() => setActiveSection('timeoff')}
            >
              <span className="sidebar-icon">🏖️</span>
              <span>Time Off</span>
            </button>
            
            <button 
              className={activeSection === 'payroll' ? 'sidebar-btn active' : 'sidebar-btn'}
              onClick={() => setActiveSection('payroll')}
            >
              <span className="sidebar-icon">💰</span>
              <span>Payroll</span>
            </button>
            
            <button 
              className={activeSection === 'reports' ? 'sidebar-btn active' : 'sidebar-btn'}
              onClick={() => setActiveSection('reports')}
            >
              <span className="sidebar-icon">📊</span>
              <span>Reports</span>
            </button>
            
            {isPayrollOfficer && (
              <button 
                className={activeSection === 'settings' ? 'sidebar-btn active' : 'sidebar-btn'}
                onClick={() => setActiveSection('settings')}
              >
                <span className="sidebar-icon">⚙️</span>
                <span>Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="payroll-main-content">
          {/* Top Navigation Tabs */}
          <div className="payroll-view-tabs">
            <button 
              className={activeView === 'dashboard' ? 'view-tab active' : 'view-tab'}
              onClick={() => setActiveView('dashboard')}
            >
              Dashboard
            </button>
            <button 
              className={activeView === 'payrun' ? 'view-tab active' : 'view-tab'}
              onClick={() => setActiveView('payrun')}
            >
              Payrun
            </button>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading payroll data...</p>
            </div>
          ) : error ? (
            <div className="alert alert-error">{error}</div>
          ) : (
            <>
              {/* Dashboard View */}
              {activeView === 'dashboard' && (
                <>
                  {/* Charts Section */}
                  <div className="payroll-charts-section">
                <h3 className="section-title">Payroll Dashboard - Statistics</h3>
                <p className="section-subtitle">
                  The Payroll Dashboard contains overview, pay run information, and statistics related to employee and employer costs.
                </p>
                
                <div className="charts-grid">
                  {/* Employee Cost Chart */}
                  <div className="chart-card">
                    <h4>Employee cost • Yearly • 3 months</h4>
                    <div className="chart-bars">
                      {getChartData().map((data, index) => (
                        <div key={index} className="bar-group">
                          <div className="bar-container">
                            <div 
                              className="bar bar-gross" 
                              style={{ height: `${(data.grossSalary / 100000) * 100}px` }}
                              title={formatCurrency(data.grossSalary)}
                            ></div>
                          </div>
                          <span className="bar-label">{data.month}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Employer Cost Chart */}
                  <div className="chart-card">
                    <h4>Employer cost • Yearly • 3 months</h4>
                    <div className="chart-bars">
                      {getChartData().map((data, index) => (
                        <div key={index} className="bar-group">
                          <div className="bar-container">
                            <div 
                              className="bar bar-deduction" 
                              style={{ height: `${(data.deductions / 100000) * 100}px` }}
                              title={formatCurrency(data.deductions)}
                            ></div>
                          </div>
                          <span className="bar-label">{data.month}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payroll List Section */}
              <div className="payroll-list-section">
                <div className="section-header">
                  <h3>Payroll Batches</h3>
                  <button className="btn-generate" onClick={() => navigate('/payroll/generate')}>
                    Generate Payroll
                  </button>
                </div>

                {payrollData.length === 0 ? (
                  <div className="empty-state">
                    <p>No payroll records found. Click "Generate Payroll" to create payroll for employees.</p>
                  </div>
                ) : (
                  <div className="payroll-batches">
                    {payrollData.map((payroll) => (
                      <div 
                        key={payroll.payroll_id} 
                        className="payroll-batch-card"
                        onClick={() => handleViewPayslip(payroll)}
                      >
                        <div className="batch-header">
                          <h4>{payroll.employee_name || user?.profile?.full_name}</h4>
                          <span className={`batch-status status-${payroll.payment_status?.toLowerCase()}`}>
                            {payroll.payment_status}
                          </span>
                        </div>
                        <div className="batch-details">
                          <div className="detail-item">
                            <span className="detail-label">Period:</span>
                            <span className="detail-value">
                              {formatMonth(payroll.month)} {payroll.year}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Gross:</span>
                            <span className="detail-value">{formatCurrency(payroll.gross_salary)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Deductions:</span>
                            <span className="detail-value">{formatCurrency(payroll.total_deductions)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Net:</span>
                            <span className="detail-value net">{formatCurrency(payroll.net_salary)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
                </>
              )}

              {/* Payrun View */}
              {activeView === 'payrun' && (
                <div className="payrun-view">
                  <div className="payrun-header-section">
                    <div className="payrun-info-text">
                      <p className="info-main">
                        The Payroll Payrun allows you to generate payslips for all employees at once. When you click the Payrun button, all employee payslips are created automatically.
                      </p>
                      <p className="info-detail">
                        The payslip of an individual employee is generated on the basis of attendance of that employee in a particular month.
                      </p>
                      <div className="info-definitions">
                        <p>Employer cost represents the employee's monthly wage</p>
                        <p>Basic wage refers to the employee's basic salary</p>
                        <p>Gross wage is the total of the basic salary + all allowances</p>
                        <p>Net wage is the total of gross - deductions</p>
                      </div>
                    </div>
                    
                    <div className="payrun-controls">
                      <div className="payrun-dropdown">
                        <label>Pay Period:</label>
                        <select 
                          value={`${selectedMonth}-${selectedYear}`}
                          onChange={(e) => {
                            const [month, year] = e.target.value.split('-');
                            setSelectedMonth(month);
                            setSelectedYear(Number(year));
                            setPayrunResults([]); // Clear previous results
                            setPayrunSuccess(false);
                          }}
                          className="payrun-period-select"
                        >
                          {months.map(month => (
                            <option key={`${month.value}-${selectedYear}`} value={`${month.value}-${selectedYear}`}>
                              Payrun for {month.label} {selectedYear}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <button 
                        className="btn-generate-payrun" 
                        onClick={handleGeneratePayrun}
                        disabled={isGeneratingPayrun}
                      >
                        {isGeneratingPayrun ? (
                          <>
                            <span className="btn-spinner"></span>
                            Generating...
                          </>
                        ) : (
                          <>
                            <span className="btn-icon">🚀</span>
                            Generate Payrun
                          </>
                        )}
                      </button>
                    </div>

                    {payrunSuccess && (
                      <div className="payrun-success-alert">
                        <span className="alert-icon">✅</span>
                        <span>Payrun generated successfully for {payrunResults.length} employees!</span>
                      </div>
                    )}

                    {error && (
                      <div className="payrun-error-alert">
                        <span className="alert-icon">⚠️</span>
                        <span>{error}</span>
                      </div>
                    )}
                  </div>

                  {/* Payrun Results */}
                  {payrunResults.length > 0 ? (
                    <div className="payrun-results-container">
                      {/* Summary Card */}
                      <div className="payrun-summary-card">
                        <div className="summary-buttons">
                          <button className="summary-btn active">Payrun</button>
                          <button className="summary-btn">Validate</button>
                        </div>
                        
                        <div className="summary-content">
                          <div className="summary-left">
                            <h3>Payrun Oct 2025</h3>
                          </div>
                          <div className="summary-amounts">
                            <div className="summary-item">
                              <span className="summary-value">₹ 50,000</span>
                              <span className="summary-label">Employer Cost</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-value">₹ 50,000</span>
                              <span className="summary-label">Gross</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-value">₹ 43,800.00</span>
                              <span className="summary-label">Net</span>
                            </div>
                            <div className="summary-status">
                              <span className="status-badge status-done">Done</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Detailed Table */}
                      <div className="payrun-table-wrapper">
                        <table className="payrun-table">
                          <thead>
                            <tr>
                              <th>Pay Period</th>
                              <th>Employee</th>
                              <th className="text-right">Employer Cost</th>
                              <th className="text-right">Basic Wage</th>
                              <th className="text-right">Gross Wage</th>
                              <th className="text-right">Net Wage</th>
                              <th className="text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payrunResults.map((payroll, index) => {
                              const components = calculateSalaryComponents(payroll);
                              return (
                                <tr key={payroll.payroll_id || index} className="payrun-row">
                                  <td>
                                    <div className="period-cell">
                                      <span className="period-month">[{formatMonth(payroll.month)} {payroll.year}]</span>
                                      <span className="period-employee">[{payroll.employee_name}]</span>
                                    </div>
                                  </td>
                                  <td>
                                    <div className="employee-cell">
                                      <span className="employee-name">{payroll.employee_name}</span>
                                      <span className="employee-code">{payroll.employee_code || 'N/A'}</span>
                                    </div>
                                  </td>
                                  <td className="text-right amount-cell">
                                    {formatCurrency(components.employerCost)}
                                  </td>
                                  <td className="text-right amount-cell">
                                    {formatCurrency(components.basicWage)}
                                  </td>
                                  <td className="text-right amount-cell">
                                    {formatCurrency(components.grossWage)}
                                  </td>
                                  <td className="text-right amount-cell net-amount">
                                    {formatCurrency(components.netWage)}
                                  </td>
                                  <td className="text-center">
                                    <span className="status-badge status-done">Done</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="payrun-totals">
                              <td colSpan="2"><strong>Total</strong></td>
                              <td className="text-right">
                                <strong>{formatCurrency(payrunResults.reduce((sum, p) => sum + calculateSalaryComponents(p).employerCost, 0))}</strong>
                              </td>
                              <td className="text-right">
                                <strong>{formatCurrency(payrunResults.reduce((sum, p) => sum + calculateSalaryComponents(p).basicWage, 0))}</strong>
                              </td>
                              <td className="text-right">
                                <strong>{formatCurrency(payrunResults.reduce((sum, p) => sum + calculateSalaryComponents(p).grossWage, 0))}</strong>
                              </td>
                              <td className="text-right">
                                <strong>{formatCurrency(payrunResults.reduce((sum, p) => sum + calculateSalaryComponents(p).netWage, 0))}</strong>
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ) : payrollData.length === 0 ? (
                    <div className="empty-state-payrun">
                      <p>No payroll records found. Click "Generate Payrun" to create payroll for employees.</p>
                    </div>
                  ) : (
                    <div className="payrun-employee-grid">
                      {/* Employee Selection List */}
                      <div className="employee-selection-panel">
                        <h4>Employees</h4>
                        <div className="employee-list">
                          {payrollData.map((payroll, index) => (
                            <div 
                              key={payroll.payroll_id}
                              className={`employee-list-item ${selectedEmployee?.payroll_id === payroll.payroll_id ? 'active' : ''}`}
                              onClick={() => setSelectedEmployee(payroll)}
                            >
                              <div className="employee-list-name">
                                {payroll.employee_name || user?.profile?.full_name}
                              </div>
                              <div className="employee-list-details">
                                <span className="employee-list-code">{payroll.employee_code || 'N/A'}</span>
                                <span className={`employee-list-status status-${payroll.payment_status?.toLowerCase()}`}>
                                  {payroll.payment_status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Employee Payslip Details */}
                      {selectedEmployee && (
                        <div className="payrun-details-panel">
                          <div className="payrun-employee-card">
                            {/* Employee Header */}
                            <div className="payrun-employee-header">
                              <div className="payrun-employee-info">
                                <h3>{selectedEmployee.employee_name || user?.profile?.full_name}</h3>
                                <p className="employee-meta">
                                  <span>Code: {selectedEmployee.employee_code || 'N/A'}</span>
                                  <span>Department: {selectedEmployee.department || 'N/A'}</span>
                                </p>
                              </div>
                              <div className="payrun-period-badge">
                                <span className="period-label">Pay Period</span>
                                <span className="period-value">
                                  {formatMonth(selectedEmployee.month)} {selectedEmployee.year}
                                </span>
                              </div>
                            </div>

                            {/* Worked Days Section */}
                            <div className="payrun-section">
                              <h4 className="section-heading">Worked Days</h4>
                              <table className="payrun-breakdown-table">
                                <thead>
                                  <tr>
                                    <th>Type</th>
                                    <th>Days</th>
                                    <th className="text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td>Attendance</td>
                                    <td>{selectedEmployee.worked_days || 20}</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.gross_salary)}</td>
                                  </tr>
                                  <tr>
                                    <td>Paid Time off</td>
                                    <td>{selectedEmployee.paid_time_off || 2}</td>
                                    <td className="text-right">₹0</td>
                                  </tr>
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td colSpan="2"><strong>Total Days</strong></td>
                                    <td className="text-right">
                                      <strong>{(selectedEmployee.worked_days || 20) + (selectedEmployee.paid_time_off || 2)}</strong>
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {/* Salary Computation Section */}
                            <div className="payrun-section">
                              <h4 className="section-heading">Salary Computation</h4>
                              <table className="payrun-breakdown-table">
                                <thead>
                                  <tr>
                                    <th>Type</th>
                                    <th className="text-center">Rate %</th>
                                    <th className="text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td>Basic Salary</td>
                                    <td className="text-center">100</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.5)}</td>
                                  </tr>
                                  <tr>
                                    <td>House Rent Allowance</td>
                                    <td className="text-center">100</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.2)}</td>
                                  </tr>
                                  <tr>
                                    <td>Standard Allowance</td>
                                    <td className="text-center">100</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.12)}</td>
                                  </tr>
                                  <tr>
                                    <td>Performance Bonus</td>
                                    <td className="text-center">100</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.1)}</td>
                                  </tr>
                                  <tr>
                                    <td>Leave Travel Allowance</td>
                                    <td className="text-center">100</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.05)}</td>
                                  </tr>
                                  <tr>
                                    <td>Fixed Allowance</td>
                                    <td className="text-center">100</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.03)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* Gross Total */}
                            <div className="payrun-total-row gross-total">
                              <span className="total-label">Gross</span>
                              <span className="total-value">{formatCurrency(selectedEmployee.gross_salary)}</span>
                            </div>

                            {/* Deductions Section */}
                            <div className="payrun-section">
                              <h4 className="section-heading">Deductions</h4>
                              <table className="payrun-breakdown-table">
                                <thead>
                                  <tr>
                                    <th>Type</th>
                                    <th className="text-center">Rate %</th>
                                    <th className="text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td>PF Employer</td>
                                    <td className="text-center">100</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.total_deductions * 0.4)}</td>
                                  </tr>
                                  <tr>
                                    <td>PF Employee</td>
                                    <td className="text-center">100</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.total_deductions * 0.4)}</td>
                                  </tr>
                                  <tr>
                                    <td>Professional Tax</td>
                                    <td className="text-center">100</td>
                                    <td className="text-right">{formatCurrency(selectedEmployee.total_deductions * 0.2)}</td>
                                  </tr>
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td colSpan="2"><strong>Total Deductions</strong></td>
                                    <td className="text-right">
                                      <strong>{formatCurrency(selectedEmployee.total_deductions)}</strong>
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {/* Net Salary */}
                            <div className="payrun-total-row net-total">
                              <span className="total-label">Net Salary</span>
                              <span className="total-value">{formatCurrency(selectedEmployee.net_salary)}</span>
                            </div>

                            {/* Action Buttons */}
                            <div className="payrun-actions">
                              <button 
                                className="btn-generate-payslip"
                                onClick={() => handleViewPayslip(selectedEmployee)}
                              >
                                Generate Payslip
                              </button>
                              <button 
                                className="btn-validate"
                                onClick={() => alert('Validation feature coming soon')}
                              >
                                Validate
                              </button>
                              <button 
                                className="btn-email"
                                onClick={() => alert('Email feature coming soon')}
                              >
                                Email
                              </button>
                              <button 
                                className="btn-print"
                                onClick={() => handleViewPayslip(selectedEmployee)}
                              >
                                Print
                              </button>
                            </div>

                            {/* Footer Note */}
                            <div className="payrun-footer-note">
                              <p>
                                Salary is calculated based on the employee's monthly attendance. Paid leaves are 
                                included in the total payable days, and unpaid leaves are deducted from salary.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Sidebar - Employee Details */}
        {selectedEmployee && (
          <div className="payroll-sidebar-right">
            <div className="employee-detail-card">
              <div className="employee-header">
                <h3>[Employees]</h3>
                <div className="employee-tabs">
                  <button className="emp-tab active">Payroll</button>
                  <button className="emp-tab">Salary Structure</button>
                  <button className="emp-tab">Regular Pay</button>
                  <button className="emp-tab">Payslip</button>
                </div>
              </div>

              <div className="employee-info">
                <div className="info-row">
                  <span className="info-label">Payrun:</span>
                  <span className="info-value">Payrun Oct 2025</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Salary Structure:</span>
                  <span className="info-value">Regular Pay</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Period:</span>
                  <span className="info-value">01 Oct 25 - 31 Oct</span>
                </div>
              </div>

              <div className="salary-breakdown">
                <div className="breakdown-section">
                  <h4>Worked Days</h4>
                  <table className="breakdown-table">
                    <tbody>
                      <tr>
                        <td>Type</td>
                        <td>Days</td>
                        <td className="text-right">Amount</td>
                      </tr>
                      <tr>
                        <td>Attendance</td>
                        <td>{selectedEmployee.worked_days || 20}</td>
                        <td className="text-right">{formatCurrency(selectedEmployee.gross_salary)}</td>
                      </tr>
                      <tr>
                        <td>Paid Time off</td>
                        <td>{selectedEmployee.paid_time_off || 2}</td>
                        <td className="text-right">₹0</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="breakdown-section">
                  <h4>Salary Computation</h4>
                  <table className="breakdown-table">
                    <tbody>
                      <tr>
                        <td>Type</td>
                        <td>Rate %</td>
                        <td className="text-right">Amount</td>
                      </tr>
                      <tr>
                        <td>Basic Salary</td>
                        <td>100</td>
                        <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.5)}</td>
                      </tr>
                      <tr>
                        <td>House Rent Allowance</td>
                        <td>100</td>
                        <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.2)}</td>
                      </tr>
                      <tr>
                        <td>Standard Allowance</td>
                        <td>100</td>
                        <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.12)}</td>
                      </tr>
                      <tr>
                        <td>Performance Bonus</td>
                        <td>100</td>
                        <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.1)}</td>
                      </tr>
                      <tr>
                        <td>Gross Salary Allowance</td>
                        <td>100</td>
                        <td className="text-right">{formatCurrency(selectedEmployee.gross_salary * 0.08)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="total-row">
                  <span>Gross</span>
                  <span>{formatCurrency(selectedEmployee.gross_salary)}</span>
                </div>

                <div className="breakdown-section">
                  <h4>Deductions</h4>
                  <table className="breakdown-table">
                    <tbody>
                      <tr>
                        <td>PF Employer</td>
                        <td>100</td>
                        <td className="text-right">{formatCurrency(selectedEmployee.total_deductions * 0.4)}</td>
                      </tr>
                      <tr>
                        <td>PF Employee</td>
                        <td>100</td>
                        <td className="text-right">{formatCurrency(selectedEmployee.total_deductions * 0.4)}</td>
                      </tr>
                      <tr>
                        <td>Professional Tax</td>
                        <td>100</td>
                        <td className="text-right">₹200</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="employee-footer">
                <p className="note-text">
                  Salary is calculated based on the employee's monthly attendance. Paid leaves are included in the total payable days, and unpaid leaves are deducted from salary.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Payroll;
