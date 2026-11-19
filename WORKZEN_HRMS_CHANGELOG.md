# WorkZen HRMS — Changelog

Nothing here is committed. All changes below are uncommitted working-tree work on `HEAD`
(`87e3950 chore: finalize WorkZen V2`), alongside ~45 pre-existing modified and ~41 untracked
files from the earlier security / login-throttle / production-readiness tracks.

## [Milestone 4 + 5] Reliability hardening, E2E export verification, IPC-flake fix, deployment readiness — 2026-11-19

**Status:** done. Roadmap reference: tracker → T-016 (D-9), T-011, T-027, T-033, T-039, T-041, D-10, D-18.

### Fixed

- **D-18 (connection leaks):** the attendance CSV export now releases its pooled
  connection on client disconnect (`res.on("close")`, released exactly once), not only on
  stream end/error. Audited every `getConnection` site: all end in `finally { release() }`.
- **D-10 (atomic init-db):** `npm run init-db` now runs the ordered, idempotent pipeline
  (schema → procedures → triggers → migrations → `verifyEffectiveSchema`) and **exits
  non-zero on any verification gap** — the old script treated procedures/triggers failures
  as optional notes and could leave a silently half-initialized database. Live-verified on
  the scratch schema.
- **D-9 / T-016 (Payroll Officer attendance):** `/attendance/all` and `/attendance/export`
  now allow the Payroll Officer (read-only; the UI offered both). Verified live: CSV export
  200 with 220k rows for the Payroll Officer; directory-authorization 15/15.
- **T-003 live ALTER:** `migrate-password-reset-codes.js` now reconciles an existing table
  idempotently — widens `reset_code` to VARCHAR(64), enforces `expires_at DATETIME NOT NULL`,
  adds the composite lookup index — instead of no-oping on any existing table. Demonstrated
  live: simulated VARCHAR(6) widened back to VARCHAR(64); verified suite totals unchanged.
- **email-transport-policy IPC flake (fixed):** the suite's `net.Socket.prototype.connect`
  stub could corrupt the test runner's child-IPC channel on Windows
  ("Unable to deserialize cloned data"), killing the file intermittently. The suite now
  runs in-process (`--experimental-test-isolation=none` in the `test` and `test:dbfree`
  scripts) where it is deterministic (8/8 across repeated runs), and its forced-failure
  stderr logging is captured and **asserted** instead of interleaving multi-line stacks with
  the runner channel.
- **T-041 + RBAC policy pins:** `logout-revocation.test.js` pins the six awaited call sites
  and the bounded logout request; `attendance-http` and `salary-http`/`demo-dataset-http`
  matrices updated to the confirmed T-011/D-9 policies.

### Verified end-to-end on `workzen_hrms_test`

- PDF payslip: HTTP 200, `%PDF-` magic, 2,908 bytes, net figure matches the payroll row.
- Attendance CSV export: HTTP 200, `text/csv`, 220,668 data rows, correct header.
- Dry-run email notifications: exercised across reset/welcome/forced-failure paths.
- RBAC boundaries across all 4 roles: re-verified by the 13-suite HTTP pass (252/252)
  and anonymous/Employee `/users` denials (401/403).
- `npm run init-db` verification pass green; `migrate:session-expiry` no-op on re-run.

## [T-004 + T-008 + T-002] HTTP perimeter, credential-privacy, session expiry — 2026-11-19

**Status:** done (all three P0s). Roadmap reference: tracker → T-004, T-008, T-002.

### Added

- **`backend/src/config/securityConfig.js`** — helmet configuration (SPA CSP with
  `style-src 'unsafe-inline'`, `frame-ancestors 'none'`, HSTS off until TLS), `TRUST_PROXY`
  validation that refuses the boot on an unsafe value, and the tiered `/api` limiter
  (per 60s: 900 authed reads / 300 unauthenticated / 300 mutations; preflight and
  `/api/health` never counted; standard `RateLimit-*` headers only).
- **`backend/src/database/migrate-session-expiry.js`** + npm script `migrate:session-expiry` —
  idempotent T-002 backfill: adds `user_sessions.expires_at` when missing, stamps legacy rows
  `issued_at + 24h` (never a lifetime extension), revokes what the stamp expired, caps accounts
  at the newest five live rows. Converges to a no-op; live-verified twice on `workzen_hrms_test`.
- **`backend/test/security-headers.test.js`** (12 cases) and
  **`backend/test/create-user-response-privacy.test.js`** (5 cases) — DB-free, wired into
  `test` and `test:dbfree`; **`backend/test/session-expiry.test.js`** (9 cases, DB-free SQL-shape).

### Changed

- **`backend/server.js`** — mounts `trust proxy` (validated), helmet, and the limiter before the
  body parsers; boot refuses an unsafe `TRUST_PROXY`.
- **`backend/src/models/sessionModel.js`** — issuance stamps the absolute window inside the cap
  transaction, revokes already-expired rows before counting, counts only unexpired rows toward
  the ≤5 cap; validation filters only the absolute window in SQL (revoked rows stay visible so
  `validateSession` keeps its exact 401/403 contracts).
- **`backend/src/database/schema.sql` + `migrate-user-sessions.js`** — `expires_at DATETIME NULL`
  + `idx_session_expiry` on fresh installs.
- **`backend/src/controllers/userController.js`** — T-008: the create-user response carries
  `credentials_emailed` / `email_delivery_status` and never a credential; the plaintext exists
  only in the welcome email.
- **`frontend/src/components/CreateUserModal.jsx`** — no password display; distinct emailed /
  mail-disabled / email-failed confirmations.
- **`backend/test/login-throttle-policy.test.js`** — the scripted `session cap` fake answers the
  two new issuance statements (expiry stamp, expired-revoke) and the session_id-ordered keep set.
- **`backend/test/leave-performance.test.js`** — the benchmark now spawns its own isolated
  backend with the limiter windows raised, because a throughput measurement is exactly what the
  production limiter must throttle.

### Verification (exact totals)

| Group | Files | Tests | Pass | Fail |
|---|---|---|---|---|
| `npm test` (unit, canonical) | 25 | 398 | 398 | 0 |
| `npm run test:dbfree` | 14 | 202 | 202 | 0 |
| HTTP suites (all 13, against the limiter + helmet-enabled server) | 13 | 252 | 252 | 0 |

## [T-007 + T-009] Approved scratch schema `workzen_hrms_test` — full verification run — 2026-11-19

**Status:** done (both tasks). Roadmap reference: tracker → T-007, T-009.

### Added

- **`workzen_hrms_test`** (approved 6-point plan; every command ran with
  `DB_NAME=workzen_hrms_test ALLOW_SCRATCH_DB=1`): schema + migrators + demo/synthetic dataset
  (1000 synthetic employees, 4 demo accounts, ~220k attendance rows, 12300 leave applications,
  10150 payroll rows), `verifyEffectiveSchema` OK — `reset_code varchar(64)`, `expires_at datetime`,
  9 `salary_components`, 18 tables / 3 views / 3 triggers / 1 procedure. Protected databases
  (`workzen_hrms`, `workzen_hrms_fresh`, `workzen_hrms_demo`) untouched.
- **`backend/test/support/capture-dry-run-mail.cjs`** — preload module (injected via
  `NODE_OPTIONS=--require`) that wraps the dry-run `jsonTransport` of spawned backends and records
  every rendered message to a JSONL file, so HTTP suites can recover the plaintext reset code from
  the message — the only place it still exists after T-003 made storage hash codes.

### Changed

- **`backend/test/password-reset-http.test.js`** — reset codes are now resolved from the captured
  dry-run mail (digest-matched against the live storage row) instead of read back as plaintext from
  `password_reset_codes`; `spawnServer` injects the capture preload.
- **`backend/test/demo-dataset-http.test.js`** — the three stale date-relative assertions were
  replaced with database-derived / plan-derived expectations (calendar size, closed payroll month,
  Paid-status month, attendance volume band).
- **`backend/test/db-safety-tripwire.test.js`** — two guard cases no longer pass `undefined`
  (which let the guard's destructuring default fall back to the real `process.env`); explicit
  empty strings keep the suite shell-independent.
- **`backend/test/attendance-http.test.js`** — stale payloads fixed to send bare `HH:mm` times per
  the pinned API contract; the bare-time rejection test became a bare-time acceptance test.

### Verification (exact totals)

| Group | Files | Tests | Pass | Fail |
|---|---|---|---|---|
| `npm test` (unit, canonical) | 24 | 389 | 389 | 0 |
| `npm run test:dbfree` | 13 | 193 | 193 | 0 |
| HTTP suites (attendance, auth-registration, auth-session, demo-dataset, directory-authz, leave, leave-performance, payroll, payroll-generation, password-reset, payslip, profile-update, salary) | 13 | 252 | 252 | 0 |

Not run: `auth-throttle-concurrency` (measurement spike requiring its own empty dedicated schema;
never part of `npm test`; correctly refuses `workzen_hrms_test`).

## [T-001] Logout now actually revokes the server session — 2026-11-01

**Status:** done. Roadmap reference: `WORKZEN_HRMS_DEVELOPMENT_TRACKER.md` → T-001.

### Fixed

- **`frontend/src/context/AuthContext.jsx:63-80`** — `logout()` deleted `workzen_token` from
  `localStorage` *before* dispatching `POST /api/auth/logout`. The axios request interceptor reads
  the token when it builds the request, so the call went out with no `Authorization` header,
  `protect` rejected it (`backend/src/middleware/auth.js:82-87`), the revoke controller never ran,
  and `.catch(() => {})` swallowed the 401. Every `user_sessions` row therefore stayed live after
  logout. `logout()` is now `async`, awaits the revoke first, and clears `localStorage` and
  `setUser(null)` in `finally`, so a 401, a 5xx, or an unreachable API still logs the client out.
- **`frontend/src/services/api.js:35-48`** — the 401 response interceptor excluded only
  `/auth/login`, so the logout 401 above triggered `window.location.href = '/login'`. That hard
  reload preempted the SPA redirect and raced the state cleanup. `/auth/logout` is now excluded too;
  a genuine expired session still redirects exactly as before.
- **`frontend/src/components/Header.jsx:8-11`**, **`pages/Dashboard.jsx:30-33`**,
  **`pages/Attendance.jsx:257-260`**, **`pages/EmployeeAttendance.jsx:218-221`**,
  **`pages/MyProfile.jsx:129-132`** — all five logout call sites now `await logout()` before
  `navigate("/login")` instead of firing it and forgetting.

No new endpoint, no duplicate logout route, no new authentication mechanism. JWT signing,
`validateSession`, the five-active-session cap (`MAX_ACTIVE_SESSIONS`), session retention, and the
Leave / attendance / payroll modules were not touched.

### Added

- **`backend/test/logout-revocation.test.js`** — 24 DB-free tests (5 suites) using the repository's
  fake-driver convention (`mysql.createPool` replaced before the modules are imported, so the real
  driver is never asked for a connection). Covers: `Session.revokeById` emits
  `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_id = ? AND revoked_at IS NULL`
  bound to the caller's own session and never a `user_id` predicate or a `DELETE`; a successful and a
  repeated logout revoke only that session; an unreadable session store fails closed with a generic
  500 that leaks no schema, SQL or driver code; no token, session id or secret appears in logs;
  `validateSession`/`protect` return 401 for a revoked row (with a positive control for a live row)
  and 401 with zero queries for missing / wrong-secret / expired / malformed tokens; plus static
  tests pinning the frontend contract (await-before-clear, cleanup in `finally`, exactly five
  awaited call sites, interceptor excludes login **and** logout, one `/auth/logout` reference).
  Added in the 2026-11-02 edge-case pass: `logout()` cannot reject (no `throw`/`return` in `catch`,
  no `await`/`throw` in `finally`), only a 401 can force a reload and `AuthContext` contains no
  `window.location` write at all, and each of the five handlers calls `navigate("/login")` strictly
  **after** `await logout()` — so no class of API failure can strand a user on a protected page.
- **`backend/package.json`** — the new suite is registered in both `test` and `test:dbfree`.

### Verification actually executed

| Check | Result |
|---|---|
| `node --test test/logout-revocation.test.js` | 24 pass / 0 fail / 0 skipped |
| `npm run test:dbfree` (backend) | 142 pass / 0 fail / 0 skipped |
| 12-file DB-free set (`attendance-mark-time-contract`, `auth-session`, `logout-revocation`, `auth-throttle-schema`, `login-throttle-policy`, `session-retention`, `boot-config`, `seed-reset-cleanup`, `error-body-sanitization`, `user-detail-privacy`, `email-transport-policy`, `benchmark-generator`) | 165 pass / 0 fail / 0 cancelled / 0 skipped, 2260 ms |
| Browser (`vite dev` :5173 → in-memory mock API :5000 reproducing the real `protect` contract) | Login → Logout click sent `Authorization: Bearer <the token held in localStorage>` (sha-256 prefix `fd853b8f5871` matched on both sides), the revoke handler ran, `workzen_token` and `workzen_user` were cleared, the app landed on `/login` with **no hard reload**, and the same token was then rejected `401` by a protected route |
| Browser, already-revoked session | UI logout received `401`; client still cleared credentials and SPA-navigated to `/login` (no reload loop, no stuck state) |
| Browser, genuine expiry | A `401` from the dashboard's 30 s poll cleared `localStorage` and redirected to `/login` — the interceptor was narrowed, not weakened |
| Harness accounting | 4 sessions created, 4 revoked, **0 active**; every unauthenticated logout attempt returned `401` and revoked nothing |
| Ports 5000 / 5173 after the run | released (harness processes stopped) |

### One run I could not reproduce, recorded for honesty

One combined run of the 12-file DB-free set reported `# tests 162 / # pass 161 / # fail 1`. I did
not keep that run's log, and it has not recurred in the **seven** full runs since (each
`165 / 165 / 0 fail`, exit code 0), nor in the isolated suite. The test *count* itself changed,
which is what the runner reports when a per-file child process dies at load — the failing file is
then counted once instead of contributing its subtests. I could not root-cause it, so it is stated
as an open observation rather than resolved. Re-running `npm run test:dbfree` is the gate; a
per-file green/denied tripwire is already scheduled as T-007.

### Edge-case matrix (2026-11-02, fault injection in the same browser harness)

Each row drives the real React app: log in, arm the fault, click the profile menu → Logout, then
read the outcome from inside the page. "Cleared" = both `workzen_token` and `workzen_user` gone;
"auth state" = a router `history.back()` into `/dashboard` bounces straight back to `/login`, which
only happens when the in-memory `user` is `null`.

| Scenario | Backend behaviour | Cleared | Reaches `/login` | Auth state | Unhandled rejection | Hard reload |
|---|---|---|---|---|---|---|
| S1 success | `200`, session revoked | yes | yes (14 ms after click) | cleared | 0 | none |
| S2 already revoked | pre-revoke, then logout → `401` | yes | yes | cleared | 0 | none |
| S3 HTTP 500 | injected `500` (mirrors an unreadable session store) | yes | yes | cleared | 0 | none |
| S4 socket destroyed mid-response | abort | yes | yes | cleared | 0 | none |
| S5 missing token | no `Authorization` → `401` | yes | yes | cleared | 0 | **none — this is RC-2 at runtime** |
| S6 invalid / expired token | unknown session → `401` | yes | yes | cleared | 0 | none |
| S7 double-clicked Logout | two clicks, one session | yes | yes | cleared | 0 | none; exactly **one** revocation, second call `401` |
| S8 slow backend | replies after 4 000 ms | yes | yes, but at **4 020 ms** | cleared | 0 | none |
| S9 wedged backend | never replies | **no** | **no** — still `/dashboard` after 4 s | **still authenticated** | 0 | none |
| S10 unreachable backend | proxy target refuses the connection | yes | yes, at **2 355 ms** | cleared | 0 | none |

Two deliberate observations from the same run:

- **S9 is the reason T-041 exists.** With no timeout, a wedged connection gates the whole client
  logout: credentials stay in `localStorage` and the user stays authenticated while believing they
  logged out. All seven scenarios in the review request (success, already-revoked, expired JWT, 500,
  connection failure, missing token, repeat) pass; S9 is outside that list and is recorded, not
  fixed, per the instruction to keep the timeout in T-041.
- **One competing hard reload remains, by design.** A `401` on a *non-logout* request — the
  dashboard's 30 s poll, or the check-in button against a revoked session — still runs
  `window.location.href = '/login'`. Verified outcome: credentials cleared, lands on `/login`.
  Narrowing that further would weaken genuine expiry handling, so it is left alone.
- **S3/S9 leave the server session live** (the revoke could not complete). The client cannot fix
  that; the row is bounded by the JWT `exp`. Retention/backfill of such rows is T-002 territory and
  was not touched.


**Not proven:** row-level `revoked_at IS NOT NULL` in a real MySQL `user_sessions` table. That needs
`backend/test/auth-session-http.test.js`, which writes to `workzen_hrms` — the app's configured
`DB_NAME` resolves to that **protected** schema — so it was deliberately not run. Tracked as
T-007 → T-009.

### Known residual risk

Logout handlers now `await` the request and no timeout is configured
(`frontend/src/services/api.js:8-13`). Measured with the S8/S9/S10 rows above: a healthy response
redirects 14 ms after the click, a 4 s response delays it to 4 020 ms, a refused connection to
2 355 ms, and a never-responding connection does not redirect at all — leaving credentials and the
in-memory session intact. Specified as **T-041** (bound the logout call itself; deliberately not a
global axios timeout, which would break the streaming CSV/report endpoints).

**Nothing in the seven scenarios listed for review depends on that gap**: with the API returning 401,
500, an aborted socket, or refusing the connection, the client always clears credentials, always
reaches `/login`, and never produces an unhandled rejection.

### Untouched by this change

No `.env` file, no database record, no schema, no migration, no seed, no Git operation, and no
Leave / attendance / payroll source file. The historical unreverked `user_sessions` rows and orphan
user `1657` are still there deliberately — that is T-002 and needs your approval.

---

## [T-005] JWT verification and signing pinned to HS256 — 2026-11-02

**Status:** done. Roadmap reference: `WORKZEN_HRMS_DEVELOPMENT_TRACKER.md` → T-005.

### Fixed

- **`backend/src/middleware/auth.js:91-94`** — `protect` verified tokens with
  `jwt.verify(token, process.env.JWT_SECRET)`: no `algorithms` option, so `jsonwebtoken` accepted
  any HMAC variant (HS384, HS512) signed with the same secret, and a future key-type change could
  have silently broadened what a forged `alg` header could reach. Verification is now pinned:
  `jwt.verify(token, process.env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] })`. A token carrying
  any other `alg` header fails before its signature is considered; there is no fallback.
- **`backend/src/controllers/authController.js:42-52`** — `generateToken` (the only sign path,
  used by login and register) relied on the library's implicit HS256 default. It now signs with
  `algorithm: JWT_ALGORITHM` explicitly, so the minted header can never drift from what `protect`
  accepts.
- **`backend/src/config/authConfig.js`** — new exported constant `JWT_ALGORITHM = "HS256"`, the
  single source of truth shared by both call sites. Confirmed choice: the application already
  minted HS256 by default, so pinning changes no live token's validity.

### Audit result

The backend contains exactly two JWT call sites (`generateToken` in the controller, one
`jwt.verify` in `protect`) — enforced by a new static test that scans all of `backend/src` and
fails if any other `jwt.sign`/`jwt.verify` appears. Sign and verify both read the raw
`process.env.JWT_SECRET` — the same expression `assertAuthConfig` validates at boot — so secret
parity is unchanged and a whitespace-padded secret cannot split the two paths.

### Added

- **`backend/test/jwt-algorithm-pinning.test.js`** — 15 DB-free tests using the repository's
  fake-driver convention (`mysql.createPool` replaced before any app module import, so no
  connection can be requested). Covers: an HS256 token for a live session passes `protect` with
  correct `req.user`; HS384 and HS512 tokens signed with the *same* secret are rejected 401 with
  zero session-store queries; hand-forged `alg:none` (empty signature) and RS256-header tokens are
  rejected 401; a post-signing HS256→HS384 header swap is rejected 401; wrong-secret,
  tampered-payload and malformed tokens still 401; static contract pins the verify option, the
  sign option, the shared import, and the full call-site census. Registered in both `test` and
  `test:dbfree`.

### Verification actually executed

| Check | Result |
|---|---|
| `node --test test/jwt-algorithm-pinning.test.js` | 15 pass / 0 fail |
| Targeted DB-free set (`jwt-algorithm-pinning`, `logout-revocation`, `auth-throttle-schema`, `boot-config`, `login-throttle-policy`, `session-retention`) | 107/107, 0 fail, run twice for flake stability |
| `npm run test:dbfree` | 157/157, 0 fail (was 142 before this change) |

**Deliberately not run:** `auth-session.test.js` (its `before`/`after` insert and delete a
temporary user via the real pool) and the HTTP suites — `DB_NAME` still resolves to the protected
`workzen_hrms`, so database-touching suites remain approval-gated. The pinning change is covered
at the middleware and contract level without them.

### Untouched by this change

No `.env`, no database, no schema, no migration, no seed, no Git operation, no frontend file, and
no Leave / attendance / payroll source file. Previously-issued tokens remain valid (HS256 was
already the signing default).

---

## [T-006] `seed.js` no longer destroys the reference salary components — 2026-11-02

**Status:** done. Roadmap reference: `WORKZEN_HRMS_DEVELOPMENT_TRACKER.md` → T-006.

### Fixed

- **`backend/src/database/seed.js`** — the full-reset script truncated
  `TRUNCATE TABLE salary_components` and then only **selected** from the table ("redundant if
  schema.sql inserts them"), never re-inserting. Since `schema.sql:191-201` is the sole source of
  the nine reference components (Basic Salary, HRA, Special Allowance, Transport, Medical,
  Provident Fund, Professional Tax, Income Tax, Insurance), one run of the script silently
  destroyed the payroll vocabulary and silently skipped every salary-structure insert that looked
  components up by name. The truncate is removed, matching `production-seed.js`, which always
  excluded `salary_components` from its reset list. Everything around it is untouched:
  `FOREIGN_KEY_CHECKS` handling, the audit-log preservation block (reset-throttle budget rows
  kept), `resetAccountScopedState` ordering before the `users` truncate, and the component lookup
  that salary-structure assignment depends on. The script itself is kept — it is not deleted.

### Added

- **`backend/test/seed-reset-cleanup.test.js`** — extended 5 → 9 cases in the file's existing
  DB-free style (scripted connections + static SQL-text assertions; the seeds only connect in
  their direct-run branch, so no database is touched). New cases pin: `seed.js` contains no
  `TRUNCATE TABLE salary_components` and no `DELETE FROM salary_components`; `seed.js`'s complete
  truncate list is exactly [password_reset_codes, payroll_details, payroll,
  employee_salary_structure, leave_applications, leave_balance, attendance, employee_profiles,
  users]; `production-seed.js`'s truncate list still excludes `salary_components` while keeping
  every account-scoped table; `schema.sql` still seeds ≥ 9 reference components.

### Verification actually executed

| Check | Result |
|---|---|
| `node --test test/seed-reset-cleanup.test.js` | 9 pass / 0 fail |
| `npm run test:dbfree` | 161/161, 0 fail (was 157; run twice, no flake — the `email-transport-policy` IPC issue did not trigger in either run) |

**Deliberately not run:** `seed.js` / `production-seed.js` themselves — direct-run,
database-writing scripts; with `DB_NAME` still resolving to the protected `workzen_hrms`, live
execution stays behind the T-007 scratch-schema approval. The fix is proven by pinning the exact
SQL the scripts would execute.

### Untouched by this change

No `.env`, no database, no schema file, no other seed script, no Git operation, no frontend file,
no Leave / attendance / payroll source file. All other working-tree changes (T-001, T-005, the
pre-existing security layer) are preserved as they were.

---

## [T-003] Password-reset codes stored as SHA-256 digests — 2026-11-02

**Status:** done (code, static schema, DB-free tests). Live-DB migration and the 33-case
`password-reset.test.js` flow regression remain gated on the T-007 scratch-schema approval.
Roadmap reference: `WORKZEN_HRMS_DEVELOPMENT_TRACKER.md` → T-003.

### Fixed

- **`backend/src/controllers/authController.js`** — `password_reset_codes.reset_code` stored the
  emailed 6-digit code in plaintext: anyone with database read access (a backup, a support dump, a
  compromised replica) held a live, single-use credential for every account with an outstanding
  code. A new exported helper `hashResetCode(code)` (SHA-256 hex of the trimmed code) is now bound
  at issuance (the INSERT stores the digest while the email still carries the plaintext code) and
  at consume (the submitted code is hashed before the lookup). The atomic SQL contract is
  deliberately unchanged: the equality-match
  `WHERE user_id = ? AND reset_code = ? AND is_used = FALSE AND expires_at > NOW() … FOR UPDATE`
  and the single-use `UPDATE … WHERE id = ? AND is_used = FALSE` are byte-identical — SHA-256 is
  deterministic, which is exactly why it works where bcrypt (non-deterministic) would have forced
  a fetch-then-compare rewrite. The guessing budget, the 10-minute TTL and the account-keyed
  lookup still bound the 10⁶ space; the hash adds confidentiality at rest, not brute-force
  resistance. stdout/audit_logs were already code-free; tests now pin that permanently.
- **Static schema alignment (no live execution)** — `backend/src/database/schema.sql`,
  `backend/src/database/migrate-password-reset-codes.js` and
  `backend/database/migrations/013_create_password_reset_codes_table.sql` all now declare
  `reset_code VARCHAR(64) NOT NULL` (a SHA-256 hex digest does not fit the old `VARCHAR(6)`),
  `expires_at DATETIME NOT NULL` (unifying the migrator's TIMESTAMP drift), and replace the
  plaintext-era standalone `INDEX idx_reset_code (reset_code)` with the user-scoped composite
  `INDEX idx_user_reset_code (user_id, reset_code)`.

### Added

- **`backend/test/password-reset-code-hashing.test.js`** — 15 DB-free tests using the repository's
  fake-driver convention plus a captured dry-run mail transport, so the test can tie the emailed
  plaintext to the stored digest end-to-end without SMTP or a database. Covers: issuance stores
  the 64-char digest equal to `sha256(emailed code)` and never the plaintext; no SQL parameter,
  `audit_logs` value column or stdout/stderr line carries the code (the budget reservation row
  carries only action/ip/user-agent with literal NULLs); consume queries with the digest of the
  emailed code (full round-trip through a real issuance), preserves atomic single-use consumption,
  keeps the charge on a wrong guess (no refund) and refunds on success; malformed-shape and
  over-budget submissions are refused before any store access; static pins for all three schema
  files. Registered in both `test` and `test:dbfree`.

### Verification actually executed

| Check | Result |
|---|---|
| `node --test test/password-reset-code-hashing.test.js` | 15 pass / 0 fail |
| `npm run test:dbfree` | 176/176, 0 fail (was 161); three consecutive clean runs, run twice more hitting the documented `email-transport-policy` runner-IPC flake (172/173; that file passes 8/8 in-process — pre-existing, tracked with T-001's notes) |

**Gated on T-007/T-009 — deliberately not done here:** (a) authoring + executing a live
`ALTER TABLE password_reset_codes MODIFY reset_code VARCHAR(64) …` against any real database
(an in-flight plaintext code becomes unusable by design — issuance supersedes all live rows first
— but the migration itself must not be run without the approved scratch schema);
(b) `migrate-password-reset-codes.js` live execution; (c) the 33-case `password-reset.test.js`
live-flow regression, which writes to the database.

### Untouched by this change

No `.env`, no database, no Git operation, no frontend file, no Leave / attendance / payroll
source file. The email still carries the plaintext code by design; only storage is hashed. All
other working-tree changes (T-001, T-005, T-006, the pre-existing security layer) are preserved
as they were.

---

## [T-007] Fail-closed DB-safety tripwire across every DB-writing suite — 2026-11-02

**Status:** tripwire code done and verified; the scratch database itself still awaits explicit
approval (6-point plan delivered with this change). Roadmap reference:
`WORKZEN_HRMS_DEVELOPMENT_TRACKER.md` → T-007.

### The gap this closes

The audit found the DB-writing surface was far wider than the tracker assumed: not 8 but **21**
suites reach the real database (8 unit suites, 12 HTTP suites, the leave performance benchmark),
and only `auth-throttle-concurrency.test.js` had its own scratch-schema guard. Meanwhile the app's
`DB_NAME` resolves to the protected `workzen_hrms`, so any of those suites run by hand would have
created, mutated and deleted temporary rows inside live data.

### Added

- **`backend/test/support/dbGuard.js`** — `assertScratchDatabase(suiteName)`: fail-closed, pure
  environment validation, never imports a driver and never opens a connection. Four rules in order:
  DB_NAME must be set; must not be one of `workzen_hrms`, `workzen_hrms_fresh`, `workzen_hrms_demo`
  (checked case-insensitively); must be scratch-shaped (`_test`/`_scratch` suffix, `[A-Za-z0-9_]{1,64}`
  — the same charset rule `schemaSetup.assertSafeSchemaName` applies); and `ALLOW_SCRATCH_DB=1` must
  be explicitly exported, so a scratch-looking name alone can never silently become the test target.
  Throwing at module scope means a misconfigured run registers zero tests and cannot look green —
  the same principle as `httpSuite.requiredBaseUrl`.
- Wired at module scope into **all 21 DB-writing suites**. Deliberately NOT placed in
  `src/config/database.js`: a boot-time guard there would break the DB-free suites that legitimately
  import and stub the pool.
- **`backend/test/leave-performance.test.js`** — migrated off the silent `{ skip: !base }` pattern
  (which could pass with zero tests) onto `requiredBaseUrl('LEAVE_API_URL', 'test:leave:perf')` +
  `guardExecutedTests('leave-performance benchmark', 10)`, closing the D-13 gap the audit flagged.
- **`backend/test/db-safety-tripwire.test.js`** — 17 DB-free cases: every protected name (and
  case-variants) refused even with the opt-in; missing DB_NAME refused; non-scratch and unsafe-charset
  names refused; missing/wrong opt-in refused; `workzen_hrms_test` with the opt-in accepted; a census
  test asserting all 21 suites import and invoke the guard, cross-checked against pool imports;
  `auth-throttle-concurrency`'s dedicated guard intact; the guard helper driver-free. Registered in
  both `test` and `test:dbfree`.

### Verification actually executed

| Check | Result |
|---|---|
| `node --test test/db-safety-tripwire.test.js` | 17 pass / 0 fail |
| `node --test test/salary.test.js` (guarded suite, protected DB_NAME from .env) | "REFUSING TO RUN (salary): workzen_hrms is a protected application database" — 0 tests registered, no connection attempted |
| `node --test test/leave-performance.test.js` | same refusal (and `LEAVE_API_URL` would gate it first in a URL-less run) |
| `node --test test/payroll-http.test.js` with URL set, DB_NAME unset | "DB_NAME is not set" refusal |
| Same with `DB_NAME=workzen_hrms_test ALLOW_SCRATCH_DB=1` | guard passes; the suite proceeds against only the (non-existent) scratch schema — connection failures, zero writes, protected databases untouched, no lingering listeners |
| `npm run test:dbfree` | 193/193, 0 fail (was 176) — two consecutive clean runs |

### What this unlocks — pending your approval

With the tripwire live, the 21 DB-writing suites are mechanically incapable of touching
`workzen_hrms`, `workzen_hrms_fresh` or `workzen_hrms_demo`. The remaining half of T-007 is the
scratch database itself — the 6-point approval plan is in the completion report. Once approved:
T-009 (run all suites and produce a real pass/fail table), the T-002 session backfill and T-003's
live `ALTER TABLE` all become executable.

### Untouched by this change

No `.env`, no database, no Git operation, no frontend file, no Leave / attendance / payroll source
file. All other working-tree changes (T-001, T-003, T-005, T-006, the pre-existing security layer)
are preserved as they were.
