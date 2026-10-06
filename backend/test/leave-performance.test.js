import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import pool from '../src/config/database.js';

const base = process.env.LEAVE_API_URL;
const ITERATIONS = 20; // Number of iterations per endpoint
const MUTATION_ITERATIONS = 5;

const call = async (path, options = {}) => {
  const start = performance.now();
  const response = await fetch(`${base}${path}`, options);
  let body;
  try {
      body = await response.json();
  } catch (e) {
      body = null;
  }
  const elapsed = performance.now() - start;
  return { response, body, elapsed };
};

const percentile = (sorted, p) => {
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, i)];
};

const benchmark = async (label, fn, iterations = ITERATIONS) => {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn(i);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const result = {
    p50: percentile(times, 50).toFixed(1),
    p95: percentile(times, 95).toFixed(1),
    p99: percentile(times, 99).toFixed(1),
  };
  console.log(`  ${label}: p50=${result.p50}ms  p95=${result.p95}ms  p99=${result.p99}ms`);
  return { label, ...result };
};

describe('Leave Performance Benchmark', { skip: !base }, () => {
    let empToken, hrToken, empId, hrId, paidLeaveTypeId;
    const summary = [];
    const createdLeaves = [];

    // Distinct weekday dates in the current balance year (November 2026).
    const applyDates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
    const statusDates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
    const cancelDates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];

    before(async () => {
        // Authenticate
        const authEmp = await call('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'employee@workzen.demo', password: 'Employee@123' })
        });
        assert.equal(authEmp.response.status, 200, 'Employee login failed');
        empToken = authEmp.body.data.token;
        empId = authEmp.body.data.userId;

        const authHr = await call('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'hr@workzen.demo', password: 'Hr@123' })
        });
        assert.equal(authHr.response.status, 200, 'HR login failed');
        hrToken = authHr.body.data.token;
        hrId = authHr.body.data.userId;

        // Pick the paid leave type with the most remaining balance so the
        // benchmark exercises the real (balance-checked) apply/approve path.
        const balRes = await call('/leave/balance', { headers: { Authorization: `Bearer ${empToken}` } });
        const paid = (balRes.body.data || [])
            .filter((b) => b.is_paid === 1 || b.is_paid === true)
            .sort((a, b) => Number(b.remaining_days) - Number(a.remaining_days));
        assert.ok(paid.length > 0, 'No paid leave balance available for benchmark');
        paidLeaveTypeId = paid[0].leave_type_id;
    });

    after(async () => {
        // Cleanup
        if (createdLeaves.length > 0) {
            const placeholders = createdLeaves.map(() => '?').join(',');
            await pool.query(`DELETE FROM audit_logs WHERE record_id IN (${placeholders}) AND table_name = 'leave_applications'`, createdLeaves);
            await pool.query(`DELETE FROM leave_applications WHERE leave_id IN (${placeholders})`, createdLeaves);
        }

        console.log('\n========================================');
        console.log('Leave Performance Baseline');
        console.log('========================================');
        console.log('Endpoint                          p50     p95     p99');
        console.log('─────────────────────────────────────────────────────');
        for (const row of summary) {
            console.log(`${row.label.padEnd(32)}${row.p50.padStart(6)}ms  ${row.p95.padStart(6)}ms  ${row.p99.padStart(6)}ms`);
        }
        console.log('========================================\n');
        await pool.end();
    });

    it('GET /leave/types (employee token)', async () => {
        const res = await benchmark('GET /leave/types', async () => {
            await call('/leave/types', { headers: { Authorization: `Bearer ${empToken}` } });
        });
        summary.push(res);
    });

    it('GET /leave/balance (employee token)', async () => {
        const res = await benchmark('GET /leave/balance', async () => {
            await call('/leave/balance', { headers: { Authorization: `Bearer ${empToken}` } });
        });
        summary.push(res);
    });

    it('GET /leave/my-leaves (employee token)', async () => {
        const res = await benchmark('GET /leave/my-leaves', async () => {
            await call('/leave/my-leaves', { headers: { Authorization: `Bearer ${empToken}` } });
        });
        summary.push(res);
    });

    it('GET /leave/requests (HR token)', async () => {
        const res = await benchmark('GET /leave/requests', async () => {
            await call('/leave/requests', { headers: { Authorization: `Bearer ${hrToken}` } });
        });
        summary.push(res);
    });

    it('GET /leave/requests?status=Pending (HR token)', async () => {
        const res = await benchmark('GET /leave/requests?status=Pending', async () => {
            await call('/leave/requests?status=Pending', { headers: { Authorization: `Bearer ${hrToken}` } });
        });
        summary.push(res);
    });

    it('GET /leave/active-leaves (HR token)', async () => {
        const res = await benchmark('GET /leave/active-leaves', async () => {
            await call('/leave/active-leaves', { headers: { Authorization: `Bearer ${hrToken}` } });
        });
        summary.push(res);
    });

    it('GET /leave/audit (HR token)', async () => {
        const res = await benchmark('GET /leave/audit', async () => {
            await call('/leave/audit', { headers: { Authorization: `Bearer ${hrToken}` } });
        });
        summary.push(res);
    });

    it('POST /leave/apply (employee token)', async () => {
        const res = await benchmark('POST /leave/apply', async (i) => {
            const date = applyDates[i % applyDates.length];
            const applyRes = await call('/leave/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
                body: JSON.stringify({
                    leave_type_id: paidLeaveTypeId,
                    start_date: date,
                    end_date: date,
                    reason: 'Performance benchmark test'
                })
            });
            assert.equal(applyRes.response.status, 201, `apply failed: ${JSON.stringify(applyRes.body)}`);
            const leaveId = applyRes.body.data.leave_id;
            createdLeaves.push(leaveId);
            // Immediately cancel to keep the employee eligible for the next iteration.
            await call(`/leave/${leaveId}/cancel`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` }
            });
        }, MUTATION_ITERATIONS);
        summary.push(res);
    });

    it('PATCH /leave/:id/status (HR token)', async () => {
        const res = await benchmark('PATCH /leave/:id/status', async (i) => {
            const date = statusDates[i % statusDates.length];
            const applyRes = await call('/leave/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
                body: JSON.stringify({
                    leave_type_id: paidLeaveTypeId,
                    start_date: date,
                    end_date: date,
                    reason: 'Performance benchmark approval test'
                })
            });
            assert.equal(applyRes.response.status, 201, `apply failed: ${JSON.stringify(applyRes.body)}`);
            const leaveId = applyRes.body.data.leave_id;
            createdLeaves.push(leaveId);

            // Approve
            await call(`/leave/${leaveId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hrToken}` },
                body: JSON.stringify({ status: 'Approved' })
            });

            // Cancel for cleanup (restores balance) via the cancel endpoint.
            await call(`/leave/${leaveId}/cancel`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` }
            });
        }, MUTATION_ITERATIONS);
        summary.push(res);
    });

    it('PATCH /leave/:id/cancel (employee token)', async () => {
        const res = await benchmark('PATCH /leave/:id/cancel', async (i) => {
            const date = cancelDates[i % cancelDates.length];
            const applyRes = await call('/leave/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
                body: JSON.stringify({
                    leave_type_id: paidLeaveTypeId,
                    start_date: date,
                    end_date: date,
                    reason: 'Performance benchmark cancel test'
                })
            });
            assert.equal(applyRes.response.status, 201, `apply failed: ${JSON.stringify(applyRes.body)}`);
            const leaveId = applyRes.body.data.leave_id;
            createdLeaves.push(leaveId);

            // Cancel
            await call(`/leave/${leaveId}/cancel`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` }
            });
        }, MUTATION_ITERATIONS);
        summary.push(res);
    });
});
