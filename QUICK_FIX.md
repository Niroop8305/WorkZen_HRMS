# 🚨 QUICK FIX - Choose ONE Method

Your backend server is running ✅, but database tables are missing.

---

## ⚡ METHOD 1: Double-Click (EASIEST)

1. Find the file: **`setup-timeoff.bat`** in your project root
2. **Double-click it**
3. Enter your MySQL root password when prompted
4. Wait for "SUCCESS!"
5. Refresh your browser

---

## ⚡ METHOD 2: PowerShell Script

```powershell
.\setup-timeoff-db.ps1
```

Enter your MySQL password when prompted.

---

## ⚡ METHOD 3: MySQL Workbench (MOST RELIABLE)

1. **Open MySQL Workbench**
2. **Connect** to your database
3. **File → Open SQL Script**
4. **Select**: `INSTALL_TIME_OFF.sql`
5. **Press Ctrl+Shift+Enter** (Execute All)
6. **Wait for success message**
7. **Refresh browser**

---

## ⚡ METHOD 4: Manual PowerShell Command

If you know your MySQL path, run:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p workzen_hrms
```

Then paste this SQL:

```sql
USE workzen_hrms;
source D:/Repositories/Odoo-x-Amalthea-2025-Hackathon/INSTALL_TIME_OFF.sql
```

---

## ✅ How to Verify It Worked

After running ANY method above:

1. Go to: **http://localhost:5173/timeoff**
2. **Refresh** (F5)
3. The 500 errors should be **GONE**
4. You should see "No leave requests found"
5. Click **NEW** and submit a request - it should work!

---

## 🎯 What Gets Created

- ✅ `leave_balances` table (24 Paid + 7 Sick days per user)
- ✅ `leave_requests` table (stores all requests)
- ✅ `leave_requests_view` (employee details combined)
- ✅ Balances initialized for all existing users

---

**Choose the method you're most comfortable with and run it now!** 🚀
