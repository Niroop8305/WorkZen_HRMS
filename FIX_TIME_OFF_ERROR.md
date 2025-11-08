# 🔧 FIX: Time Off 500 Error

## Problem

You're seeing **500 Internal Server Error** when accessing `/api/leave/requests` because the database tables don't exist yet.

## Solution - Follow These Steps:

### Step 1: Run the Database Setup Script

1. **Open MySQL Workbench**
2. **Connect to your database**
3. **Open the file**: `INSTALL_TIME_OFF.sql` (in the root folder)
4. **Select ALL the text** (Ctrl+A)
5. **Click the Lightning Bolt icon** (Execute) or press Ctrl+Shift+Enter
6. **Wait for "Setup Complete!"** message

### Step 2: Verify Tables Were Created

Run the verification script:

1. Open `CHECK_TIME_OFF_TABLES.sql`
2. Execute it
3. You should see:
   - ✅ `leave_requests` table
   - ✅ `leave_balances` table
   - ✅ `leave_requests_view` view

### Step 3: Restart Backend Server

```powershell
# Kill any existing server process
# Then start fresh:
cd backend
npm run dev
```

### Step 4: Refresh Your Browser

1. Go to: http://localhost:5173/timeoff
2. The error should be gone!
3. You should see "No leave requests found" message

---

## Quick Test

Once setup is complete, test the feature:

1. **Click "NEW" button**
2. **Fill in the form**:
   - Leave Type: Paid time Off
   - Start Date: Tomorrow
   - End Date: Day after tomorrow
   - Reason: Testing
3. **Submit**
4. **You should see**: Your request appear in the table with "Pending" status

---

## Still Having Issues?

If you still see errors after running the SQL script:

1. **Check database connection**: Make sure backend `.env` file has correct credentials
2. **Check server logs**: Look for specific error messages in the terminal
3. **Verify user is logged in**: Make sure JWT token is valid

---

## Common Errors & Fixes

### Error: "Table 'leave_requests' doesn't exist"

**Fix**: Run `INSTALL_TIME_OFF.sql` script

### Error: "Cannot read property of undefined"

**Fix**: Make sure you're logged in (valid token)

### Error: "EADDRINUSE: Port 5000 already in use"

**Fix**: Kill the existing Node process:

```powershell
# Find and kill process using port 5000
Get-Process -Name node | Stop-Process -Force
# Then restart: npm run dev
```

---

✅ After completing these steps, the Time Off feature will work perfectly!
