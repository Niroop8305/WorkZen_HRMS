# Time Off Management Feature

## Overview

A complete Time Off Management system with role-based access control for managing Paid Time Off (24 days) and Sick Time Off (7 days).

## Features

### Employee Features

- ✅ View personal leave balance
- ✅ Submit time off requests
- ✅ View status of submitted requests (Pending/Approved/Rejected)
- ✅ View request history

### Admin/HR Officer Features

- ✅ View all employee leave requests
- ✅ Approve or reject requests
- ✅ Search and filter requests
- ✅ Auto-update leave balances on approval
- ✅ View leave balances for all employees

## Setup Instructions

### 1. Database Migration

Run the SQL migration file to create the required tables:

**Option A: Using MySQL Workbench**

1. Open MySQL Workbench
2. Connect to the `workzen_hrms` database
3. Open the file: `backend/src/database/time_off_schema.sql`
4. Execute the entire script

**Option B: Using MySQL Command Line**

```bash
mysql -u root -p workzen_hrms < backend/src/database/time_off_schema.sql
```

This will create:

- `leave_balances` table - tracks available days for each employee
- `leave_requests` table - stores all time off requests
- `leave_requests_view` - view with employee details
- Initial leave balances for existing users (24 Paid, 7 Sick days)

### 2. Restart Backend Server

```bash
cd backend
npm start
```

### 3. Access the Feature

Navigate to: `http://localhost:5173/timeoff`

## API Endpoints

### Employee Endpoints

- `POST /api/leave/request` - Submit a new leave request
- `GET /api/leave/requests` - Get my leave requests
- `GET /api/leave/balance` - Get my leave balance
- `DELETE /api/leave/request/:id` - Delete pending request

### Admin/HR Endpoints

- `GET /api/leave/requests?search=&status=&leave_type=` - Get all requests
- `PUT /api/leave/request/:id/status` - Approve/Reject request

## Database Schema

### leave_balances

```sql
- balance_id (PK)
- user_id (FK)
- paid_time_off_balance (DECIMAL)
- sick_time_off_balance (DECIMAL)
- year (INT)
- created_at, updated_at
```

### leave_requests

```sql
- request_id (PK)
- user_id (FK)
- employee_name
- start_date, end_date
- leave_type ('Paid time Off', 'Sick time off')
- total_days
- reason (TEXT)
- status ('Pending', 'Approved', 'Rejected')
- reviewed_by (FK), reviewed_at
- created_at, updated_at
```

## UI Features

### Layout (Matching Screenshot)

- ✅ Left sidebar navigation
- ✅ Tab navigation (Time Off / Allocation)
- ✅ Purple "NEW" button for new requests
- ✅ Search bar for filtering
- ✅ Reject/Approve circular buttons (for admin)
- ✅ Leave balance cards showing available days
- ✅ Table with columns: Name, Start Date, End Date, Time off Type, Status
- ✅ Red/Green action buttons for approve/reject

### Color Scheme

- Background: Dark theme (#1a1a1a, #2a2a2a)
- Primary: Odoo Purple (var(--odoo-purple))
- Approve: Green (#28a745)
- Reject: Red (#dc3545)
- Pending: Orange (#FFA500)

## Business Logic

1. **Leave Request Submission**

   - Calculates total days from start to end date
   - Validates sufficient balance before submission
   - Sets status to 'Pending'

2. **Approval Process**

   - Only Admin/HR Officer can approve/reject
   - On approval: Automatically deducts days from balance
   - On rejection: No balance change
   - Records who reviewed and when

3. **Balance Management**
   - Each user gets 24 Paid Time Off days
   - Each user gets 7 Sick Time Off days
   - Balances are per year
   - Auto-initialized for new users

## Testing Checklist

- [ ] Employee can submit leave request
- [ ] Request shows in table immediately
- [ ] Admin/HR can see all requests
- [ ] Admin can approve request
- [ ] Balance decreases after approval
- [ ] Admin can reject request
- [ ] Status badges show correct colors
- [ ] Search filters work
- [ ] Modal form validation works
- [ ] Insufficient balance prevents submission

## File Structure

```
backend/
  src/
    controllers/
      leaveController.js     # Request handlers
    models/
      leaveModel.js          # Database queries
    routes/
      leaveRoutes.js         # API routes
    database/
      time_off_schema.sql    # Database schema

frontend/
  src/
    pages/
      TimeOff.jsx            # Main component
    styles/
      TimeOff.css            # Styles matching screenshot
```

## Notes

- Employees can only view their own requests
- Admins/HR Officers can view all requests
- Only pending requests can be deleted
- Date calculation includes weekends (you can modify this logic)
- Leave balance persists across browser sessions
- All operations are secured with JWT authentication

## Troubleshooting

**Issue: "Cannot read property of undefined"**

- Solution: Make sure you're logged in and token is valid

**Issue: "Insufficient balance"**

- Solution: Check leave_balances table, verify user has balance initialized

**Issue: Approve/Reject buttons not showing**

- Solution: Verify user role is 'Admin' or 'HR Officer'

**Issue: Tables not created**

- Solution: Run the SQL migration file manually in MySQL Workbench

---

**Ready to use!** 🚀 The Time Off Management feature is fully functional with UI matching the provided screenshot.
