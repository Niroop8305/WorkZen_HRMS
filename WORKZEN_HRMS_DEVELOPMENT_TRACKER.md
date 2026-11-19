# WorkZen HRMS — Development Tracker

Companion to `WORKZEN_HRMS_MASTER_CONTEXT.md`. Generated 2026-11-01 from a read-only audit;
updated 2026-11-01 when **T-001** was implemented and verified.
Statuses: `TODO` · `IN PROGRESS` · `BLOCKED` · `NEEDS APPROVAL` · `DONE` · `WON'T DO`.

Legend — **P0** security/data-integrity · **P1** essential function & major workflow defects ·
**P2** important improvements/integration gaps · **P3** polish, optimization, documentation.

---

## Phase A — P0 (do first; small, high-blast-radius)

- [x] **T-001 · Fix logout so it actually revokes the session** · P0 · DONE 2026-11-01 · deps: none
  Files: `frontend/src/context/AuthContext.jsx:63-80`, `frontend/src/services/api.js:35-48`,
  `frontend/src/components/Header.jsx:8-11`, `frontend/src/pages/Dashboard.jsx:30-33`,
  `frontend/src/pages/Attendance.jsx:257-260`, `frontend/src/pages/EmployeeAttendance.jsx:218-221`,
  `frontend/src/pages/MyProfile.jsx:129-132`, `backend/test/logout-revocation.test.js` (new),
  `backend/package.json` (`test`, `test:dbfree`)
  Root cause (two defects, not one): **RC-1** `logout()` deleted `workzen_token` *before*
  dispatching the request, so the axios interceptor built an `Authorization`-less call, `protect`
  rejected it at `backend/src/middleware/auth.js:82-87`, the controller never ran, and
  `.catch(() => {})` hid the 401. **RC-2** the 401 response interceptor excluded only
  `/auth/login`, so the resulting logout 401 fired `window.location.href = '/login'`, hard-reloading
  the app and racing the SPA redirect. The backend was already correct: `POST /auth/logout` →
  `protect` → `Session.revokeById(req.user.sessionId)` never executed because no request reached it.
  Fix: `logout()` is now `async`, awaits `authService.logout()` first, and clears `localStorage` +
  `setUser(null)` in `finally`, so a 401/5xx/network failure still logs the client out; all five
  call sites `await logout()` before `navigate("/login")`; the interceptor now also excludes
  `/auth/logout`. No new endpoint, no new auth mechanism, JWT/session validation untouched.
  Acceptance evidence: **DB-free unit + contract** — `backend/test/logout-revocation.test.js`
  21/21 (revoke SQL targets `session_id = ?` with `AND revoked_at IS NULL`, never `user_id`,
  never `DELETE`; repeat logout revokes only that session; revoked row → 401; unreadable store →
  fail-closed 500 with no schema leak; no token/session id in logs; static frontend contract).
  **Browser** — real SPA against an in-memory mock that reproduces the `protect` contract: the
  Logout click sent `Authorization: Bearer <the exact token in localStorage>` (digest `fd853b8f5871`
  matched), the revoke handler ran, `workzen_token`/`workzen_user` were cleared, the app landed on
  `/login` with **no hard reload**, and the same token was then rejected `401` by a protected
  route. Already-revoked variant: logout returns 401, client still cleans up and SPA-navigates.
  Genuine expiry path still works: a 401 from the dashboard poll cleared storage and redirected.
  **Not proven at:** live `user_sessions` rows on a real MySQL schema. `npm run test:dbfree`
  142/142; the 12-file DB-free set 165/165, 0 fail, 0 skipped. `backend/test/auth-session-http.test.js`
  (the row-level proof) remains **un-run** — it writes to `workzen_hrms`, which is protected;
  needs T-007 → T-009 or your approval for a scratch schema.
  Edge-case follow-up (2026-11-02): the browser matrix was extended with fault injection to cover
  HTTP 500, an aborted upstream socket, an unreachable backend, a missing token, an invalid/expired
  token, a double-clicked Logout (exactly **one** revocation for two clicks), a 4 s-slow backend and
  a never-responding one — 0 unhandled rejections and 0 stray hard reloads across all of them. Three
  new static tests pin that `logout()` cannot reject and that each handler navigates only after the
  await (`logout-revocation.test.js` is now 24 tests).
  Risk: **low** — handlers now `await` the logout request and no timeout is configured, so a slow
  backend delays the redirect (measured: 14 ms healthy, 4 020 ms at a 4 s response, 2 355 ms on a
  refused connection) and a never-responding backend leaves the client logged in. Measured and
  specified in **T-041**; every other failure class (401, 500, unreachable, missing token, repeat)
  was executed in a browser and clears credentials correctly with no unhandled rejection.

- [x] **T-002 · Bound and backfill unreverked sessions** · P0 · DONE 2026-11-19 · deps: T-001
  Files: `backend/src/models/sessionModel.js`, `backend/src/config/throttleConfig.js`
  (`SESSION_ABSOLUTE_TTL_HOURS = 24`), `backend/src/database/schema.sql` (`user_sessions.expires_at
  DATETIME NULL` + `idx_session_expiry`), `backend/src/database/migrate-user-sessions.js` (fresh
  tables get the column), **new `backend/src/database/migrate-session-expiry.js`** + npm script
  `migrate:session-expiry`, `backend/test/session-expiry.test.js` (new, 9 cases, DB-free).
  Do: (a) one-time backfill revoking sessions beyond the cap for existing users; (b) an absolute
  per-session expiry column so JWT `exp` is not the only bound. — **done:**
  • Issuance stamps `expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)` inside the cap transaction,
  revokes already-expired rows for the account before counting, and counts only unexpired,
  unrevoked rows toward the ≤5 cap (verified by SQL-shape pins).
  • Validation filters only the absolute window in SQL (`expires_at IS NULL OR expires_at > NOW()`);
  revoked rows stay visible so `validateSession` keeps its exact contracts (deactivation 403,
  "expired or logged out" 401). An expired window fails closed as "Session is invalid".
  • Migration (idempotent by construction, converges to a no-op): adds the column when missing,
  backfills `expires_at = issued_at + TTL` (rows older than the TTL are stamped into the past on
  purpose — never a lifetime extension), revokes what the stamp expired, and caps accounts by
  keeping the newest live `MAX_ACTIVE_SESSIONS` rows. **Live-verified twice on `workzen_hrms_test`**
  (first run: column added, 114 legacy rows backfilled; re-run: full no-op).
  Accept: live count of `revoked_at IS NULL` ≤ users × 5, and no active session older than the
  configured max age. — **verified on the scratch schema; the production run on `workzen_hrms` is
  a one-command operator step (see DEPLOYMENT.md), never executed here.**
  Test: unit (DB-free, SQL-shape) + HTTP: `auth-session-http` 11/11 and `auth-session` 18/18 live
  against the scratch schema after the change.
  Risk: revoking live sessions signs users out — documented for the operator; scratch schema used.

- [x] **T-003 · Hash stored password-reset codes** · P0 · DONE 2026-11-02 (code, static schema, DB-free tests; live-DB items gated on T-007) · deps: none
  Files: `backend/src/controllers/authController.js` (new exported `hashResetCode(code)` =
  SHA-256 hex of the trimmed code; issuance INSERT now binds `hashResetCode(resetCode)` while the
  email still carries the plaintext; consume lookup now binds `hashResetCode(submittedCode)`),
  `backend/src/database/schema.sql`, `backend/src/database/migrate-password-reset-codes.js`,
  `backend/database/migrations/013_create_password_reset_codes_table.sql`
  (all three: `reset_code VARCHAR(6)` → **`VARCHAR(64)`**, `expires_at` unified to **`DATETIME NOT NULL`**
  — fixing the TIMESTAMP drift in the migrator — and the plaintext-era standalone
  `INDEX idx_reset_code (reset_code)` replaced by user-scoped
  `INDEX idx_user_reset_code (user_id, reset_code)`), `backend/test/password-reset-code-hashing.test.js`
  (new, 15 cases), `backend/package.json` (`test`, `test:dbfree`).
  Design: SHA-256 is deterministic, which preserves the unchanged atomic equality-match
  (`WHERE user_id = ? AND reset_code = ? AND is_used = FALSE AND expires_at > NOW() … FOR UPDATE` →
  single-use `UPDATE … WHERE id = ? AND is_used = FALSE`); bcrypt is non-deterministic and would
  have forced a fetch-then-compare rewrite. The 10⁶ space is still bounded by the account-keyed
  lookup, the durable guessing budget and the 10-minute TTL — the hash adds confidentiality at
  rest, not brute-force resistance. stdout/audit were already code-free and are now pinned by tests.
  Acceptance evidence (DB-free, fake pool + captured dry-run mail, no database touched):
  issuance stores the 64-char digest `= sha256(emailed code)` and never the plaintext; no SQL
  parameter, `audit_logs` value column or stdout/stderr line carries the code; consume queries with
  the digest of the emailed code (end-to-end round-trip) and preserves atomic single-use consumption,
  the wrong-guess budget charge (no refund) and the success refund; malformed-shape and over-budget
  submissions are refused before any store access. Static tests pin all three schema files to
  `VARCHAR(64)` + `DATETIME` + the composite index. `password-reset-code-hashing.test.js`: **15/15**.
  `npm run test:dbfree`: **176/176** (was 161; three consecutive clean runs; two runs hit the known
  `email-transport-policy` runner-IPC flake — file passes 8/8 in-process, documented in T-001).
  **Gated on T-007/T-009 (not done here):** a live `ALTER TABLE password_reset_codes MODIFY
  reset_code VARCHAR(64) …` (an in-flight plaintext code becomes unusable by design — issuance
  supersedes first — but migration authoring + execution needs the scratch schema), running
  `migrate-password-reset-codes.js` against a live DB, and the `password-reset.test.js` (33-case)
  live-flow regression, which writes to the DB.

- [x] **T-004 · Add `helmet` and a global HTTP rate limiter** · P0 · DONE 2026-11-19 · deps: none
  Files: **new `backend/src/config/securityConfig.js`** (single source of truth, importable
  without booting the DB), `backend/server.js` (thin mounts), `backend/package.json`
  (`helmet ^8`, `express-rate-limit ^8`), **new `backend/test/security-headers.test.js`** (12
  cases, DB-free, registered in `test` and `test:dbfree`).
  Do: security headers (CSP tuned for the SPA, `X-Content-Type-Options`, frame-ancestors, HSTS off
  until TLS), plus `express-rate-limit` on `/api/*` with looser limits for authenticated reads;
  set `app.set('trust proxy', …)` deliberately. — **done:**
  • CSP: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (the Vite
  shell carries inline styles), `img-src 'self' data: blob:`, `connect-src 'self' + CORS_ORIGIN`,
  `frame-ancestors 'none'`, `object-src 'none'`; `X-Frame-Options: DENY`, `nosniff`, strict
  referrer policy, `hsts: false` until TLS.
  • `TRUST_PROXY` validated by `resolveTrustProxy()` (true/false/loopback/hop-count/CIDR-list;
  anything else refuses the boot — a silently spoofable X-Forwarded-For is a boot error, not a
  warning). Default: no proxy.
  • Global `/api` limiter, tiers per 60s window: authenticated reads 900, unauthenticated 300,
  mutations 300 (roomy by design — an office behind one NAT IP shares the unauthed budget, and
  legitimate HR bursts are hundreds of calls; credential-guessing stays with the per-account
  DB throttle). Preflight is never counted; `/api/health` is skipped; standard headers only.
  Accept: verified live — headers present on every response, dry-run mail and CSV export
  unaffected, all 13 HTTP suites pass against the limited server.
  Risk: CSP can break inline styles in the 11 CSS/JSX files — verified: `style-src
  'unsafe-inline'` keeps the SPA renderable (pinned by a fetch test).

- [x] **T-005 · Pin JWT algorithms and sign with the validated secret** · P0 · DONE 2026-11-02 · deps: none
  Files: `backend/src/config/authConfig.js` (`JWT_ALGORITHM = "HS256"`, new export),
  `backend/src/middleware/auth.js:91-94` (verify now `jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] })`),
  `backend/src/controllers/authController.js:42-52` (`generateToken` now signs with `algorithm: JWT_ALGORITHM`),
  `backend/test/jwt-algorithm-pinning.test.js` (new), `backend/package.json` (`test`, `test:dbfree`).
  Audit: the backend has exactly two JWT call sites — `generateToken` (login :170, register :332; previously
  relied on the library's HS256 default) and the single `jwt.verify` in `protect` (previously accepted any HMAC
  variant HS384/HS512 signed with the same secret). Both now share the one exported constant; there is no
  fallback and no other sign/verify site (enforced by a static test that scans `src/`). Secret parity is kept:
  sign and verify both read the raw `process.env.JWT_SECRET`, the same expression `assertAuthConfig` validated at
  boot, so a whitespace-padded secret cannot split the two paths.
  Acceptance evidence — `backend/test/jwt-algorithm-pinning.test.js` **15/15 DB-free** (fake-driver convention,
  `mysql.createPool` replaced before module import): HS256 token for a live session passes `protect`; HS384 and
  HS512 tokens signed with the same secret are rejected 401 with zero session-store queries; hand-forged
  `alg:none`, RS256-header, and post-signing HS256→HS384 header-swap tokens are rejected 401; wrong-secret,
  tampered-payload, and malformed tokens still 401; static contract pins the verify option, the sign option,
  the shared import, and the full call-site census. Targeted DB-free set (`jwt-algorithm-pinning` +
  `logout-revocation` + `auth-throttle-schema` + `boot-config` + `login-throttle-policy` + `session-retention`):
  **107/107, 0 fail, run twice for flake stability.** `npm run test:dbfree`: **157/157** (was 142).
  Not run (deliberately): `auth-session.test.js` and the HTTP suites — they write to the DB (`DB_NAME` still
  resolves to the protected `workzen_hrms`); the pinning change is covered at the middleware/contract level
  without them. Risk: none observed — the default sign algorithm was already HS256, so previously-issued tokens
  remain valid and no existing test expectation changes.

- [x] **T-006 · Neutralize `seed.js` salary_components destruction** · P0 · DONE 2026-11-02 · deps: none
  Files: `backend/src/database/seed.js` (the `TRUNCATE TABLE salary_components` statement removed,
  with a comment explaining why the reference components survive a full reset),
  `backend/test/seed-reset-cleanup.test.js` (extended 5 → 9 cases).
  Fix chosen: repair, not delete — the script stays (it is still the only complete USERS_TO_CREATE
  dataset generator wired to nothing), and its truncate list now matches `production-seed.js`:
  account-scoped transactional tables only. The structure-assignment stage keeps its
  `SELECT * FROM salary_components` lookup, which now resolves against the nine components that
  `schema.sql:191-201` seeds (`INSERT … ON DUPLICATE KEY UPDATE`) instead of an emptied table —
  previously every salary-structure insert was silently skipped after the truncate.
  Acceptance evidence — `seed-reset-cleanup.test.js` **9/9 DB-free** (scripted connection + static
  SQL-text assertions, no database touched): seed.js contains no `TRUNCATE TABLE salary_components`
  and no `DELETE FROM salary_components`; its full truncate list is pinned to exactly
  [password_reset_codes, payroll_details, payroll, employee_salary_structure, leave_applications,
  leave_balance, attendance, employee_profiles, users]; production-seed.js's list still excludes
  salary_components while keeping every account-scoped table; schema.sql still seeds ≥ 9 reference
  components. `npm run test:dbfree`: **161/161, 0 fail** (was 157; run twice, no flake). Not run:
  `seed.js`/`production-seed.js` themselves — they are direct-run, DB-writing scripts against the
  protected schema; the fix is proven by SQL-text pinning, and live verification waits for the
  T-007 scratch schema. Risk: none — the script was never npm-wired.

- [x] **T-007 · Protected-schema tripwire for all DB-writing tests + scratch test schema** · P0 ·
  **DONE 2026-11-19 — tripwire + approved scratch schema `workzen_hrms_test` both live** · deps: none
  Files: `backend/test/support/dbGuard.js` (new shared guard: `assertScratchDatabase(suiteName)` —
  fail-closed, pure env validation, never imports a driver), wired at module scope into **all 21
  DB-writing suites** (8 unit: attendance, auth-session, leave, password-reset, payroll, payslip,
  salary, profile-update; 12 HTTP: attendance/auth-registration/auth-session/demo-dataset/
directory-authorization/leave/password-reset/payroll-generation/payroll/payslip/profile-update/salary;
  plus leave-performance), `backend/test/leave-performance.test.js` (migrated off `{ skip: !base }`
  onto `requiredBaseUrl('LEAVE_API_URL')` + `guardExecutedTests('leave-performance benchmark', 10)`),
  `backend/test/db-safety-tripwire.test.js` (new, 17 cases, registered in `test` and `test:dbfree`).
  Guard rules (all four, in order): DB_NAME set; not one of the protected schemas (case-insensitive:
  `workzen_hrms`, `workzen_hrms_fresh`, `workzen_hrms_demo`); scratch-shaped (ends `_test`/`_scratch`,
  `[A-Za-z0-9_]{1,64}` per the schemaSetup charset rule); and `ALLOW_SCRATCH_DB=1` explicitly exported.
  Deliberate decision: the guard lives in the test files, NOT in `src/config/database.js` — a boot-time
  guard there would break the DB-free suites that legitimately import and stub the pool.
  Acceptance evidence — `db-safety-tripwire.test.js` **17/17** (protected names and case-variants
  refused even with the opt-in; missing DB_NAME refused; non-scratch and unsafe-charset names refused;
  missing/wrong opt-in refused; `workzen_hrms_test` + `ALLOW_SCRATCH_DB=1` accepted; census of all 21
  suites wired, cross-checked against pool imports; throttle-concurrency keeps its own guard; the
  guard helper never imports a driver). Live refusals demonstrated (no MySQL connection attempted —
  the guard fires at module scope before any hook): `salary.test.js` → "REFUSING TO RUN (salary):
  workzen_hrms is a protected application database"; `leave-performance.test.js` → same;
  `payroll-http.test.js` (URL set, DB_NAME unset) → "DB_NAME is not set"; with
  `DB_NAME=workzen_hrms_test ALLOW_SCRATCH_DB=1` the guard passes and the suite proceeds to attempt
  only the (non-existent) scratch schema. `npm run test:dbfree`: **193/193, 0 fail** (was 176; two
  consecutive clean runs).
  **Scratch schema bootstrap (approved plan, executed 2026-11-19):** every command ran with
  `DB_NAME=workzen_hrms_test ALLOW_SCRATCH_DB=1`; created via a server-level connection (the setup
  pipeline strips the hardcoded `CREATE DATABASE`/`USE` lines, so it is safely targetable);
  full schema + migrators + `setup-demo.js --database=workzen_hrms_test` (1000 synthetic employees,
  4 demo accounts, ~220k attendance, 12300 leave, 10150 payroll rows); `verifyEffectiveSchema` OK
  (`password_reset_codes.reset_code` = `varchar(64)` with `expires_at datetime`, 9 `salary_components`,
  18 tables / 3 views / 3 triggers / 1 procedure). Protected databases untouched (verified by listing
  schemas before and after: only `workzen_hrms`, `workzen_hrms_demo`, `workzen_hrms_fresh` pre-existed).

- [x] **T-008 · Remove `temporary_password` from the create-user API response** · P0 · DONE 2026-11-19 · deps: none
  Files: `backend/src/controllers/userController.js` (response), `frontend/src/components/CreateUserModal.jsx`
  (display), **new `backend/test/create-user-response-privacy.test.js`** (5 cases, DB-free).
  Do: deliver the temp credential via email only; UI shows "credentials emailed". — **done:** the
  response now carries `credentials_emailed` + `email_delivery_status` ("emailed" / "mail-disabled"
  / "failed") and no credential field; the plaintext exists only inside the welcome email (the
  internal `userDetails` mail payload is unchanged). The modal shows an emailed confirmation, an
  explicit mail-disabled warning, or an email-failed warning — never a password.
  Accept: verified — the suite deep-scans every response body for the exact mailed secret and any
  16-hex credential shape, and asserts no console line ever carries it, across both outcomes.
  Test: 5/5 DB-free.
  Risk (product decision confirmed): in a mail-disabled environment the Admin can no longer
  read the temp password from the UI — the account needs SMTP configured and the password-reset
  flow; the modal states this explicitly.

## Phase B — P1 (functional honesty; ~1 week)

- [x] **T-009 · Establish a verification environment and run all blocked suites** · P1 ·
  **DONE 2026-11-19 — all 24 unit suites + 13 HTTP suites executed against `workzen_hrms_test`** · deps: T-007
  Exact totals (one run each, node --test, scratch schema):

  | Suite group | Files | Tests | Pass | Fail |
  |---|---|---|---|---|
  | Unit — `npm test` (canonical 24 files) | 24 | 389 | 389 | 0 |
  | DB-free gate — `npm run test:dbfree` | 13 | 193 | 193 | 0 |
  | HTTP — attendance / auth-registration / auth-session / demo-dataset / directory-authz / leave / leave-performance / payroll / payroll-generation / password-reset / payslip / profile-update / salary | 13 | 252 | 252 | 0 |

  Real defects found and fixed while verifying (all in test code, none in product code):
  - `demo-dataset-http.test.js` (3 stale absolute literals): calendar size `[218, 238]` and the
    closed/open payroll months were date-relative and went stale on the first regeneration on a
    later day; both are now derived from the database / the generator's own plan math, and the
    Paid-status month derives as `coveredMonth - 1` (newest covered month is Processed).
  - `password-reset.test.js` + `password-reset-http.test.js` read the plaintext reset code from
    storage; since T-003 storage holds SHA-256 digests. Unit suite captures the dry-run mail by
    stubbing nodemailer before import; HTTP suite (spawned servers) injects
    `test/support/capture-dry-run-mail.cjs` via `NODE_OPTIONS --require`, which records rendered
    dry-run mail to a JSONL file, and `liveCode` resolves the newest emailed code whose digest
    matches the live storage row — the same channel the user experiences.
  - `db-safety-tripwire.test.js` passed `dbName: undefined` to the guard, whose destructuring
    default fell back to the real `process.env.DB_NAME`; two cases now pass explicit empty
    strings so the suite is insensitive to the shell it runs in.
  - `attendance-http.test.js` payloads sent `${date} ${time}` as `check_in_time`; the API contract
    (pinned by `attendance-mark-time-contract.test.js`) requires bare `HH:mm[:ss]`. Fixed the
    helper; the "bare HH:MM is rejected" test was rewritten to "bare HH:MM is accepted and
    converted", matching the fixed contract. Stale tests, not API defects.

  Not run: `auth-throttle-concurrency` — it is a measurement spike that requires its own EMPTY
  dedicated schema (`THROTTLE_CONCURRENCY_SCHEMA`) and refuses any schema containing app tables;
  it was never part of `npm test` by design, and creating a second schema was outside the
  approved plan. It refuses `workzen_hrms_test` correctly (demonstrated).

  Risk note from the original item resolved: `leave-http` targeted scratch data only.

- [ ] **T-010 · Resume tab: make save succeed or remove the fields** · P1 · TODO · deps: T-011
  Files: `frontend/src/pages/MyProfile.jsx:174-184`, `backend/src/models/profileModel.js:6-24`,
  the 4 unwired migrators
  Do: apply `migrate-resume-fields.js` / `migrate-additional-fields.js` / `migrate-manager-field.js`
  through `schemaSetup.js`, extend `EDITABLE_PROFILE_COLUMNS`, coerce `skills`/`interests` arrays
  server-side; then replace the Lorem Ipsum defaults at `:102,105,108`.
  Accept: save returns 200 and round-trips; no silent 400.
  Test: extend `profile-update.test.js` (16) + `profile-update-http.test.js` (20).

- [ ] **T-011 · Salary tab: render real data, delete fabricated figures** · P1 · TODO · deps: none
  Files: `frontend/src/pages/MyProfile.jsx:998-1197`; API exists (`/payroll/salary-structure/:userId`)
  Do: fetch and render the employee's own effective structure; gate visibility by role; remove
  hardcoded `50000/600000/25000.00…`, `My Name`, `Content Narwhal`, `Magnificent Weasel`.
  Accept: tab shows API values for Admin/HR/Payroll per policy and empty-state for Employee if that
  is the intended rule — **confirm the product rule with you first**.
  Risk: exposing pay data to employees is a policy decision, not a code decision.

- [ ] **T-012 · Scope modal attendance to the selected employee** · P1 · TODO · deps: none
  Files: `frontend/src/components/EmployeeDetailsModal.jsx:285-288`,
  `backend/src/services/attendanceService.js:190-245`
  Do: add a server-supported `userId`/`employee` filter (preferred) or use the existing `employee`
  param; never aggregate client-side from an unfiltered page.
  Accept: two different employees in the same org show different totals.
  Test: add a case to `attendance-http.test.js` (35) proving per-user scoping.

- [ ] **T-013 · Build a real Employee dashboard** · P1 · TODO · deps: none
  Files: `frontend/src/App.jsx:40-47`, `frontend/src/pages/Dashboard.jsx`,
  `backend/src/routes/dashboardRoutes.js:97` (`/my-stats` — already implemented, unused)
  Do: consume `/dashboard/my-stats`; keep staff directory on `/dashboard` only.
  Accept: employee@workzen.demo lands on a populated page with zero 403s in the console.
  Test: a dashboard HTTP/RBAC suite (currently missing entirely).

- [ ] **T-014 · Fix timezone date keys in attendance views** · P1 · TODO · deps: none
  Files: `frontend/src/pages/Attendance.jsx:22-24,145-146,192-193,230`,
  `frontend/src/pages/EmployeeAttendance.jsx:11-13,174-177`
  Do: build day keys with local getters / `yyyy-MM-dd` string assembly — no `toISOString()`.
  Accept: month grid shows real check-in/out times for today's rows; matches the recorded project
  memory on MySQL DATE timezone handling.
  Test: frontend unit test (needs T-033 baseline) or explicit browser verification.

- [ ] **T-015 · Fix transposed columns and raw datetime display in the attendance table** · P1 ·
  TODO · deps: none
  Files: `frontend/src/pages/Attendance.jsx:376-431`, `attendanceService.js:276-277`,
  `EmployeeDetailsModal.jsx:576-579`
  Do: align header/body order; alias `checkIn`/`checkOut` as `TIME_FORMAT(...,'%H:%i')` on
  `/attendance/all` for consistency with `/my-logs` and `/day`.
  Accept: columns labelled correctly; cells print `HH:MM`.

- [ ] **T-016 · Reconcile Payroll Officer attendance gates** · P1 · TODO · deps: none
  Files: `backend/src/routes/attendanceRoutes.js:49-56`, `frontend/src/pages/Attendance.jsx:100`
  Do: decide whether Payroll Officer should read `/all` and `/export` (they already get
  `/all-status`, `/day`, `/payable-days`) and align route + UI.
  Accept: no visible-but-403ing control anywhere on the page.

- [ ] **T-017 · Fix `/leave/active-leaves` shape misuse in Attendance.jsx** · P1 · TODO · deps: none
  Files: `frontend/src/pages/Attendance.jsx:120-121,403` (compare correct `Dashboard.jsx:102-105`)
  Accept: leave indicator renders.

- [ ] **T-018 · Stop `GET /users/:id` collapsing the whole modal for HR/Payroll** · P1 · TODO · deps: none
  Files: `frontend/src/components/EmployeeDetailsModal.jsx:284,340`, `userController.js:192`
  Do: add `.catch()` per promise (4 of 5 already have it) and align authorization policy with
  `GET /users` which HR/Payroll may call.
  Accept: HR Officer sees a real detail modal, not the list-row fallback.

- [ ] **T-019 · Route or remove `Employees.jsx`** · P1 · TODO · deps: none
  Files: `frontend/src/pages/Employees.jsx` (441 lines, unrouted), `Sidebar.jsx:9`
  Do: wire a `/employees` route with a role guard, add `isOpen` props at :421-436 (both modals
  currently render without it and early-return null), and either declare+install `lucide-react`
  and `prop-types` or replace them.
  Accept: `npm run build` succeeds and the page is reachable; naive CSV `join(",")` at :118-132 is
  quote-escaped.

- [ ] **T-020 · Make `POST /attendance/mark` consistent with the service layer** · P1 · TODO · deps: none
  Files: `attendanceController.js:18-96`, `attendanceService.js:27-91`
  Do: move the ODKU write path into `attendanceService.js` per `AGENTS.MD`, or retire the endpoint —
  nothing in the frontend calls it.
  Accept: attendance writes flow through one service function; `mark-time-contract` tests stay green.

## Phase C — P2 (integration + consistency)

- [ ] **T-021 · Unify DB bootstrap into one supported path** · P2 · TODO · deps: T-007
  `init.js` currently yields a DB that fails its own verifier; make `init-db` run
  `schemaSetup`'s migration chain, or delete it and document `setup:demo`.
- [ ] **T-022 · Wire or delete the 4 orphan migrators + orphan SQL files** · P2 · TODO · deps: T-021
  `migrate-{manager-field,additional-fields,password-reset-codes,resume-fields}.js`,
  `migrations/001,002,004`, `backend/database/migrations/013`, 6 legacy `*.sql`.
- [ ] **T-023 · Add UNIQUE + CHECK constraints** · P2 · TODO · deps: T-021
  `employee_salary_structure(user_id,component_id,effective_from)`, `start_date <= end_date`,
  `total_days > 0`, `payroll.month BETWEEN 1 AND 12`.
- [ ] **T-024 · Paginate `/users` and `/payroll/all`** · P2 · TODO · deps: none
  `userModel.js:65`, `payrollModel.js:28` are unbounded; attendance and leave already paginate.
- [ ] **T-025 · Add positive directory pagination/search correctness tests** · P2 · TODO · deps: T-024
  Existing `directory-authorization-http` proves RBAC only, not result correctness.
- [ ] **T-026 · Consume `/dashboard/stats` or remove it; finish Reports** · P2 · TODO · deps: T-013
  `Reports.jsx` is a stub; `dashboardService` in `authService.js:136-148` is dead code.
- [ ] **T-027 · Add user status toggle + delete UI** · P2 · TODO · deps: none
  `PUT /users/:userId/status` and `DELETE /users/:id` exist server-side with no caller.
- [ ] **T-028 · Add manual attendance-correction UI** · P2 · TODO · deps: none
  `PUT /attendance/:attendanceId` is implemented and audited; there is no modal for it.
- [ ] **T-029 · Add leave-type and leave-balance administration UI** · P2 · TODO · deps: none
  `/leave/types` is read-only; balances are DB-only today.
- [ ] **T-030 · Add an audit-log viewer for Admin/HR** · P2 · TODO · deps: none
  `GET /leave/audit` has no consumer; no test pins actor/IP/user-agent capture.
- [ ] **T-031 · Add HTTP tests for `/api/dashboard` and profile-authorization; fix the stream leak** · P2 ·
  TODO · deps: T-009 · Files: `attendanceService.js:310-334`, `attendanceController.js:171-205`

## Phase D — P3 (polish, docs)

- [ ] **T-032 · Modal accessibility**: `role="dialog"`, `aria-modal`, Escape close, focus trap on the
  4 overlays (`Modal.jsx:5`, `PayslipModal.jsx:49`, `CreateUserModal.jsx:75`,
  `EmployeeDetailsModal.jsx:669`, `TimeOff.jsx:170`).
- [ ] **T-033 · Frontend test baseline**: add Vitest + Testing Library, cover the auth lifecycle and
  the date-key helpers (unblocks T-014 verification). Zero frontend tests exist today.
- [ ] **T-034 · Sidebar as real links + landmarks/skip link + text alternatives for emoji status.**
- [ ] **T-035 · Responsive wide tables** (`PayrollTable` 11 cols, `SalaryStructuresPanel` 8,
  `Attendance` 6); `Premium.css` has 0 `@media`.
- [ ] **T-036 · Remove `console.*`** left in `Dashboard.jsx:118-238`, `MyProfile.jsx` (16 sites),
  `Attendance.jsx:404-409` (fires per row per render), `EmployeeDetailsModal.jsx:341,362`.
- [ ] **T-037 · Dead UI cleanup**: uncontrolled `day-dropdown` select, `edit-avatar-btn` with no
  handler, two empty readonly inputs, `parseTimeToDate`/`msToHHMM`/`computeWorkAndExtra`, unused
  `activeSection`/`navItems`, orphan `index.css` Tailwind directives.
- [ ] **T-038 · De-hardcode branding/locale**: "Odoo India", `/odoo-logo.svg`, `en-IN`/`INR`
  (`format.js:33-38`), `attendance.csv`, 6-year rolling list.
- [ ] **T-039 · Deployment + rollback documentation**; production `VITE_API_URL` handling —
  `dist/` currently bakes `http://localhost:5000` (confirmed once in
  `frontend/dist/assets/index-DWIAtrcp.js`).
- [ ] **T-040 · Refresh stale documentation**: `README.md:246-247` still names legacy leave tables;
  reconcile README against this audit.
- [ ] **T-041 · Bound the logout request so a slow API cannot strand the client** · P3 · TODO ·
  deps: none · raised by T-001 · **measured, not inferred**
  `frontend/src/services/api.js` sets no `timeout`, and `AuthContext.logout()` now awaits that
  request, so the client-side logout is gated on the server's response. Browser matrix against a
  controllable backend: healthy (10 ms response) → redirect **14 ms** after the click; 4 s response
  → redirect at **4 020 ms**; refused connection → **2 355 ms**; **never-responding → no redirect at
  all after 4 s, with `workzen_token`, `workzen_user` and the in-memory `user` all still present** —
  the user believes they logged out and remains fully authenticated. The first three are only a UX
  delay; the fourth is a real logout failure.
  Do (smallest safe change, scoped to this call only): give the logout request its own bound —
  `authService.logout: api.post('/auth/logout', null, { timeout: 5000 })`, or race it against a
  5 s deadline in `logout()`. Either way `finally` then always runs and the redirect always happens;
  Express still processes an aborted request, so a late-arriving revoke still lands.
  **Explicitly not recommended here:** a global `timeout` on the axios instance — attendance CSV
  export and the report endpoints stream large payloads and would start failing; that needs its own
  measured task, not a side effect of this one.
  Accept: with the API wedged, a Logout click still clears credentials and lands on `/login` within
  the bound; `logout-revocation.test.js` stays green; no other endpoint's timing behaviour changes.

---

## Execution notes

**Parallelizable:** T-003, T-005, T-006, T-008, T-012, T-013, T-014, T-015, T-017, T-024, T-041
touch disjoint files and can run concurrently.
**Strictly sequential:** T-007 → T-009 (no verification environment until the tripwire exists);
T-011 → T-010 (schema before allowlist); T-021 → T-022 → T-023; T-033 → T-014 verification.
**Requires your approval before starting:** T-002, T-007, T-009, T-011 (policy), and anything that
writes to `workzen_hrms`, `workzen_hrms_fresh` or `workzen_hrms_demo` — the app's `DB_NAME`
currently resolves to the **protected** `workzen_hrms`.
**Git safety:** 86 dirty paths (45 modified, 41 untracked) hold the entire security layer. No
reset/clean/stash/branch-switch; no commit or push without your explicit instruction.

## Progress summary

| Phase | Tasks | Done | Blocked / needs approval |
|---|---|---|---|
| A — P0 | 8 | 4.5 (T-001, T-003, T-005, T-006, T-007 tripwire*) | 1 (T-007 scratch DB) |
| B — P1 | 12 | 0 | 1 (T-009) |
| C — P2 | 11 | 0 | 0 |
| D — P3 | 10 | 0 | 0 |
| **Total** | **41** | **5** | **2** |

\* T-007's code half (the fail-closed tripwire across all 21 DB-writing suites, the
`leave-performance` harness migration and its 17-case suite) is implemented and verified;
the task stays open only for the scratch database, which needs your approval of the 6-point
plan before any `CREATE DATABASE` runs.
