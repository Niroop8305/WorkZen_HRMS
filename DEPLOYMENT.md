# WorkZen HRMS — Deployment Guide

Audience: the operator deploying WorkZen to a real server. Read the checklist at
the end before go-live.

---

## 1. Architecture overview

```
Browser (React 18 SPA, Vite build in frontend/dist)
   │  same-origin /api  (or absolute VITE_API_URL)
   ▼
Express API (backend/server.js)
   │  helmet CSP + global /api rate limiter + JWT HS256 auth + RBAC
   ▼
Controllers → Services (authoritative calculations) → mysql2 pool
   ▼
MySQL 8.0 (utf8mb4 / InnoDB)
```

- 4 roles: **Admin**, **HR Officer**, **Payroll Officer**, **Employee**.
- All calculations (attendance minutes, payroll amounts, salary totals) happen on
  the server; the React client only displays API results.
- Sensitive mutations (attendance corrections, credential changes, payroll
  generation, user status) write to the `audit_logs` trail.

## 2. Environment variables

Copy `.env.example` in each app and fill real values. **Never commit `.env`.**

### Backend (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes (`production`) | enables the stricter boot gate |
| `PORT` | yes | API port (default 5000) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes | MySQL target |
| `JWT_SECRET` | yes | ≥ 32 random chars; the shipped placeholder refuses to boot |
| `JWT_EXPIRE` | yes | e.g. `7d` |
| `CORS_ORIGIN` | yes | the deployed frontend origin(s), comma-separated |
| `TRUST_PROXY` | behind a proxy | `loopback`, hop count, or IP/CIDR list; **never** a bare `true` unless a real proxy is in front |
| `RATE_LIMIT_*` | optional | per-60s tiers: authed reads 900 / unauthed 300 / mutations 300 |
| `SESSION_ABSOLUTE_TTL_HOURS` | optional | T-002 absolute session lifetime (default 24) |
| `APP_TIMEZONE` | optional | business timezone (default `Asia/Kolkata`) |
| `EMAIL_DRY_RUN` | recommended initially | `true` renders mail locally, never sends |
| `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM` | for real mail | SMTP credentials |

### Frontend (`frontend/.env` — build-time!)

| Variable | Notes |
|---|---|
| `VITE_API_URL` | **Vite inlines this into the bundle at build time.** Same-origin deployments leave it `/api`; separately hosted APIs set the absolute URL. Never leave a developer's `http://localhost:5000/api` in the file used for a production build — it bakes the developer machine into `dist/`. |

## 3. Database setup

### New database (fresh clone)

```bash
cd backend
npm install
cp .env.example .env          # fill DB_* + JWT_SECRET
npm run init-db               # schema → procedures → triggers → migrations → verify
npm run seed:demo             # optional demo accounts + benchmark dataset (dev only)
npm run dev                   # http://localhost:5000
```

`init-db` is atomic-by-verification: it exits non-zero if `verifyEffectiveSchema`
finds any gap, so a half-migrated database cannot be mistaken for a working one.
It never drops data; on an existing database it runs the idempotent migration pass
and re-verifies.

### Existing database (one-time migrations)

An existing `workzen_hrms` created before the 2026-11 work needs these one-time
steps (each is idempotent and safe to re-run):

```bash
cd backend

# T-003: password-reset codes are stored as SHA-256 digests (VARCHAR(64))
npm run migrate:password-reset-codes
# or, standalone SQL:
#   ALTER TABLE password_reset_codes
#     MODIFY reset_code VARCHAR(64) NOT NULL,
#     MODIFY expires_at DATETIME NOT NULL;
#   CREATE INDEX ... (composite (user_id, reset_code) index if absent)

# T-002: absolute session expiry + cap backfill (revokes excess live sessions;
# users may be signed out once — plan the timing)
npm run migrate:session-expiry

# Attendance milestone columns + uniqueness (idempotent)
npm run migrate:attendance
npm run migrate:auth-throttle
npm run migrate:leave-cancellation
npm run migrate:salary-components
npm run migrate:user-sessions

# Verify everything before starting the server
npm run init-db               # verification-only pass on an initialized DB
```

**Do not** run these against a database you cannot afford to sign users out of
without notice; T-002's backfill revokes sessions beyond the 5-per-user cap.

## 4. Frontend build & deploy

```bash
cd frontend
npm install
cp .env.example .env          # set VITE_API_URL for the target topology
npm run build                 # dist/ — zero hardcoded localhost URLs
npm run preview               # sanity-check the built bundle locally
```

Serve `dist/` from any static host or the reverse proxy that also routes `/api`
to the backend. The CSP allows inline styles (the Vite shell uses them) and
scripts from `'self'` only.

## 5. Security posture (what ships enabled)

- **Helmet**: CSP `default-src 'self'`, `script-src 'self'`,
  `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`,
  `object-src 'none'`; `X-Frame-Options: DENY`; `nosniff`; strict referrer
  policy. HSTS is **off** until you terminate TLS — enable it in the proxy or
  flip `hsts: true` after HTTPS exists.
- **Rate limiting** on `/api`: tiered per 60s (900 authed reads / 300
  unauthenticated / 300 mutations); preflight and `/api/health` are never
  counted; standard `RateLimit-*` headers. The per-account credential throttle
  lives in the DB (`auth_throttle`) and is independent.
- **JWT**: HS256 only (algorithm pinning); sessions revocable server-side, ≤ 5
  active per user, absolute 24h expiry (`SESSION_ABSOLUTE_TTL_HOURS`).
- **Reset codes**: stored as SHA-256 digests; the plaintext exists only in the
  emailed message; issuance/consumption budgets are DB-backed and audited.
- **Create-user**: the temporary password is delivered **only** by email; the
  API response and UI never display it (`credentials_emailed` /
  `email_delivery_status`).

## 6. Testing before go-live

```bash
cd backend
npm run test:dbfree           # 202 DB-free tests (no database needed)
DB_NAME=<scratch_db> ALLOW_SCRATCH_DB=1 npm test            # 398 unit tests
# HTTP suites need a scratch backend + per-suite *_API_URL env vars
# (see backend/package.json scripts and WORKZEN_HRMS_DEVELOPMENT_TRACKER.md)
```

Never point the DB-writing suites at a production database: they are guarded
(`backend/test/support/dbGuard.js`) and refuse protected names outright, but
write real rows into whatever approved scratch schema you configure.

## 7. Go-live checklist

- [ ] `.env` files contain real secrets; `.env` is NOT in git (`git status`).
- [ ] `JWT_SECRET` is a fresh ≥ 32-char random value (not the placeholder).
- [ ] `NODE_ENV=production` and `CORS_ORIGIN` lists the real frontend origin.
- [ ] `TRUST_PROXY` matches the actual proxy topology.
- [ ] One-time migrations (§3) ran and `npm run init-db` verification passed.
- [ ] `frontend/dist` built with the production `VITE_API_URL`; no `localhost`
      in the bundle (`grep -r localhost dist/assets`).
- [ ] TLS terminates at the proxy; HSTS enabled at the proxy or in helmet.
- [ ] `EMAIL_DRY_RUN` off (or deliberately on) and SMTP credentials verified
      with `npm run test:email`.
- [ ] Demo accounts (`@workzen.demo`) are NOT usable in production — reseed or
      disable them.
- [ ] Backups/restore of MySQL tested at least once.

## 8. Rollback

1. The API and frontend are stateless: redeploy the previous build/bundle.
2. Schema migrations are additive and idempotent (`expires_at`, `reset_code`
   widening, attendance columns). Rolling the app back does **not** require
   schema rollback; older app code ignores the new columns. Remove the added
   columns only after both old and new code are gone from every host.
3. Database restore: use your MySQL backup; the audit trail (`audit_logs`) is
   append-only evidence and should be preserved.
