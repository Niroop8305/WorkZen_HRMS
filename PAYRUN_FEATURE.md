# Payroll Payrun Feature Documentation

## Overview
The **Payroll Payrun** feature allows Payroll Officers and Administrators to automatically generate payslips for all employees for a selected pay period with a single click. The system calculates salary components (Employer Cost, Basic Wage, Gross Wage, and Net Wage) and marks each payroll entry with a status once processed.

## Features

### 1. **Automatic Payrun Generation**
- Generate payslips for all active employees at once
- Select any month and year for payroll processing
- Real-time progress indication during generation
- Success/error alerts with detailed feedback

### 2. **Salary Components Calculation**
The system automatically calculates:
- **Employer Cost**: Total monthly wage (equals Gross Wage)
- **Basic Wage**: Employee's base salary
- **Gross Wage**: Basic Salary + All Allowances (HRA, DA, etc.)
- **Net Wage**: Gross Wage - Total Deductions (PF, Tax, etc.)

### 3. **Structured Results Display**
- Clean table format showing all payroll entries
- Employee information with codes
- All salary components in Indian Rupees (₹)
- Status badge showing "Done" for processed payslips
- Total row showing sum of all components

### 4. **Data Validation**
- Checks for existing payroll records to avoid duplicates
- Validates active employees with configured salaries
- Ensures attendance data is available
- Transaction rollback on errors

## User Interface

### Payrun Header Section
```
┌─────────────────────────────────────────────────────────┐
│ Information Panel                                        │
│ • Main description of payrun functionality              │
│ • Salary component definitions                          │
│                                                          │
│ Pay Period: [October 2025 ▼]  [🚀 Generate Payrun]     │
│                                                          │
│ ✅ Payrun generated successfully for 15 employees!      │
└─────────────────────────────────────────────────────────┘
```

### Results Table
```
┌──────────────────────────────────────────────────────────────────────┐
│ Payrun Results - October 2025                     15 employees       │
├──────────┬──────────┬────────────┬───────────┬────────────┬─────────┤
│ Pay      │ Employee │ Employer   │ Basic     │ Gross      │ Net     │
│ Period   │          │ Cost       │ Wage      │ Wage       │ Wage    │
├──────────┼──────────┼────────────┼───────────┼────────────┼─────────┤
│ [Oct     │ John Doe │ ₹50,000   │ ₹25,000   │ ₹50,000    │ ₹43,800 │
│  2025]   │ EMP001   │            │           │            │  Done   │
├──────────┼──────────┼────────────┼───────────┼────────────┼─────────┤
│ Total              │ ₹8,50,000  │ ₹4,25,000 │ ₹8,50,000  │ ₹7,44,000│
└──────────────────────────────────────────────────────────────────────┘
```

## Technical Implementation

### Frontend (React)
**File**: `frontend/src/pages/Payroll.jsx`

**Key Functions**:
```javascript
// Generate payrun for all employees
const handleGeneratePayrun = async () => {
  // API call to backend
  // Display results in table
  // Show success/error alerts
}

// Calculate salary components for display
const calculateSalaryComponents = (payroll) => {
  // Returns employerCost, basicWage, grossWage, netWage
}
```

**State Management**:
- `payrunResults`: Array of generated payroll records
- `isGeneratingPayrun`: Loading state during generation
- `payrunSuccess`: Success flag for alert display

### Backend API
**File**: `backend/src/routes/payrollRoutes.js`

**Endpoint**: `POST /api/payroll/generate-payrun`

**Authorization**: Admin, Payroll Officer only

**Request Body**:
```json
{
  "month": "10",
  "year": 2025
}
```

**Response**:
```json
{
  "success": true,
  "message": "Payrun generated successfully for 15 employees",
  "data": [
    {
      "payroll_id": 123,
      "employee_name": "John Doe",
      "employee_code": "EMP001",
      "month": "10",
      "year": 2025,
      "basic_salary": 25000,
      "total_allowances": 25000,
      "gross_salary": 50000,
      "total_deductions": 6200,
      "net_salary": 43800,
      "payment_status": "Done"
    }
  ]
}
```

### Salary Calculation Logic

#### Allowances (40% HRA + 10% DA)
```
HRA = Basic Salary × 40%
DA = Basic Salary × 10%
Total Allowances = HRA + DA
```

#### Gross Salary
```
Gross Salary = Basic Salary + Total Allowances
```

#### Deductions (12% PF + ₹200 Tax)
```
PF = Basic Salary × 12%
Professional Tax = ₹200 (fixed)
Total Deductions = PF + Professional Tax
```

#### Net Salary
```
Net Salary = Gross Salary - Total Deductions
```

### Database Tables

**payroll** table:
- `payroll_id`: Primary key
- `user_id`: Employee reference
- `month`, `year`: Pay period
- `working_days`, `present_days`, `leave_days`: Attendance
- `gross_salary`, `total_deductions`, `net_salary`: Amounts
- `payment_status`: Status (Done, Pending, etc.)
- `generated_by`: User who generated payroll

**payroll_details** table:
- `payroll_id`: Foreign key to payroll
- `component_id`: Salary component reference
- `amount`: Component amount

## Usage Instructions

### For Payroll Officers/Admins:

1. **Navigate to Payroll**
   - Click on "Payroll" in the main navigation
   - Click on "Payrun" tab

2. **Select Pay Period**
   - Choose month and year from dropdown
   - Example: "Payrun for October 2025"

3. **Generate Payrun**
   - Click "🚀 Generate Payrun" button
   - Wait for processing (loading indicator shows)
   - View success message with employee count

4. **Review Results**
   - Check the results table for all employees
   - Verify salary components are correct
   - Note "Done" status for each entry
   - Review totals at bottom of table

5. **View Individual Payslips** (optional)
   - Click on any employee row
   - View detailed payslip breakdown
   - Print or download as needed

### Validation & Error Handling

**The system validates**:
- ✅ Only Payroll Officers can generate payrun
- ✅ Month and year are required
- ✅ Employees must have basic salary configured
- ✅ Prevents duplicate payroll for same period
- ✅ Uses transactions for data consistency

**Error Messages**:
- "Only Payroll Officers can generate payrun"
- "No active employees found with salary configured"
- "Payrun already exists for this period"
- "Failed to generate payrun" (with details)

## Styling & Responsiveness

### Desktop View
- Full table with all columns visible
- Horizontal scroll if needed
- Hover effects on rows
- Sticky table header

### Mobile View
- Responsive table layout
- Smaller font sizes
- Full-width button
- Stacked controls
- Vertical scrolling

### Color Scheme
- **Success**: Green (#4CAF50)
- **Purple**: Primary color for headers
- **Done Status**: Green badge
- **Amounts**: Monospace font for numbers

## Future Enhancements

1. **Email Notifications**
   - Send payslips to employees automatically
   - Email all employees after payrun

2. **PDF Generation**
   - Bulk PDF export for all payslips
   - Individual PDF download

3. **Approval Workflow**
   - Multi-level approval before marking "Done"
   - Review and edit before finalizing

4. **Advanced Calculations**
   - Tax slabs based on income
   - Variable allowances per employee
   - Bonus and incentive calculations

5. **Reports**
   - Monthly payroll summary
   - Year-to-date reports
   - Department-wise breakdown

## Testing Checklist

- [ ] Generate payrun for current month
- [ ] Verify salary calculations are correct
- [ ] Check duplicate prevention works
- [ ] Test with no employees
- [ ] Test with missing salary data
- [ ] Verify status updates to "Done"
- [ ] Test responsive design on mobile
- [ ] Check table scrolling with many employees
- [ ] Verify totals row calculation
- [ ] Test error handling and alerts

## Support & Troubleshooting

**Issue**: "No active employees found"
- **Solution**: Ensure employees have basic_salary configured in employee_profiles

**Issue**: "Payrun already exists"
- **Solution**: Payroll for this month/year already generated. Use different period.

**Issue**: Calculations seem incorrect
- **Solution**: Check salary_components table for correct percentages and amounts

**Issue**: Transaction errors
- **Solution**: Check database connection and transaction rollback logs

---

**Version**: 1.0.0  
**Last Updated**: November 8, 2025  
**Author**: GitHub Copilot
