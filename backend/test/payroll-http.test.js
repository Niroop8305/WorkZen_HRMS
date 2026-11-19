import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

// Payroll Milestone 1 decommission regression suite.
// Verifies (a) the preserved primary payroll routes still enforce their RBAC and
// (b) every retired legacy route now returns a deliberate 404 from the app-level
// handler instead of a 500 from a missing legacy table.
// Read-only: performs no payroll generation and no database writes.
import { requiredBaseUrl, guardExecutedTests } from "./support/httpSuite.js";
import { assertScratchDatabase } from "./support/dbGuard.js";
const base = requiredBaseUrl("PAYROLL_API_URL", "test:payroll:http");
// T-007 tripwire: the target server writes to the database; the schema it
// points at must be an approved scratch one. Fails closed before any test
// registers.
assertScratchDatabase("payroll-http");

let employeeToken, hrToken, adminToken, payrollToken;

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

describe('Payroll decommission HTTP regression', () => {
  before(async () => {
    employeeToken = await login('employee@workzen.demo', 'Employee@123');
    hrToken = await login('hr@workzen.demo', 'Hr@123');
    adminToken = await login('admin@workzen.demo', 'Admin@123');
    payrollToken = await login('payroll@workzen.demo', 'Payroll@123');
    assert.ok(employeeToken && hrToken && adminToken && payrollToken, 'all demo tokens issued');
  });

  describe('preserved primary routes: RBAC intact', () => {
    it('GET /payroll/my-payroll returns 200 for Employee', async () => {
      const { response, body } = await call('/payroll/my-payroll', { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
    });

    it('GET /payroll/my-payroll returns 401 without a token', async () => {
      const { response } = await call('/payroll/my-payroll');
      assert.equal(response.status, 401);
    });

    it('GET /payroll/all returns 403 for Employee', async () => {
      const { response } = await call('/payroll/all', { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 403);
    });

    it('GET /payroll/all returns 403 for HR Officer (not a payroll role)', async () => {
      const { response } = await call('/payroll/all', { headers: authHeaders(hrToken) });
      assert.equal(response.status, 403);
    });

    it('GET /payroll/all returns 200 for Payroll Officer', async () => {
      const { response, body } = await call('/payroll/all', { headers: authHeaders(payrollToken) });
      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
    });

    it('GET /payroll/all returns 200 for Admin', async () => {
      const { response } = await call('/payroll/all', { headers: authHeaders(adminToken) });
      assert.equal(response.status, 200);
    });

    it('GET /payroll/components returns 403 for Employee', async () => {
      const { response } = await call('/payroll/components', { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 403);
    });

    it('GET /payroll/components returns 200 for Payroll Officer', async () => {
      const { response, body } = await call('/payroll/components', { headers: authHeaders(payrollToken) });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.data));
    });
  });

  describe('retired legacy routes: deliberate 404 (not 500)', () => {
    const retired = [
      ['GET', '/employees'],
      ['GET', '/employees/1'],
      ['GET', '/payrun/summary'],
      ['POST', '/payrun/run'],
      ['GET', '/payslip/1'],
      ['POST', '/payslip/1/validate'],
      ['GET', '/payroll/payslips'],
      ['POST', '/payroll/payslips'],
      ['GET', '/payroll/payslips/1'],
      ['GET', '/payroll/salary-statement?employee_id=1&year=2025'],
    ];

    for (const [method, path] of retired) {
      it(`${method} ${path} returns 404`, async () => {
        const { response, body } = await call(path, {
          method,
          headers: method === 'GET' ? authHeaders(adminToken) : jsonHeaders(adminToken),
        });
        assert.equal(response.status, 404, `expected 404 for ${method} ${path}, got ${response.status}`);
        assert.equal(body?.success, false);
      });
    }
  });
});

guardExecutedTests("PAYROLL_API_URL", 9);
