import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import pool from '../src/config/database.js';

// Critical-1 regression: POST /api/auth/register must never let a caller obtain
// elevated privileges. The route is Admin-only and role_name is allowlisted to
// non-Admin roles, so an unauthenticated caller cannot self-provision an Admin.
// Isolation: the suite creates its own temporary users and hard-deletes them in
// teardown. Demo users are only ever used to obtain tokens; they are never
// modified.
import { requiredBaseUrl, guardExecutedTests } from "./support/httpSuite.js";
import { assertScratchDatabase } from "./support/dbGuard.js";
const base = requiredBaseUrl("AUTH_API_URL", "test:auth:http");
// T-007 tripwire: the target server writes to the database; the schema it
// points at must be an approved scratch one. Fails closed before any test
// registers.
assertScratchDatabase("auth-registration-http");
const TEMP_PASSWORD = 'Temp@12345';

const call = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
};

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = (token) => ({ ...authHeaders(token), 'Content-Type': 'application/json' });

const login = async (email, password) => {
  const { body } = await call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return body?.data?.token;
};

const roleCount = async (roleName) => {
  const [rows] = await pool.query(
    'SELECT role_id FROM roles WHERE role_name = ? LIMIT 1',
    [roleName],
  );
  return rows[0]?.role_id ?? null;
};

const persistedRole = async (email) => {
  const [rows] = await pool.query(
    `SELECT u.user_id, u.role_id, r.role_name
     FROM users u INNER JOIN roles r ON u.role_id = r.role_id
     WHERE u.email = ? LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
};

describe('Auth registration privilege-escalation regression', () => {
  let adminToken;
  let hrToken;
  let employeeToken;
  let employeeRoleId;
  let adminRoleId;
  let payrollRoleId;
  const createdEmails = [];
  const stamp = Date.now();

  before(async () => {
    adminToken = await login('admin@workzen.demo', 'Admin@123');
    hrToken = await login('hr@workzen.demo', 'Hr@123');
    employeeToken = await login('employee@workzen.demo', 'Employee@123');
    assert.ok(adminToken && hrToken && employeeToken, 'all demo tokens issued');

    employeeRoleId = await roleCount('Employee');
    adminRoleId = await roleCount('Admin');
    payrollRoleId = await roleCount('Payroll Officer');
    assert.ok(employeeRoleId && adminRoleId && payrollRoleId, 'reference roles exist');
  });

  after(async () => {
    for (const email of createdEmails) {
      const user = await persistedRole(email);
      if (!user) continue;
      await pool.query('DELETE FROM employee_profiles WHERE user_id = ?', [user.user_id]);
      await pool.query('DELETE FROM users WHERE user_id = ?', [user.user_id]);
    }
    await pool.end();
  });

  const registerBody = (overrides = {}) => ({
    email: `auth-http-${stamp}-${createdEmails.length}@example.test`,
    password: TEMP_PASSWORD,
    role_name: 'Employee',
    company_name: 'Acme Ltd',
    first_name: 'Reg',
    last_name: 'Http',
    ...overrides,
  });

  describe('1. the route is no longer public', () => {
    it('POST /auth/register without a token returns 401', async () => {
      const { response, body } = await call('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerBody({ role_name: 'Admin' })),
      });
      assert.equal(response.status, 401);
      assert.equal(body.success, false);
    });

    it('POST /auth/register as an Employee returns 403', async () => {
      const { response, body } = await call('/auth/register', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify(registerBody({ role_name: 'Admin' })),
      });
      assert.equal(response.status, 403);
      assert.equal(body.success, false);
    });

    it('POST /auth/register as an HR Officer returns 403', async () => {
      const { response } = await call('/auth/register', {
        method: 'POST',
        headers: jsonHeaders(hrToken),
        body: JSON.stringify(registerBody()),
      });
      assert.equal(response.status, 403);
    });

    it('a rejected registration attempt persists no user', async () => {
      const email = `auth-http-rejected-${stamp}@example.test`;
      await call('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerBody({ email, role_name: 'Admin' })),
      });
      assert.equal(await persistedRole(email), null);
    });
  });

  describe('2. Admin cannot mint another Admin through this route', () => {
    it('role_name "Admin" is rejected with 400 and creates no account', async () => {
      const email = `auth-http-admin-attempt-${stamp}@example.test`;
      const { response, body } = await call('/auth/register', {
        method: 'POST',
        headers: jsonHeaders(adminToken),
        body: JSON.stringify(registerBody({ email, role_name: 'Admin' })),
      });
      assert.equal(response.status, 400);
      assert.equal(body.success, false);
      assert.equal(await persistedRole(email), null);
    });

    it('an unknown role name is rejected with 400', async () => {
      const { response } = await call('/auth/register', {
        method: 'POST',
        headers: jsonHeaders(adminToken),
        body: JSON.stringify(registerBody({ role_name: 'Superuser' })),
      });
      assert.equal(response.status, 400);
    });
  });

  describe('3. legitimate registration still works', () => {
    it('Admin can register an Employee and the persisted role is Employee', async () => {
      const body = registerBody();
      createdEmails.push(body.email);
      const { response, body: payload } = await call('/auth/register', {
        method: 'POST',
        headers: jsonHeaders(adminToken),
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 201);
      assert.equal(payload.success, true);
      assert.equal(payload.data.role, 'Employee');

      const stored = await persistedRole(body.email);
      assert.ok(stored, 'user row persisted');
      assert.equal(stored.role_id, employeeRoleId);
      assert.equal(stored.role_name, 'Employee');

      const claims = jwt.decode(payload.data.token);
      assert.equal(claims.roleName, 'Employee');
      assert.equal(claims.userId, stored.user_id);
    });

    it('the issued token authenticates as that Employee, not as Admin', async () => {
      const body = registerBody();
      createdEmails.push(body.email);
      const { body: payload } = await call('/auth/register', {
        method: 'POST',
        headers: jsonHeaders(adminToken),
        body: JSON.stringify(body),
      });

      const me = await call('/auth/me', { headers: authHeaders(payload.data.token) });
      assert.equal(me.response.status, 200);
      assert.equal(me.body.data.role, 'Employee');

      const org = await call('/attendance/all', { headers: authHeaders(payload.data.token) });
      assert.equal(org.response.status, 403);
    });

    it('client-supplied role_id and is_admin are ignored', async () => {
      const body = {
        ...registerBody(),
        role_id: adminRoleId,
        is_admin: true,
      };
      createdEmails.push(body.email);
      const { response, body: payload } = await call('/auth/register', {
        method: 'POST',
        headers: jsonHeaders(adminToken),
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 201);

      const stored = await persistedRole(body.email);
      assert.equal(stored.role_id, employeeRoleId, 'client role_id must not be trusted');
      assert.equal(stored.role_name, 'Employee');
      assert.equal(jwt.decode(payload.data.token).roleName, 'Employee');
    });

    it('a non-Admin officer role can still be assigned by an Admin', async () => {
      const body = registerBody({ role_name: 'Payroll Officer' });
      createdEmails.push(body.email);
      const { response } = await call('/auth/register', {
        method: 'POST',
        headers: jsonHeaders(adminToken),
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 201);
      const stored = await persistedRole(body.email);
      assert.equal(stored.role_id, payrollRoleId);
    });

    it('existing validation still rejects missing required fields', async () => {
      const { response, body } = await call('/auth/register', {
        method: 'POST',
        headers: jsonHeaders(adminToken),
        body: JSON.stringify({ email: `auth-http-partial-${stamp}@example.test` }),
      });
      assert.equal(response.status, 400);
      assert.equal(body.success, false);
    });
  });
});

guardExecutedTests("AUTH_API_URL", 11);
