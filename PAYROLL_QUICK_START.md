# Payroll Module - Quick Start Guide

## 🚀 Getting Started

### Starting the Application

1. **Backend** (Terminal 1):
   ```powershell
   cd backend
   npm run dev
   ```

2. **Frontend** (Terminal 2):
   ```powershell
   cd frontend
   npm run dev
   ```

3. Access the application at: `http://localhost:5173`

## 📋 Features Overview

### For Employees
- ✅ View personal payroll history
- ✅ Access detailed payslips
- ✅ Filter by month and year
- ✅ Print payslips

### For Payroll Officers & Admins
- ✅ View all employees' payroll
- ✅ Access any employee's payslip
- ✅ Generate new payroll (coming soon)
- ✅ Manage settings (coming soon)

## 🎯 How to Use

### Viewing Your Payroll (Employee)

1. **Login** to your account
2. **Navigate** to "Payroll" from the top menu
3. **Filter** (optional):
   - Select Month (or "All Months")
   - Select Year
4. **View** the payroll list showing:
   - Pay Period
   - Gross Salary
   - Deductions
   - Net Salary
   - Payment Status
5. **Click** "View Payslip" to see detailed breakdown

### Viewing Employee Payroll (Payroll Officer/Admin)

1. **Login** to your account
2. **Navigate** to "Payroll" from the top menu
3. **See** all employees' payroll in the table
4. **Filter** by month/year if needed
5. **Click** "View Payslip" on any row to see details

### Understanding the Payslip

The payslip contains:

#### 📊 Employee Information
- Name and Employee Code
- Department and Designation

#### 💰 Payment Information
- Pay Period (Month/Year)
- Payment Date
- Payment Status
- Date of Joining

#### 📅 Attendance Summary
- Worked Days
- Paid Time Off

#### 💵 Earnings
- Basic Salary
- House Rent Allowance
- Standard Allowance
- Performance Bonus
- Other allowances
- **Gross Total**

#### 📉 Deductions
- PF (Employee & Employer)
- Professional Tax
- TDS
- Other deductions
- **Total Deductions**

#### ✨ Net Salary
Large display showing: **Total Net Payable = Gross - Deductions**

### Printing a Payslip

1. **Open** the payslip you want to print
2. **Click** "Print" button at the top
3. **Or** use browser print: `Ctrl + P` (Windows) / `Cmd + P` (Mac)
4. The layout is optimized for printing

## 🎨 Navigation Guide

### Main Menu Items

| Menu Item | Who Can See | Purpose |
|-----------|-------------|---------|
| **Dashboard** | Everyone | Overview and quick actions |
| **Payroll** | Everyone | Payroll records and payslips |
| **Attendance** | Everyone | Attendance tracking (coming soon) |
| **Leave** | Everyone | Leave management (coming soon) |

### Tabs in Payroll Page

| Tab | Who Can See | Purpose |
|-----|-------------|---------|
| **Employees** | Everyone | Employee list (coming soon) |
| **Payroll** | Everyone | Payroll records |
| **Reports** | Everyone | Payroll reports (coming soon) |
| **Settings** | Officers/Admin | System settings (coming soon) |

## 🔍 Status Badges

### Payment Status Colors

- 🟢 **Paid** (Green) - Payment completed
- 🟡 **Pending** (Yellow/Orange) - Awaiting payment
- 🔵 **Processing** (Blue) - Payment in progress

## 📱 Mobile Support

The payroll module is fully responsive:
- ✅ Works on tablets
- ✅ Works on mobile phones
- ✅ Adaptive table layouts
- ✅ Touch-friendly buttons

## ⚙️ Filters

### Month Filter
- Select specific month (January - December)
- Or select "All Months" to see all records

### Year Filter
- Shows last 5 years
- Default: Current year

## 🖨️ Printing Tips

1. **Use the Print button** in the payslip view for best results
2. The page will automatically:
   - Hide navigation
   - Hide action buttons
   - Optimize layout for paper
   - Use print-friendly colors

3. **Recommended print settings**:
   - Paper: A4
   - Orientation: Portrait
   - Margins: Normal
   - Background graphics: Off

## 🔐 Security Features

- ✅ **Role-based access control**
  - Employees can only see their own data
  - Officers can see all data
  
- ✅ **Token-based authentication**
  - Automatic logout on token expiry
  - Secure API calls

- ✅ **Confidentiality**
  - Payslips marked as confidential
  - Individual access only

## 💡 Tips & Tricks

### Quick Actions
- Use Dashboard quick action buttons for fast navigation
- Hover over cards for interactive effects

### Keyboard Shortcuts
- `Ctrl + P` / `Cmd + P` - Print current page

### Data Refresh
- Change filters automatically refreshes data
- No need to click a "Search" button

## ❓ Common Questions

### Q: Where is my payslip?
**A:** Navigate to Payroll → Select month/year → Click "View Payslip"

### Q: Can I download my payslip?
**A:** Yes! Click "Download PDF" (feature coming soon) or use "Print" → "Save as PDF"

### Q: Why can't I see other employees' payroll?
**A:** Only Payroll Officers and Admins can see all employees' data

### Q: How do I generate payroll?
**A:** (For Officers) Click "Generate Payroll" button on the Payroll page

### Q: Can I see previous years' payroll?
**A:** Yes! Use the year filter to select any of the last 5 years

## 🎯 What's Next?

### Coming Soon
- 📧 Email payslips to employees
- 📊 Advanced reports and analytics
- 🔧 Salary component configuration
- 👥 Employee management interface
- 📑 Bulk payroll generation

## 🐛 Troubleshooting

### Issue: No data showing
**Check:**
1. Are you logged in?
2. Have you selected the correct month/year?
3. Is the backend running?

### Issue: Cannot print
**Try:**
1. Use the "Print" button instead of browser print
2. Check browser print settings
3. Ensure pop-ups are not blocked

### Issue: Payslip not loading
**Check:**
1. Is your internet connection stable?
2. Try refreshing the page
3. Check browser console for errors

## 📞 Support

For issues or questions:
1. Check this guide
2. Review PAYROLL_IMPLEMENTATION.md for technical details
3. Contact system administrator

---

**Made with ❤️ for WorkZen HRMS**
*Your Workforce Management Solution*
