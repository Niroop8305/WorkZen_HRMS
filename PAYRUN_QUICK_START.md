# 🚀 Quick Start - Payroll Payrun Dashboard

## Complete MySQL-Based Payrun System

---

## ⚡ Quick Setup (5 minutes)

### Step 1: Initialize Database
```bash
cd backend
npm run init-payroll
```

Expected output:
```
🚀 Initializing Payroll Database...
✅ Database tables created successfully
✅ Sample employees added
✅ Sample attendance data added

📊 Database Summary:
   - Employees: 5
   - Attendance Records: 10

🎉 Payroll database initialization complete!
```

### Step 2: Start Backend
```bash
npm start
```

Server running at: `http://localhost:5000`

### Step 3: Start Frontend
```bash
cd ../frontend
npm run dev
```

Frontend running at: `http://localhost:5173`

### Step 4: Access Payrun Dashboard
Navigate to: **http://localhost:5173/payrun**

---

## 🎯 How to Use

1. **Select Period**
   - Month: October
   - Year: 2025

2. **Click "🚀 Run Payrun"**

3. **View Results**
   - Summary card shows total employees and cost
   - Table displays all payslips with salary breakdown

---

## 📊 What Gets Calculated

For each employee:
```
✅ Earned Salary (based on present days + paid leaves)
✅ PF Deduction (12% of basic salary)
✅ Tax Deduction (₹200 fixed)
✅ Unpaid Leave Deduction (per day × unpaid days)
✅ Net Salary (gross - deductions)
```

---

## 🗄️ Database Tables Created

1. **employees** - Employee master data
2. **attendance** - Monthly attendance records
3. **payslips** - Generated payslips
4. **payruns** - Payrun summary

---

## 📋 Sample Employees

| Name | Employee ID | Basic Salary | HRA |
|------|------------|--------------|-----|
| Rajesh Kumar | EMP001 | ₹25,000 | ₹5,000 |
| Priya Sharma | EMP002 | ₹30,000 | ₹6,000 |
| Amit Patel | EMP003 | ₹28,000 | ₹5,600 |
| Sneha Reddy | EMP004 | ₹32,000 | ₹6,400 |
| Vikram Singh | EMP005 | ₹27,000 | ₹5,400 |

---

## 🔌 API Endpoints

### Generate Payrun
```bash
POST http://localhost:5000/api/payrun/run
Content-Type: application/json

{
  "month": "October",
  "year": 2025
}
```

### Get All Payruns
```bash
GET http://localhost:5000/api/payrun/list
```

### Get Payrun Details
```bash
GET http://localhost:5000/api/payrun/:id
```

### Get Single Payslip
```bash
GET http://localhost:5000/api/payslip/:id
```

---

## 🎨 UI Features

- **Dark Theme**: Modern black background with purple accents
- **Responsive**: Works on desktop, tablet, and mobile
- **Real-time Loading**: Spinner during payrun generation
- **Summary Card**: Key metrics at a glance
- **Detailed Table**: Full salary breakdown for each employee
- **Status Badges**: Visual indicators for completed payslips

---

## 📁 New Files Created

### Backend
```
backend/src/
├── models/
│   ├── employeeModel.js       ✅ Employee CRUD operations
│   ├── attendanceModel.js     ✅ Attendance management
│   ├── payslipModel.js        ✅ Payslip operations
│   └── payrunModel.js         ✅ Payrun operations
├── controllers/
│   └── payrunController.js    ✅ Salary calculation logic
├── routes/
│   └── payrunRoutes.js        ✅ API routes
└── database/
    ├── payroll_schema.sql     ✅ Database schema
    └── init_payroll.js        ✅ Initialization script
```

### Frontend
```
frontend/src/
├── pages/
│   └── PayrunDashboard.jsx    ✅ Main dashboard component
└── styles/
    └── PayrunDashboard.css    ✅ Complete styling
```

---

## ✨ Expected Result

After running payrun for October 2025:

**Summary:**
- Total Employees: 5
- Total Cost: ~₹215,000
- Status: ✅ Done

**Each Payslip Shows:**
- Employee Name & ID
- Basic Salary
- HRA
- Gross Salary
- Total Deductions (PF + Tax + Unpaid)
- **Net Salary** (in green)
- Status Badge (✅ Done)
- View Button (to see details)

---

## 🐛 Common Issues

### Issue: Database connection error
**Solution:** Check MySQL is running and `.env` credentials are correct

### Issue: No attendance records
**Solution:** Run `npm run init-payroll` again

### Issue: Port already in use
**Solution:** Change PORT in `.env` or kill existing process

---

## 🎉 Success!

You now have a fully functional payroll payrun system that:
- ✅ Automatically calculates salaries
- ✅ Generates payslips in bulk
- ✅ Stores data in MySQL
- ✅ Displays results in modern UI
- ✅ Handles attendance-based salary computation

---

## 📖 More Documentation

- Full details: See `PAYRUN_FEATURE.md`
- Architecture: See `ARCHITECTURE.md`
- Setup guide: See `SETUP_GUIDE.md`

---

**Built with ❤️ for WorkZen HRMS**
