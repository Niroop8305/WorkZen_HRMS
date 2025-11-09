# Payslip Feature - Live Data Implementation Guide

## 📋 Overview

This guide will help you implement the payslip feature with **live data** instead of mock data. The system will generate payslips based on actual employee attendance records spanning **5 months (June-October 2025)** for **5 employees**.

---

## 🎯 What You Get

### Mock Data Provided

- **5 Employees** with different salary structures
- **5 Months** of attendance data (June-October 2025)
- **25 Attendance Records** ready for payslip generation
- **Realistic variations** in attendance (paid leaves, unpaid leaves, present days)

### Employee Details

| ID  | Name         | Employee Code | Basic Salary | HRA    | PF Rate |
| --- | ------------ | ------------- | ------------ | ------ | ------- |
| 1   | Rajesh Kumar | EMP001        | ₹25,000      | ₹5,000 | 12%     |
| 2   | Priya Sharma | EMP002        | ₹30,000      | ₹6,000 | 12%     |
| 3   | Amit Patel   | EMP003        | ₹28,000      | ₹5,600 | 12%     |
| 4   | Sneha Reddy  | EMP004        | ₹32,000      | ₹6,400 | 12%     |
| 5   | Vikram Singh | EMP005        | ₹27,000      | ₹5,400 | 12%     |

---

## 🚀 Step-by-Step Implementation

### Step 1: Insert Mock Data into Database

1. **Locate the SQL file:**

   ```
   PAYSLIP_MOCK_DATA_5_MONTHS.sql
   ```

2. **Execute the SQL script:**

   **Option A - Using MySQL Workbench:**

   - Open MySQL Workbench
   - Connect to your `workzen_hrms` database
   - Open the SQL file: `PAYSLIP_MOCK_DATA_5_MONTHS.sql`
   - Click "Execute" (⚡ icon)
   - Wait for completion message

   **Option B - Using MySQL Command Line:**

   ```bash
   mysql -u root -p workzen_hrms < PAYSLIP_MOCK_DATA_5_MONTHS.sql
   ```

   **Option C - Using PowerShell (Windows):**

   ```powershell
   Get-Content .\PAYSLIP_MOCK_DATA_5_MONTHS.sql | mysql -u root -p workzen_hrms
   ```

3. **Verify Data Insertion:**
   Run this query in your MySQL client:

   ```sql
   SELECT
       e.emp_id,
       e.name,
       COUNT(a.id) as months_with_data
   FROM employees e
   LEFT JOIN attendance a ON e.id = a.emp_id
   GROUP BY e.id;
   ```

   You should see 5 employees, each with 5 months of data.

---

### Step 2: Verify Backend Setup

1. **Check if payslip routes are configured:**

   Open `backend/server.js` and verify this line exists:

   ```javascript
   app.use("/api/payslip", payslipRoutes);
   ```

2. **Ensure database connection is working:**

   ```javascript
   // backend/src/config/database.js should be properly configured
   ```

3. **Start the backend server:**

   ```bash
   cd backend
   npm start
   ```

   Server should run on: `http://localhost:5000`

---

### Step 3: Test Payslip API Endpoints

#### A. Create a Draft Payslip

**Endpoint:** `POST /api/payslip/new`

**Request:**

```json
{
  "emp_id": 1,
  "month": "October",
  "year": 2025
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:5000/api/payslip/new \
  -H "Content-Type: application/json" \
  -d '{"emp_id": 1, "month": "October", "year": 2025}'
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Draft payslip created successfully",
  "payslip": {
    "id": 1,
    "emp_id": 1,
    "month": "October",
    "year": 2025,
    "basic_salary": 25000.0,
    "status": "Draft",
    "employee_name": "Rajesh Kumar",
    "employee_code": "EMP001"
  }
}
```

---

#### B. Compute Salary (Preview)

**Endpoint:** `POST /api/payslip/compute`

**Request:**

```json
{
  "emp_id": 1,
  "month": "October",
  "year": 2025,
  "present_days": 22,
  "paid_leaves": 2,
  "unpaid_leaves": 0
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:5000/api/payslip/compute \
  -H "Content-Type: application/json" \
  -d '{
    "emp_id": 1,
    "month": "October",
    "year": 2025,
    "present_days": 22,
    "paid_leaves": 2,
    "unpaid_leaves": 0
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Salary computed successfully",
  "computation": {
    "employee_id": 1,
    "employee_name": "Rajesh Kumar",
    "employee_code": "EMP001",
    "month": "October",
    "year": 2025,
    "basic_salary": 25000.0,
    "per_day_rate": 833.33,
    "earned_days": 24,
    "earned_salary": 20000.0,
    "hra": 4000.0,
    "gross_salary": 24000.0,
    "pf_deduction": 2400.0,
    "tax_deduction": 200.0,
    "unpaid_deduction": 0.0,
    "total_deductions": 2600.0,
    "net_salary": 21400.0
  }
}
```

---

#### C. Save Computed Payslip

**Endpoint:** `PUT /api/payslip/:id/save`

**Request:**

```json
{
  "basic_salary": 25000.0,
  "hra": 4000.0,
  "earned_salary": 20000.0,
  "gross_salary": 24000.0,
  "pf_deduction": 2400.0,
  "tax_deduction": 200.0,
  "unpaid_deduction": 0.0,
  "total_deductions": 2600.0,
  "net_salary": 21400.0,
  "present_days": 22,
  "paid_leaves": 2,
  "unpaid_leaves": 0
}
```

**cURL Example:**

```bash
curl -X PUT http://localhost:5000/api/payslip/1/save \
  -H "Content-Type: application/json" \
  -d '{
    "basic_salary": 25000.00,
    "hra": 4000.00,
    "earned_salary": 20000.00,
    "gross_salary": 24000.00,
    "pf_deduction": 2400.00,
    "tax_deduction": 200.00,
    "unpaid_deduction": 0.00,
    "total_deductions": 2600.00,
    "net_salary": 21400.00,
    "present_days": 22,
    "paid_leaves": 2,
    "unpaid_leaves": 0
  }'
```

---

#### D. Get All Payslips

**Endpoint:** `GET /api/payslip/`

**cURL Example:**

```bash
curl -X GET http://localhost:5000/api/payslip/
```

**Filter by Month:**

```bash
curl -X GET "http://localhost:5000/api/payslip/?month=October&year=2025"
```

---

### Step 4: Implement Frontend Integration

#### A. Create Payslip Component

```jsx
// frontend/src/components/Payslip/PayslipGenerator.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";

const PayslipGenerator = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [month, setMonth] = useState("October");
  const [year, setYear] = useState(2025);
  const [computation, setComputation] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get("http://localhost:5000/api/employees");
      setEmployees(response.data);
    } catch (error) {
      console.error("Error fetching employees:", error);
    }
  };

  const handleCompute = async () => {
    if (!selectedEmployee) {
      alert("Please select an employee");
      return;
    }

    setLoading(true);
    try {
      // First, get attendance data
      const attendanceRes = await axios.get(
        `http://localhost:5000/api/attendance/${selectedEmployee}?month=${month}&year=${year}`
      );

      const attendance = attendanceRes.data;

      // Compute salary
      const computeRes = await axios.post(
        "http://localhost:5000/api/payslip/compute",
        {
          emp_id: selectedEmployee,
          month,
          year,
          present_days: attendance.present_days,
          paid_leaves: attendance.paid_leaves,
          unpaid_leaves: attendance.unpaid_leaves,
        }
      );

      setComputation(computeRes.data.computation);
    } catch (error) {
      console.error("Error computing salary:", error);
      alert("Error computing salary. Please check attendance data.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!computation) return;

    try {
      // Create draft payslip first
      const createRes = await axios.post(
        "http://localhost:5000/api/payslip/new",
        {
          emp_id: selectedEmployee,
          month,
          year,
        }
      );

      const payslipId = createRes.data.payslip.id;

      // Save computed values
      await axios.put(`http://localhost:5000/api/payslip/${payslipId}/save`, {
        basic_salary: computation.basic_salary,
        hra: computation.hra,
        earned_salary: computation.earned_salary,
        gross_salary: computation.gross_salary,
        pf_deduction: computation.pf_deduction,
        tax_deduction: computation.tax_deduction,
        unpaid_deduction: computation.unpaid_deduction,
        total_deductions: computation.total_deductions,
        net_salary: computation.net_salary,
        present_days: computation.present_days,
        paid_leaves: computation.paid_leaves,
        unpaid_leaves: computation.unpaid_leaves,
      });

      alert("Payslip saved successfully!");
      setComputation(null);
    } catch (error) {
      console.error("Error saving payslip:", error);
      alert("Error saving payslip. It may already exist.");
    }
  };

  return (
    <div className="payslip-generator">
      <h2>Generate Payslip</h2>

      <div className="form-group">
        <label>Employee:</label>
        <select
          value={selectedEmployee}
          onChange={(e) => setSelectedEmployee(e.target.value)}
        >
          <option value="">Select Employee</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name} ({emp.emp_id})
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Month:</label>
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="June">June</option>
          <option value="July">July</option>
          <option value="August">August</option>
          <option value="September">September</option>
          <option value="October">October</option>
        </select>
      </div>

      <div className="form-group">
        <label>Year:</label>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </div>

      <button onClick={handleCompute} disabled={loading}>
        {loading ? "Computing..." : "Compute Salary"}
      </button>

      {computation && (
        <div className="computation-result">
          <h3>Salary Breakdown</h3>
          <table>
            <tbody>
              <tr>
                <td>Employee:</td>
                <td>{computation.employee_name}</td>
              </tr>
              <tr>
                <td>Basic Salary:</td>
                <td>₹{computation.basic_salary.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Earned Days:</td>
                <td>{computation.earned_days} days</td>
              </tr>
              <tr>
                <td>Earned Salary:</td>
                <td>₹{computation.earned_salary.toFixed(2)}</td>
              </tr>
              <tr>
                <td>HRA (20%):</td>
                <td>₹{computation.hra.toFixed(2)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Gross Salary:</strong>
                </td>
                <td>
                  <strong>₹{computation.gross_salary.toFixed(2)}</strong>
                </td>
              </tr>
              <tr>
                <td>PF Deduction:</td>
                <td>₹{computation.pf_deduction.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Tax:</td>
                <td>₹{computation.tax_deduction.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Unpaid Deduction:</td>
                <td>₹{computation.unpaid_deduction.toFixed(2)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Total Deductions:</strong>
                </td>
                <td>
                  <strong>₹{computation.total_deductions.toFixed(2)}</strong>
                </td>
              </tr>
              <tr className="net-salary">
                <td>
                  <strong>Net Salary:</strong>
                </td>
                <td>
                  <strong>₹{computation.net_salary.toFixed(2)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <button onClick={handleSave} className="save-btn">
            Save Payslip
          </button>
        </div>
      )}
    </div>
  );
};

export default PayslipGenerator;
```

---

### Step 5: Generate Payslips for All Employees (Payrun)

To generate payslips for all employees at once:

**Endpoint:** `POST /api/payrun/generate`

**Request:**

```json
{
  "month": "October",
  "year": 2025
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:5000/api/payrun/generate \
  -H "Content-Type: application/json" \
  -d '{"month": "October", "year": 2025}'
```

This will:

1. Create a payrun for October 2025
2. Generate payslips for all 5 employees automatically
3. Calculate salaries based on attendance data
4. Return summary of generated payslips

---

## 💡 Salary Calculation Formula

The system uses the following formula:

```
Per Day Rate = Basic Salary / 30
Earned Days = Present Days + Paid Leaves
Earned Salary = Per Day Rate × Earned Days
HRA = Earned Salary × 20%
Gross Salary = Earned Salary + HRA

PF Deduction = Earned Salary × 12%
Tax Deduction = ₹200 (Fixed)
Unpaid Deduction = Per Day Rate × Unpaid Leaves
Total Deductions = PF + Tax + Unpaid Deduction

Net Salary = Gross Salary - Total Deductions
```

---

## 📊 Example Calculation

**Employee:** Rajesh Kumar (EMP001)  
**Month:** October 2025  
**Basic Salary:** ₹25,000  
**Present Days:** 22  
**Paid Leaves:** 2  
**Unpaid Leaves:** 0

**Calculation:**

```
Per Day Rate = 25000 / 30 = ₹833.33
Earned Days = 22 + 2 = 24
Earned Salary = 833.33 × 24 = ₹20,000.00
HRA = 20000 × 0.20 = ₹4,000.00
Gross Salary = 20000 + 4000 = ₹24,000.00

PF Deduction = 20000 × 0.12 = ₹2,400.00
Tax = ₹200.00
Unpaid Deduction = 833.33 × 0 = ₹0.00
Total Deductions = 2400 + 200 + 0 = ₹2,600.00

Net Salary = 24000 - 2600 = ₹21,400.00
```

---

## 🔍 Troubleshooting

### Issue: "Employee not found"

**Solution:** Ensure you've run the mock data SQL script and employees are inserted.

```sql
SELECT * FROM employees;
```

### Issue: "Attendance data not found"

**Solution:** Check if attendance records exist for the selected month.

```sql
SELECT * FROM attendance WHERE emp_id = 1 AND month = 'October' AND year = 2025;
```

### Issue: "Payslip already exists"

**Solution:** Either delete the existing payslip or create for a different month.

```sql
DELETE FROM payslips WHERE emp_id = 1 AND month = 'October' AND year = 2025;
```

### Issue: "Database connection error"

**Solution:** Check your database configuration in `backend/src/config/database.js`

---

## 📈 Testing Checklist

- [ ] Mock data inserted successfully (5 employees, 5 months)
- [ ] Backend server running on port 5000
- [ ] Can fetch employee list
- [ ] Can fetch attendance data
- [ ] Can create draft payslip
- [ ] Can compute salary
- [ ] Can save payslip
- [ ] Can view saved payslips
- [ ] Can generate payrun for all employees
- [ ] Frontend displays payslip data correctly

---

## 🎓 Next Steps

1. **Implement PDF Generation:**

   - Add library like `pdfkit` or `jspdf`
   - Create payslip template
   - Generate downloadable PDFs

2. **Add Email Functionality:**

   - Send payslips via email
   - Attach PDF to email

3. **Implement Approval Workflow:**

   - Add approval status
   - HR can review before finalizing

4. **Add Historical Reports:**
   - Monthly payroll reports
   - Year-to-date summaries
   - Tax calculations

---

## 📞 Support

If you have questions or issues:

1. Check the troubleshooting section
2. Review the API documentation in `PAYSLIP_API_DOCUMENTATION.md`
3. Check the implementation summary in `PAYSLIP_IMPLEMENTATION_SUMMARY.md`

---

## ✅ Success Indicators

You'll know the implementation is successful when:

1. You can generate payslips for all 5 employees
2. Calculations match the expected values
3. Payslips show correct salary breakdowns
4. You can generate payslips for any of the 5 months
5. Frontend displays all data correctly

---

**Happy Coding! 🚀**
