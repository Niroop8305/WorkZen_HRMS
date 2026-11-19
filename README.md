# WorkZen — Smart Human Resource Management System

WorkZen is a production-style HRMS that consolidates **Attendance**, **Leave**, and
**Payroll** into a single, secure, role-aware backend with a React self-service
frontend. It is built to be measurable: every calculation is server-authoritative,
key sensitive mutations are audited, and the headline endpoints were benchmarked
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
- key sensitive mutations are traceable through a single audit trail.

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
- HR/Admin approval and rejection. The service locks and pre-validates the balance
  inside a transaction, then changes the application status; the
  `after_leave_approval` database trigger is the sole writer that deducts paid
  balance on approval and restores it on cancellation. Unpaid leave never mutates
  paid balance.
- Org-wide request lists with server-side filters/pagination, active-leave and audit
  reports, and non-blocking email notifications.

### Payroll

- Governance-able salary components and effective-dated salary structures with
  overlap protection and as-of resolution.
- A single calculation engine (no duplicate paths) that consumes frozen Attendance
  and Leave data to derive payable days, prorate fixed earnings by the payable
  ratio, resolve fixed and percentage-based components, and compute gross, total
  deductions, and net.
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

14 tables are used by the live application (`user_sessions` included), plus 3 read views
consumed by the user and dashboard surfaces. The database also carries **3 triggers and
1 stored procedure**, installed by `npm run init-db` (`schema.sql` + `triggers.sql` +
`procedures.sql`) and re-verified in order by `npm run setup:demo`:

| Database object | Type | Role |
|---|---|---|
| `after_leave_approval` | trigger | Sole writer of `leave_balance.used_days`/`remaining_days` — deducts paid balance on Pending→Approved and restores it on Approved→Cancelled |
| `before_attendance_insert` | trigger | Maintains `attendance.total_hours` (check-out − check-in) before an insert |
| `before_attendance_update` | trigger | Recomputes `attendance.total_hours` before an update |
| `calculate_leave_days` | procedure | Installed but **not called** by the application — Leave duration is computed in JavaScript |

Division of responsibility:

- **Leave** — the service locks and reads the balance, pre-validates availability, and
  changes the application status inside a transaction; the `after_leave_approval`
  trigger then performs the paid-leave deduction/restoration exactly once. The service
  does not update the balance columns directly.
- **Attendance** — the service computes the authoritative status and the worked/late/
  early-checkout minute fields; the two attendance triggers only maintain the derived
  `total_hours` column.
- The unused `calculate_leave_days` procedure is a passive schema object and is not part
  of the active request flow.

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

- **HTTP perimeter (T-004):** Helmet with a SPA-compatible CSP
  (`style-src 'unsafe-inline'` for the Vite shell), `frame-ancestors 'none'`,
  `X-Frame-Options: DENY`, `nosniff`; HSTS off until TLS. A tiered global rate
  limiter on `/api` (per 60s: 900 authenticated reads / 300 unauthenticated /
  300 mutations; preflight and health never counted) bounds floods without
  criminalizing legitimate bursts. `TRUST_PROXY` is validated at boot; an unsafe
  value refuses to start.
- **Authentication:** JWT required on protected module endpoints; an unauthenticated
  request to a protected endpoint returns `401`. Only `POST /api/auth/login` is public;
  both self-service password-reset steps require a live session, and there is no
  anonymous forgot-password endpoint keyed on email address. Algorithms are pinned
  to HS256 (T-005); a session is revocable server-side, capped at 5 active per
  user, and expires absolutely after 24h (T-002).
- **Password reset (T-003):** reset codes are stored as SHA-256 digests; the
  plaintext exists only inside the emailed message; issuance/consumption budgets
  are DB-backed, audited, and lock out brute-force guessing per account.
- **Authorization (RBAC):** `authorize(...)` guards role-scoped endpoints. A verified
  Employee is blocked (`403`) from org attendance, org leave, payroll generation,
  salary components/structures (except reading their own structure), and **any other
  employee's** payroll or payslip (IDOR protection confirmed at the JSON and PDF
  endpoints).
- **Credential privacy (T-008):** the create-user response carries delivery
  metadata (`credentials_emailed` / `email_delivery_status`) and never a password;
  the temporary credential exists only inside the welcome email.
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

Three layers. DB-writing suites are guarded (`backend/test/support/dbGuard.js`):
they refuse protected databases outright and run only against an explicitly
approved scratch schema (`DB_NAME=workzen_hrms_test ALLOW_SCRATCH_DB=1`).

| Suite | Command | Latest verified result |
|---|---|---|
| Backend unit/integration (25 files) | `npm test` (with scratch DB) | **398 tests / 0 failed** |
| DB-free gate (no database required) | `npm run test:dbfree` | **202 tests / 0 failed** |
| HTTP integration (13 suites: auth, session, reset, attendance, leave, leave-performance, payroll, payroll-generation, payslip, salary, profile, directory, demo-dataset) | `npm run test:*:http` with `*_API_URL` env vars | **252 tests / 0 failed** |
| Frontend (Vitest + Testing Library) | `cd frontend && npm test` | **10 tests / 0 failed** |

HTTP suites are env-gated (`LEAVE_API_URL`, `PAYROLL_API_URL`, `PAYSLIP_API_URL`,
`PROFILE_API_URL`, `SESSION_API_URL`, `AUTH_API_URL`, `ATTENDANCE_API_URL`,
`DEMO_DATASET_API_URL`, `DIRECTORY_API_URL`) and use
different isolation strategies, so they are not all fully isolated from the demo dataset:

- The payroll-generation and salary suites seed their own **temporary users** and
  hard-delete them in teardown, so they never touch the demo employees.
- The Leave HTTP suite operates on the **shared** demo employee; it snapshots that
  employee's `leave_balance` rows before the run and restores them exactly in teardown,
  so repeated runs are deterministic even though it does not use an isolated user.
- The payroll decommission suite is read-only (RBAC and deliberate-404 checks) and
  performs no writes.
- `test/benchmark-generator.test.js` is pure (no database connection), so `npm test`
  verifies the dataset planner on any machine.
- `test/demo-dataset-http.test.js` only reads the generated dataset; its writes are
  `user_sessions` rows from its own logins/logout and two `PAYSLIP_DOWNLOADED` audit
  rows from its PDF check. Point it (and the server) at a generated non-production
  schema via `DB_NAME`.

- The payroll-generation and salary suites seed their own **temporary users** and
  hard-delete them in teardown, so they never touch the demo employees.
- The Leave HTTP suite operates on the **shared** demo employee; it snapshots that
  employee's `leave_balance` rows before the run and restores them exactly in teardown,
  so repeated runs are deterministic even though it does not use an isolated user.
- The payroll decommission suite is read-only (RBAC and deliberate-404 checks) and
  performs no writes.

---

## Performance

Measured against a dedicated 1,000-employee benchmark dataset (109,151 attendance
rows, 12,300 leave applications, 10,150 payroll records, 30,450 payroll line items).
Those percentiles predate the reproducible generator; the same dataset shape is now
rebuilt by `npm run setup:demo` at 221,000 synthetic attendance rows, and single-request
timings re-measured on it (localhost, one sample each, not percentiles) stayed in the
same order: `GET /attendance/my-logs` 6 ms, `GET /leave/balance` 4 ms,
`GET /payroll/my-payroll` 6 ms, `GET /payroll/payslip/:id` 7 ms, its PDF 20 ms,
`GET /attendance/day` over 1,001 employees 20-27 ms with search/status/department
filters, and `GET /leave/requests` 56 ms.
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
by design: `GET /payroll/all` with no period filter has no pagination and streams all
10,160 rows (5.6 MB JSON, measured 272 ms on the 221,000-row dataset), and
`GET /attendance/all` with no filters counts and joins all 221,218 attendance rows
(measured 1,218 ms, `Using temporary; Using filesort`) before returning one page. Both
are mitigated in real use by the existing server-side filters/pagination — a filtered
day read over 1,001 employees is ~20-27 ms and `GET /payroll/all?month=&year=` for one
period is ~32 ms; a month/year-leading index on `payroll` would help the unfiltered
browse but is not added because it is not justified by actual filtered query behavior.

### Query plans (EXPLAIN highlights)

Every hot path seeks an index; no new index was warranted.

- `leave_balance` lookup → `idx_user_year`, ~6 rows.
- Leave overlap check (correctness-critical) → `idx_user_status` range, ~10 rows.
- `payroll` history → `unique_user_month_year`, ~11 rows.
- Salary structure as-of → `idx_user_component`, ~3 rows.
- Payslip by id → PRIMARY + `idx_payroll_id`, 1 + N rows.
- Filtered attendance org list → `idx_attendance_date` range.

---

## Business-rule scope & limitations

Documented, intentional boundaries of the current implementation:

- **Leave** counts weekdays only (Saturday and Sunday excluded); public holidays are
  not modeled, and partial-day leave is not supported.
- **Payroll** working-day counts exclude weekends and use no holiday calendar; payable
  days are derived from frozen attendance and paid-leave data.
- The `calculate_leave_days` stored procedure is installed but **unused** — Leave
  duration is computed in the service layer.

---

## Setup

### Prerequisites

- Node.js v18+
- MySQL 8.0+

### Backend

One command gives a new developer a fully working, populated environment:

```bash
cd backend
npm install
cp .env.example .env        # set DB_* and JWT_SECRET
npm run setup:demo          # schema -> migrations -> demo accounts -> dataset -> verify
npm run dev                 # http://localhost:5000
```

`npm run setup:demo` runs five ordered stages and prints each one:

1. **Schema initialization** — `schema.sql` + `procedures.sql` + `triggers.sql`, with any
   `CREATE DATABASE`/`USE` binding stripped so the target schema comes from `DB_NAME`
   (or `--database=`).
2. **Migrations in dependency order** — `attendance` derived columns +
   `unique_user_attendance_date` → `salary_components.calculation_type` →
   `user_sessions` → the updated `after_leave_approval` (leave-cancellation) trigger.
   Each step checks `INFORMATION_SCHEMA` first, so reruns are no-ops and the same
   migration can also be run standalone via `npm run migrate:*`.
3. **Demo account seeding** — skipped when the four `@workzen.demo` accounts already
   exist; use `--reseed-demo-users` to refresh their passwords explicitly.
4. **Benchmark dataset generation** — the deterministic synthetic population described
   under *Reproducible demo & benchmark dataset* (skippable with `--skip-generate`).
5. **Post-seed integrity verification** — 22 referential, uniqueness, business-rule and
   arithmetic checks; the command exits non-zero if any check fails.

Setup never drops a schema and never reseeds blindly: on an already-populated database
it reports `already initialized; setup will not drop or reseed data`, skips existing
employees, and only re-verifies. `npm run init-db` remains available as the schema-only
step, but `npm run setup:demo` is the command to use for a working environment.

`init-db` is enough for the API to authenticate: `schema.sql` includes `user_sessions`,
the session registry that `protect` validates every JWT against and fails closed without.
A database created before that table existed must run `npm run migrate:user-sessions` once,
otherwise every authenticated request returns 500.

Useful flags: `--database=<schema>` (dedicated non-production schema), `--dry-run`
(plan only, no writes), `--employees`, `--months`, `--leave-applications`, `--seed`,
`--skip-generate`, `--force-reseed-benchmark --yes` (deletes only `%@workzen.test`
rows). The generator refuses to run with `NODE_ENV=production`.

```bash
npm run verify:demo -- --database=workzen_hrms   # re-run stage 5 on its own
npm run generate:benchmark -- --dry-run          # planned volumes, no writes
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

## Reproducible demo & benchmark dataset

`npm run setup:demo` builds one self-consistent population, deterministic from
`--seed` (default `20261001`): the same seed always produces the same identities, leave
windows, attendance timestamps and payroll snapshots.

| Dataset | Count | Notes |
|---|---:|---|
| Synthetic employees | 1,000 | `emp0001@workzen.test` … `emp1000@workzen.test`, codes `WZ-SYN-0001`… |
| Attendance rows (synthetic) | 221,000 | 850 employees × 218 weekdays + 150 senior employees × 238 |
| Leave applications | 12,300 | 13 for the first 300 employees, 12 for the rest |
| Payroll records | 10,150 | 11 periods for the senior cohort, 10 for the rest |
| Payroll component snapshots | 30,450 | exactly 3 components per payroll record |
| `leave_balance` rows | 12,000 | per employee × leave type × calendar year |
| Demo-employee coverage | 218 + 13 + 10 + 30 | `employee@workzen.demo` gets the same calendar, so `attendance` holds 221,218 rows |

**Attendance volume.** The original brief estimated ~217,000 attendance rows. The real
number follows from the approved payroll window (Dec-2025 … Sep-2026) and the
weekday-only rule, so it is calculated rather than padded: Dec-2025 … Sep-2026 contains
218 Mon–Fri dates and Nov-2025 (the senior cohort's extra month) contains 20, giving
`850 × 218 + 150 × 238 = 221,000`. Manufacturing 4,000 extra rows would have meant
duplicate user/date pairs, weekend dates or unsupported periods, all of which the
business rules forbid.

**Business rules are the generator's own code**, not re-implemented: attendance rows are
driven through `calculateAttendanceMetrics()` (Asia/Kolkata, 09:00–18:00, 15-minute
grace, 240-minute half day), payroll through `countWorkingDays()`,
`attendancePayableDays()`, `paidLeaveDaysForPeriod()` and `calculatePayroll()`, and paid
leave through the real `Pending → Approved → Cancelled` transitions so
`after_leave_approval` deducts and restores balances exactly as the application does.
Bulk writes are batched (one transaction per employee) instead of calling
`generatePayroll()` 10,150 times; a spread sample of 21 snapshots is re-verified
against the live calculation path in `test/demo-dataset-http.test.js`.

Consequences enforced and verified: no negative net salary (minimum observed net
₹24,627.28), no weekend or duplicate attendance, no overlapping leave windows, no paid
leave beyond the annual allocation, payroll snapshots that agree with their component
rows, only supported periods, and **no bulk `audit_logs` rows** (the generator writes
none; only live API actions audit).

Existing demo users, manually created records and any non-`@workzen.test` data are
preserved. Generation is resumable: an interrupted run leaves no half-created employee
(each employee is one transaction), and the next run skips the reserved emails that
already exist.

### Verification

```bash
cd backend
DB_NAME=workzen_hrms_fresh PORT=5062 node server.js &
DEMO_DATASET_API_URL=http://localhost:5062/api DB_NAME=workzen_hrms_fresh npm run test:demo-dataset:http
```

The suite proves synthetic + demo logins, HIGH-3 session revocation, employee
self-service (attendance history, leave balance/my-leaves, payroll list, payslip JSON +
PDF), RBAC and IDOR denial for HR/payroll surfaces, HR org lists with search/status/
department filters over 1,001 employees, the live-payroll-sample recomputation, and the
exact volumes above.

---

## Demo accounts

Local development only — never use in production.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@workzen.demo` | `Admin@123` |
| HR Officer | `hr@workzen.demo` | `Hr@123` |
| Payroll Officer | `payroll@workzen.demo` | `Payroll@123` |
| Employee | `employee@workzen.demo` | `Employee@123` |
| Synthetic benchmark employee | `emp0001@workzen.test` … `emp1000@workzen.test` | `Benchmark@123` |

Synthetic identities are fabricated (names, phones and addresses come from generator
pools) and live on the reserved `.test` domain, which is never routable and marks them
as benchmark-owned data that `--force-reseed-benchmark` may delete.


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
- Transaction-safe payroll generation, paid-leave approval/cancellation (whose balance
  effect is applied by the `after_leave_approval` trigger), and manual
  attendance corrections — each paired with an `audit_logs` entry.
- Server-rendered payslip PDFs; the client downloads a blob, never re-renders payroll.
- Defense-in-depth RBAC with verified IDOR protection on payroll and payslip reads.
- 213 automated tests across unit + HTTP layers, all green against the real database.
- Measured sub-100ms p95 on the core self-service and payslip endpoints at 1,000-employee scale.

## License

MIT — free to use for learning and development.
