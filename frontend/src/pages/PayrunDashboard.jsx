import { useState } from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import "../styles/PayrunDashboard.css";

const PayrunDashboard = () => {
  const [selectedMonth, setSelectedMonth] = useState("October");
  const [selectedYear, setSelectedYear] = useState(2025);
  const [activePayslipTab, setActivePayslipTab] = useState("worked-days");

  // Static data loaded by default
  const [payrunData, setPayrunData] = useState({
    success: true,
    message: "Payrun generated successfully for October 2025",
    payrun: {
      id: 1,
      month: "October",
      year: 2025,
      total_employees: 5,
      total_cost: 215000.0,
      status: "Done",
    },
    payslips: [
      {
        id: 1,
        employee_name: "Rajesh Kumar",
        employee_id: "EMP001",
        basic_salary: 25000,
        hra: 5000,
        earned_salary: 24000,
        gross_salary: 29000,
        pf_deduction: 3000,
        tax_deduction: 200,
        unpaid_deduction: 0,
        total_deductions: 3200,
        net_salary: 25800,
        present_days: 22,
        paid_leaves: 2,
        unpaid_leaves: 0,
        status: "Done",
      },
      {
        id: 2,
        employee_name: "Priya Sharma",
        employee_id: "EMP002",
        basic_salary: 30000,
        hra: 6000,
        earned_salary: 28800,
        gross_salary: 34800,
        pf_deduction: 3600,
        tax_deduction: 200,
        unpaid_deduction: 0,
        total_deductions: 3800,
        net_salary: 31000,
        present_days: 24,
        paid_leaves: 0,
        unpaid_leaves: 0,
        status: "Done",
      },
      {
        id: 3,
        employee_name: "Amit Patel",
        employee_id: "EMP003",
        basic_salary: 28000,
        hra: 5600,
        earned_salary: 22400,
        gross_salary: 28000,
        pf_deduction: 3360,
        tax_deduction: 200,
        unpaid_deduction: 1866.67,
        total_deductions: 5426.67,
        net_salary: 22573.33,
        present_days: 20,
        paid_leaves: 2,
        unpaid_leaves: 2,
        status: "Done",
      },
      {
        id: 4,
        employee_name: "Sneha Reddy",
        employee_id: "EMP004",
        basic_salary: 32000,
        hra: 6400,
        earned_salary: 30720,
        gross_salary: 37120,
        pf_deduction: 3840,
        tax_deduction: 200,
        unpaid_deduction: 0,
        total_deductions: 4040,
        net_salary: 33080,
        present_days: 23,
        paid_leaves: 1,
        unpaid_leaves: 0,
        status: "Done",
      },
      {
        id: 5,
        employee_name: "Vikram Singh",
        employee_id: "EMP005",
        basic_salary: 27000,
        hra: 5400,
        earned_salary: 25920,
        gross_salary: 31320,
        pf_deduction: 3240,
        tax_deduction: 200,
        unpaid_deduction: 0,
        total_deductions: 3440,
        net_salary: 27880,
        present_days: 21,
        paid_leaves: 3,
        unpaid_leaves: 0,
        status: "Done",
      },
    ],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [showPayslipModal, setShowPayslipModal] = useState(false);

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  // Employee selection for modal compute
  const [selectedEmployeeForCompute, setSelectedEmployeeForCompute] =
    useState(null);

  // New Payslip Form State
  const [showNewPayslipForm, setShowNewPayslipForm] = useState(false);
  const [newPayslipData, setNewPayslipData] = useState({
    employee_id: "",
    employee_name: "",
    basic_salary: 25000,
    month: "October",
    year: 2025,
    present_days: 0,
    paid_leaves: 0,
    unpaid_leaves: 0,
    total_working_days: 30,
  });
  const [computedPayslip, setComputedPayslip] = useState(null);

  // Available employees
  const availableEmployees = [
    { id: "EMP001", name: "Rajesh Kumar", basic_salary: 25000 },
    { id: "EMP002", name: "Priya Sharma", basic_salary: 30000 },
    { id: "EMP003", name: "Amit Patel", basic_salary: 28000 },
    { id: "EMP004", name: "Sneha Reddy", basic_salary: 32000 },
    { id: "EMP005", name: "Vikram Singh", basic_salary: 27000 },
    { id: "EMP006", name: "Anjali Verma", basic_salary: 26000 },
  ];

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const years = [2023, 2024, 2025, 2026];

  const formatCurrency = (amount) => {
    return `₹ ${parseFloat(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleViewPayslip = (payslip) => {
    setSelectedPayslip(payslip);
    setSelectedEmployeeForCompute(payslip);
    setShowPayslipModal(true);
  };

  const handleCloseModal = () => {
    setShowPayslipModal(false);
    setSelectedPayslip(null);
    setSelectedEmployeeForCompute(null);
  };

  const handleEmployeeSelectForCompute = (e) => {
    const empId = e.target.value;
    if (!empId) {
      setSelectedEmployeeForCompute(null);
      return;
    }

    const employee = availableEmployees.find((emp) => emp.id === empId);
    if (employee) {
      // Find existing payslip or create temporary one
      const existingPayslip = payrunData.payslips.find(
        (p) => p.employee_id === empId
      );

      if (existingPayslip) {
        setSelectedEmployeeForCompute(existingPayslip);
      } else {
        // Create temporary payslip data for new employee
        setSelectedEmployeeForCompute({
          employee_id: employee.id,
          employee_name: employee.name,
          basic_salary: employee.basic_salary,
          hra: employee.basic_salary * 0.2,
          present_days: 0,
          paid_leaves: 0,
          unpaid_leaves: 0,
          earned_salary: 0,
          gross_salary: 0,
          pf_deduction: 0,
          tax_deduction: 200,
          unpaid_deduction: 0,
          total_deductions: 200,
          net_salary: 0,
        });
      }
    }
  };

  const handleComputeInModal = () => {
    if (!selectedEmployeeForCompute) {
      alert("Please select an employee first!");
      return;
    }

    // Recompute with current data
    const totalWorkingDays = 30;
    const basicSalary = selectedEmployeeForCompute.basic_salary;
    const perDayRate = basicSalary / totalWorkingDays;

    const earnedDays =
      (selectedEmployeeForCompute.present_days || 0) +
      (selectedEmployeeForCompute.paid_leaves || 0);
    const earnedSalary = perDayRate * earnedDays;
    const hra = earnedSalary * 0.2;
    const grossSalary = earnedSalary + hra;

    const pfDeduction = earnedSalary * 0.12;
    const taxDeduction = 200;
    const unpaidDeduction =
      perDayRate * (selectedEmployeeForCompute.unpaid_leaves || 0);
    const totalDeductions = pfDeduction + taxDeduction + unpaidDeduction;
    const netSalary = grossSalary - totalDeductions;

    // Update selected employee with computed values
    setSelectedEmployeeForCompute({
      ...selectedEmployeeForCompute,
      earned_salary: earnedSalary,
      hra: hra,
      gross_salary: grossSalary,
      pf_deduction: pfDeduction,
      tax_deduction: taxDeduction,
      unpaid_deduction: unpaidDeduction,
      total_deductions: totalDeductions,
      net_salary: netSalary,
    });

    alert("Salary computed successfully!");
  };

  const handlePrintPayslip = () => {
    window.print();
  };

  // Validate Payslip Handler with Loading & Feedback
  const handleValidatePayslip = async () => {
    if (!selectedPayslip?.id) {
      setValidationMessage("❌ No payslip selected");
      setTimeout(() => setValidationMessage(""), 3000);
      return;
    }

    // Check if already validated
    if (selectedPayslip.status === "Done") {
      setValidationMessage("ℹ️ This payslip is already validated");
      setTimeout(() => setValidationMessage(""), 3000);
      return;
    }

    if (
      !confirm(
        "Are you sure you want to validate this payslip? This action will mark it as finalized."
      )
    ) {
      return;
    }

    // Start loading state
    setIsValidating(true);
    setValidationMessage("⏳ Validating payslip...");

    try {
      const response = await fetch(
        `http://localhost:5000/api/payslip/${selectedPayslip.id}/validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to validate payslip");
      }

      // Update the selected payslip with validated data
      setSelectedPayslip(data.payslip);

      // Update the payslip in the payrun data list
      if (payrunData?.payslips) {
        const updatedPayslips = payrunData.payslips.map((p) =>
          p.id === selectedPayslip.id ? data.payslip : p
        );
        setPayrunData({
          ...payrunData,
          payslips: updatedPayslips,
        });
      }

      // Success message
      setValidationMessage("✅ Payslip validated successfully!");

      // Clear message after 3 seconds
      setTimeout(() => setValidationMessage(""), 3000);
    } catch (err) {
      // Error message
      setValidationMessage(`❌ Error: ${err.message}`);
      console.error("Validation error:", err);

      // Clear message after 5 seconds
      setTimeout(() => setValidationMessage(""), 5000);
    } finally {
      // Stop loading state
      setIsValidating(false);
    }
  };

  // New Payslip Handlers
  const handleNewPayslip = () => {
    setShowNewPayslipForm(true);
    setComputedPayslip(null);
    setNewPayslipData({
      employee_id: "",
      employee_name: "",
      basic_salary: 25000,
      month: "October",
      year: 2025,
      present_days: 0,
      paid_leaves: 0,
      unpaid_leaves: 0,
      total_working_days: 30,
    });
  };

  const handleCloseNewPayslipForm = () => {
    setShowNewPayslipForm(false);
    setComputedPayslip(null);
  };

  const handleEmployeeChange = (e) => {
    const employeeId = e.target.value;
    const employee = availableEmployees.find((emp) => emp.id === employeeId);

    if (employee) {
      setNewPayslipData({
        ...newPayslipData,
        employee_id: employee.id,
        employee_name: employee.name,
        basic_salary: employee.basic_salary,
      });
    }
  };

  const handleNewPayslipInputChange = (field, value) => {
    setNewPayslipData({
      ...newPayslipData,
      [field]: value,
    });
  };

  const handleComputeNewPayslip = () => {
    const {
      basic_salary,
      present_days,
      paid_leaves,
      unpaid_leaves,
      total_working_days,
    } = newPayslipData;

    // Calculate per day rate
    const perDayRate = basic_salary / total_working_days;

    // Calculate earned days and salary
    const earnedDays = present_days + paid_leaves;
    const earnedSalary = perDayRate * earnedDays;

    // Calculate allowances
    const hra = basic_salary * 0.2; // 20% HRA

    // Calculate gross salary
    const grossSalary = earnedSalary + hra;

    // Calculate deductions
    const pfDeduction = basic_salary * 0.12; // 12% PF
    const taxDeduction = 200; // Fixed tax
    const unpaidDeduction = perDayRate * unpaid_leaves;
    const totalDeductions = pfDeduction + taxDeduction + unpaidDeduction;

    // Calculate net salary
    const netSalary = grossSalary - totalDeductions;

    setComputedPayslip({
      ...newPayslipData,
      earned_salary: earnedSalary,
      hra: hra,
      gross_salary: grossSalary,
      pf_deduction: pfDeduction,
      tax_deduction: taxDeduction,
      unpaid_deduction: unpaidDeduction,
      total_deductions: totalDeductions,
      net_salary: netSalary,
    });
  };

  const handleGeneratePayslip = () => {
    if (!computedPayslip) {
      alert("Please compute the payslip first!");
      return;
    }

    // Add the new payslip to the list
    const newPayslip = {
      id: payrunData.payslips.length + 1,
      employee_name: computedPayslip.employee_name,
      employee_id: computedPayslip.employee_id,
      basic_salary: computedPayslip.basic_salary,
      hra: computedPayslip.hra,
      earned_salary: computedPayslip.earned_salary,
      gross_salary: computedPayslip.gross_salary,
      pf_deduction: computedPayslip.pf_deduction,
      tax_deduction: computedPayslip.tax_deduction,
      unpaid_deduction: computedPayslip.unpaid_deduction,
      total_deductions: computedPayslip.total_deductions,
      net_salary: computedPayslip.net_salary,
      present_days: computedPayslip.present_days,
      paid_leaves: computedPayslip.paid_leaves,
      unpaid_leaves: computedPayslip.unpaid_leaves,
      status: "Done",
    };

    setPayrunData({
      ...payrunData,
      payslips: [...payrunData.payslips, newPayslip],
      payrun: {
        ...payrunData.payrun,
        total_employees: payrunData.payrun.total_employees + 1,
        total_cost: payrunData.payrun.total_cost + newPayslip.gross_salary,
      },
    });

    alert(
      `Payslip generated successfully for ${computedPayslip.employee_name}!`
    );
    handleCloseNewPayslipForm();
  };

  const handleRunPayrun = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:5000/api/payrun/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to run payrun");
      }

      setPayrunData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      setPayrunData(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar activeSection="payroll" />

      <main className="dashboard-main">
        <Header title="Payrun Dashboard" />

        <div className="payrun-dashboard">
          <div className="dashboard-header">
            <h1>🚀 Payroll Payrun Dashboard</h1>
            <p className="subtitle">
              Automatically generate payslips for all employees
            </p>
          </div>

          {/* Controls Section */}
          <div className="controls-section">
            <div className="control-group">
              <label htmlFor="month-select">Pay Period:</label>
              <div className="period-selectors">
                <select
                  id="month-select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="period-select"
                >
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="period-select"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="btn-run-payrun"
              onClick={handleRunPayrun}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Generating Payrun...
                </>
              ) : (
                <>
                  <span className="icon">🚀</span>
                  Run Payrun
                </>
              )}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          {/* Results Section */}
          {payrunData && payrunData.success && (
            <div className="results-section">
              {/* Summary Card */}
              <div className="summary-card">
                <div className="summary-header">
                  <h2>
                    Payrun {payrunData.payrun.month} {payrunData.payrun.year}
                  </h2>
                  <span className="status-badge success">
                    ✅ {payrunData.payrun.status}
                  </span>
                </div>

                <div className="summary-stats">
                  <div className="stat-box">
                    <div className="stat-label">Total Employees</div>
                    <div className="stat-value">
                      {payrunData.payrun.total_employees}
                    </div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-label">Total Cost</div>
                    <div className="stat-value">
                      {formatCurrency(payrunData.payrun.total_cost)}
                    </div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-label">Status</div>
                    <div className="stat-value status">Done</div>
                  </div>
                </div>
              </div>

              {/* Payslips Table */}
              <div className="payslips-section">
                <h3>Generated Payslips</h3>
                <div className="table-container">
                  <table className="payslips-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Employee ID</th>
                        <th>Basic Salary</th>
                        <th>HRA</th>
                        <th>Gross Salary</th>
                        <th>Deductions</th>
                        <th>Net Salary</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrunData.payslips.map((payslip) => (
                        <tr key={payslip.id}>
                          <td className="employee-name">
                            {payslip.employee_name}
                          </td>
                          <td>{payslip.employee_id}</td>
                          <td>{formatCurrency(payslip.basic_salary)}</td>
                          <td>{formatCurrency(payslip.hra)}</td>
                          <td>{formatCurrency(payslip.gross_salary)}</td>
                          <td className="deductions">
                            {formatCurrency(payslip.total_deductions)}
                          </td>
                          <td className="net-salary">
                            {formatCurrency(payslip.net_salary)}
                          </td>
                          <td>
                            <span
                              className={`status-badge ${
                                payslip.status === "Done"
                                  ? "done"
                                  : payslip.status === "Pending"
                                  ? "pending"
                                  : "draft"
                              }`}
                            >
                              {payslip.status === "Done"
                                ? "✅"
                                : payslip.status === "Pending"
                                ? "⏳"
                                : "📝"}{" "}
                              {payslip.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn-view-payslip"
                              onClick={() => handleViewPayslip(payslip)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!payrunData && !error && !isLoading && (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3>No Payrun Generated Yet</h3>
              <p>
                Select a pay period and click "Run Payrun" to generate payslips
                for all employees
              </p>
            </div>
          )}

          {/* Payslip Modal */}
          {showPayslipModal && selectedPayslip && (
            <div className="modal-overlay" onClick={handleCloseModal}>
              <div
                className="payslip-modal payslip-modal-v2"
                onClick={(e) => e.stopPropagation()}
              >
                <button className="modal-close" onClick={handleCloseModal}>
                  ×
                </button>

                {/* Print-only Layout */}
                <div className="print-only-content">
                  <div className="print-header">
                    <div className="company-logo">[Company Logo]</div>
                    <h2 className="print-title">
                      Salary slip for month of{" "}
                      {selectedEmployeeForCompute
                        ? new Date().toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          })
                        : "Feb 2025"}
                    </h2>
                  </div>

                  <div className="print-employee-details">
                    <div className="detail-row">
                      <span className="detail-label">Employee name</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">
                        {selectedEmployeeForCompute?.name || "[Emp Name]"}
                      </span>
                      <span className="detail-label-right">PAN</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">DCEXXXXXX3</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Employee Code</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">
                        {selectedEmployeeForCompute?.id || "[Emp Code]"}
                      </span>
                      <span className="detail-label-right">UAN</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">23423423423</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Department</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">[Department]</span>
                      <span className="detail-label-right">Bank A/c NO.</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">23423423432</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Location</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">[Emp_Location]</span>
                      <span className="detail-label-right">Pay period</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">
                        1/1/2025 to 31/1/2025
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Date of joining</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">20/6/2017</span>
                      <span className="detail-label-right">Pay date</span>
                      <span className="detail-colon">:</span>
                      <span className="detail-value">3/2/2025</span>
                    </div>
                  </div>

                  <div className="print-worked-days">
                    <h3 className="print-section-title">Worked Days</h3>
                    <table className="print-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th className="text-right">Number of Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Attendance</td>
                          <td className="text-right">
                            {(
                              selectedEmployeeForCompute?.present_days || 20
                            ).toFixed(0)}{" "}
                            Days
                          </td>
                        </tr>
                        <tr className="total-row-print">
                          <td>
                            <strong>Total</strong>
                          </td>
                          <td className="text-right">
                            <strong>
                              {(
                                (selectedEmployeeForCompute?.present_days ||
                                  20) +
                                (selectedEmployeeForCompute?.paid_leaves || 2)
                              ).toFixed(0)}{" "}
                              Days
                            </strong>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="print-salary-table">
                    <table className="print-earnings-deductions">
                      <thead>
                        <tr>
                          <th>Earnings</th>
                          <th className="text-right">Amounts</th>
                          <th>Deductions</th>
                          <th className="text-right">Amounts</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Basic Salary</td>
                          <td className="text-right">
                            ₹{" "}
                            {(
                              selectedEmployeeForCompute?.basic_salary || 0
                            ).toFixed(2)}
                          </td>
                          <td>PF Employee</td>
                          <td className="text-right">
                            - ₹{" "}
                            {(
                              selectedEmployeeForCompute?.pf_deduction || 0
                            ).toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td>House Rent Allowance</td>
                          <td className="text-right">
                            ₹{" "}
                            {(selectedEmployeeForCompute?.hra || 0).toFixed(2)}
                          </td>
                          <td>PF Employer</td>
                          <td className="text-right">- ₹ 0.00</td>
                        </tr>
                        <tr>
                          <td>Standard Allowance</td>
                          <td className="text-right">₹ 0.00</td>
                          <td>Professional Tax</td>
                          <td className="text-right">
                            - ₹{" "}
                            {(
                              selectedEmployeeForCompute?.tax_deduction || 0
                            ).toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td>Performance Bonus</td>
                          <td className="text-right">₹ 0.00</td>
                          <td>TDS Deduction</td>
                          <td className="text-right">- ₹ 0.00</td>
                        </tr>
                        <tr>
                          <td>Leave Travel Allowance</td>
                          <td className="text-right">₹ 0.00</td>
                          <td></td>
                          <td></td>
                        </tr>
                        <tr>
                          <td>Fixed Allowance</td>
                          <td className="text-right">₹ 0.00</td>
                          <td></td>
                          <td></td>
                        </tr>
                        <tr className="gross-row">
                          <td>
                            <strong>Gross</strong>
                          </td>
                          <td className="text-right">
                            <strong>
                              ₹{" "}
                              {(
                                selectedEmployeeForCompute?.gross_salary || 0
                              ).toFixed(2)}
                            </strong>
                          </td>
                          <td></td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="print-net-payable">
                    <div className="net-label">
                      Total Net Payable (Grosss Earning - Total deductions)
                    </div>
                    <div className="net-amount">
                      {(selectedEmployeeForCompute?.net_salary || 0).toFixed(2)}
                    </div>
                    <div className="net-words">(Amount in words) only</div>
                  </div>
                </div>

                {/* Screen-only Content */}
                <div className="payslip-document-v2 screen-only-content">
                  {/* Description Header */}
                  <div className="payslip-description">
                    <p>
                      When a user opens any generated payslip, they can view
                      detailed information such as working days and worked day
                      amounts. They can also generate a new payslip or cancel,
                      and they can print the payslip as well.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="payslip-action-buttons">
                    <button
                      className="btn-action btn-new"
                      onClick={handleNewPayslip}
                    >
                      New Payslip
                    </button>
                    <button
                      className="btn-action btn-compute"
                      onClick={handleComputeInModal}
                    >
                      Compute
                    </button>
                    <button
                      className="btn-action btn-validate"
                      onClick={handleValidatePayslip}
                      disabled={
                        selectedPayslip?.status === "Done" || isValidating
                      }
                    >
                      {isValidating
                        ? "⏳ Validating..."
                        : selectedPayslip?.status === "Done"
                        ? "✅ Validated"
                        : "Validate"}
                    </button>
                    <button
                      className="btn-action btn-cancel"
                      onClick={handleCloseModal}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-action btn-print"
                      onClick={handlePrintPayslip}
                    >
                      Print
                    </button>
                  </div>

                  {/* Validation Feedback Message */}
                  {validationMessage && (
                    <div
                      className={`validation-message ${
                        validationMessage.includes("✅")
                          ? "success"
                          : validationMessage.includes("❌")
                          ? "error"
                          : "info"
                      }`}
                    >
                      {validationMessage}
                    </div>
                  )}

                  {/* Employee Selection */}
                  <div className="employee-selection-section">
                    <label htmlFor="employee-select">Select Employee:</label>
                    <select
                      id="employee-select"
                      className="employee-select-dropdown"
                      value={
                        selectedEmployeeForCompute?.employee_id ||
                        selectedEmployeeForCompute?.id ||
                        ""
                      }
                      onChange={handleEmployeeSelectForCompute}
                    >
                      <option value="">-- Select Employee --</option>
                      {availableEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Employee Header */}
                  <div className="employee-header">
                    <h2>
                      {selectedEmployeeForCompute
                        ? selectedEmployeeForCompute.employee_name
                        : "[Employee]"}
                    </h2>
                  </div>

                  {/* Employee Info Grid */}
                  <div className="employee-info-grid">
                    <div className="info-row">
                      <div className="info-label">Payrun</div>
                      <div className="info-value info-link">
                        Payrun {payrunData.payrun.month}{" "}
                        {payrunData.payrun.year}
                      </div>
                    </div>
                    <div className="info-row">
                      <div className="info-label">Salary Structure</div>
                      <div className="info-value info-link">Regular Pay</div>
                    </div>
                    <div className="info-row">
                      <div className="info-label">Period</div>
                      <div className="info-value">01 Oct To 31 Oct</div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="payslip-tabs">
                    <button
                      className={`tab-button ${
                        activePayslipTab === "worked-days" ? "active" : ""
                      }`}
                      onClick={() => setActivePayslipTab("worked-days")}
                    >
                      Worked Days
                    </button>
                    <button
                      className={`tab-button ${
                        activePayslipTab === "salary-computation"
                          ? "active"
                          : ""
                      }`}
                      onClick={() => setActivePayslipTab("salary-computation")}
                    >
                      Salary Computation
                    </button>
                  </div>

                  {/* Tab Content */}
                  {activePayslipTab === "worked-days" &&
                    !selectedEmployeeForCompute && (
                      <div className="tab-content">
                        <div className="empty-employee-state">
                          <div className="empty-icon">👤</div>
                          <h3>No Employee Selected</h3>
                          <p>
                            Please select an employee from the dropdown above to
                            view their salary details
                          </p>
                        </div>
                      </div>
                    )}

                  {activePayslipTab === "worked-days" &&
                    selectedEmployeeForCompute && (
                      <div className="tab-content">
                        <table className="worked-days-table">
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th className="text-right">Days</th>
                              <th className="text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>Attendance</td>
                              <td className="text-right">
                                {(
                                  selectedEmployeeForCompute.present_days || 0
                                ).toFixed(2)}
                                <span className="days-note">
                                  {" "}
                                  (5 working days in week)
                                </span>
                              </td>
                              <td className="text-right">
                                ₹{" "}
                                {(
                                  (selectedEmployeeForCompute.basic_salary /
                                    30) *
                                  (selectedEmployeeForCompute.present_days || 0)
                                ).toFixed(6)}
                              </td>
                            </tr>
                            <tr>
                              <td>Paid Time off</td>
                              <td className="text-right">
                                {(
                                  selectedEmployeeForCompute.paid_leaves || 0
                                ).toFixed(2)}
                                <span className="days-note">
                                  {" "}
                                  (2 Paid leaves/Month)
                                </span>
                              </td>
                              <td className="text-right">
                                ₹{" "}
                                {(
                                  (selectedEmployeeForCompute.basic_salary /
                                    30) *
                                  (selectedEmployeeForCompute.paid_leaves || 0)
                                ).toFixed(6)}
                              </td>
                            </tr>
                            <tr className="total-row">
                              <td colSpan="3">
                                <div className="pavan-badge">
                                  Total Worked Days
                                </div>
                              </td>
                            </tr>
                            <tr className="total-row">
                              <td></td>
                              <td className="text-right">
                                <strong>
                                  {(
                                    (selectedEmployeeForCompute.present_days ||
                                      0) +
                                    (selectedEmployeeForCompute.paid_leaves ||
                                      0)
                                  ).toFixed(2)}
                                </strong>
                              </td>
                              <td className="text-right">
                                <strong>
                                  ₹{" "}
                                  {(
                                    selectedEmployeeForCompute.earned_salary ||
                                    0
                                  ).toFixed(2)}
                                </strong>
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <div className="salary-note">
                          <p>
                            Salary is calculated based on the employee's monthly
                            attendance. Paid leaves are included in the total
                            payable days, while unpaid leaves are deducted from
                            the salary
                          </p>
                        </div>
                      </div>
                    )}

                  {activePayslipTab === "salary-computation" &&
                    !selectedEmployeeForCompute && (
                      <div className="tab-content">
                        <div className="empty-employee-state">
                          <div className="empty-icon">👤</div>
                          <h3>No Employee Selected</h3>
                          <p>
                            Please select an employee from the dropdown above to
                            view their salary computation
                          </p>
                        </div>
                      </div>
                    )}

                  {activePayslipTab === "salary-computation" &&
                    selectedEmployeeForCompute && (
                      <div className="tab-content">
                        <table className="salary-computation-table">
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th className="text-right">Rate</th>
                              <th className="text-right">Quantity</th>
                              <th className="text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="section-header">
                              <td colSpan="4">
                                <strong>Earnings</strong>
                              </td>
                            </tr>
                            <tr>
                              <td>Basic Salary</td>
                              <td className="text-right">
                                ₹{" "}
                                {(
                                  selectedEmployeeForCompute.basic_salary || 0
                                ).toFixed(2)}
                              </td>
                              <td className="text-right">1.00</td>
                              <td className="text-right">
                                ₹{" "}
                                {(
                                  selectedEmployeeForCompute.basic_salary || 0
                                ).toFixed(2)}
                              </td>
                            </tr>
                            <tr>
                              <td>House Rent Allowance (HRA)</td>
                              <td className="text-right">
                                ₹{" "}
                                {(selectedEmployeeForCompute.hra || 0).toFixed(
                                  2
                                )}
                              </td>
                              <td className="text-right">1.00</td>
                              <td className="text-right">
                                ₹{" "}
                                {(selectedEmployeeForCompute.hra || 0).toFixed(
                                  2
                                )}
                              </td>
                            </tr>
                            <tr className="subtotal-row">
                              <td colSpan="3">
                                <strong>Gross Salary</strong>
                              </td>
                              <td className="text-right">
                                <strong>
                                  ₹{" "}
                                  {(
                                    selectedEmployeeForCompute.gross_salary || 0
                                  ).toFixed(2)}
                                </strong>
                              </td>
                            </tr>

                            <tr className="section-header">
                              <td colSpan="4">
                                <strong>Deductions</strong>
                              </td>
                            </tr>
                            <tr>
                              <td>PF Contribution</td>
                              <td className="text-right">
                                ₹{" "}
                                {(
                                  selectedEmployeeForCompute.pf_deduction || 0
                                ).toFixed(2)}
                              </td>
                              <td className="text-right">1.00</td>
                              <td className="text-right">
                                ₹{" "}
                                {(
                                  selectedEmployeeForCompute.pf_deduction || 0
                                ).toFixed(2)}
                              </td>
                            </tr>
                            <tr>
                              <td>Tax Deduction</td>
                              <td className="text-right">
                                ₹{" "}
                                {(
                                  selectedEmployeeForCompute.tax_deduction || 0
                                ).toFixed(2)}
                              </td>
                              <td className="text-right">1.00</td>
                              <td className="text-right">
                                ₹{" "}
                                {(
                                  selectedEmployeeForCompute.tax_deduction || 0
                                ).toFixed(2)}
                              </td>
                            </tr>
                            {(selectedEmployeeForCompute.unpaid_deduction ||
                              0) > 0 && (
                              <tr>
                                <td>Unpaid Leave Deduction</td>
                                <td className="text-right">
                                  ₹{" "}
                                  {selectedEmployeeForCompute.unpaid_deduction.toFixed(
                                    2
                                  )}
                                </td>
                                <td className="text-right">1.00</td>
                                <td className="text-right">
                                  ₹{" "}
                                  {selectedEmployeeForCompute.unpaid_deduction.toFixed(
                                    2
                                  )}
                                </td>
                              </tr>
                            )}
                            <tr className="subtotal-row">
                              <td colSpan="3">
                                <strong>Total Deductions</strong>
                              </td>
                              <td className="text-right">
                                <strong>
                                  ₹{" "}
                                  {(
                                    selectedEmployeeForCompute.total_deductions ||
                                    0
                                  ).toFixed(2)}
                                </strong>
                              </td>
                            </tr>

                            <tr className="net-salary-row">
                              <td colSpan="3">
                                <strong>Net Salary (Take Home)</strong>
                              </td>
                              <td className="text-right">
                                <strong>
                                  ₹{" "}
                                  {(
                                    selectedEmployeeForCompute.net_salary || 0
                                  ).toFixed(2)}
                                </strong>
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <div className="salary-note">
                          <p>
                            <strong>Net Salary:</strong> ₹{" "}
                            {(
                              selectedEmployeeForCompute.net_salary || 0
                            ).toFixed(2)}
                          </p>
                          <p className="salary-words">
                            In Words:{" "}
                            {convertToWords(
                              Math.round(
                                selectedEmployeeForCompute.net_salary || 0
                              )
                            )}{" "}
                            Rupees Only
                          </p>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* New Payslip Form Modal */}
          {showNewPayslipForm && (
            <div className="modal-overlay" onClick={handleCloseNewPayslipForm}>
              <div
                className="new-payslip-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="modal-close"
                  onClick={handleCloseNewPayslipForm}
                >
                  ×
                </button>

                <div className="new-payslip-form">
                  <h2 className="form-title">Create New Payslip</h2>
                  <p className="form-subtitle">
                    Fill in the employee details and attendance to generate a
                    payslip
                  </p>

                  {/* Employee Selection */}
                  <div className="form-section">
                    <h3>Employee Information</h3>
                    <div className="form-grid">
                      <div className="form-group">
                        <label htmlFor="employee">Select Employee *</label>
                        <select
                          id="employee"
                          value={newPayslipData.employee_id}
                          onChange={handleEmployeeChange}
                          className="form-control"
                          required
                        >
                          <option value="">-- Select Employee --</option>
                          {availableEmployees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} ({emp.id})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="basic_salary">Basic Salary</label>
                        <input
                          type="number"
                          id="basic_salary"
                          value={newPayslipData.basic_salary}
                          onChange={(e) =>
                            handleNewPayslipInputChange(
                              "basic_salary",
                              parseFloat(e.target.value)
                            )
                          }
                          className="form-control"
                          readOnly
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pay Period */}
                  <div className="form-section">
                    <h3>Pay Period</h3>
                    <div className="form-grid">
                      <div className="form-group">
                        <label htmlFor="month">Month *</label>
                        <select
                          id="month"
                          value={newPayslipData.month}
                          onChange={(e) =>
                            handleNewPayslipInputChange("month", e.target.value)
                          }
                          className="form-control"
                          required
                        >
                          {months.map((month) => (
                            <option key={month} value={month}>
                              {month}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="year">Year *</label>
                        <select
                          id="year"
                          value={newPayslipData.year}
                          onChange={(e) =>
                            handleNewPayslipInputChange(
                              "year",
                              parseInt(e.target.value)
                            )
                          }
                          className="form-control"
                          required
                        >
                          {years.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="total_working_days">
                          Total Working Days
                        </label>
                        <input
                          type="number"
                          id="total_working_days"
                          value={newPayslipData.total_working_days}
                          onChange={(e) =>
                            handleNewPayslipInputChange(
                              "total_working_days",
                              parseInt(e.target.value)
                            )
                          }
                          className="form-control"
                          min="1"
                          max="31"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Attendance */}
                  <div className="form-section">
                    <h3>Attendance Details</h3>
                    <div className="form-grid">
                      <div className="form-group">
                        <label htmlFor="present_days">Present Days *</label>
                        <input
                          type="number"
                          id="present_days"
                          value={newPayslipData.present_days}
                          onChange={(e) =>
                            handleNewPayslipInputChange(
                              "present_days",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="form-control"
                          min="0"
                          max={newPayslipData.total_working_days}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="paid_leaves">Paid Leaves</label>
                        <input
                          type="number"
                          id="paid_leaves"
                          value={newPayslipData.paid_leaves}
                          onChange={(e) =>
                            handleNewPayslipInputChange(
                              "paid_leaves",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="form-control"
                          min="0"
                          max={newPayslipData.total_working_days}
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="unpaid_leaves">Unpaid Leaves</label>
                        <input
                          type="number"
                          id="unpaid_leaves"
                          value={newPayslipData.unpaid_leaves}
                          onChange={(e) =>
                            handleNewPayslipInputChange(
                              "unpaid_leaves",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="form-control"
                          min="0"
                          max={newPayslipData.total_working_days}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Computed Payslip Preview */}
                  {computedPayslip && (
                    <div className="form-section computed-preview">
                      <h3>Computed Salary Breakdown</h3>
                      <div className="preview-grid">
                        <div className="preview-item">
                          <span className="preview-label">Earned Salary:</span>
                          <span className="preview-value">
                            {formatCurrency(computedPayslip.earned_salary)}
                          </span>
                        </div>
                        <div className="preview-item">
                          <span className="preview-label">HRA (20%):</span>
                          <span className="preview-value">
                            {formatCurrency(computedPayslip.hra)}
                          </span>
                        </div>
                        <div className="preview-item">
                          <span className="preview-label">Gross Salary:</span>
                          <span className="preview-value highlight">
                            {formatCurrency(computedPayslip.gross_salary)}
                          </span>
                        </div>
                        <div className="preview-item">
                          <span className="preview-label">
                            PF Deduction (12%):
                          </span>
                          <span className="preview-value deduction">
                            -{formatCurrency(computedPayslip.pf_deduction)}
                          </span>
                        </div>
                        <div className="preview-item">
                          <span className="preview-label">Tax Deduction:</span>
                          <span className="preview-value deduction">
                            -{formatCurrency(computedPayslip.tax_deduction)}
                          </span>
                        </div>
                        {computedPayslip.unpaid_deduction > 0 && (
                          <div className="preview-item">
                            <span className="preview-label">
                              Unpaid Leave Deduction:
                            </span>
                            <span className="preview-value deduction">
                              -
                              {formatCurrency(computedPayslip.unpaid_deduction)}
                            </span>
                          </div>
                        )}
                        <div className="preview-item">
                          <span className="preview-label">
                            Total Deductions:
                          </span>
                          <span className="preview-value deduction">
                            -{formatCurrency(computedPayslip.total_deductions)}
                          </span>
                        </div>
                        <div className="preview-item net-salary-preview">
                          <span className="preview-label">Net Salary:</span>
                          <span className="preview-value">
                            {formatCurrency(computedPayslip.net_salary)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="form-actions">
                    <button
                      className="btn-form btn-compute-form"
                      onClick={handleComputeNewPayslip}
                      disabled={
                        !newPayslipData.employee_id ||
                        newPayslipData.present_days === 0
                      }
                    >
                      💰 Compute Salary
                    </button>
                    <button
                      className="btn-form btn-generate"
                      onClick={handleGeneratePayslip}
                      disabled={!computedPayslip}
                    >
                      ✅ Generate Payslip
                    </button>
                    <button
                      className="btn-form btn-cancel-form"
                      onClick={handleCloseNewPayslipForm}
                    >
                      ❌ Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// Helper function to convert number to words
function convertToWords(amount) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  if (amount === 0) return "Zero";

  let words = "";

  if (amount >= 100000) {
    words += ones[Math.floor(amount / 100000)] + " Lakh ";
    amount %= 100000;
  }

  if (amount >= 1000) {
    const thousands = Math.floor(amount / 1000);
    if (thousands >= 10) {
      words += tens[Math.floor(thousands / 10)] + " ";
      if (thousands % 10 > 0) words += ones[thousands % 10] + " ";
    } else {
      words += ones[thousands] + " ";
    }
    words += "Thousand ";
    amount %= 1000;
  }

  if (amount >= 100) {
    words += ones[Math.floor(amount / 100)] + " Hundred ";
    amount %= 100;
  }

  if (amount >= 20) {
    words += tens[Math.floor(amount / 10)] + " ";
    amount %= 10;
  } else if (amount >= 10) {
    words += teens[amount - 10] + " ";
    amount = 0;
  }

  if (amount > 0) {
    words += ones[amount] + " ";
  }

  return words.trim();
}

export default PayrunDashboard;
