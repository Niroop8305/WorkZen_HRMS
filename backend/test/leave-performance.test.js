import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import pool from '../src/config/database.js';
import { requiredBaseUrl, guardExecutedTests } from './support/httpSuite.js';
import { assertScratchDatabase } from './support/dbGuard.js';

// T-007 tripwire first: this benchmark writes leave applications, audit rows
// and (on drift) repairs shared leave_balance rows, so it must never run
// against a protected application schema. Fails closed before any test
// registers.
assertScratchDatabase('leave-performance');

const base = requiredBaseUrl('LEAVE_API_URL', 'test:leave:perf');
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

// Teardown safety net. This benchmark writes leave applications and their audit
// trail through the shared demo employee, so it only removes rows it can prove
// it created, keeps a re-insertable backup of every audit row it deletes, and
// verifies that backup/restore round-trip before touching anything shared.
// Production Leave behavior is untouched.
const SELF_CHECK_RECORD_ID = -1;

const selectAuditRows = async (recordIds) => {
  if (recordIds.length === 0) return [];
  const placeholders = recordIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT log_id, user_id, action, table_name, record_id, old_value, new_value,
            ip_address, user_agent, created_at
     FROM audit_logs
     WHERE table_name = 'leave_applications' AND record_id IN (${placeholders})
     ORDER BY log_id`,
    recordIds
  );
  return rows;
};

const deleteAuditRowsByLogId = async (logIds) => {
  if (logIds.length === 0) return 0;
  const placeholders = logIds.map(() => '?').join(',');
  const [result] = await pool.query(
    `DELETE FROM audit_logs WHERE log_id IN (${placeholders})`,
    logIds
  );
  return result.affectedRows;
};

const restoreAuditRows = async (rows) => {
  for (const row of rows) {
    await pool.query(
      `INSERT INTO audit_logs
         (log_id, user_id, action, table_name, record_id, old_value, new_value,
          ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.log_id, row.user_id, row.action, row.table_name, row.record_id,
        row.old_value, row.new_value, row.ip_address, row.user_agent, row.created_at,
      ]
    );
  }
};

const selectBalances = async (userId) => {
  const [rows] = await pool.query(
    `SELECT balance_id, used_days, remaining_days
     FROM leave_balance WHERE user_id = ? ORDER BY balance_id`,
    [userId]
  );
  return rows;
};

// Nothing in the frozen Leave flow writes leave_balance (approval only reads it
// for eligibility), so drift here means something outside that design mutated
// the shared employee. Repair from the snapshot, verify, then fail loudly.
const restoreBalancesIfDrifted = async (userId, snapshot) => {
  if (!userId || snapshot.length === 0) return;
  const current = await selectBalances(userId);
  const drifted = snapshot.filter((row) => {
    const found = current.find((c) => c.balance_id === row.balance_id);
    return !found
      || String(found.used_days) !== String(row.used_days)
      || String(found.remaining_days) !== String(row.remaining_days);
  });
  const missing = current.filter((row) => !snapshot.some((s) => s.balance_id === row.balance_id));
  if (drifted.length === 0 && missing.length === 0) return;

  for (const row of drifted) {
    await pool.query(
      'UPDATE leave_balance SET used_days = ?, remaining_days = ? WHERE balance_id = ?',
      [row.used_days, row.remaining_days, row.balance_id]
    );
  }
  const after = await selectBalances(userId);
  assert.equal(after.length, snapshot.length,
    `balance rows for user ${userId} must match the snapshot count`);
  for (const row of snapshot) {
    const found = after.find((c) => c.balance_id === row.balance_id);
    assert.ok(found, `balance ${row.balance_id} must exist`);
    assert.equal(String(found.used_days), String(row.used_days),
      `used_days must be restored for balance ${row.balance_id}`);
    assert.equal(String(found.remaining_days), String(row.remaining_days),
      `remaining_days must be restored for balance ${row.balance_id}`);
  }
  throw new Error(
    `Repaired ${drifted.length} drifted leave_balance row(s) and found ${missing.length} ` +
    `unexpected extra row(s) for user ${userId}; the Leave flow is not expected to touch balances.`
  );
};

const verifyAuditBackupRestore = async () => {
  const [inserted] = await pool.query(
    `INSERT INTO audit_logs
       (user_id, action, table_name, record_id, old_value, new_value)
     VALUES (NULL, 'LEAVE_BENCHMARK_SELFCHECK', 'leave_applications', ?, 'before-restore', 'after-restore')`,
    [SELF_CHECK_RECORD_ID]
  );
  const logId = inserted.insertId;
  try {
    const backup = await selectAuditRows([SELF_CHECK_RECORD_ID]);
    assert.equal(backup.length, 1, 'the teardown selector must read back its own audit row');
    assert.equal(backup[0].log_id, logId, 'the selector must resolve to this run row only');
    assert.equal(
      await deleteAuditRowsByLogId(backup.map((row) => row.log_id)),
      1,
      'the teardown deleter must remove exactly the backed-up row'
    );
    await restoreAuditRows(backup);
    const restored = await selectAuditRows([SELF_CHECK_RECORD_ID]);
    assert.equal(restored.length, 1, 'the audit backup must restore');
    assert.equal(restored[0].log_id, logId, 'restore must keep the original log_id');
    assert.equal(restored[0].action, 'LEAVE_BENCHMARK_SELFCHECK', 'restore must keep the action');
    assert.equal(String(restored[0].old_value), 'before-restore', 'restore must keep old_value');
    assert.equal(String(restored[0].new_value), 'after-restore', 'restore must keep new_value');
  } finally {
    await deleteAuditRowsByLogId([logId]);
  }
};

describe('Leave Performance Benchmark', () => {
    let empToken, hrToken, empId, hrId, paidLeaveTypeId;
    const summary = [];
    const createdLeaves = [];

    // Tagged reasons make every row this suite writes traceable to this run, so
    // the only rows it ever deletes are provably its own. The same prefix also
    // matches rows written by older, untagged runs of this benchmark.
    const runTag = `perf-${Date.now()}-${process.pid}`;
    const reasonFor = (kind) => `Performance benchmark ${kind} ${runTag}`;
    const benchmarkReasonPrefix = 'Performance benchmark %';
    let balanceSnapshot = [];
    let preExistingLeaveIds = new Set();

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

        // Prove the safety net works before mutating anything shared.
        await verifyAuditBackupRestore();

        const [balanceRows] = await pool.query(
          'SELECT balance_id, used_days, remaining_days FROM leave_balance WHERE user_id = ? ORDER BY balance_id',
          [empId]
        );
        balanceSnapshot = balanceRows;

        // Rows left by an interrupted run would trip the overlap check and make
        // every apply in the benchmark return 400.
        const [leftovers] = await pool.query(
          `SELECT leave_id FROM leave_applications
           WHERE user_id = ? AND reason LIKE ?`,
          [empId, benchmarkReasonPrefix]
        );
        if (leftovers.length > 0) {
            const ids = leftovers.map((row) => row.leave_id);
            console.warn(`Sweeping ${ids.length} leftover benchmark leave row(s) from an interrupted run.`);
            const auditRows = await selectAuditRows(ids);
            await deleteAuditRowsByLogId(auditRows.map((row) => row.log_id));
            const placeholders = ids.map(() => '?').join(',');
            await pool.query(
              `DELETE FROM leave_applications WHERE leave_id IN (${placeholders})`,
              ids
            );
        }

        const [existing] = await pool.query(
          'SELECT leave_id FROM leave_applications WHERE user_id = ?',
          [empId]
        );
        preExistingLeaveIds = new Set(existing.map((row) => row.leave_id));
    });

    after(async () => {
        // Cleanup: verified, scoped, and reversible.
        let auditBackup = [];
        let teardownError = null;
        try {
            const ours = createdLeaves.filter((id) => !preExistingLeaveIds.has(id));
            assert.equal(ours.length, createdLeaves.length,
              'every tracked leave id must be one this run created');

            if (ours.length > 0) {
                auditBackup = await selectAuditRows(ours);
                const deleted = await deleteAuditRowsByLogId(auditBackup.map((row) => row.log_id));
                assert.equal(deleted, auditBackup.length,
                  'teardown must delete exactly the audit rows it backed up');

                const placeholders = ours.map(() => '?').join(',');
                const [leafDelete] = await pool.query(
                    `DELETE FROM leave_applications WHERE leave_id IN (${placeholders})`,
                    ours
                );
                assert.equal(leafDelete.affectedRows, ours.length,
                    `teardown must remove its own ${ours.length} benchmark leave row(s)`);

                const [survivors] = await pool.query(
                    `SELECT COUNT(*) n FROM leave_applications WHERE leave_id IN (${placeholders})`,
                    ours
                );
                assert.equal(Number(survivors[0].n), 0, 'no benchmark leave may survive teardown');
                assert.equal((await selectAuditRows(ours)).length, 0,
                    'no audit row may describe a removed benchmark leave');
            }
            await restoreBalancesIfDrifted(empId, balanceSnapshot);
        } catch (error) {
            teardownError = error;
            if (auditBackup.length > 0) {
                try {
                    await restoreAuditRows(auditBackup);
                    console.error('Leave benchmark teardown rolled its audit deletions back.');
                } catch (restoreError) {
                    console.error('Leave benchmark teardown could NOT restore its audit backup:', restoreError.message);
                }
            }
            console.error(
                `Leave benchmark teardown failed for user ${empId}: ${error.message}. ` +
                'Shared leave data needs manual review before the next run.'
            );
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
        if (teardownError) throw teardownError;
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
                    reason: reasonFor('apply')
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
                    reason: reasonFor('approval')
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
                    reason: reasonFor('cancel')
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

// Registered at module scope after the suites: the guard counts every case that
// actually ran and fails if the plan was not met, so a filtered or partially
// registered benchmark can never report green (httpSuite harness contract).
guardExecutedTests('leave-performance benchmark', 10);
