import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import api from "../services/api";
import "../styles/App.css";

const Payslip = () => {
  const { payrollId } = useParams();
  const navigate = useNavigate();
  const [payslipData, setPayslipData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPayslipData();
  }, [payrollId]);

  const fetchPayslipData = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/payroll/payslips/${payrollId}`);
      setPayslipData(response.data.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch payslip data");
      console.error("Error fetching payslip:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(Number(amount || 0));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatMonth = (month, year) => {
    const date = new Date(year, month - 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const handlePrint = () => {
    const content = document.getElementById("payslip-content");
    if (!content) {
      window.print();
      return;
    }

    const printWindow = window.open("", "PRINT", "height=800,width=1000");
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payslip</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: "Segoe UI", Arial, sans-serif;
              padding: 24px;
              color: #0f172a;
              background: #ffffff;
            }
            .payslip-container {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 24px;
            }
            .payslip-company-header { text-align: center; margin-bottom: 16px; }
            .payslip-company-header h1 { margin: 0 0 6px; font-size: 22px; }
            .company-tagline { margin: 0; color: #64748b; font-size: 12px; }
            .payslip-title h2 { margin: 12px 0 20px; font-size: 18px; }
            .payslip-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            .info-section { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
            .info-section h3 { margin: 0 0 10px; font-size: 14px; color: #1e293b; }
            .info-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 4px 0; }
            .info-label { color: #64748b; }
            .payslip-attendance { margin-top: 18px; }
            .attendance-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
            .attendance-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; font-size: 12px; }
            .payslip-breakdown { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px; }
            .breakdown-column { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
            .breakdown-column h3 { margin: 0 0 10px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 6px 4px; border-bottom: 1px solid #e2e8f0; }
            th { text-align: left; color: #64748b; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row td { border-bottom: none; font-weight: 600; }
            .payslip-net-salary { margin-top: 16px; text-align: center; }
            .net-salary-box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
            .net-salary-label { display: block; font-size: 12px; color: #64748b; }
            .net-salary-amount { display: block; font-size: 18px; font-weight: 700; }
            .net-salary-note { display: block; font-size: 11px; color: #94a3b8; }
            .payslip-footer { margin-top: 16px; font-size: 11px; color: #64748b; }
            @page { margin: 12mm; }
          </style>
        </head>
        <body>
          ${content.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  const handleDownloadPDF = () => {
    // This would integrate with a PDF generation service
    alert("PDF download functionality to be implemented");
  };

  if (loading) {
    return (
      <div className="dashboard-layout">
        <Sidebar activeSection="payroll" />
        <main className="dashboard-main">
          <Header title="Payslip" />
          <div className="payslip-page">
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading payslip...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-layout">
        <Sidebar activeSection="payroll" />
        <main className="dashboard-main">
          <Header title="Payslip" />
          <div className="payslip-page">
            <div className="alert alert-error">{error}</div>
            <button
              onClick={() => navigate("/payroll")}
              className="btn btn-secondary"
            >
              Back to Payroll
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!payslipData) {
    return (
      <div className="dashboard-layout">
        <Sidebar activeSection="payroll" />
        <main className="dashboard-main">
          <Header title="Payslip" />
          <div className="payslip-page">
            <div className="alert alert-warning">Payslip not found</div>
            <button
              onClick={() => navigate("/payroll")}
              className="btn btn-secondary"
            >
              Back to Payroll
            </button>
          </div>
        </main>
      </div>
    );
  }

  const payroll = payslipData;

  const earnings = [
    {
      id: "basic",
      name: "Basic Salary",
      amount: payroll.basic_salary,
    },
    {
      id: "hra",
      name: "HRA",
      amount: payroll.hra,
    },
    {
      id: "earned",
      name: "Earned Salary",
      amount: payroll.earned_salary,
    },
  ].filter((item) => Number(item.amount || 0) > 0);

  const deductions = [
    {
      id: "pf",
      name: "PF Deduction",
      amount: payroll.pf_deduction,
    },
    {
      id: "tax",
      name: "Tax Deduction",
      amount: payroll.tax_deduction,
    },
    {
      id: "unpaid",
      name: "Unpaid Leave Deduction",
      amount: payroll.unpaid_deduction,
    },
  ].filter((item) => Number(item.amount || 0) > 0);

  const workedDays = payroll.present_days || 0;
  const paidLeaves = payroll.paid_leaves || 0;
  const unpaidLeaves = payroll.unpaid_leaves || 0;

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="payroll" />

      <main className="dashboard-main">
        <Header title="Payslip" />

        <div className="payslip-page">
          <div className="payslip-header">
            <button
              onClick={() => navigate("/payroll")}
              className="btn btn-secondary"
            >
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
            {/* Company Header */}
            <div className="payslip-company-header">
              <h1>WorkZen HRMS</h1>
              <p className="company-tagline">
                Your Workforce Management Solution
              </p>
            </div>

            {/* Payslip Title */}
            <div className="payslip-title">
              <h2>
                Salary Slip for {formatMonth(payroll.month, payroll.year)}
              </h2>
            </div>

            {/* Employee Information */}
            <div className="payslip-info-grid">
              <div className="info-section">
                <h3>Employee Information</h3>
                <div className="info-row">
                  <span className="info-label">Employee Name:</span>
                  <span className="info-value">
                    {payroll.employee_name || payroll.name}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Employee Code:</span>
                  <span className="info-value">
                    {payroll.employee_code || payroll.employee_id}
                  </span>
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
                  <span className="info-value">
                    {formatMonth(payroll.month, payroll.year)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Payment Date:</span>
                  <span className="info-value">
                    {payroll.payment_date
                      ? formatDate(payroll.payment_date)
                      : "Pending"}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Status:</span>
                  <span
                    className={`status-badge status-${(
                      payroll.status || "Pending"
                    )
                      .toLowerCase()
                      .replace(" ", "-")}`}
                  >
                    {payroll.status || "Pending"}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Date of Joining:</span>
                  <span className="info-value">
                    {payroll.created_at ? formatDate(payroll.created_at) : "-"}
                  </span>
                </div>
              </div>
            </div>

            {/* Attendance Summary */}
            <div className="payslip-attendance">
              <h3>Attendance Summary</h3>
              <div className="attendance-grid">
                <div className="attendance-item">
                  <span className="attendance-label">Worked Days:</span>
                  <span className="attendance-value">{workedDays}</span>
                </div>
                <div className="attendance-item">
                  <span className="attendance-label">Paid Time Off:</span>
                  <span className="attendance-value">{paidLeaves}</span>
                </div>
                <div className="attendance-item">
                  <span className="attendance-label">Unpaid Leaves:</span>
                  <span className="attendance-value">{unpaidLeaves}</span>
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
                        <td>{earning.name}</td>
                        <td className="text-right">
                          {formatCurrency(earning.amount)}
                        </td>
                        <td className="text-center">-</td>
                      </tr>
                    ))}
                    {earnings.length === 0 && (
                      <tr>
                        <td colSpan="3" className="text-center">
                          No earnings listed
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td>
                        <strong>Gross Earnings</strong>
                      </td>
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
                        <td>{deduction.name}</td>
                        <td className="text-right">
                          {formatCurrency(deduction.amount)}
                        </td>
                        <td className="text-center">-</td>
                      </tr>
                    ))}
                    {deductions.length === 0 && (
                      <tr>
                        <td colSpan="3" className="text-center">
                          No deductions
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td>
                        <strong>Total Deductions</strong>
                      </td>
                      <td className="text-right" colSpan="2">
                        <strong>
                          {formatCurrency(payroll.total_deductions)}
                        </strong>
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
                <span className="net-salary-amount">
                  {formatCurrency(payroll.net_salary)}
                </span>
                <span className="net-salary-note">
                  (Gross Earning - Total Deductions)
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="payslip-footer">
              <p className="footer-note">
                <strong>Note:</strong> This is a computer-generated payslip and
                does not require a signature. Salary is calculated based on the
                employee's monthly attendance. Paid leaves are included in the
                total payable days, and unpaid leaves are deducted from salary.
              </p>
              <p className="footer-disclaimer">
                This payslip is confidential and is intended solely for the
                addressee.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Payslip;
