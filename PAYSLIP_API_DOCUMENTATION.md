# Payslip API Documentation

## Overview
This document describes the API endpoints for creating and managing individual payslips in the WorkZen HRMS system.

## Base URL
```
http://localhost:5000/api/payslip
```

---

## API Endpoints

### 1. Create New Payslip (Draft)

**Endpoint:** `POST /api/payslip/new`

**Purpose:** Create a new draft payslip for a single employee.

**Request Body:**
```json
{
  "emp_id": 3,
  "month": "October",
  "year": 2025
}
```

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Draft payslip created successfully",
  "payslip": {
    "id": 15,
    "emp_id": 3,
    "payrun_id": null,
    "month": "October",
    "year": 2025,
    "basic_salary": 28000.00,
    "hra": 0.00,
    "earned_salary": 0.00,
    "gross_salary": 0.00,
    "pf_deduction": 0.00,
    "tax_deduction": 0.00,
    "unpaid_deduction": 0.00,
    "total_deductions": 0.00,
    "net_salary": 0.00,
    "present_days": 0,
    "paid_leaves": 0,
    "unpaid_leaves": 0,
    "status": "Draft",
    "created_at": "2025-11-08T10:30:00.000Z",
    "employee_name": "Amit Patel",
    "employee_code": "EMP003"
  }
}
```

**Response (Error - 409 if payslip exists):**
```json
{
  "success": false,
  "message": "Payslip already exists for this employee and period",
  "payslip": {
    "id": 10,
    "status": "Done"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:5000/api/payslip/new \
  -H "Content-Type: application/json" \
  -d '{
    "emp_id": 3,
    "month": "October",
    "year": 2025
  }'
```

---

### 2. Compute Salary

**Endpoint:** `POST /api/payslip/compute`

**Purpose:** Calculate salary breakdown based on attendance data.

**Request Body:**
```json
{
  "emp_id": 3,
  "month": "October",
  "year": 2025,
  "present_days": 22,
  "paid_leaves": 2,
  "unpaid_leaves": 1
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Salary computed successfully",
  "computation": {
    "employee_id": 3,
    "employee_name": "Amit Patel",
    "employee_code": "EMP003",
    "month": "October",
    "year": 2025,
    "basic_salary": 28000.00,
    "total_working_days": 30,
    "present_days": 22,
    "paid_leaves": 2,
    "unpaid_leaves": 1,
    "earned_days": 24,
    "per_day_rate": 933.33,
    "earned_salary": 22400.00,
    "hra": 4480.00,
    "gross_salary": 26880.00,
    "pf_deduction": 2688.00,
    "tax_deduction": 200.00,
    "unpaid_deduction": 933.33,
    "total_deductions": 3821.33,
    "net_salary": 23058.67
  }
}
```

**Calculation Logic:**
```javascript
// Per Day Rate
perDayRate = basic_salary / 30

// Earned Salary
earnedDays = present_days + paid_leaves
earnedSalary = perDayRate × earnedDays

// HRA (20% of earned salary)
hra = earnedSalary × 0.20

// Gross Salary
grossSalary = earnedSalary + hra

// Deductions
pfDeduction = earnedSalary × 0.12  // 12% of earned salary
taxDeduction = 200  // Fixed
unpaidDeduction = perDayRate × unpaid_leaves

// Total & Net
totalDeductions = pfDeduction + taxDeduction + unpaidDeduction
netSalary = grossSalary - totalDeductions
```

**cURL Example:**
```bash
curl -X POST http://localhost:5000/api/payslip/compute \
  -H "Content-Type: application/json" \
  -d '{
    "emp_id": 3,
    "month": "October",
    "year": 2025,
    "present_days": 22,
    "paid_leaves": 2,
    "unpaid_leaves": 1
  }'
```

---

### 3. Save Computed Payslip

**Endpoint:** `PUT /api/payslip/:id/save`

**Purpose:** Save computed salary values to a draft payslip and mark it as "Done".

**URL Parameters:**
- `id` - Payslip ID

**Request Body:**
```json
{
  "basic_salary": 28000.00,
  "hra": 4480.00,
  "earned_salary": 22400.00,
  "gross_salary": 26880.00,
  "pf_deduction": 2688.00,
  "tax_deduction": 200.00,
  "unpaid_deduction": 933.33,
  "total_deductions": 3821.33,
  "net_salary": 23058.67,
  "present_days": 22,
  "paid_leaves": 2,
  "unpaid_leaves": 1
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Payslip saved successfully",
  "payslip": {
    "id": 15,
    "emp_id": 3,
    "payrun_id": null,
    "month": "October",
    "year": 2025,
    "basic_salary": 28000.00,
    "hra": 4480.00,
    "earned_salary": 22400.00,
    "gross_salary": 26880.00,
    "pf_deduction": 2688.00,
    "tax_deduction": 200.00,
    "unpaid_deduction": 933.33,
    "total_deductions": 3821.33,
    "net_salary": 23058.67,
    "present_days": 22,
    "paid_leaves": 2,
    "unpaid_leaves": 1,
    "status": "Done",
    "created_at": "2025-11-08T10:30:00.000Z",
    "employee_name": "Amit Patel",
    "employee_code": "EMP003"
  }
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:5000/api/payslip/15/save \
  -H "Content-Type: application/json" \
  -d '{
    "basic_salary": 28000.00,
    "hra": 4480.00,
    "earned_salary": 22400.00,
    "gross_salary": 26880.00,
    "pf_deduction": 2688.00,
    "tax_deduction": 200.00,
    "unpaid_deduction": 933.33,
    "total_deductions": 3821.33,
    "net_salary": 23058.67,
    "present_days": 22,
    "paid_leaves": 2,
    "unpaid_leaves": 1
  }'
```

---

### 4. Get Payslip by ID

**Endpoint:** `GET /api/payslip/:id`

**Purpose:** Retrieve a specific payslip with employee details.

**URL Parameters:**
- `id` - Payslip ID

**Response (Success - 200):**
```json
{
  "success": true,
  "payslip": {
    "id": 15,
    "emp_id": 3,
    "payrun_id": null,
    "month": "October",
    "year": 2025,
    "basic_salary": 28000.00,
    "hra": 4480.00,
    "earned_salary": 22400.00,
    "gross_salary": 26880.00,
    "pf_deduction": 2688.00,
    "tax_deduction": 200.00,
    "unpaid_deduction": 933.33,
    "total_deductions": 3821.33,
    "net_salary": 23058.67,
    "present_days": 22,
    "paid_leaves": 2,
    "unpaid_leaves": 1,
    "status": "Done",
    "created_at": "2025-11-08T10:30:00.000Z",
    "employee_name": "Amit Patel",
    "employee_code": "EMP003",
    "emp_basic_salary": 28000.00
  }
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:5000/api/payslip/15
```

---

### 5. Delete Payslip (Draft Only)

**Endpoint:** `DELETE /api/payslip/:id`

**Purpose:** Delete a draft payslip. Only payslips with status "Draft" can be deleted.

**URL Parameters:**
- `id` - Payslip ID

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Payslip deleted successfully"
}
```

**Response (Error - 403 if not Draft):**
```json
{
  "success": false,
  "message": "Only draft payslips can be deleted"
}
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:5000/api/payslip/15
```

---

### 6. Get All Payslips (with Filters)

**Endpoint:** `GET /api/payslip/`

**Purpose:** Retrieve all payslips with optional filters.

**Query Parameters:**
- `month` (optional) - Filter by month (e.g., "October")
- `year` (optional) - Filter by year (e.g., 2025)
- `emp_id` (optional) - Filter by employee ID
- `status` (optional) - Filter by status ("Draft" or "Done")

**Response (Success - 200):**
```json
{
  "success": true,
  "count": 3,
  "payslips": [
    {
      "id": 15,
      "emp_id": 3,
      "payrun_id": null,
      "month": "October",
      "year": 2025,
      "basic_salary": 28000.00,
      "hra": 4480.00,
      "earned_salary": 22400.00,
      "gross_salary": 26880.00,
      "pf_deduction": 2688.00,
      "tax_deduction": 200.00,
      "unpaid_deduction": 933.33,
      "total_deductions": 3821.33,
      "net_salary": 23058.67,
      "present_days": 22,
      "paid_leaves": 2,
      "unpaid_leaves": 1,
      "status": "Done",
      "created_at": "2025-11-08T10:30:00.000Z",
      "employee_name": "Amit Patel",
      "employee_code": "EMP003"
    }
  ]
}
```

**cURL Examples:**
```bash
# Get all payslips
curl -X GET http://localhost:5000/api/payslip/

# Filter by month and year
curl -X GET "http://localhost:5000/api/payslip/?month=October&year=2025"

# Filter by employee
curl -X GET "http://localhost:5000/api/payslip/?emp_id=3"

# Filter by status
curl -X GET "http://localhost:5000/api/payslip/?status=Draft"

# Multiple filters
curl -X GET "http://localhost:5000/api/payslip/?month=October&year=2025&status=Done"
```

---

## Workflow Example

### Creating a Complete Payslip

**Step 1: Create Draft Payslip**
```bash
curl -X POST http://localhost:5000/api/payslip/new \
  -H "Content-Type: application/json" \
  -d '{"emp_id": 3, "month": "November", "year": 2025}'
```
Response: `payslip_id = 16`

**Step 2: Compute Salary**
```bash
curl -X POST http://localhost:5000/api/payslip/compute \
  -H "Content-Type: application/json" \
  -d '{
    "emp_id": 3,
    "month": "November",
    "year": 2025,
    "present_days": 20,
    "paid_leaves": 1,
    "unpaid_leaves": 0
  }'
```
Save the computation results.

**Step 3: Save Computed Values**
```bash
curl -X PUT http://localhost:5000/api/payslip/16/save \
  -H "Content-Type: application/json" \
  -d '{
    "basic_salary": 28000.00,
    "hra": 3920.00,
    "earned_salary": 19600.00,
    "gross_salary": 23520.00,
    "pf_deduction": 2352.00,
    "tax_deduction": 200.00,
    "unpaid_deduction": 0.00,
    "total_deductions": 2552.00,
    "net_salary": 20968.00,
    "present_days": 20,
    "paid_leaves": 1,
    "unpaid_leaves": 0
  }'
```

**Step 4: Retrieve Payslip**
```bash
curl -X GET http://localhost:5000/api/payslip/16
```

---

## Error Codes

| Status Code | Description |
|------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Missing required fields |
| 403 | Forbidden - Action not allowed |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Duplicate entry |
| 500 | Internal Server Error |

---

## Database Schema

### payslips Table
```sql
CREATE TABLE payslips (
  id INT PRIMARY KEY AUTO_INCREMENT,
  emp_id INT NOT NULL,
  payrun_id INT NULL,
  month VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  basic_salary DECIMAL(10,2) DEFAULT 0,
  hra DECIMAL(10,2) DEFAULT 0,
  earned_salary DECIMAL(10,2) DEFAULT 0,
  gross_salary DECIMAL(10,2) DEFAULT 0,
  pf_deduction DECIMAL(10,2) DEFAULT 0,
  tax_deduction DECIMAL(10,2) DEFAULT 0,
  unpaid_deduction DECIMAL(10,2) DEFAULT 0,
  total_deductions DECIMAL(10,2) DEFAULT 0,
  net_salary DECIMAL(10,2) DEFAULT 0,
  present_days INT DEFAULT 0,
  paid_leaves INT DEFAULT 0,
  unpaid_leaves INT DEFAULT 0,
  status ENUM('Draft','Done') DEFAULT 'Draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (emp_id) REFERENCES employees(id),
  UNIQUE KEY unique_emp_month_year (emp_id, month, year)
);
```

---

## Notes

1. **Draft vs Done:** New payslips are created with status "Draft" and changed to "Done" after saving computed values.

2. **Unique Constraint:** One employee can only have one payslip per month/year combination.

3. **Calculations:** All salary calculations are based on earned salary (prorated by attendance), not full basic salary.

4. **HRA:** Calculated as 20% of earned salary, not basic salary.

5. **PF:** Calculated as 12% of earned salary, not basic salary.

6. **Tax:** Fixed at ₹200 per month.

7. **Unpaid Leaves:** Deducted at per-day rate from gross salary.
