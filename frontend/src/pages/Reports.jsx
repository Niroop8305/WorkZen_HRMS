import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import html2pdf from "html2pdf.js";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import "../styles/App.css";
import "../styles/Reports.css";

const Reports = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("reports");
  const [reportType, setReportType] = useState("salary-statement");

  // Salary Statement Report State
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [employeeData, setEmployeeData] = useState(null);
  const [showReport, setShowReport] = useState(false);

  // Check if user has access to Reports
  const hasReportAccess =
    user?.role === "Admin" || user?.role === "Payroll Officer";

  // Redirect if user doesn't have access
  useEffect(() => {
    if (!hasReportAccess) {
      navigate("/unauthorized");
    }
  }, [hasReportAccess, navigate]);

  // Fetch employees for dropdown
  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem("workzen_token");
      // Fetch payroll employees for salary statement report
      const response = await api.get("/employees", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      console.log("Employees API Response:", response.data);
      const employeesList = response.data.data || [];
      console.log("Employees List:", employeesList);
      setEmployees(employeesList);
    } catch (error) {
      console.error("Error fetching employees:", error);
      console.error("Error details:", error.response?.data);
      setError("Failed to load employees");
    }
  };

  const navItems = [
    { id: "employees", label: "Employees", path: "/dashboard" },
    { id: "attendance", label: "Attendance", path: "/attendance" },
    { id: "timeoff", label: "Time Off", path: null },
    { id: "payroll", label: "Payroll", path: null },
    { id: "reports", label: "Reports", path: "/reports" },
  ];

  const handleNavClick = (item) => {
    if (item.path) {
      navigate(item.path);
    } else {
      setActiveSection(item.id);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleGenerateReport = async () => {
    if (!selectedEmployee) {
      setError("Please select an employee");
      return;
    }

    if (!selectedYear) {
      setError("Please select a year");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch salary statement data
      const response = await api.get(
        `/payroll/salary-statement?employee_id=${selectedEmployee}&year=${selectedYear}`
      );

      // Show the report inline
      setReportData(response.data.data);
      setEmployeeData(
        response.data.employee ||
          employees.find((e) => e.emp_id === selectedEmployee)
      );
      setShowReport(true);
    } catch (err) {
      console.error("Error generating report:", err);
      setError(err.response?.data?.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!reportData) return;

    const employee =
      employeeData || employees.find((e) => e.emp_id == selectedEmployee);

    // Get the report display element that's already rendered on the page
    const reportElement = document.querySelector(".report-display");

    if (!reportElement) {
      alert("Please generate the report first before downloading.");
      return;
    }

    // Configure PDF options
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `Salary_Statement_${
        employee?.name || employee?.full_name || "Employee"
      }_${selectedYear}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#000000",
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
        compress: true,
      },
    };

    // Generate PDF from the existing DOM element
    html2pdf()
      .set(opt)
      .from(reportElement)
      .save()
      .catch((error) => {
        console.error("Error generating PDF:", error);
        alert("Error generating PDF. Please try again.");
      });
  };

  const generateReportHTML = (employee, companyName, data) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Salary Statement Report Print</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            background: #000 !important;
            color: #fff;
            padding: 40px;
          }
          .print-container {
            max-width: 900px;
            margin: 0 auto;
            border: 2px solid #fff;
            padding: 40px;
            background: #000 !important;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #fff;
          }
          .header h1 {
            color: #5dade2;
            font-size: 28px;
            margin-bottom: 10px;
            font-weight: 600;
          }
          .company-name {
            color: #ff4444;
            font-size: 18px;
            margin-bottom: 20px;
            font-weight: 500;
          }
          .report-title {
            color: #ff4444;
            font-size: 20px;
            margin-bottom: 25px;
            font-weight: 500;
          }
          .employee-details {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
          }
          .detail-group {
            flex: 1;
          }
          .detail-row {
            display: flex;
            margin-bottom: 8px;
          }
          .detail-label {
            color: #fff;
            min-width: 150px;
            font-size: 14px;
          }
          .detail-value {
            color: #fff;
            font-size: 14px;
          }
          .salary-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 30px;
          }
          .section-header {
            background: transparent;
            padding: 15px 0;
          }
          .section-title {
            color: #ff4444;
            font-size: 18px;
            font-weight: 600;
          }
          .table-header {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #fff;
            margin-bottom: 10px;
          }
          .table-header div {
            flex: 1;
            text-align: center;
            color: #5dade2;
            font-size: 14px;
            font-weight: 500;
          }
          .component-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #444;
          }
          .component-row div {
            flex: 1;
            text-align: center;
            color: #fff;
            font-size: 14px;
          }
          .component-row div:first-child {
            text-align: left;
            padding-left: 40px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            margin-top: 10px;
            border-top: 2px solid #fff;
            font-weight: 600;
          }
          .total-row div {
            flex: 1;
            text-align: center;
            color: #fff;
            font-size: 15px;
          }
          .total-row div:first-child {
            text-align: left;
          }
          .net-salary {
            margin-top: 30px;
            padding: 15px 0;
            border-top: 2px solid #fff;
          }
          .net-salary-row {
            display: flex;
            justify-content: space-between;
            font-size: 16px;
            font-weight: 700;
          }
          .net-salary-row div {
            flex: 1;
            text-align: center;
            color: #fff;
          }
          .net-salary-row div:first-child {
            text-align: left;
            color: #ff4444;
          }
          @media print {
            body {
              background: #000 !important;
              padding: 20px;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-container {
              background: #000 !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="print-container">
          <div class="header">
            <h1>Salary Statement Report Print</h1>
          </div>
          
          <div class="company-name">[${companyName}]</div>
          <div class="report-title">Salary Statement Report</div>
          
          <div class="employee-details">
            <div class="detail-group">
              <div class="detail-row">
                <div class="detail-label">Employee Name</div>
                <div class="detail-value">${employee?.full_name || "N/A"}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Designation</div>
                <div class="detail-value">${employee?.role_name || "N/A"}</div>
              </div>
            </div>
            <div class="detail-group">
              <div class="detail-row">
                <div class="detail-label">Date Of Joining</div>
                <div class="detail-value">${
                  employee?.created_at
                    ? new Date(employee.created_at).toLocaleDateString("en-IN")
                    : "N/A"
                }</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Salary Effective From</div>
                <div class="detail-value">${
                  employee?.created_at
                    ? new Date(employee.created_at).toLocaleDateString("en-IN")
                    : "N/A"
                }</div>
              </div>
            </div>
          </div>
          
          <div class="salary-table">
            <div class="section-header">
              <div class="section-title">Salary Components</div>
            </div>
            
            <div class="table-header">
              <div></div>
              <div>Monthly Amount</div>
              <div>Yearly Amount</div>
            </div>
            
            <div class="section-header">
              <div class="section-title">Earnings</div>
            </div>
            
            ${
              data && data.length > 0
                ? `
              <div class="component-row">
                <div>Basic</div>
                <div>₹ ${parseFloat(data[0]?.basic_salary || 0).toFixed(
                  0
                )}</div>
                <div>₹ ${(parseFloat(data[0]?.basic_salary || 0) * 12).toFixed(
                  0
                )}</div>
              </div>
              <div class="component-row">
                <div>HRA</div>
                <div>₹ ${parseFloat(data[0]?.allowances || 0).toFixed(0)}</div>
                <div>₹ ${(parseFloat(data[0]?.allowances || 0) * 12).toFixed(
                  0
                )}</div>
              </div>
              <div class="component-row">
                <div>:</div>
                <div>:</div>
                <div>:</div>
              </div>
              <div class="component-row">
                <div>:</div>
                <div>:</div>
                <div>:</div>
              </div>
            `
                : `
              <div class="component-row">
                <div>Basic</div>
                <div>₹ 0</div>
                <div>₹ 0</div>
              </div>
            `
            }
            
            <div class="section-header" style="margin-top: 20px;">
              <div class="section-title">Deduction</div>
            </div>
            
            ${
              data && data.length > 0
                ? `
              <div class="component-row">
                <div>PF</div>
                <div>₹ ${parseFloat(data[0]?.deductions || 0).toFixed(0)}</div>
                <div>₹ ${(parseFloat(data[0]?.deductions || 0) * 12).toFixed(
                  0
                )}</div>
              </div>
              <div class="component-row">
                <div>:</div>
                <div>:</div>
                <div>:</div>
              </div>
              <div class="component-row">
                <div>:</div>
                <div>:</div>
                <div>:</div>
              </div>
            `
                : `
              <div class="component-row">
                <div>PF</div>
                <div>₹ 0</div>
                <div>₹ 0</div>
              </div>
            `
            }
            
            <div class="net-salary">
              <div class="net-salary-row">
                <div>Net Salary</div>
                <div>₹ ${
                  data && data.length > 0
                    ? parseFloat(data[0]?.net_salary || 0).toFixed(0)
                    : "0"
                }</div>
                <div>₹ ${
                  data && data.length > 0
                    ? (parseFloat(data[0]?.net_salary || 0) * 12).toFixed(0)
                    : "0"
                }</div>
              </div>
            </div>
          </div>
        </div>

      </body>
      </html>
    `;
  };

  // Generate years dropdown (current year and 5 years back)
  const generateYears = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = 0; i < 6; i++) {
      years.push(currentYear - i);
    }
    return years;
  };

  if (!hasReportAccess) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="reports" />

      {/* Main Content */}
      <main className="dashboard-main">
        <Header title="Reports" />

        {/* Reports Content */}
        <div className="reports-container">
          <div className="report-card">
            <div className="report-header">
              <div className="report-title-section">
                <h2 className="report-name">Salary Statement Report</h2>
              </div>
              <button
                className="btn-print"
                onClick={handleGenerateReport}
                disabled={loading || !selectedEmployee || !selectedYear}
              >
                {loading ? "Generating..." : "Print"}
              </button>
            </div>

            <div className="report-form">
              {error && (
                <div className="error-message">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="employee-select">
                  Employee Name:{" "}
                  {employees.length > 0 && `(${employees.length} employees)`}
                </label>
                <select
                  id="employee-select"
                  className="form-select"
                  value={selectedEmployee}
                  onChange={(e) => {
                    setSelectedEmployee(e.target.value);
                    setError(null);
                  }}
                >
                  <option value="">-- Select Employee --</option>
                  {employees.length === 0 ? (
                    <option value="" disabled>
                      Loading employees...
                    </option>
                  ) : (
                    employees.map((emp) => (
                      <option key={emp.emp_id} value={emp.emp_id}>
                        {emp.name} ({emp.emp_id})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="year-select">Year</label>
                <select
                  id="year-select"
                  className="form-select"
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setError(null);
                  }}
                >
                  {generateYears().map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Display Report Inline */}
          {showReport && reportData && (
            <div className="report-display">
              <div className="report-content">
                <div className="report-print-header">
                  <h1
                    style={{
                      color: "#5dade2",
                      textAlign: "center",
                      fontSize: "28px",
                      marginBottom: "20px",
                      paddingBottom: "20px",
                      borderBottom: "2px solid #fff",
                    }}
                  >
                    Salary Statement Report Print
                  </h1>
                </div>

                <div
                  style={{
                    color: "#ff4444",
                    fontSize: "18px",
                    marginBottom: "20px",
                  }}
                >
                  [{user?.profile?.company_name || "kitsw"}]
                </div>

                <div
                  style={{
                    color: "#ff4444",
                    fontSize: "20px",
                    marginBottom: "25px",
                  }}
                >
                  Salary Statement Report
                </div>

                <div className="employee-details-grid">
                  <div className="detail-column">
                    <div className="detail-item">
                      <span className="detail-label">Employee Name</span>
                      <span className="detail-value">
                        {employeeData?.name || employeeData?.full_name || "N/A"}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Designation</span>
                      <span className="detail-value">
                        {employeeData?.designation ||
                          employeeData?.role_name ||
                          "Employee"}
                      </span>
                    </div>
                  </div>
                  <div className="detail-column">
                    <div className="detail-item">
                      <span className="detail-label">Date Of Joining</span>
                      <span className="detail-value">
                        {employeeData?.date_of_joining ||
                        employeeData?.created_at
                          ? new Date(
                              employeeData?.date_of_joining ||
                                employeeData?.created_at
                            ).toLocaleDateString("en-IN")
                          : "N/A"}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">
                        Salary Effective From
                      </span>
                      <span className="detail-value">
                        {employeeData?.date_of_joining ||
                        employeeData?.created_at
                          ? new Date(
                              employeeData?.date_of_joining ||
                                employeeData?.created_at
                            ).toLocaleDateString("en-IN")
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="salary-components-section">
                  <h3
                    style={{
                      color: "#ff4444",
                      fontSize: "18px",
                      marginBottom: "15px",
                      marginTop: "30px",
                    }}
                  >
                    Salary Components
                  </h3>

                  <div className="components-table-header">
                    <div></div>
                    <div style={{ color: "#5dade2" }}>Monthly Amount</div>
                    <div style={{ color: "#5dade2" }}>Yearly Amount</div>
                  </div>

                  <h4
                    style={{
                      color: "#ff4444",
                      fontSize: "18px",
                      marginTop: "20px",
                      marginBottom: "10px",
                    }}
                  >
                    Earnings
                  </h4>

                  {reportData && reportData.length > 0 ? (
                    <>
                      <div className="component-row">
                        <div>Basic</div>
                        <div>
                          ₹{" "}
                          {parseFloat(reportData[0]?.basic_salary || 0).toFixed(
                            0
                          )}
                        </div>
                        <div>
                          ₹{" "}
                          {(
                            parseFloat(reportData[0]?.basic_salary || 0) * 12
                          ).toFixed(0)}
                        </div>
                      </div>
                      <div className="component-row">
                        <div>HRA</div>
                        <div>
                          ₹{" "}
                          {parseFloat(reportData[0]?.allowances || 0).toFixed(
                            0
                          )}
                        </div>
                        <div>
                          ₹{" "}
                          {(
                            parseFloat(reportData[0]?.allowances || 0) * 12
                          ).toFixed(0)}
                        </div>
                      </div>
                      <div className="component-row">
                        <div>:</div>
                        <div>:</div>
                        <div>:</div>
                      </div>
                      <div className="component-row">
                        <div>:</div>
                        <div>:</div>
                        <div>:</div>
                      </div>
                    </>
                  ) : (
                    <div className="component-row">
                      <div>Basic</div>
                      <div>₹ 0</div>
                      <div>₹ 0</div>
                    </div>
                  )}

                  <h4
                    style={{
                      color: "#ff4444",
                      fontSize: "18px",
                      marginTop: "20px",
                      marginBottom: "10px",
                    }}
                  >
                    Deduction
                  </h4>

                  {reportData && reportData.length > 0 ? (
                    <>
                      <div className="component-row">
                        <div>PF</div>
                        <div>
                          ₹{" "}
                          {parseFloat(reportData[0]?.deductions || 0).toFixed(
                            0
                          )}
                        </div>
                        <div>
                          ₹{" "}
                          {(
                            parseFloat(reportData[0]?.deductions || 0) * 12
                          ).toFixed(0)}
                        </div>
                      </div>
                      <div className="component-row">
                        <div>:</div>
                        <div>:</div>
                        <div>:</div>
                      </div>
                      <div className="component-row">
                        <div>:</div>
                        <div>:</div>
                        <div>:</div>
                      </div>
                    </>
                  ) : (
                    <div className="component-row">
                      <div>PF</div>
                      <div>₹ 0</div>
                      <div>₹ 0</div>
                    </div>
                  )}

                  <div
                    className="net-salary-row"
                    style={{
                      marginTop: "30px",
                      paddingTop: "15px",
                      borderTop: "2px solid #fff",
                    }}
                  >
                    <div
                      style={{
                        color: "#ff4444",
                        fontWeight: "700",
                        fontSize: "16px",
                      }}
                    >
                      Net Salary
                    </div>
                    <div style={{ fontWeight: "700", fontSize: "16px" }}>
                      ₹{" "}
                      {reportData && reportData.length > 0
                        ? parseFloat(reportData[0]?.net_salary || 0).toFixed(0)
                        : "0"}
                    </div>
                    <div style={{ fontWeight: "700", fontSize: "16px" }}>
                      ₹{" "}
                      {reportData && reportData.length > 0
                        ? (
                            parseFloat(reportData[0]?.net_salary || 0) * 12
                          ).toFixed(0)
                        : "0"}
                    </div>
                  </div>
                </div>

                <div className="report-actions">
                  <button
                    className="btn-download-pdf"
                    onClick={handleDownloadPDF}
                  >
                    Download as PDF
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Reports;
