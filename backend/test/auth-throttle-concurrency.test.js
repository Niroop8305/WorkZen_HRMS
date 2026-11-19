import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { assertSafeSchemaName, migrationSteps } from "../src/database/setup/schemaSetup.js";

dotenv.config();

// Throttle-concurrency MEASUREMENT spike. It exists because the Step 1 design rests
// on InnoDB behaviors that have never been measured here, and HIGH-4 already hit one
// real gap-lock deadlock. This suite measures; it does not certify the future model.
//
// REFUSES TO RUN without an approved isolated scratch schema, and refuses outright
// if that schema is one of the protected databases or looks like a real dataset:
//
//   THROTTLE_CONCURRENCY_SCHEMA=<scratch_schema> npm run test:throttle:concurrency
//
// The schema must already exist - this suite never creates or drops a schema:
//   CREATE DATABASE auth_throttle_spike
//     CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
//
// What it writes is confined to `auth_throttle` inside that schema, and every bucket
// it touches is stamped `spike:<run id>:<case>`, so teardown reaps only this run's
// rows plus residue of the same suite from an earlier crashed run.
//
// It is deliberately NOT part of `npm test`: it is a database-writing suite.

const PROTECTED_SCHEMAS = ["workzen_hrms", "workzen_hrms_fresh", "workzen_hrms_demo"];
// If any of these exist in the target, the target is an application schema, not a
// scratch one, and the spike will not touch it.
const APP_TABLES = [
  "users",
  "employee_profiles",
  "attendance",
  "payroll",
  "leave_applications",
  "audit_logs",
];

const RUN_ID = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const TARGET = process.env.THROTTLE_CONCURRENCY_SCHEMA;

const requireApprovedScratchSchema = () => {
  if (!TARGET) {
    throw new Error(
      "REFUSING TO RUN: this suite writes rows. It needs an approved isolated scratch " +
        "schema, created once by an operator, and pointed at explicitly:\n" +
        "  CREATE DATABASE auth_throttle_spike CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;\n" +
        "  THROTTLE_CONCURRENCY_SCHEMA=auth_throttle_spike npm run test:throttle:concurrency\n" +
        "It is skipped nowhere and counts nothing when it does not run.",
    );
  }
  assertSafeSchemaName(TARGET);
  if (PROTECTED_SCHEMAS.includes(TARGET)) {
    throw new Error(`REFUSING TO RUN: ${TARGET} is a protected database.`);
  }
  if (process.env.DB_NAME && process.env.DB_NAME === TARGET) {
    throw new Error(
      `REFUSING TO RUN: DB_NAME points the running application at ${TARGET}; pick a schema nothing else uses.`,
    );
  }
  return TARGET;
};

const schema = requireApprovedScratchSchema();

// Candidate statements for the Step 2 model. Written out here, once, so the spike and
// the eventual model are testing the same SQL and nobody re-derives it from memory.
const CHARGE_NEW_WINDOW = `
  INSERT INTO auth_throttle (bucket, window_start, attempts, last_attempt_at)
  VALUES (?, NOW(), 1, NOW())
  ON DUPLICATE KEY UPDATE attempts = attempts + 1, last_attempt_at = NOW()`;
const CROSS_AFTER_INCREMENT = `
  INSERT INTO auth_throttle (bucket, window_start, attempts, last_attempt_at)
  VALUES (?, NOW(), 1, NOW())
  ON DUPLICATE KEY UPDATE attempts = attempts + 1,
    locked_until = IF(attempts >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until),
    last_attempt_at = NOW()`;
const CROSS_BEFORE_INCREMENT = `
  INSERT INTO auth_throttle (bucket, window_start, attempts, last_attempt_at)
  VALUES (?, NOW(), 1, NOW())
  ON DUPLICATE KEY UPDATE
    locked_until = IF(attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until),
    attempts = attempts + 1,
    last_attempt_at = NOW()`;
const RESET_AWARE_CHARGE = `
  INSERT INTO auth_throttle (bucket, window_start, attempts, last_attempt_at)
  VALUES (?, NOW(), 1, NOW())
  ON DUPLICATE KEY UPDATE
    attempts = IF(window_start > DATE_SUB(NOW(), INTERVAL ? MINUTE), attempts + 1, 1),
    window_start = IF(window_start > DATE_SUB(NOW(), INTERVAL ? MINUTE), window_start, NOW()),
    last_attempt_at = NOW()`;
const SWEEP = `
  DELETE FROM auth_throttle
  WHERE bucket LIKE ?
    AND last_attempt_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
    AND (locked_until IS NULL OR locked_until < NOW())
  LIMIT 1000`;

const THRESHOLD = 10;
const LOCKOUT_MINUTES = 15;
const WINDOW_MINUTES = 15;
const IDLE_RETENTION_MINUTES = 60;

const measurements = [];
const record = (name, value) => {
  measurements.push({ name, ...value });
  console.log(`MEASURE ${name} ${JSON.stringify(value)}`);
};

const connections = [];
const openConnection = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: schema,
  });
  connections.push(connection);
  return connection;
};

const bucket = (caseName, index) => `spike:${RUN_ID}:${caseName}:${index}`;
const casePrefix = (caseName) => `spike:${RUN_ID}:${caseName}:%`;

const readBucket = async (name) => {
  const connection = await openConnection();
  const [rows] = await connection.query(
    `SELECT attempts, window_start, locked_until, last_attempt_at
     FROM auth_throttle WHERE bucket = ?`,
    [name],
  );
  return rows[0] ?? null;
};

const rowCount = async (pattern) => {
  const connection = await openConnection();
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS total FROM auth_throttle WHERE bucket LIKE ?`,
    [pattern],
  );
  return row.total;
};

const seedBucket = async (name, { attempts, windowOffsetMinutes, lockedUntil, idleMinutes }) => {
  const connection = await openConnection();
  await connection.query(
    `INSERT INTO auth_throttle (bucket, window_start, attempts, locked_until, last_attempt_at)
     VALUES (?, DATE_SUB(NOW(), INTERVAL ? MINUTE), ?, ?,
             DATE_SUB(NOW(), INTERVAL ? MINUTE))
     ON DUPLICATE KEY UPDATE
       window_start = DATE_SUB(NOW(), INTERVAL ? MINUTE),
       attempts = VALUES(attempts),
       locked_until = VALUES(locked_until),
       last_attempt_at = DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [
      name,
      windowOffsetMinutes ?? 0,
      attempts,
      lockedUntil ?? null,
      idleMinutes ?? 0,
      windowOffsetMinutes ?? 0,
      idleMinutes ?? 0,
    ],
  );
};

// Runs `caller` K times in parallel on K separate connections, which is what makes
// InnoDB do the work a single pooled connection would serialize away.
const concurrent = async (caseName, caller) => {
  const workers = await Promise.all(
    Array.from({ length: 8 }, async (_, index) => {
      const connection = await openConnection();
      try {
        return await caller(connection, index);
      } catch (error) {
        return { ok: false, code: error.code ?? null, errno: error.errno ?? null, sqlState: error.sqlState ?? null };
      }
    }),
  );
  const failures = workers.filter((worker) => worker && worker.ok === false);
  return {
    successes: workers.length - failures.length,
    errors: failures.map((failure) => failure.code),
    caseName,
  };
};

const reapCase = async (caseName) => {
  const connection = await openConnection();
  const [result] = await connection.query(`DELETE FROM auth_throttle WHERE bucket LIKE ?`, [
    casePrefix(caseName),
  ]);
  return result.affectedRows;
};

before(async () => {
  const connection = await openConnection();
  const [[exists]] = await connection.query(
    `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [schema],
  );
  assert.ok(
    exists,
    `${schema} does not exist. Create it once (operator action): CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`,
  );

  const [foreignTables] = await connection.query(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME IN (?)`,
    [schema, APP_TABLES],
  );
  assert.equal(
    foreignTables.length,
    0,
    `${schema} holds application tables (${foreignTables.map((t) => t.name).join(", ")}); it is not a scratch schema`,
  );

  // Reap only this suite's own stamps, including residue of a crashed earlier run.
  await connection.query(`DELETE FROM auth_throttle WHERE bucket LIKE 'spike:%'`);
});

after(async () => {
  const connection = connections[0];
  if (connection) {
    await connection.query(`DELETE FROM auth_throttle WHERE bucket LIKE ?`, [`spike:${RUN_ID}:%`]);
  }
  for (const open of connections) {
    await open.end().catch(() => {});
  }
  console.log(`MEASUREMENTS ${JSON.stringify(measurements)}`);
});

describe("auth_throttle migration under a real race", () => {
  it("two processes both finding the table absent must not abort setup", async () => {
    const connection = await openConnection();
    const [presentBefore] = await connection.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_throttle'`,
      [schema],
    );
    const raceWindowExercised = presentBefore.length === 0;

    const step = migrationSteps.find((entry) => entry.id === "auth-throttle");
    const [first, second] = await Promise.allSettled([
      step.run(await openConnection(), schema),
      step.run(await openConnection(), schema),
    ]);

    for (const outcome of [first, second]) {
      assert.equal(
        outcome.status,
        "fulfilled",
        `a racing migration must not reject: ${outcome.reason?.message}`,
      );
    }
    const [presentAfter] = await connection.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_throttle'`,
      [schema],
    );
    assert.equal(presentAfter.length, 1, "the table is present exactly once");
    record("migration-race", {
      raceWindowExercised,
      reported: [first.value?.detail, second.value?.detail],
      note: raceWindowExercised
        ? "both calls ran while the table was absent (or nearly so)"
        : "table already present: this run did NOT exercise the race window",
    });
    if (!raceWindowExercised) {
      console.log(
        "NOTE the race window was not exercised because auth_throttle already existed. " +
          "Re-create the scratch schema to prove the concurrent create.",
      );
    }
  });
});

describe("concurrent counter writes", () => {
  it("charges a brand-new bucket K times without duplicating the row or inflating the counter", async () => {
    const target = bucket("first-touch", 0);
    const outcome = await concurrent("first-touch", async (connection) => {
      await connection.query(CHARGE_NEW_WINDOW, [target]);
      return { ok: true };
    });
    const row = await readBucket(target);

    assert.equal(await rowCount(casePrefix("first-touch")), 1, "exactly one row for one bucket");
    assert.ok(row, "the bucket exists");
    assert.equal(
      row.attempts,
      outcome.successes,
      `every surviving charge must be counted exactly once: successes=${outcome.successes}, attempts=${row.attempts}, errors=${JSON.stringify(outcome.errors)}`,
    );
    assert.ok(row.attempts <= 8, "the counter can never exceed the number of charges");
    record("first-touch", { ...outcome, attempts: row.attempts, windowStart: row.window_start });
  });

  it("charges an existing bucket K times with the same invariant", async () => {
    const target = bucket("existing", 0);
    await seedBucket(target, { attempts: 1 });
    const outcome = await concurrent("existing", async (connection) => {
      await connection.query(CHARGE_NEW_WINDOW, [target]);
      return { ok: true };
    });
    const row = await readBucket(target);

    assert.equal(await rowCount(casePrefix("existing")), 1);
    assert.equal(
      row.attempts,
      1 + outcome.successes,
      `no lost update: seeded 1 + ${outcome.successes} successes, attempts=${row.attempts}, errors=${JSON.stringify(outcome.errors)}`,
    );
    record("existing", { ...outcome, attempts: row.attempts });
  });

  it("sets the lockout exactly on the crossing charge, never before the threshold", async () => {
    const crossing = bucket("cross-after", 0);
    await seedBucket(crossing, { attempts: THRESHOLD - 1 });
    const outcome = await concurrent("cross-after", async (connection) => {
      await connection.query(CROSS_AFTER_INCREMENT, [crossing, THRESHOLD, LOCKOUT_MINUTES]);
      return { ok: true };
    });
    const row = await readBucket(crossing);

    assert.equal(row.attempts, THRESHOLD - 1 + outcome.successes);
    assert.ok(row.locked_until, "the threshold was reached, so the lockout must be stored");
    const minutesAhead =
      (new Date(row.locked_until).getTime() - Date.now()) / 60000;
    assert.ok(
      minutesAhead > LOCKOUT_MINUTES - 2 && minutesAhead <= LOCKOUT_MINUTES + 2,
      `lockout horizon must come from the DB clock: ${minutesAhead} minutes ahead`,
    );
    record("cross-after", { ...outcome, attempts: row.attempts, lockedUntil: row.locked_until });

    const below = bucket("cross-below", 0);
    await seedBucket(below, { attempts: 1 });
    await concurrent("cross-below", async (connection) => {
      await connection.query(CROSS_AFTER_INCREMENT, [below, THRESHOLD, LOCKOUT_MINUTES]);
      return { ok: true };
    });
    const belowRow = await readBucket(below);
    assert.ok(belowRow.attempts < THRESHOLD, `measured ${belowRow.attempts} attempts`);
    assert.equal(belowRow.locked_until, null, "below threshold the bucket must stay unlocked");
    record("cross-below", { attempts: belowRow.attempts });
  });

  it("measures whether ON DUPLICATE KEY UPDATE assignments see earlier assignments", async () => {
    // Step 2's threshold predicate depends on this: `attempts` on the right-hand side
    // of a later assignment may already be the incremented value. Measured, not assumed.
    const afterForm = bucket("order-after", 0);
    const beforeForm = bucket("order-before", 0);
    await seedBucket(afterForm, { attempts: THRESHOLD - 1 });
    await seedBucket(beforeForm, { attempts: THRESHOLD - 1 });

    const connection = await openConnection();
    await connection.query(CROSS_AFTER_INCREMENT, [afterForm, THRESHOLD, LOCKOUT_MINUTES]);
    await connection.query(CROSS_BEFORE_INCREMENT, [beforeForm, THRESHOLD, LOCKOUT_MINUTES]);

    const [a, b] = [await readBucket(afterForm), await readBucket(beforeForm)];
    assert.equal(a.attempts, THRESHOLD);
    assert.equal(b.attempts, THRESHOLD);
    record("assignment-order", {
      incrementThenPredicate: { attempts: a.attempts, locked: Boolean(a.locked_until) },
      predicateThenIncrement: { attempts: b.attempts, locked: Boolean(b.locked_until) },
      reading:
        a.locked_until && b.locked_until
          ? "both forms lock at the crossing charge"
          : "the two forms disagree - only one ordering is safe for the threshold",
    });
  });

  it("resets a stale window without inflating the counter beyond the charges", async () => {
    const target = bucket("window-reset", 0);
    await seedBucket(target, { attempts: 7, windowOffsetMinutes: WINDOW_MINUTES * 2 });
    const outcome = await concurrent("window-reset", async (connection) => {
      await connection.query(RESET_AWARE_CHARGE, [
        target,
        WINDOW_MINUTES,
        WINDOW_MINUTES,
      ]);
      return { ok: true };
    });
    const row = await readBucket(target);

    assert.equal(await rowCount(casePrefix("window-reset")), 1);
    assert.ok(row.attempts >= 1, "the reset window still has at least the first charge");
    assert.ok(
      row.attempts <= outcome.successes,
      `a reset must not multiply charges: attempts=${row.attempts}, successes=${outcome.successes}`,
    );
    assert.ok(
      new Date(row.window_start).getTime() > Date.now() - 60000,
      "the stale window must have moved to now",
    );
    record("window-reset", { ...outcome, attempts: row.attempts, windowStart: row.window_start });
  });

  it("never lets the retention sweep erase a live lockout or lose a charge", async () => {
    const idleUnlocked = bucket("sweep-idle", 0);
    const idleLocked = bucket("sweep-locked", 0);
    const inFlight = bucket("sweep-charge", 0);
    await seedBucket(idleUnlocked, { attempts: 3, idleMinutes: IDLE_RETENTION_MINUTES * 2 });
    await seedBucket(idleLocked, {
      attempts: THRESHOLD,
      idleMinutes: IDLE_RETENTION_MINUTES * 2,
      lockedUntil: new Date(Date.now() + 10 * 60000),
    });
    await seedBucket(inFlight, { attempts: 1 });

    const sweepAndCharge = await Promise.all([
      (async () => {
        const connection = await openConnection();
        const [result] = await connection.query(SWEEP, [
          `spike:${RUN_ID}:sweep-%`,
          IDLE_RETENTION_MINUTES,
        ]);
        return result.affectedRows;
      })(),
      concurrent("sweep-charge", async (connection) => {
        await connection.query(CHARGE_NEW_WINDOW, [inFlight]);
        return { ok: true };
      }),
    ]);
    const deleted = sweepAndCharge[0];
    const charged = sweepAndCharge[1];

    assert.equal(await readBucket(idleUnlocked), null, "an idle unlocked bucket is prunable");
    const lockedRow = await readBucket(idleLocked);
    assert.ok(
      lockedRow && new Date(lockedRow.locked_until).getTime() > Date.now(),
      "a live lockout must survive a sweep no matter how idle the bucket is",
    );
    const flightRow = await readBucket(inFlight);
    assert.ok(flightRow, "a bucket charged during a sweep still exists afterwards");
    assert.ok(
      flightRow.attempts >= 1 && flightRow.attempts <= 1 + charged.successes,
      `no lost or multiplied charge across a concurrent DELETE: attempts=${flightRow.attempts}, successes=${charged.successes}, deleted=${deleted}`,
    );
    record("sweep", {
      deleted,
      successes: charged.successes,
      errors: charged.errors,
      attemptsAfter: flightRow.attempts,
      lockedSurvived: Boolean(lockedRow),
    });
  });

  it("measures the deadlock cost of touching two namespaces in opposite orders", async () => {
    const fail = bucket("order-fail", 0);
    const req = bucket("order-req", 0);

    const runTx = async (firstBucket, secondBucket) => {
      const connection = await openConnection();
      try {
        await connection.query("START TRANSACTION");
        await connection.query(CHARGE_NEW_WINDOW, [firstBucket]);
        await connection.query(CHARGE_NEW_WINDOW, [secondBucket]);
        await connection.query("COMMIT");
        return { ok: true };
      } catch (error) {
        await connection.query("ROLLBACK").catch(() => {});
        return { ok: false, code: error.code ?? null, errno: error.errno ?? null };
      }
    };

    const opposite = await Promise.all([
      runTx(fail, req),
      runTx(req, fail),
      runTx(fail, req),
      runTx(req, fail),
    ]);
    const oppositeDeadlocks = opposite.filter((r) => r.code === "ER_LOCK_DEADLOCK").length;

    await reapCase("order-fail");
    const sorted = await Promise.all([
      runTx(bucket("order-fail", 1), bucket("order-req", 1)),
      runTx(bucket("order-fail", 1), bucket("order-req", 1)),
      runTx(bucket("order-fail", 1), bucket("order-req", 1)),
      runTx(bucket("order-fail", 1), bucket("order-req", 1)),
    ]);
    const sortedDeadlocks = sorted.filter((r) => r.code === "ER_LOCK_DEADLOCK").length;

    record("lock-order", {
      oppositeOrders: opposite.map((r) => r.code ?? "ok"),
      oppositeDeadlocks,
      sortedOrders: sorted.map((r) => r.code ?? "ok"),
      sortedDeadlocks,
      reading:
        sortedDeadlocks === 0
          ? "consistent order deadlocked none; Step 2 must sort buckets bytewise before locking"
          : "even consistent order deadlocked - the model needs a retry or a single-row path",
    });
    // Only an invariant, not a prediction: whichever order costs, the counters must
    // still be exact for the transactions that survived.
    const failRow = await readBucket(bucket("order-fail", 1));
    const survivors = sorted.filter((r) => r.ok).length;
    assert.equal(failRow.attempts, survivors, `attempts=${failRow?.attempts}, survivors=${survivors}`);
  });
});
