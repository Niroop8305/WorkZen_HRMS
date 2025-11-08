# Debugging Guide: Airplane Icon for Employees on Leave

## Steps to Debug:

### 1. Check Backend Server

Make sure the backend server is running with the updated code:

```bash
cd backend
node server.js
```

Look for startup messages and verify no errors.

### 2. Test the API Endpoint Directly

Open a new terminal or use a tool like Postman/Thunder Client and test:

**Endpoint:** `GET http://localhost:5000/api/leave/active-leaves`

**Headers:**

- Authorization: Bearer YOUR_TOKEN_HERE

You should get a response like:

```json
{
  "success": true,
  "data": {
    "123": {
      "id": 1,
      "start_date": "2025-11-09",
      "end_date": "2025-11-11",
      "leave_type": "Sick Time Off",
      "days_requested": 3,
      "employee_name": "John Doe",
      "email": "john@example.com"
    }
  }
}
```

### 3. Check Browser Console

1. Open your browser DevTools (F12)
2. Go to the Console tab
3. Reload the Dashboard or Attendance page
4. Look for these console messages:
   - "Active leaves response:" - Shows what the API returned
   - "Setting active leaves:" - Shows what was stored in state
   - "Checking employee X:" - Shows leave check for each employee
   - "Employee X is on leave!" - Confirms leave detection

### 4. Check Network Tab

1. Open DevTools > Network tab
2. Reload the page
3. Look for the API call to `/api/leave/active-leaves`
4. Check:
   - Status code (should be 200)
   - Response data
   - Any errors

### 5. Verify Database

Run the test query in MySQL:

```bash
mysql -u root -p workzen_hrms < backend/test_active_leaves.sql
```

Or run in MySQL Workbench:

```sql
USE workzen_hrms;

SELECT
    lr.id,
    lr.user_id,
    lr.start_date,
    lr.end_date,
    lr.status,
    CASE
        WHEN CURDATE() BETWEEN lr.start_date AND lr.end_date THEN 'ACTIVE'
        ELSE 'NOT ACTIVE'
    END as is_active_today
FROM leave_requests lr
WHERE lr.status = 'Approved'
ORDER BY lr.start_date DESC;
```

### 6. Common Issues & Solutions:

#### Issue 1: Backend server not restarted

**Solution:** Stop (Ctrl+C) and restart: `node server.js`

#### Issue 2: Date format mismatch

**Solution:** Check that leave request dates are in 'YYYY-MM-DD' format

#### Issue 3: No approved leaves for today

**Solution:** Ensure you have at least one leave request with:

- status = 'Approved'
- start_date <= today
- end_date >= today

#### Issue 4: Frontend not loading new code

**Solution:**

- Hard refresh browser (Ctrl+Shift+R)
- Clear browser cache
- Check if React dev server is running

#### Issue 5: Authentication issue

**Solution:** Make sure you're logged in as Admin or HR Officer

### 7. Manual Test:

1. Go to Time Off page
2. Create a new leave request for today's date (Nov 9, 2025)
3. As Admin/HR, approve the request
4. Go to Dashboard or Attendance page
5. You should see the ✈️ airplane icon

### 8. Check Console Output:

When backend receives the request, you should see:

```
Fetching active leaves for date: 2025-11-09
Active leaves found: 1
Active leaves data: [ { id: 1, user_id: 123, ... } ]
Active leaves map: { '123': { id: 1, ... } }
```

When frontend renders, you should see:

```
Active leaves response: { success: true, data: { '123': {...} } }
Setting active leaves: { '123': {...} }
Checking employee 123: { isOnLeave: true, ... }
Employee 123 is on leave!
```

## Quick Fix Commands:

```bash
# Backend
cd backend
node server.js

# In another terminal - Frontend (if needed)
cd frontend
npm run dev

# Test API endpoint (replace TOKEN)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/leave/active-leaves
```

## Expected Behavior:

- Dashboard: Employee card shows ✈ icon instead of green/yellow dot
- Attendance: Employee name has ✈️ emoji prefix in the table

If you follow these steps and still don't see the airplane icon, share the console output and I can help further!
