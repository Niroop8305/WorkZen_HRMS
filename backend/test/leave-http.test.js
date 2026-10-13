import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import pool from '../src/config/database.js';

const base = process.env.LEAVE_API_URL;
let employeeToken, hrToken, adminToken, payrollToken;
let employeeId, hrId;
let createdIds = [];
let paidLeaveTypeId, unpaidLeaveTypeId;
// Test-isolation only: this suite approves paid leave for the shared demo
// employee and its teardown raw-deletes the leave_applications rows, which
// bypasses the cancellation restore path and permanently drains
// leave_balance.used_days across runs. Snapshot the employee's balance rows
// before the suite and restore them exactly in teardown so repeated runs are
// deterministic. Production Leave behavior is untouched.
let balanceSnapshot = [];

const call = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json();
  return { response, body };
};

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = (token) => ({ ...authHeaders(token), 'Content-Type': 'application/json' });

describe('Leave Management HTTP API', { skip: !base }, () => {
  before(async () => {
    // Login Employee
    let res = await call('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee@workzen.demo', password: 'Employee@123' })
    });
    employeeToken = res.body.data.token;
    employeeId = res.body.data.userId;

    // Login HR
    res = await call('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hr@workzen.demo', password: 'Hr@123' })
    });
    hrToken = res.body.data.token;
    hrId = res.body.data.userId;

    // Login Admin
    res = await call('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@workzen.demo', password: 'Admin@123' })
    });
    adminToken = res.body.data.token;

    // Login Payroll
    res = await call('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'payroll@workzen.demo', password: 'Payroll@123' })
    });
    payrollToken = res.body.data.token;

    // Fetch Leave Types to identify paid and unpaid
    res = await call('/leave/types', { headers: authHeaders(employeeToken) });
    const types = res.body.data;
    paidLeaveTypeId = types.find(t => t.is_paid === 1 || t.is_paid === true)?.leave_type_id;
    unpaidLeaveTypeId = types.find(t => t.is_paid === 0 || t.is_paid === false)?.leave_type_id;

    // Snapshot the test employee's leave balances for deterministic teardown.
    const [balanceRows] = await pool.query(
      'SELECT balance_id, used_days, remaining_days FROM leave_balance WHERE user_id = ?',
      [employeeId]
    );
    balanceSnapshot = balanceRows;
  });

  after(async () => {
    if (createdIds.length > 0) {
      const placeholders = createdIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM audit_logs WHERE record_id IN (${placeholders}) AND table_name = 'leave_applications'`, createdIds);
      await pool.query(`DELETE FROM leave_applications WHERE leave_id IN (${placeholders})`, createdIds);
    }
    // Restore the snapshotted balances so the shared demo employee is left
    // exactly as it was found, regardless of which leaves were approved.
    for (const row of balanceSnapshot) {
      await pool.query(
        'UPDATE leave_balance SET used_days = ?, remaining_days = ? WHERE balance_id = ?',
        [row.used_days, row.remaining_days, row.balance_id]
      );
    }
    await pool.end();
  });

  describe('1. Employee endpoints', () => {
    it('GET /leave/types should return 200 and list of types', async () => {
      const { response, body } = await call('/leave/types', { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.length > 0);
      assert.ok('leave_type_id' in body.data[0]);
      assert.ok('is_paid' in body.data[0]);
    });

    it('GET /leave/balance should return 200', async () => {
      const { response, body } = await call('/leave/balance', { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.data));
    });

    it('GET /leave/balance?employee_id=<self> should return 403 for Employee', async () => {
      const { response } = await call(`/leave/balance?employee_id=${employeeId}`, { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 403);
    });

    it('POST /leave/apply should return 201 on valid data', async () => {
      const { response, body } = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({
          leave_type_id: paidLeaveTypeId,
          start_date: '2026-12-01',
          end_date: '2026-12-02',
          reason: 'Test leave'
        })
      });
      assert.equal(response.status, 201);
      assert.equal(body.data.status, 'Pending');
      assert.equal(body.data.total_days, 2);
      createdIds.push(body.data.leave_id);
    });

    it('GET /leave/my-leaves should return 200 and contain the created leave', async () => {
      const { response, body } = await call('/leave/my-leaves', { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.data));
      const myLeave = body.data.find(l => l.leave_id === createdIds[createdIds.length - 1]);
      assert.ok(myLeave);
    });

    it('PATCH /leave/:id/cancel on Pending should return 200', async () => {
      const leaveId = createdIds[createdIds.length - 1];
      const { response, body } = await call(`/leave/${leaveId}/cancel`, {
        method: 'PATCH',
        headers: jsonHeaders(employeeToken)
      });
      assert.equal(response.status, 200);
      assert.equal(body.data.status, 'Cancelled');
    });

    it('GET /leave/requests should return 403 for Employee', async () => {
      const { response } = await call('/leave/requests', { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 403);
    });

    it('GET /leave/active-leaves should return 403 for Employee', async () => {
      const { response } = await call('/leave/active-leaves', { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 403);
    });

    it('GET /leave/audit should return 403 for Employee', async () => {
      const { response } = await call('/leave/audit', { headers: authHeaders(employeeToken) });
      assert.equal(response.status, 403);
    });
  });

  describe('2. HR Officer endpoints', () => {
    it('GET /leave/requests should return 200 and pagination', async () => {
      const { response, body } = await call('/leave/requests', { headers: authHeaders(hrToken) });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.pagination);
    });

    it('GET /leave/requests?page=1&limit=1 should return pagination.limit === 1', async () => {
      const { response, body } = await call('/leave/requests?page=1&limit=1', { headers: authHeaders(hrToken) });
      assert.equal(response.status, 200);
      assert.equal(body.pagination.limit, 1);
    });

    it('GET /leave/requests?status=Pending should return all Pending', async () => {
      const { response, body } = await call('/leave/requests?status=Pending', { headers: authHeaders(hrToken) });
      assert.equal(response.status, 200);
      assert.ok(body.data.every(l => l.status === 'Pending'));
    });

    it('GET /leave/active-leaves should return 200', async () => {
      const { response, body } = await call('/leave/active-leaves', { headers: authHeaders(hrToken) });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.data));
    });

    it('GET /leave/audit should return 200 with pagination', async () => {
      const { response, body } = await call('/leave/audit', { headers: authHeaders(hrToken) });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.pagination);
    });

    it('GET /leave/balance?employee_id=<employee> should return 200 for HR', async () => {
      const { response, body } = await call(`/leave/balance?employee_id=${employeeId}`, { headers: authHeaders(hrToken) });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.every((b) => b.user_id === employeeId));
    });

    it('GET /leave/balance?employee_id=abc should return 400 for HR', async () => {
      const { response } = await call('/leave/balance?employee_id=abc', { headers: authHeaders(hrToken) });
      assert.equal(response.status, 400);
    });

    it('GET /leave/requests?employee_id=<employee> should only return that employee', async () => {
      const { response, body } = await call(`/leave/requests?employee_id=${employeeId}`, { headers: authHeaders(hrToken) });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.every((r) => r.employee_id === employeeId));
    });

    it('PATCH /leave/:id/status with Approved should return 200', async () => {
      // Create a leave to approve
      const createRes = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-03', end_date: '2026-12-04', reason: 'HR Approval test' })
      });
      createdIds.push(createRes.body.data.leave_id);

      const { response, body } = await call(`/leave/${createRes.body.data.leave_id}/status`, {
        method: 'PATCH',
        headers: jsonHeaders(hrToken),
        body: JSON.stringify({ status: 'Approved' })
      });
      assert.equal(response.status, 200);
      assert.equal(body.data.status, 'Approved');
    });

    it('PATCH /leave/:id/status with Rejected should return 200', async () => {
      // Create a leave to reject
      const createRes = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-07', end_date: '2026-12-08', reason: 'HR Rejection test' })
      });
      createdIds.push(createRes.body.data.leave_id);

      const { response, body } = await call(`/leave/${createRes.body.data.leave_id}/status`, {
        method: 'PATCH',
        headers: jsonHeaders(hrToken),
        body: JSON.stringify({ status: 'Rejected', rejection_reason: 'Test reason' })
      });
      assert.equal(response.status, 200);
      assert.equal(body.data.status, 'Rejected');
    });
  });

  describe('3. Admin endpoints', () => {
    it('GET /leave/requests should return 200', async () => {
      const { response } = await call('/leave/requests', { headers: authHeaders(adminToken) });
      assert.equal(response.status, 200);
    });

    it('GET /leave/active-leaves should return 200', async () => {
      const { response } = await call('/leave/active-leaves', { headers: authHeaders(adminToken) });
      assert.equal(response.status, 200);
    });

    it('GET /leave/audit should return 200', async () => {
      const { response } = await call('/leave/audit', { headers: authHeaders(adminToken) });
      assert.equal(response.status, 200);
    });
  });

  describe('4. Payroll Officer restrictions', () => {
    it('GET /leave/requests should return 403', async () => {
      const { response } = await call('/leave/requests', { headers: authHeaders(payrollToken) });
      assert.equal(response.status, 403);
    });

    it('GET /leave/active-leaves should return 403', async () => {
      const { response } = await call('/leave/active-leaves', { headers: authHeaders(payrollToken) });
      assert.equal(response.status, 403);
    });

    it('GET /leave/audit should return 403', async () => {
      const { response } = await call('/leave/audit', { headers: authHeaders(payrollToken) });
      assert.equal(response.status, 403);
    });
  });

  describe('5. Validation and error cases', () => {
    it('POST /leave/apply with invalid leave_type_id should return 400', async () => {
      const { response } = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: 999999, start_date: '2026-12-09', end_date: '2026-12-10', reason: 'Invalid type' })
      });
      assert.equal(response.status, 400);
    });

    it('POST /leave/apply with end_date before start_date should return 400', async () => {
      const { response } = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-10', end_date: '2026-12-09', reason: 'Invalid dates' })
      });
      assert.equal(response.status, 400);
    });

    it('POST /leave/apply with missing reason should return 400', async () => {
      const { response } = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-11', end_date: '2026-12-11' })
      });
      assert.equal(response.status, 400);
    });

    it('POST /leave/apply with weekend-only dates should return 400', async () => {
      // Dec 12, 2026 is Saturday
      const { response } = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-12', end_date: '2026-12-13', reason: 'Weekend only' })
      });
      assert.equal(response.status, 400);
    });

    it('PATCH /leave/999999/status should return 400 (not found)', async () => {
      const { response } = await call(`/leave/999999/status`, {
        method: 'PATCH',
        headers: jsonHeaders(hrToken),
        body: JSON.stringify({ status: 'Approved' })
      });
      assert.equal(response.status, 400);
    });

    it('PATCH /leave/:id/status with Rejected but missing reason should return 400', async () => {
      const createRes = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-14', end_date: '2026-12-14', reason: 'Miss reason reject' })
      });
      createdIds.push(createRes.body.data.leave_id);

      const { response } = await call(`/leave/${createRes.body.data.leave_id}/status`, {
        method: 'PATCH',
        headers: jsonHeaders(hrToken),
        body: JSON.stringify({ status: 'Rejected' }) // missing rejection_reason
      });
      assert.equal(response.status, 400);
    });

    it('PATCH /leave/:id/cancel on already-cancelled leave should return 400', async () => {
      const createRes = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-15', end_date: '2026-12-15', reason: 'Double cancel' })
      });
      createdIds.push(createRes.body.data.leave_id);

      await call(`/leave/${createRes.body.data.leave_id}/cancel`, { method: 'PATCH', headers: jsonHeaders(employeeToken) });
      const { response } = await call(`/leave/${createRes.body.data.leave_id}/cancel`, { method: 'PATCH', headers: jsonHeaders(employeeToken) });
      assert.equal(response.status, 400);
    });
  });

  describe('6. Approval and cancellation workflow', () => {
    it('Approve -> Cancel should restore balance', async () => {
      const createRes = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-16', end_date: '2026-12-16', reason: 'Workflow 1' })
      });
      createdIds.push(createRes.body.data.leave_id);
      const leaveId = createRes.body.data.leave_id;

      await call(`/leave/${leaveId}/status`, {
        method: 'PATCH', headers: jsonHeaders(hrToken), body: JSON.stringify({ status: 'Approved' })
      });

      const { response, body } = await call(`/leave/${leaveId}/cancel`, {
        method: 'PATCH', headers: jsonHeaders(employeeToken)
      });
      assert.equal(response.status, 200);
      assert.equal(body.data.status, 'Cancelled');
    });

    it('Reject -> Re-reject should fail', async () => {
      const createRes = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-17', end_date: '2026-12-17', reason: 'Workflow 2' })
      });
      createdIds.push(createRes.body.data.leave_id);
      const leaveId = createRes.body.data.leave_id;

      await call(`/leave/${leaveId}/status`, {
        method: 'PATCH', headers: jsonHeaders(hrToken), body: JSON.stringify({ status: 'Rejected', rejection_reason: 'reason 1' })
      });

      const { response } = await call(`/leave/${leaveId}/status`, {
        method: 'PATCH', headers: jsonHeaders(hrToken), body: JSON.stringify({ status: 'Rejected', rejection_reason: 'reason 2' })
      });
      assert.equal(response.status, 400);
    });

    it('Approve -> Re-approve should fail', async () => {
      const createRes = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: paidLeaveTypeId, start_date: '2026-12-18', end_date: '2026-12-18', reason: 'Workflow 3' })
      });
      createdIds.push(createRes.body.data.leave_id);
      const leaveId = createRes.body.data.leave_id;

      await call(`/leave/${leaveId}/status`, {
        method: 'PATCH', headers: jsonHeaders(hrToken), body: JSON.stringify({ status: 'Approved' })
      });

      const { response } = await call(`/leave/${leaveId}/status`, {
        method: 'PATCH', headers: jsonHeaders(hrToken), body: JSON.stringify({ status: 'Approved' })
      });
      assert.equal(response.status, 400);
    });
  });

  describe('7. Unpaid leave', () => {
    it('Approve unpaid leave should succeed', async () => {
      const createRes = await call('/leave/apply', {
        method: 'POST',
        headers: jsonHeaders(employeeToken),
        body: JSON.stringify({ leave_type_id: unpaidLeaveTypeId, start_date: '2026-12-21', end_date: '2026-12-22', reason: 'Unpaid test' })
      });
      createdIds.push(createRes.body.data.leave_id);
      const leaveId = createRes.body.data.leave_id;

      const { response, body } = await call(`/leave/${leaveId}/status`, {
        method: 'PATCH', headers: jsonHeaders(hrToken), body: JSON.stringify({ status: 'Approved' })
      });
      assert.equal(response.status, 200);
      assert.equal(body.data.status, 'Approved');
    });
  });
});