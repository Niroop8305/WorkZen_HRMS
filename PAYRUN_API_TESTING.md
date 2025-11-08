# 🧪 Payrun API Testing Guide

## Base URL
```
http://localhost:5000
```

---

## 1. Generate Payrun

### Endpoint
```
POST /api/payrun/run
```

### Description
Generates payrun for all employees for the specified month and year. Calculates salaries based on attendance data and creates payslips.

### Request Body
```json
{
  "month": "October",
  "year": 2025
}
```

### Example using cURL
```bash
curl -X POST http://localhost:5000/api/payrun/run \
  -H "Content-Type: application/json" \
  -d '{"month":"October","year":2025}'
```

### Example using Postman
1. Method: **POST**
2. URL: `http://localhost:5000/api/payrun/run`
3. Headers: `Content-Type: application/json`
4. Body (raw JSON):
```json
{
  "month": "October",
  "year": 2025
}
```

### Success Response (201)
```json
{
  "success": true,
  "message": "Payrun generated successfully for October 2025",
  "payrun": {
    "id": 1,
    "month": "October",
    "year": 2025,
    "total_employees": 5,
    "total_cost": 215000.00,
    "status": "Done"
  },
  "payslips": [
    {
      "id": 1,
      "employee_name": "Rajesh Kumar",
      "employee_id": "EMP001",
      "basic_salary": 25000,
      "hra": 5000,
      "earned_salary": 24000,
      "gross_salary": 24000,
      "pf_deduction": 3000,
      "tax_deduction": 200,
      "unpaid_deduction": 0,
      "total_deductions": 3200,
      "net_salary": 20800,
      "present_days": 22,
      "paid_leaves": 2,
      "unpaid_leaves": 0,
      "status": "Done"
    }
    // ... more payslips
  ]
}
```

### Error Response (400)
```json
{
  "success": false,
  "message": "Month and year are required"
}
```

### Error Response (404)
```json
{
  "success": false,
  "message": "No attendance records found for October 2025"
}
```

---

## 2. Get All Payruns

### Endpoint
```
GET /api/payrun/list
```

### Description
Retrieves list of all payruns with summary information.

### Example using cURL
```bash
curl http://localhost:5000/api/payrun/list
```

### Success Response (200)
```json
{
  "success": true,
  "count": 2,
  "payruns": [
    {
      "id": 1,
      "month": "October",
      "year": 2025,
      "total_employees": 5,
      "total_cost": 215000.00,
      "status": "Done",
      "created_at": "2025-11-08T10:30:00.000Z"
    },
    {
      "id": 2,
      "month": "September",
      "year": 2025,
      "total_employees": 5,
      "total_cost": 198000.00,
      "status": "Done",
      "created_at": "2025-10-08T09:15:00.000Z"
    }
  ]
}
```

---

## 3. Get Payrun by ID

### Endpoint
```
GET /api/payrun/:id
```

### Description
Retrieves detailed information about a specific payrun including all payslips.

### Example using cURL
```bash
curl http://localhost:5000/api/payrun/1
```

### Success Response (200)
```json
{
  "success": true,
  "payrun": {
    "id": 1,
    "month": "October",
    "year": 2025,
    "total_employees": 5,
    "total_cost": 215000.00,
    "status": "Done",
    "created_at": "2025-11-08T10:30:00.000Z",
    "payslips": [
      {
        "id": 1,
        "emp_id": 1,
        "employee_name": "Rajesh Kumar",
        "employee_id": "EMP001",
        "basic_salary": 25000,
        "gross_salary": 24000,
        "net_salary": 20800,
        "status": "Done"
      }
      // ... more payslips
    ]
  }
}
```

### Error Response (404)
```json
{
  "success": false,
  "message": "Payrun not found"
}
```

---

## 4. Get Single Payslip

### Endpoint
```
GET /api/payslip/:id
```

### Description
Retrieves detailed information about a specific payslip including employee details.

### Example using cURL
```bash
curl http://localhost:5000/api/payslip/1
```

### Success Response (200)
```json
{
  "success": true,
  "payslip": {
    "id": 1,
    "emp_id": 1,
    "employee_name": "Rajesh Kumar",
    "employee_id": "EMP001",
    "payrun_id": 1,
    "month": "October",
    "year": 2025,
    "basic_salary": 25000.00,
    "hra": 5000.00,
    "earned_salary": 24000.00,
    "gross_salary": 24000.00,
    "pf_deduction": 3000.00,
    "tax_deduction": 200.00,
    "unpaid_deduction": 0.00,
    "total_deductions": 3200.00,
    "net_salary": 20800.00,
    "present_days": 22,
    "paid_leaves": 2,
    "unpaid_leaves": 0,
    "status": "Done",
    "created_at": "2025-11-08T10:30:00.000Z"
  }
}
```

### Error Response (404)
```json
{
  "success": false,
  "message": "Payslip not found"
}
```

---

## 5. Update Payrun Status

### Endpoint
```
PATCH /api/payrun/:id/status
```

### Description
Updates the status of a payrun (e.g., from "Done" to "Validated").

### Request Body
```json
{
  "status": "Validated"
}
```

### Example using cURL
```bash
curl -X PATCH http://localhost:5000/api/payrun/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"Validated"}'
```

### Success Response (200)
```json
{
  "success": true,
  "message": "Payrun status updated successfully"
}
```

### Error Response (400)
```json
{
  "success": false,
  "message": "Invalid status. Must be Pending, Done, or Validated"
}
```

### Error Response (404)
```json
{
  "success": false,
  "message": "Payrun not found"
}
```

---

## 🧪 Testing Workflow

### Step 1: Initialize Database
```bash
cd backend
npm run init-payroll
```

### Step 2: Start Server
```bash
npm start
```

### Step 3: Test Generate Payrun
```bash
curl -X POST http://localhost:5000/api/payrun/run \
  -H "Content-Type: application/json" \
  -d '{"month":"October","year":2025}'
```

### Step 4: List All Payruns
```bash
curl http://localhost:5000/api/payrun/list
```

### Step 5: Get Specific Payrun
```bash
curl http://localhost:5000/api/payrun/1
```

### Step 6: Get Payslip Details
```bash
curl http://localhost:5000/api/payslip/1
```

### Step 7: Update Status
```bash
curl -X PATCH http://localhost:5000/api/payrun/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"Validated"}'
```

---

## 📊 Sample Test Data

### Employees Available
- **EMP001**: Rajesh Kumar - ₹25,000 basic + ₹5,000 HRA
- **EMP002**: Priya Sharma - ₹30,000 basic + ₹6,000 HRA
- **EMP003**: Amit Patel - ₹28,000 basic + ₹5,600 HRA
- **EMP004**: Sneha Reddy - ₹32,000 basic + ₹6,400 HRA
- **EMP005**: Vikram Singh - ₹27,000 basic + ₹5,400 HRA

### Attendance Periods Available
- **October 2025** - Full attendance data
- **September 2025** - Full attendance data

### Test Scenarios

#### Scenario 1: Generate October Payrun
```bash
POST /api/payrun/run
Body: {"month":"October","year":2025}
Expected: 5 payslips created, total cost ~₹215,000
```

#### Scenario 2: Generate September Payrun
```bash
POST /api/payrun/run
Body: {"month":"September","year":2025}
Expected: 5 payslips created, total cost ~₹198,000
```

#### Scenario 3: Regenerate Existing Payrun
```bash
POST /api/payrun/run
Body: {"month":"October","year":2025}
Expected: Updates existing payrun, recalculates payslips
```

#### Scenario 4: Invalid Period
```bash
POST /api/payrun/run
Body: {"month":"November","year":2025}
Expected: 404 - No attendance records found
```

---

## 🔍 Debugging Tips

### Check Database Connection
```bash
curl http://localhost:5000/api/health
```

### View Server Logs
Terminal should show:
```
✅ MySQL Database Connected Successfully
🚀 Server running on port 5000
POST /api/payrun/run 201 1523ms
```

### Common Error Codes
- **400**: Bad Request (missing/invalid parameters)
- **404**: Not Found (no attendance data)
- **500**: Server Error (database/calculation error)

---

## 📝 Response Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET/PATCH |
| 201 | Created | Payrun generated successfully |
| 400 | Bad Request | Missing month/year or invalid status |
| 404 | Not Found | No data found |
| 500 | Server Error | Database or processing error |

---

## 🎯 Expected Calculation Results

For **Rajesh Kumar** (EMP001) in October 2025:
- Present Days: 22
- Paid Leaves: 2
- Unpaid Leaves: 0
- Basic: ₹25,000
- HRA: ₹5,000
- Per Day: ₹25,000 / 30 = ₹833.33
- Earned: ₹833.33 × 24 = ₹20,000
- PF: ₹25,000 × 0.12 = ₹3,000
- Tax: ₹200
- Net: ~₹20,800

---

**Happy Testing! 🚀**
