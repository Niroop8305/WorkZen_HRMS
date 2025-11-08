import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import axios from 'axios';

const Payslip = () => {
  const { payrollId } = useParams();
  const navigate = useNavigate();
  const [payslipData, setPayslipData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPayslipData();
  }, [payrollId]);

  const fetchPayslipData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('workzen_token');
      
      const response = await axios.get(`http://localhost:5000/api/payroll/payslip/${payrollId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setPayslipData(response.data.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch payslip data');
      console.error('Error fetching payslip:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatMonth = (month, year) => {
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    // This would integrate with a PDF generation service
    alert('PDF download functionality to be implemented');
  };

  if (loading) {
    return (
      <div className="page-container">
        <Navigation />
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading payslip...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <Navigation />
        <div className="content-wrapper">
          <div className="alert alert-error">{error}</div>
          <button onClick={() => navigate('/payroll')} className="btn btn-secondary">
            Back to Payroll
          </button>
        </div>
      </div>
    );
  }

  if (!payslipData) {
    return (
      <div className="page-container">
        <Navigation />
        <div className="content-wrapper">
          <div className="alert alert-warning">Payslip not found</div>
          <button onClick={() => navigate('/payroll')} className="btn btn-secondary">
            Back to Payroll
          </button>
        </div>
      </div>
    );
  }

  const { payroll, details } = payslipData;
  const earnings = details.filter(d => d.component_type === 'Earning');
  const deductions = details.filter(d => d.component_type === 'Deduction');

  return (
    <div className="page-container">
      <Navigation />
      
      <div className="content-wrapper">
        <div className="payslip-header">
          <button onClick={() => navigate('/payroll')} className="btn btn-secondary">
            ← Back to Payroll
          </button>
          
          <div className="payslip-actions">
            <button onClick={handlePrint} className="btn btn-outline">
              Print
            </button>
            <button onClick={handleDownloadPDF} className="btn btn-primary">
              Download PDF
            </button>
          </div>
        </div>

        <div className="payslip-container" id="payslip-content">
          <div className="payslip-document">
            {/* Company Header */}
            <div className="payslip-company-header">
              <h1>WorkZen HRMS</h1>
              <p className="company-tagline">Your Workforce Management Solution</p>
            </div>

            {/* Payslip Title */}
            <div className="payslip-title">
              <h2>Salary Slip for {formatMonth(payroll.month, payroll.year)}</h2>
            </div>

            {/* Employee Information */}
            <div className="payslip-info-grid">
              <div className="info-section">
                <h3>Employee Information</h3>
                <div className="info-row">
                  <span className="info-label">Employee Name:</span>
                  <span className="info-value">{payroll.employee_name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Employee Code:</span>
                  <span className="info-value">{payroll.employee_code}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Department:</span>
                  <span className="info-value">{payroll.department}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Designation:</span>
                  <span className="info-value">{payroll.designation}</span>
                </div>
              </div>

              <div className="info-section">
                <h3>Payment Information</h3>
                <div className="info-row">
                  <span className="info-label">Pay Period:</span>
                  <span className="info-value">{formatMonth(payroll.month, payroll.year)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Payment Date:</span>
                  <span className="info-value">
                    {payroll.payment_date ? formatDate(payroll.payment_date) : 'Pending'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Status:</span>
                  <span className={`status-badge status-${payroll.payment_status?.toLowerCase()}`}>
                    {payroll.payment_status}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Date of Joining:</span>
                  <span className="info-value">{formatDate(payroll.date_of_joining || new Date())}</span>
                </div>
              </div>
            </div>

            {/* Attendance Summary */}
            <div className="payslip-attendance">
              <h3>Attendance Summary</h3>
              <div className="attendance-grid">
                <div className="attendance-item">
                  <span className="attendance-label">Worked Days:</span>
                  <span className="attendance-value">{payroll.worked_days || 0}</span>
                </div>
                <div className="attendance-item">
                  <span className="attendance-label">Paid Time Off:</span>
                  <span className="attendance-value">{payroll.paid_time_off || 0}</span>
                </div>
              </div>
            </div>

            {/* Salary Breakdown */}
            <div className="payslip-breakdown">
              <div className="breakdown-column">
                <h3>Earnings</h3>
                <table className="breakdown-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="text-right">Amount</th>
                      <th className="text-center">Rate %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.map((earning) => (
                      <tr key={earning.detail_id}>
                        <td>{earning.component_name}</td>
                        <td className="text-right">{formatCurrency(earning.amount)}</td>
                        <td className="text-center">{earning.rate || 100}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td><strong>Gross Earnings</strong></td>
                      <td className="text-right" colSpan="2">
                        <strong>{formatCurrency(payroll.gross_salary)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="breakdown-column">
                <h3>Deductions</h3>
                <table className="breakdown-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="text-right">Amount</th>
                      <th className="text-center">Rate %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductions.map((deduction) => (
                      <tr key={deduction.detail_id}>
                        <td>{deduction.component_name}</td>
                        <td className="text-right">{formatCurrency(deduction.amount)}</td>
                        <td className="text-center">{deduction.rate || '-'}%</td>
                      </tr>
                    ))}
                    {deductions.length === 0 && (
                      <tr>
                        <td colSpan="3" className="text-center">No deductions</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td><strong>Total Deductions</strong></td>
                      <td className="text-right" colSpan="2">
                        <strong>{formatCurrency(payroll.total_deductions)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Net Salary */}
            <div className="payslip-net-salary">
              <div className="net-salary-box">
                <span className="net-salary-label">Total Net Payable</span>
                <span className="net-salary-amount">{formatCurrency(payroll.net_salary)}</span>
                <span className="net-salary-note">
                  (Gross Earning - Total Deductions)
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="payslip-footer">
              <p className="footer-note">
                <strong>Note:</strong> This is a computer-generated payslip and does not require a signature. 
                Salary is calculated based on the employee's monthly attendance. 
                Paid leaves are included in the total payable days, and unpaid leaves are deducted from salary.
              </p>
              <p className="footer-disclaimer">
                This payslip is confidential and is intended solely for the addressee.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payslip;
