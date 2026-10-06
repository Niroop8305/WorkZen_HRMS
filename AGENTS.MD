## WorkZen Repository Context

### Architecture

- Frontend: React 18, Vite, React Router, Axios, CSS
- Backend: Node.js, Express, JWT, bcryptjs, mysql2
- Database: MySQL schema in `backend/src/database/schema.sql`
- Request flow: React -> Axios -> Express route -> JWT/RBAC middleware -> controller -> service/SQL -> MySQL

### Source Of Truth

The actual source code and database schema are authoritative. README feature lists may be stale and must not be treated as proof that a workflow exists.

The repository contains legacy payroll and leave paths that reference tables different from the primary schema. Do not expand those paths without inspecting and consolidating their data model first.

### Current Project State

Attendance Milestone 1A-1C is implemented and verified. Attendance includes:

- Configurable timezone and rules. Defaults: `Asia/Kolkata`, 09:00 start, 18:00 end, 15-minute late grace, 240-minute half-day threshold.
- One attendance row per user and business date, protected by `unique_user_attendance_date`.
- Server-side check-in/check-out calculations for worked, late, and early-checkout minutes.
- Paginated employee history and HR/Admin day/list endpoints.
- Search, status, department, and date-range filters.
- Streamed CSV export.
- Transaction-safe, audited manual corrections through the existing `audit_logs` table.

Leave Milestones 2A-2D are implemented and frozen. Leave uses only:

- `leave_types`
- `leave_balance`
- `leave_applications`
- `users`
- `employee_profiles`
- `audit_logs`

Leave includes database-backed types and balances, weekday-only applications,
overlap detection, HR/Admin approval and rejection, paid balance deduction and
restoration, pending/approved cancellation, unpaid-leave neutrality, audit
events, HR/Admin organization queries, server-side filters/pagination, and
non-blocking email notifications using the existing Nodemailer infrastructure.

Legacy Leave structures such as `leave_requests`, `leave_balances`,
`leave_allocations`, and `leave_requests_view` must not be recreated or used.

### Demo Accounts

Run `cd backend; npm run seed:demo` to create or refresh:

- Admin: `admin@workzen.demo` / `Admin@123`
- HR Officer: `hr@workzen.demo` / `Hr@123`
- Payroll Officer: `payroll@workzen.demo` / `Payroll@123`
- Employee: `employee@workzen.demo` / `Employee@123`

These are local development credentials only and must not be used in production.

### Commands

```text
cd backend; npm run init-db
cd backend; npm run migrate:attendance
cd backend; npm run migrate:leave-cancellation
cd backend; npm run seed:demo
cd backend; npm test
cd backend; $env:LEAVE_API_URL='http://localhost:5000/api'; npm run test:leave:http
cd backend; npm run dev
cd frontend; npm run dev
cd frontend; npm run build
```

The backend test suite uses the configured MySQL database and creates temporary test data, cleaning it up afterward. A running backend on port 5000 can block verification; use another `PORT` for an isolated server.

### Working Rules

- Inspect before editing and preserve working APIs.
- Keep attendance business logic in `backend/src/services/attendanceService.js`; controllers should remain thin.
- Keep authoritative calculations on the backend; React displays API results.
- Use parameterized SQL and existing RBAC middleware.
- Do not work on Payroll, Docker, CI/CD, or unrelated refactors unless explicitly requested.
- Leave is frozen; only make Leave changes for verified defects or an explicitly requested follow-up.
- Do not claim tests, API verification, or performance metrics without running them.
