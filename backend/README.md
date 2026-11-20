# WorkZen HRMS - Backend

Smart Human Resource Management System - Backend API

## Tech Stack

- **Node.js** + **Express.js** - Backend framework
- **MySQL** - Relational database
- **JWT** - Authentication
- **bcryptjs** - Password hashing

## Database Architecture

### Core Tables

1. **roles** - User role management (Admin, HR Officer, Payroll Officer, Employee)
2. **users** - User authentication and accounts
3. **employee_profiles** - Detailed employee information
4. **attendance** - Daily attendance tracking with check-in/check-out
5. **leave_types** - Different types of leaves
6. **leave_balance** - Employee leave allocations and usage
7. **leave_applications** - Leave requests and approvals
8. **salary_components** - Salary component definitions (earnings/deductions)
9. **employee_salary_structure** - Individual employee salary structures
10. **payroll** - Monthly payroll records
11. **payroll_details** - Detailed breakdown of payroll components
12. **audit_logs** - System activity audit trail
13. **password_reset_codes** - Short-lived password reset codes
14. **user_sessions** - Server-side JWT session registry (HIGH-3 revocation), part of
    `schema.sql` so `npm run init-db` creates it; `npm run migrate:user-sessions` adds it
    to a database created before it was in the base schema

### Key Features

- **Foreign Key Relationships** for data integrity
- **Indexes** for optimized queries
- **Views** for the user directory and dashboard aggregates
- **`audit_logs`** append-only trail for key sensitive mutations
- **3 triggers + 1 stored procedure** installed by `npm run init-db`
  (`triggers.sql`, `procedures.sql`):
  - `after_leave_approval` — the **sole** writer of
    `leave_balance.used_days`/`remaining_days`; it deducts paid balance on a
    Pending→Approved transition and restores it on Approved→Cancelled. The Leave
    service locks and pre-validates the balance and changes the application
    status, but does not update the balance columns directly.
  - `before_attendance_insert` / `before_attendance_update` — maintain the
    derived `attendance.total_hours` column; the Attendance service owns the
    authoritative status and worked/late/early-checkout minute fields.
  - `calculate_leave_days` — installed but **not called** by the application;
    Leave duration is computed in JavaScript.
- Business logic lives in the **service layer**; the triggers above are the
  narrow, intentional exceptions documented here.

## Installation

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment**
   
   Copy `.env.example` to `.env` and update:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=workzen_hrms
   JWT_SECRET=your_secret_key
   ```

3. **Initialize the database and demo data (recommended)**
   ```bash
   npm run setup:demo
   ```

   This single command is the documented fresh-clone path. It runs five ordered stages
   and prints each one:

   1. `schema.sql` + `procedures.sql` + `triggers.sql` (any `CREATE DATABASE`/`USE`
      binding is stripped, so the target schema comes from `DB_NAME` or `--database=`)
   2. Migrations in dependency order, each guarded by an `INFORMATION_SCHEMA` check so a
      rerun is a no-op:
      `attendance` derived columns + `unique_user_attendance_date` →
      `salary_components.calculation_type` → `user_sessions` → the
      `after_leave_approval` leave-cancellation trigger
   3. Demo account seeding (skipped when the four `@workzen.demo` accounts exist;
      `--reseed-demo-users` refreshes them explicitly)
   4. Deterministic benchmark dataset generation
   5. Post-seed integrity verification — 22 checks; the command exits non-zero on failure

   Setup never drops a schema and never reseeds an existing database. `init-db` and the
   individual `migrate:*` scripts remain available for a schema-only install or for
   re-running one migration, but `setup:demo` is the command a new developer should use.

   **Session table before the first login.** `protect` validates every JWT against
   `user_sessions` and fails closed, so an API that cannot read that table answers 500 to
   *every* authenticated request. `schema.sql` now creates it, so `init-db` is enough for
   a fresh clone; a database created before HIGH-3 needs `npm run migrate:user-sessions`
   once. `npm run setup:demo` covers both because its migration stage runs the same step.

   Flags: `--database=<schema>`, `--dry-run`, `--skip-generate`, `--seed`,
   `--employees`, `--months`, `--leave-applications`, `--chunk-size`, `--end-period`,
   `--force-reseed-benchmark --yes` (deletes only `%@workzen.test` rows). Generation and
   setup both refuse `NODE_ENV=production`.

   ```bash
   npm run verify:demo          # re-run stage 5 against DB_NAME / --database=
   npm run generate:benchmark   # dataset only, resumable
   ```

4. **Start Server**
   ```bash
   npm run dev
   ```

   Server runs on: `http://localhost:5000`

   ## Demo Users

   `npm run setup:demo` (or `npm run seed:demo` on its own) creates or refreshes the
   local demo accounts:

   | Role | Email | Password |
   |---|---|---|
   | Admin | `admin@workzen.demo` | `Admin@123` |
   | HR Officer | `hr@workzen.demo` | `Hr@123` |
   | Payroll Officer | `payroll@workzen.demo` | `Payroll@123` |
   | Employee | `employee@workzen.demo` | `Employee@123` |
   | Synthetic benchmark employee | `emp0001@workzen.test` … `emp1000@workzen.test` | `Benchmark@123` |

   ## Benchmark dataset

   The generator produces one deterministic population from `--seed` (default
   `20261001`) so a demo environment can be rebuilt identically on any machine:

   | Object | Rows |
   |---|---:|
   | Synthetic employees | 1,000 |
   | Attendance rows (synthetic) | 221,000 |
   | Leave applications | 12,300 |
   | Payroll records | 10,150 |
   | Payroll component snapshots | 30,450 |
   | `leave_balance` rows | 12,000 |
   | `audit_logs` rows written by generation | 0 |

   Volumes come from the application's own rules, not from padding counters: the payroll
   window Dec-2025 … Sep-2026 holds 218 Mon–Fri dates and the senior cohort's extra
   month (Nov-2025) holds 20, so `850 × 218 + 150 × 238 = 221,000` attendance rows. The
   shared demo employee additionally receives 218 attendance rows, 13 leave
   applications and 10 payroll periods, which is why the `attendance` table itself holds
   221,218 rows.

   Every generated value reuses the live code paths: `calculateAttendanceMetrics()` for
   attendance status and minutes, `countWorkingDays()` /
   `attendancePayableDays()` / `paidLeaveDaysForPeriod()` / `calculatePayroll()` for
   payroll, real `Pending → Approved → Cancelled` status transitions so the
   `after_leave_approval` trigger maintains paid balances, and effective-dated salary
   structures with `Basic` (FIXED), `HRA` (PERCENTAGE) and `PF` (FIXED deduction) so both
   `calculation_type` branches are exercised. Writes are batched inside one transaction
   per employee; `generatePayroll()` is not called 10,150 times, and
   `test/demo-dataset-http.test.js` recomputes a 21-record spread sample with the live
   service functions to prove the snapshots agree.

   Guarantees enforced by the planner and re-checked in `verify:demo`: no negative net
   salary, weekday-only attendance with one row per user and date, non-overlapping
   single-calendar-year leave windows inside the annual allocation, paid balance rows
   equal to approved leave, payroll snapshots matching their component rows, only
   supported payroll periods, no synthetic audit rows, and no partially generated
   employee after an interrupted run.

   Verify it at any time:

   ```bash
   npm run verify:demo -- --database=workzen_hrms_fresh
   ```

## API Endpoints

### Authentication (`/api/auth`)

- `POST /register` - Register new user
- `POST /login` - User login
- `GET /me` - Get current user profile
- `POST /logout` - Logout user

### Users (`/api/users`)

- `GET /` - Get all users (Admin/HR)
- `GET /profile/:userId` - Get user profile
- `PUT /profile/:userId` - Update profile
- `PUT /:userId/status` - Update user status (Admin)

### Attendance (`/api/attendance`)

- `POST /check-in` - Employee check-in
- `POST /check-out` - Employee check-out
- `GET /status` - Current employee status
- `GET /today` - Today's employee records
- `GET /my-logs` - Paginated employee history
- `GET /summary` - Monthly employee summary
- `GET /day` - Paginated daily records for HR/Admin/Payroll
- `GET /all` - Paginated HR/Admin records with filters
- `GET /export` - Filtered CSV export for HR/Admin
- `PUT /:attendanceId` - Audited HR/Admin correction
- `DELETE /:attendanceId` - Admin deletion

Admin list filters include `page`, `limit`, `search`, `status`, `department`,
`startDate`, and `endDate`. The maximum page size is 100.

Attendance rules default to `Asia/Kolkata`, 09:00 expected start, 18:00
expected end, 15-minute late grace, and a 240-minute half-day threshold.
Override them with the `APP_TIMEZONE` and `ATTENDANCE_*` environment variables.

Leave organization endpoints:

- `GET /requests` - Admin/HR organization-wide requests with pagination, search, status, leave type, department, `employee_id`, and date filters
- `GET /active-leaves` - Admin/HR currently approved leave records
- `GET /audit` - Admin/HR Leave audit report with pagination and action filters
- `PATCH /:id/status` - Admin/HR approval or rejection
- `PATCH /:id/cancel` - Eligible employee/Admin/HR cancellation

Leave notifications reuse the existing Nodemailer service and are sent after a
successful committed mutation. Email delivery is skipped safely when SMTP
credentials are not configured and never rolls back a Leave transaction.

Leave endpoint performance at 1,000-employee scale (300 requests per read,
concurrency 10, 0% errors) is documented in the repository root `README.md`
Performance section — that benchmark is the authoritative source. The
`test:leave:perf` harness below is a low-volume smoke timer (a handful of
requests per endpoint) and is **not** a percentile-grade measurement:

```bash
LEAVE_API_URL='http://localhost:5000/api' npm run test:leave:perf
```

### Leave (`/api/leave`)

- `GET /types` - Get database-backed leave types
- `GET /balance` - Get the authenticated employee's current-year balances; Admin/HR may pass `?employee_id=<id>` to view another employee's balances
- `POST /apply` - Submit a pending leave application
- `GET /my-leaves` - Get the authenticated employee's leave history

The Leave milestone (frozen) uses only `leave_types`, `leave_balance`,
`employee_profiles`, `users`, `audit_logs`, and `leave_applications`. Legacy
`leave_requests`, `leave_balances`, `leave_allocations`, and
`leave_requests_view` must not be recreated or used.

The foundation additionally uses `password_reset_codes` (SHA-256 digests,
T-003), `user_sessions` (revocable sessions with absolute expiry, T-002) and
`auth_throttle` (per-account throttle counters).

Leave days are calculated inclusively while excluding Saturday and Sunday.
Holidays and partial-day leave are not currently modeled. Applications must
remain within one calendar year, and pending or approved periods cannot
overlap for the same employee. Submitting an application does not deduct
balance. The service locks and pre-validates the balance inside a transaction
and then changes the application status; the `after_leave_approval` database
trigger is the sole writer that deducts paid balance on approval and restores
it when an approved paid leave is cancelled. Unpaid leave never mutates the
paid balance.

### Payroll (`/api/payroll`)

- `GET /my-payroll` - Get my payroll records
- `GET /payslip/:payrollId` - Get detailed payslip
- `GET /all` - Get all payroll (Admin/Payroll Officer)
- `POST /generate` - Generate payroll (Admin/Payroll Officer)
- `PUT /:payrollId/status` - Update payment status (Admin/Payroll Officer)
- `GET /components` - Get salary components (Admin/Payroll Officer)
- `GET /salary-structure/:userId` - Get an employee's salary structure (Admin/Payroll Officer)

These are the only mounted payroll routes. The legacy payroll world
(`/api/payrun/*`, `/api/payslip/*`, `/api/employees/*`, and the duplicate
`/api/payroll/payslips` and `/api/payroll/salary-statement` endpoints) was
decommissioned in Payroll Milestone 1 and now returns a deliberate `404`. Its
backing tables (`payroll_employees`, `payroll_payslips`, `payroll_payruns`,
`payroll_attendance`) do not exist in the live database and must not be
recreated. Their historical DDL files (`payroll_schema.sql`,
`payslips_migration.sql`) were removed in the deployment cleanup — they must
never be recreated.

Payroll is functionally complete: salary components, effective-dated salary
structures with overlap/as-of handling, a single transaction-safe calculation
engine, a payment-status state machine, audit logging, and server-rendered
payslip JSON + PDF are all implemented and covered by the payroll, salary, and
payslip test suites.

### Dashboard (`/api/dashboard`)

- `GET /stats` - Get admin dashboard statistics (Admin/HR)
- `GET /my-stats` - Get employee dashboard

## Authentication

All protected routes require JWT token in header:

```
Authorization: Bearer <token>
```

## Role-Based Access Control

- **Admin** - Full system access
- **HR Officer** - Employee, attendance, and leave management
- **Payroll Officer** - Payroll and salary management
- **Employee** - View own records and apply for leave

## Database Schema Highlights

### Entity Relationships

```
users (1) ←→ (1) employee_profiles
users (1) ←→ (N) attendance
users (1) ←→ (N) leave_applications
users (1) ←→ (N) payroll
users (1) ←→ (N) leave_balance
users (N) ←→ (1) roles
leave_applications (N) ←→ (1) leave_types
payroll (1) ←→ (N) payroll_details
payroll_details (N) ←→ (1) salary_components
```

### Key Constraints

- Unique email per user
- Unique attendance per user per date
- Foreign keys with CASCADE/RESTRICT as appropriate
- Check constraints for data validation

## Error Handling

Standardized error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Development

```bash
npm run dev  # Start with nodemon
npm start    # Start production server
```

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js         # Database connection
│   ├── controllers/
│   │   └── authController.js   # Authentication logic
│   ├── database/
│   │   ├── schema.sql          # Complete database schema
│   │   ├── init.js             # Schema-only initialization
│   │   ├── setup-demo.js       # npm run setup:demo — ordered fresh-clone setup
│   │   ├── verify-demo.js      # npm run verify:demo — post-seed integrity checks
│   │   ├── generate-benchmark.js # npm run generate:benchmark — dataset writer/CLI
│   │   ├── benchmark/
│   │   │   └── plan.js         # Deterministic planning (no database access)
│   │   ├── setup/
│   │   │   ├── schemaSetup.js  # Schema + ordered, idempotent migration runner
│   │   │   └── verifyDemoData.js # 22 integrity/uniqueness/business-rule checks
│   │   ├── migrate-*.js        # Individual idempotent migrations
│   │   └── seed-demo-users.js  # Demo account seeding
│   ├── middleware/
│   │   ├── auth.js             # JWT & role verification
│   │   └── errorHandler.js     # Error handling
│   ├── models/
│   │   ├── userModel.js        # User data access
│   │   └── profileModel.js     # Profile data access
│   └── routes/
│       ├── authRoutes.js       # Auth endpoints
│       ├── userRoutes.js       # User endpoints
│       ├── attendanceRoutes.js # Attendance endpoints
│       ├── leaveRoutes.js      # Leave endpoints
│       ├── payrollRoutes.js    # Payroll endpoints
│       └── dashboardRoutes.js  # Dashboard endpoints
├── .env                        # Environment variables
├── server.js                   # Express server
└── package.json                # Dependencies
```

## Security Features

- Password hashing with bcrypt
- JWT token-based authentication
- Role-based authorization
- SQL injection prevention (parameterized queries)
- CORS configuration
- Environment variable protection

## Testing

```bash
npm test                        # 165 unit/integration tests, includes the pure
                                # benchmark-generator planner suite
npm run test:demo-dataset:http  # env-gated; needs a server + DB_NAME pointed at a
                                # generated non-production schema
npm run test:payroll:http
npm run test:payslip:http
npm run test:leave:http
npm run test:session:http
npm run test:profile:http
```

`test/benchmark-generator.test.js` opens no database connection, so `npm test` verifies
the dataset planner (determinism, weekday calendars, leave allocation, attendance
policy, payroll arithmetic, argument parsing) anywhere. The HTTP suites are skipped
unless their env URL is set. To exercise the generated dataset end to end:

```bash
npm run setup:demo -- --database=workzen_hrms_fresh
DB_NAME=workzen_hrms_fresh PORT=5062 node server.js &
DEMO_DATASET_API_URL=http://localhost:5062/api DB_NAME=workzen_hrms_fresh npm run test:demo-dataset:http
```

Health check endpoint:
```
GET http://localhost:5000/api/health
```

Expected response:
```json
{
  "success": true,
  "message": "WorkZen HRMS Backend is running",
  "timestamp": "2025-11-08T..."
}
```
