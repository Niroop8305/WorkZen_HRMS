<<<<<<< HEAD

# Quick Start - My Profile Feature

## 🚀 Quick Setup (3 Steps)

### Step 1: Apply Database Migration

```powershell
# Navigate to backend directory
cd backend

# Run the migration SQL
mysql -u root -p workzen_hrms < src/database/add_resume_fields.sql
```

**OR** manually run in MySQL Workbench:

```sql
USE workzen_hrms;

ALTER TABLE employee_profiles
ADD COLUMN IF NOT EXISTS about TEXT,
ADD COLUMN IF NOT EXISTS what_i_love TEXT,
ADD COLUMN IF NOT EXISTS interests TEXT,
ADD COLUMN IF NOT EXISTS skills JSON,
ADD COLUMN IF NOT EXISTS certifications JSON;

UPDATE employee_profiles
SET skills = JSON_ARRAY(),
    certifications = JSON_ARRAY()
WHERE skills IS NULL OR certifications IS NULL;
```

# Quick Start - WorkZen

This quick start covers both the My Profile feature and the Attendance feature so you can get the latest code running locally.

## Prerequisites

- MySQL running and accessible
- Node.js (>= 18) and npm installed

## 1) Database Migrations

If you're testing the My Profile feature, apply the resume migration:

```powershell
cd backend
mysql -u root -p workzen_hrms < src/database/add_resume_fields.sql
```

If you're testing Attendance, apply the attendance enhancements:

```powershell
cd backend
Get-Content src\database\attendance_enhancements.sql | mysql -u root -p workzen_hrms
```

## 2) Install dependencies

Install backend deps and regenerate the lockfile (we removed the conflicting lockfile during merge):

```powershell
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

## 3) Start services

Backend:

```powershell
cd backend
npm start
```

Frontend:

```powershell
cd frontend
npm run dev
```

Open the app at http://localhost:5173 and log in.

## Quick tests

- Visit /profile to validate My Profile UI and edit/save profile information.
- Visit /attendance to validate attendance views (employee & admin flows).

## Troubleshooting

- If pages are blank, check browser console for JS errors and ensure backend API is running on port 5000.
- If skills/certifications don't save, ensure the resume migration was applied and run the backend migration script.

---

For more detailed feature docs see `MY_PROFILE_FEATURE.md` and `ATTENDANCE_FEATURE.md`.
