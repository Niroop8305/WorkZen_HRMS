# WorkZen — Smart Human Resource Management System

WorkZen is a production-style HRMS that consolidates **Attendance**, **Leave**, and
**Payroll** into a single, secure, role-aware backend with a React self-service
frontend. It is built to be measurable: every calculation is server-authoritative,
every sensitive operation is audited, and the headline endpoints were benchmarked
against a 1,000-employee dataset rather than a toy fixture.

- **Team:** Team-68 — LaxmiNiroop Papani, Sharath Chandra Chandupatla, Zainab Amreen, Ishrath Jasmine
- **Problem statement:** Simplifying HR operations for smarter workplaces
- **Demo recording:** https://drive.google.com/file/d/15srGdsJnu_gW45lxgUzSWsAI2y1dglLJ/view?usp=sharing

---

## Problem solved

Small and mid-size teams often juggle attendance spreadsheets, email-based leave
approvals, and manually computed payroll in separate tools with no shared source of
truth. WorkZen replaces that with one system where:

- employees self-serve attendance, leave, and payslips;
- HR runs approvals and org-wide reporting;
- Payroll Officers generate payslips from a governed, effective-dated salary model;
- every change is traceable through a single audit trail.

---

## Core modules

### Attendance

- Timezone-aware check-in / check-out using configurable rules. Defaults: `Asia/Kolkata`,
  09:00 start, 18:00 end, 15-minute late grace, 240-minute half-day threshold.
- Server-side worked, late, and early-checkout minute calculation; the client never
  computes status.
- One record per user per business date, enforced by a unique constraint.
- Paginated employee history plus HR/Admin org views with search, status, department,
  and date-range filters.
- Streamed CSV export and transaction-safe, audited manual corrections.

### Leave

- Database-backed leave types and annual balances.
- Weekday-only applications, inclusive day counting, and overlap detection.
- HR/Admin approval and rejection; approval deducts paid balance inside a locked
  transaction, cancellation restores it. Unpaid leave never mutates paid balance.
- Org-wide request lists with server-side filters/pagination, active-leave and audit
  reports, and non-blocking email notifications.

### Payroll

- Governance-able salary components and effective-dated salary structures with
  overlap protection and as-of resolution.
- A single calculation engine (no duplicate paths) that consumes frozen Attendance
  and Leave data to compute payable days, pro-rated PF, gross, and net.
- Transaction-safe payroll generation, a payment-status state machine, and audit.
- Server-side payslips (JSON + PDF rendered with pdfkit) and employee self-service.

---

## Architecture

```
React SPA (Vite)
      │  Axios + JWT (Authorization header)
      ▼
Express API  ──►  JWT auth (protect)  ──►  RBAC (authorize roles)
      │
      ▼
Controllers (thin)  ──►  Services (business rules, calculations)
      │                       │
      ▼                       ▼
   Models (parameterized SQL)  │
      │                       │
      ▼                       ▼
    MySQL (schema + indexes + audit_logs)
```

Request flow: **JWT → RBAC → Controller → Service → Model → MySQL.** The backend is
the only security boundary; the React app renders whatever the API returns.
Payroll is a downstream consumer of the frozen Attendance and Leave data — it never
re-derives their business rules.

```
                      WorkZen
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
     Attendance        Leave         Payroll
         │               │               │
         └───────────────┼───────────────┘
                         ▼
                    Services layer
                         ▼
                 Data access layer
                         ▼
                      MySQL
```

---

## Database architecture

13 tables are used by the live application, plus 3 read views consumed by the user and
dashboard surfaces. There are **no triggers or stored procedures** — all logic lives in
the service layer.

| Table | Purpose |
|---|---|
| `roles` | Admin, HR Officer, Payroll Officer, Employee |
| `users` | Authentication + role link |
| `employee_profiles` | Employee code, department, designation |
| `attendance` | One row per user per business date |
| `leave_types` | Database-driven leave categories (paid/unpaid) |
| `leave_balance` | Per user / type / year allocation and usage |
| `leave_applications` | Leave requests and approval state |
| `salary_components` | Earning/deduction definitions |
| `employee_salary_structure` | Effective-dated per-employee amounts |
| `payroll` | One row per user per month/year + status |
| `payroll_details` | Frozen component breakdown per payslip |
| `audit_logs` | Append-only trail for sensitive mutations |
| `password_reset_codes` | Self-service password reset |

Relationships:

```
users 1──1 employee_profiles
users 1──N attendance
users 1──N leave_balance / leave_applications
users 1──N employee_salary_structure / payroll
leave_applications N──1 leave_types
payroll 1──N payroll_details N──1 salary_components
```

---

## Security

- **Authentication:** JWT required on every module endpoint; unauthenticated requests
  return `401`.
- **Authorization (RBAC):** `authorize(...)` guards role-scoped endpoints. A verified
  Employee is blocked (`403`) from org attendance, org leave, payroll generation,
  salary components/structures, and **any other employee's** payroll or payslip (IDOR
  protection confirmed at the JSON and PDF endpoints).
- **Server-authoritative calculations:** manual attendance corrections and payroll
  amounts are recomputed by the backend; a client-supplied `status` or salary amount is
  never trusted, so no arbitrary value is persisted.
- **Input security:** parameterized SQL throughout; validation at the service layer;
  a `' OR 1=1--` style search payload is safely treated as a literal (empty result, no
  error).
- **Error handling:** standardized `{ success:false, message }` envelope; known DB/JWT
  errors are mapped to safe messages; stack traces are only emitted in `development`.
- **Retired surfaces:** the legacy `/api/payslip/*`, `/api/payrun/*`, and
  `/api/employees/*` endpoints return a deliberate `404`.

---

## Testing

Two layers, both run against the real MySQL database (no mocks):

| Suite | Command | Result |
|---|---|---|
| Backend unit/integration (`attendance`, `leave`, `salary`, `payroll`, `payslip`) | `npm test` | **109 tests / 25 suites / 0 failed** |
| HTTP integration (leave, payroll, payroll-generation, payslip, salary) | `npm run test:*:http` | **104 tests / 0 failed** |
| **Total automated tests** | | **213 / 0 failed** |

HTTP suites are env-gated (`LEAVE_API_URL`, `PAYROLL_API_URL`, `PAYSLIP_API_URL`,
`SALARY_API_URL`) and seed their own isolated temp users so they never drain the demo
dataset. The Leave HTTP suite snapshots and restores the shared demo balance in
teardown, so repeated runs are deterministic.

---

## Performance

Measured against a dedicated 1,000-employee benchmark dataset (109,151 attendance
rows, 12,300 leave applications, 10,150 payroll records, 30,450 payroll line items).
Read endpoints: 300 requests at concurrency 10; write endpoints: 150 distinct-entity
requests at concurrency 5. **All endpoints returned a 0.0% error rate.** Percentiles
below are aggregated across those request counts, not single calls.

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|
| `POST /attendance/check-in` | 11.9 | 17.6 | 18.9 |
| `GET /attendance/my-logs` | 15.5 | 25.2 | 48.4 |
| `GET /attendance/all` (filtered day) | 55.6 | 91.6 | 120.8 |
| `POST /leave/apply` | 17.7 | 23.8 | 29.4 |
| `PATCH /leave/:id/status` (approve) | 25.6 | 32.9 | 37.0 |
| `GET /leave/balance` | 29.7 | 41.5 | 44.4 |
| `GET /payroll/my-payroll` | 14.3 | 21.7 | 25.3 |
| `GET /payroll/salary-structure/:id/as-of` | 12.8 | 20.2 | 23.3 |
| `GET /payroll/payslip/:id` | 17.1 | 25.9 | 26.9 |
| `GET /payroll/payslip/:id/pdf` (server PDF) | 62.9 | 78.4 | 92.8 |
| `POST /payroll/generate` | 39.6 | 46.4 | 52.1 |

**Known non-critical scalability limits.** The two unfiltered org-list reads are heavy
by design: `GET /payroll/all` with no period filter streams all ~10k rows (p50 ≈ 1.5s),
and `GET /attendance/all` with no filters full-joins ~109k rows (p50 ≈ 1.8s) with a
`Using temporary; Using filesort`. Both are mitigated in real use by the existing
server-side filters/pagination (the filtered attendance path is ~92ms p95); a
month/year-leading index on `payroll` would help the unfiltered browse but is not added
because it is not justified by actual filtered query behavior.

### Query plans (EXPLAIN highlights)

Every hot path seeks an index; no new index was warranted.

- `leave_balance` lookup → `idx_user_year`, ~6 rows.
- Leave overlap check (correctness-critical) → `idx_user_status` range, ~10 rows.
- `payroll` history → `unique_user_month_year`, ~11 rows.
- Salary structure as-of → `idx_user_component`, ~3 rows.
- Payslip by id → PRIMARY + `idx_payroll_id`, 1 + N rows.
- Filtered attendance org list → `idx_attendance_date` range.

---

## Setup

### Prerequisites

- Node.js v18+
- MySQL 8.0+

### Backend

```bash
cd backend
npm install
cp .env.example .env        # set DB_* and JWT_SECRET
npm run init-db
npm run migrate:attendance
npm run migrate:leave-cancellation
npm run migrate:salary-components
npm run seed:demo
npm run dev                 # http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
npm run build               # production build
```

### Tests

```bash
cd backend
npm test
# HTTP suites (start the backend on the target port first):
LEAVE_API_URL=http://localhost:5000/api npm run test:leave:http
PAYROLL_API_URL=http://localhost:5000/api npm run test:payroll:http
```

---

## Demo accounts

Local development only — never use in production.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@workzen.demo` | `Admin@123` |
| HR Officer | `hr@workzen.demo` | `Hr@123` |
| Payroll Officer | `payroll@workzen.demo` | `Payroll@123` |
| Employee | `employee@workzen.demo` | `Employee@123` |

---

## API overview

| Module | Base | Highlights |
|---|---|---|
| Auth | `/api/auth` | register, login, me, password reset |
| Users | `/api/users` | profile, org directory (Admin/HR) |
| Attendance | `/api/attendance` | check-in/out, my-logs, summary, org list + CSV export, audited correction |
| Leave | `/api/leave` | types, balance, apply, my-leaves, org requests, active-leaves, audit, approve/reject, cancel |
| Payroll | `/api/payroll` | my-payroll, all (Admin/Payroll), generate, status, components, salary-structure (+ as-of), payslip JSON/PDF |
| Dashboard | `/api/dashboard` | admin stats, employee self-service stats |

56 route handlers across these modules. Response envelope is
`{ success, data, message? }`, with `{ ..., pagination }` on paginated list reads.

---

## Engineering highlights

- Single server-authoritative payroll engine; no duplicated calculation paths.
- Effective-dated salary model with overlap protection and as-of resolution.
- Transaction-safe payroll generation, paid-leave balance mutation, and manual
  attendance corrections — each paired with an `audit_logs` entry.
- Server-rendered payslip PDFs; the client downloads a blob, never re-renders payroll.
- Defense-in-depth RBAC with verified IDOR protection on payroll and payslip reads.
- 213 automated tests across unit + HTTP layers, all green against the real database.
- Measured sub-100ms p95 on the core self-service and payslip endpoints at 1,000-employee scale.

## License

MIT — free to use for learning and development.
