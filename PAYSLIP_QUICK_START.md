# 🚀 Payslip Feature - Quick Start Guide

## ⚡ 5-Minute Setup

Follow these steps to get the payslip feature working with live data in **5 minutes**:

---

## Step 1: Insert Mock Data (2 minutes)

### Option A: Using MySQL Workbench (Easiest)

1. Open **MySQL Workbench**
2. Connect to your database
3. Open file: `PAYSLIP_MOCK_DATA_5_MONTHS.sql`
4. Click **Execute** button (⚡)
5. Wait for success message

### Option B: Using Command Line

```bash
# Navigate to project root
cd d:\Repositories\Odoo-x-Amalthea-2025-Hackathon

# Execute SQL file
mysql -u root -p workzen_hrms < PAYSLIP_MOCK_DATA_5_MONTHS.sql
```

### Option C: Using PowerShell (Windows)

```powershell
Get-Content .\PAYSLIP_MOCK_DATA_5_MONTHS.sql | mysql -u root -p workzen_hrms
```

---

## Step 2: Verify Data (30 seconds)

Run this verification script:

```bash
mysql -u root -p workzen_hrms < VERIFY_PAYSLIP_SETUP.sql
```

Or manually check:

```sql
-- Check employees
SELECT * FROM employees;

-- Check attendance
SELECT * FROM attendance;
```

You should see:

- ✅ **5 employees** (EMP001 to EMP005)
- ✅ **25 attendance records** (5 employees × 5 months)

---

## Step 3: Start Backend Server (30 seconds)

```bash
# Navigate to backend
cd backend

# Install dependencies (if not done)
npm install

# Start server
npm start
```

Server should start on: `http://localhost:5000`

---

## Step 4: Test API (2 minutes)

### Test 1: Get All Employees

```bash
curl http://localhost:5000/api/employees
```

### Test 2: Get Attendance Data

```bash
curl "http://localhost:5000/api/employees/1/attendance?month=October&year=2025"
```

### Test 3: Create Draft Payslip

```bash
curl -X POST http://localhost:5000/api/payslip/new \
  -H "Content-Type: application/json" \
  -d '{"emp_id": 1, "month": "October", "year": 2025}'
```

### Test 4: Compute Salary

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

### Test 5: Generate Payrun (All Employees)

```bash
curl -X POST http://localhost:5000/api/payrun/generate \
  -H "Content-Type: application/json" \
  -d '{"month": "October", "year": 2025}'
```

---

## ✅ Success Checklist

- [ ] Mock data inserted (5 employees, 25 attendance records)
- [ ] Backend server running on port 5000
- [ ] Can fetch employees from API
- [ ] Can fetch attendance data
- [ ] Can create draft payslip
- [ ] Can compute salary
- [ ] Can generate payrun

---

## 📊 What You Have Now

### 5 Employees with Salaries:

| Employee     | Code   | Basic Salary | Total Months |
| ------------ | ------ | ------------ | ------------ |
| Rajesh Kumar | EMP001 | ₹25,000      | 5            |
| Priya Sharma | EMP002 | ₹30,000      | 5            |
| Amit Patel   | EMP003 | ₹28,000      | 5            |
| Sneha Reddy  | EMP004 | ₹32,000      | 5            |
| Vikram Singh | EMP005 | ₹27,000      | 5            |

### 5 Months of Data:

- June 2025
- July 2025
- August 2025
- September 2025
- October 2025

### Realistic Attendance Patterns:

- ✅ Present days (20-24 per month)
- ✅ Paid leaves (0-4 per month)
- ✅ Unpaid leaves (0-2 per month)
- ✅ Different patterns per employee

---

## 🎯 Next Steps

### 1. Test All Features

```bash
# Test creating payslips for all months
for month in June July August September October; do
  curl -X POST http://localhost:5000/api/payrun/generate \
    -H "Content-Type: application/json" \
    -d "{\"month\": \"$month\", \"year\": 2025}"
done
```

### 2. View Generated Payslips

```bash
# Get all payslips
curl http://localhost:5000/api/payslip/

# Filter by month
curl "http://localhost:5000/api/payslip/?month=October&year=2025"

# Filter by employee
curl "http://localhost:5000/api/payslip/?emp_id=1"
```

### 3. Implement Frontend

See `PAYSLIP_LIVE_DATA_IMPLEMENTATION_GUIDE.md` for:

- React component examples
- Frontend integration
- UI/UX best practices

---

## 🔧 Available API Endpoints

### Employee Endpoints

```
GET  /api/employees                          - Get all employees
GET  /api/employees/:id                      - Get employee by ID
GET  /api/employees/:id/attendance           - Get attendance for specific month
GET  /api/employees/:id/attendance-history   - Get all attendance records
GET  /api/employees/:id/summary              - Get employee with attendance summary
GET  /api/employees/with-attendance          - Get all employees with attendance
GET  /api/employees/months                   - Get available months
```

### Payslip Endpoints

```
POST   /api/payslip/new                      - Create draft payslip
POST   /api/payslip/compute                  - Compute salary (preview)
PUT    /api/payslip/:id/save                 - Save computed payslip
GET    /api/payslip/:id                      - Get payslip by ID
GET    /api/payslip/                         - Get all payslips (with filters)
DELETE /api/payslip/:id                      - Delete draft payslip
PUT    /api/payslip/:id/validate             - Mark payslip as Done
```

### Payrun Endpoints

```
POST   /api/payrun/generate                  - Generate payrun for all employees
GET    /api/payrun/:id                       - Get payrun by ID
GET    /api/payrun/                          - Get all payruns
PUT    /api/payrun/:id/validate              - Validate payrun
```

---

## 💡 Usage Examples

### Generate Payslips for October 2025

```javascript
// JavaScript/Node.js example
const axios = require("axios");

async function generateOctoberPayslips() {
  try {
    const response = await axios.post(
      "http://localhost:5000/api/payrun/generate",
      {
        month: "October",
        year: 2025,
      }
    );

    console.log("Payrun created:", response.data);
    console.log("Total employees:", response.data.payrun.total_employees);
    console.log("Total cost:", response.data.payrun.total_cost);
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

generateOctoberPayslips();
```

### Get Employee Payslip History

```javascript
async function getEmployeePayslips(empId) {
  try {
    const response = await axios.get(
      `http://localhost:5000/api/payslip/?emp_id=${empId}`
    );

    console.log(`Payslips for employee ${empId}:`, response.data.payslips);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

getEmployeePayslips(1);
```

---

## 🐛 Troubleshooting

### Problem: "Employee not found"

**Solution:**

```sql
-- Check if employees exist
SELECT * FROM employees;

-- If empty, run the mock data script again
```

### Problem: "Attendance data not found"

**Solution:**

```sql
-- Check attendance records
SELECT * FROM attendance WHERE emp_id = 1;

-- Verify month spelling (case-sensitive)
SELECT DISTINCT month FROM attendance;
```

### Problem: "Payslip already exists"

**Solution:**

```sql
-- Delete existing payslip
DELETE FROM payslips WHERE emp_id = 1 AND month = 'October' AND year = 2025;
```

### Problem: "Server not starting"

**Solution:**

```bash
# Check if port 5000 is in use
netstat -ano | findstr :5000

# Kill process if needed (Windows)
taskkill /PID <PID> /F

# Check environment variables
cat backend/.env
```

---

## 📚 Additional Resources

- **Detailed Guide:** `PAYSLIP_LIVE_DATA_IMPLEMENTATION_GUIDE.md`
- **API Documentation:** `PAYSLIP_API_DOCUMENTATION.md`
- **Implementation Summary:** `PAYSLIP_IMPLEMENTATION_SUMMARY.md`
- **Verification Script:** `VERIFY_PAYSLIP_SETUP.sql`

---

## 🤝 Sharing with Team

To share this setup with your team members, send them:

1. **The SQL File:**

   - `PAYSLIP_MOCK_DATA_5_MONTHS.sql`

2. **Instructions:**

   ```
   1. Run the SQL file in your MySQL database
   2. Start the backend server: npm start
   3. Test the API endpoints
   ```

3. **Quick Test Command:**
   ```bash
   curl -X POST http://localhost:5000/api/payrun/generate \
     -H "Content-Type: application/json" \
     -d '{"month": "October", "year": 2025}'
   ```

---

## 🎉 You're Ready!

Your payslip feature is now fully functional with:

- ✅ 5 employees
- ✅ 5 months of attendance data
- ✅ Live salary calculations
- ✅ Complete API endpoints
- ✅ Ready for frontend integration

**Start generating payslips now! 🚀**

---

## 📞 Need Help?

Check the troubleshooting section or refer to the detailed guide:

- `PAYSLIP_LIVE_DATA_IMPLEMENTATION_GUIDE.md`

**Happy Coding! 💻**
