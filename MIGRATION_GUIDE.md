# Migration Instructions

## Multiple Check-ins/Check-outs Per Day

This migration allows users to check in and check out multiple times per day.

### Changes Made:

1. **Database Schema**:
   - Removed `UNIQUE KEY unique_user_date` constraint from attendance table
   - Changed `check_in_time` and `check_out_time` from `TIME` to `DATETIME`
   - Added new indexes for better query performance

2. **Backend API**:
   - Updated `checkIn()` to create a new record each time (instead of updating)
   - Updated `checkOut()` to find the latest unchecked-out record
   - Updated `getAttendanceStatus()` to return the latest record's status
   - Updated `getAllEmployeesAttendanceStatus()` to fetch latest status for all employees
   - Added `getTodayAttendance()` endpoint to view all check-in/out records for today

3. **Frontend**:
   - Removed disabled state after checkout (users can check in again)
   - Updated status display logic to allow multiple check-ins per day
   - Status button now always clickable (green when checked in, yellow when checked out)

### Running the Migration:

1. Open MySQL command line or MySQL Workbench
2. Run the migration script:
   ```bash
   mysql -u root -p workzen_hrms < backend/src/database/migrations/001_allow_multiple_checkins.sql
   ```

   Or manually execute the SQL:
   ```sql
   USE workzen_hrms;
   
   ALTER TABLE attendance DROP INDEX IF EXISTS unique_user_date;
   
   ALTER TABLE attendance 
     MODIFY COLUMN check_in_time DATETIME,
     MODIFY COLUMN check_out_time DATETIME;
   
   ALTER TABLE attendance 
     ADD INDEX IF NOT EXISTS idx_check_in (user_id, check_in_time),
     ADD INDEX IF NOT EXISTS idx_check_out (user_id, check_out_time);
   ```

3. Restart the backend server if it's running

### New Behavior:

- Users can check in and check out multiple times throughout the day
- Each check-in creates a new attendance record
- Each check-out updates the most recent check-in record
- The status indicator shows the current state (checked in or checked out)
- Users can view all their check-in/out records for today via `/api/attendance/today`
- Total hours are calculated and summed across all sessions

### API Endpoints:

- `POST /api/attendance/check-in` - Check in (creates new record)
- `POST /api/attendance/check-out` - Check out (updates latest record)
- `GET /api/attendance/status` - Get current status (latest record)
- `GET /api/attendance/today` - Get all check-in/out records for today with total hours

### Example Usage:

1. User checks in at 9:00 AM → Creates Record 1 with check_in_time
2. User checks out at 12:00 PM → Updates Record 1 with check_out_time (3 hours)
3. User checks in at 1:00 PM → Creates Record 2 with check_in_time
4. User checks out at 5:00 PM → Updates Record 2 with check_out_time (4 hours)
5. Total hours worked: 7 hours across 2 sessions
