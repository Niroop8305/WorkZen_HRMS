// Phase 2 regression suite for persistent login throttling, enumeration-resistant
// sign-in, and the race-safe session cap.
//
// It is database-free by construction: mysql2's createPool/createConnection are
// replaced with a scripted fake *before* any application module is imported, so
// the real driver is never asked for a connection and `after()` proves it. Every
// assertion is therefore about (a) the exact SQL and bind order the model emits,
// (b) the decision the controller makes from the state the storage reported, and
// (c) the keep-set arithmetic of the session cap under a single-threaded simulator.
//
// What this deliberately does NOT claim: that live InnoDB serializes the
// concurrent UPSERT, that a new-primary-key INSERT gap-locks the way the model
// hopes, or that MySQL's ON DUPLICATE KEY assignment order is what the statement
// was written to be independent of. Those are measured, not assumed, by
// `npm run test:throttle:concurrency`, which is approval-gated on a scratch schema.

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const realCreatePool = mysql.createPool;
const realCreateConnection = mysql.createConnection;

const driverCalls = [];
const fakeQueries = [];

let handler = () => [[]];

const normalize = (sql) => sql.replace(/\s+/g, " ").trim();

const fakeConnection = {
  inTransaction: false,
  async query(sql, params = []) {
    const statement = normalize(sql);
    fakeQueries.push({ sql: statement, params });
    // mysql2 formats only as many bind values as there are placeholders and
    // silently drops the rest. A dropped value can remove a condition - the
    // `session_id NOT IN (...)` list, or a bucket key - so the fake refuses any
    // mismatch instead of letting a truncated statement look like a pass.
    const placeholders = (statement.match(/\?/g) || []).length;
    if (placeholders !== params.length) {
      throw new Error(
        `FAKE DRIVER: ${placeholders} placeholder(s) but ${params.length} bind value(s) in ${statement.slice(0, 90)}`,
      );
    }
    const result = await handler(statement, params);
    if (result instanceof Error) throw result;
    return result;
  },
  async beginTransaction() {
    this.inTransaction = true;
    fakeQueries.push({ transaction: "begin" });
  },
  async commit() {
    this.inTransaction = false;
    fakeQueries.push({ transaction: "commit" });
  },
  async rollback() {
    this.inTransaction = false;
    fakeQueries.push({ transaction: "rollback" });
  },
  release() {
    fakeQueries.push({ transaction: "release" });
  },
};

const fakePool = {
  query: (sql, params) => fakeConnection.query(sql, params),
  getConnection: async () => fakeConnection,
};

mysql.createPool = (config) => {
  driverCalls.push("createPool");
  return fakePool;
};
mysql.createConnection = () => {
  driverCalls.push("createConnection");
  throw new Error("the fake driver must not open a connection");
};

// A JWT secret is required for the module under test to derive a bucket key. This
// mutates only the process environment of this test process; no .env file is read
// or written, and the original value is restored in after().
const originalJwtSecret = process.env.JWT_SECRET;
const originalThrottleKey = process.env.THROTTLE_DIGEST_KEY;
process.env.JWT_SECRET = "unit-test-secret-material-that-is-long-enough-32";
delete process.env.THROTTLE_DIGEST_KEY;

const {
  ACCOUNT_LOCKED_ACTION,
  buildFailureBucket,
  clearFailedCredentials,
  evaluateLoginAttempt,
  recordFailedCredential,
  recordLockoutAudit,
  sweepExpiredBuckets,
} = await import("../src/models/loginThrottleModel.js");
const {
  FAILED_CREDENTIAL_NAMESPACE,
  MAX_FAILED_LOGINS,
  resetThrottleDigestKeyCache,
} = await import("../src/config/throttleConfig.js");
const { Session } = await import("../src/models/sessionModel.js");
const authController = await import("../src/controllers/authController.js");
const { User } = await import("../src/models/userModel.js");

after(() => {
  mysql.createPool = realCreatePool;
  mysql.createConnection = realCreateConnection;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalThrottleKey === undefined) delete process.env.THROTTLE_DIGEST_KEY;
  else process.env.THROTTLE_DIGEST_KEY = originalThrottleKey;
  resetThrottleDigestKeyCache();

  assert.deepEqual(
    driverCalls.filter((call) => call === "createConnection"),
    [],
    "the suite must never open a standalone MySQL connection",
  );
  assert.ok(
    driverCalls.length > 0 && driverCalls.every((call) => call === "createPool"),
    "every driver request must have been the stubbed pool, never a connection",
  );
});

const reset = (next) => {
  fakeQueries.length = 0;
  handler = next || (() => [[]]);
};

const emitted = (fragment) =>
  fakeQueries.filter((entry) => entry.sql?.includes(fragment));

const respond = (rowsByFragment) => (sql) => {
  for (const [fragment, value] of Object.entries(rowsByFragment)) {
    if (sql.includes(fragment)) return value;
  }
  return [[]];
};

const makeRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    set(header, value) {
      res.headers[header] = value;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const callLogin = async (body, ip = "203.0.113.7") => {
  const res = makeRes();
  await authController.login(
    { body, ip, get: (name) => (name === "user-agent" ? "UnitRunner" : undefined) },
    res,
  );
  return { status: res.statusCode, body: res.body, headers: res.headers };
};

describe("failure bucket identity", () => {
  it("keys on a digest, not on the address it protects", () => {
    reset();
    const bucket = buildFailureBucket("Reviewer@Example.Test");
    assert.ok(bucket.startsWith(FAILED_CREDENTIAL_NAMESPACE));
    assert.ok(!bucket.includes("Reviewer"));
    assert.ok(!bucket.includes("@"));
    assert.ok(Buffer.byteLength(bucket) <= 96, "must fit VARBINARY(96)");
  });

  it("collapses the spellings the collation-equivalent lookup would match", () => {
    reset();
    // users.email is compared case-insensitively, so these are one account. If the
    // bucket were not normalized the same way, changing the casing of one address
    // would hand the caller a fresh counter.
    const variants = [
      "attacker@example.test",
      "Attacker@Example.TEST",
      "  attacker@example.test  ",
    ];
    const buckets = new Set(variants.map((email) => buildFailureBucket(email)));
    assert.equal(buckets.size, 1, "case and padding must not fork the bucket");
  });

  it("keeps distinct accounts in distinct buckets", () => {
    reset();
    assert.notEqual(
      buildFailureBucket("a@example.test"),
      buildFailureBucket("b@example.test"),
    );
  });

  it("refuses an address that cannot match a user row", () => {
    reset();
    assert.equal(buildFailureBucket("x".repeat(256)), null);
    assert.equal(buildFailureBucket(""), null);
    assert.equal(buildFailureBucket(undefined), null);
  });

  it("reports the store as unavailable rather than unthrottled when no key exists", async () => {
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "short";
    resetThrottleDigestKeyCache();
    try {
      reset();
      const gate = await evaluateLoginAttempt("nobody@example.test");
      assert.equal(gate.storeUnavailable, true);
      assert.equal(
        emitted("SELECT").length,
        0,
        "a missing key must not fall through to a database read",
      );
    } finally {
      process.env.JWT_SECRET = saved;
      resetThrottleDigestKeyCache();
    }
  });
});

describe("gate read", () => {
  it("refuses while the lockout clock the server reported is still running", async () => {
    reset(respond({ lockout_seconds: [[{ lockout_seconds: 420, window_attempts: 0 }]] }));
    const gate = await evaluateLoginAttempt("locked@example.test");
    assert.equal(gate.allowed, false);
    assert.equal(gate.locked, true);
    assert.equal(gate.retryAfterSeconds, 420);
  });

  it("refuses at the threshold even if a lockout row is missing", async () => {
    reset(respond({ lockout_seconds: [[{ lockout_seconds: 0, window_attempts: MAX_FAILED_LOGINS }]] }));
    const gate = await evaluateLoginAttempt("tensecond@example.test");
    assert.equal(gate.allowed, false);
  });

  it("allows one below the threshold", async () => {
    reset(respond({ lockout_seconds: [[{ lockout_seconds: 0, window_attempts: 9 }]] }));
    const gate = await evaluateLoginAttempt("nine@example.test");
    assert.equal(gate.allowed, true);
    assert.equal(gate.attempts, 9);
    assert.equal(gate.wasLocked, false);
  });

  it("asks the database clock, never the process clock", () => {
    reset(respond({ lockout_seconds: [[{ lockout_seconds: 0, window_attempts: 0 }]] }));
    return evaluateLoginAttempt("clock@example.test").then(() => {
      const gateQuery = emitted("FROM auth_throttle")[0];
      assert.ok(gateQuery.sql.includes("CURRENT_TIMESTAMP"));
      assert.ok(gateQuery.sql.includes("DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)"));
      assert.ok(
        !/new Date|Date\.now/.test(gateQuery.sql),
        "the gate cannot contain application time",
      );
      assert.deepEqual(gateQuery.params[0], 15, "window minutes are bound, not inline");
    });
  });

  it("fails closed when the storage cannot answer", async () => {
    reset(() => new Error("ER_NO_SUCH_TABLE: Table 'workzen_hrms.auth_throttle' doesn't exist"));
    const gate = await evaluateLoginAttempt("atable@example.test");
    assert.equal(gate.storeUnavailable, true);
  });
});

describe("failure charge", () => {
  it("is one atomic statement with no read that could under-count a burst", async () => {
    reset(respond({ lockout_seconds: [[{ lockout_seconds: 0, window_attempts: 3 }]] }));
    await recordFailedCredential(`${FAILED_CREDENTIAL_NAMESPACE}abc`);
    const charge = emitted("ON DUPLICATE KEY UPDATE");
    assert.equal(charge.length, 1, "exactly one charging statement");
    const touched = fakeQueries.filter((entry) => entry.sql?.includes("auth_throttle"));
    assert.equal(touched.length, 2, "one write, then one read of what the server decided");
    assert.ok(
      touched[0].sql.includes("ON DUPLICATE KEY UPDATE"),
      "the counter is written before anything reads it, so a parallel burst cannot both see nine",
    );
  });

  it("derives every column from pre-statement values so assignment order cannot matter", () => {
    reset(respond({ lockout_seconds: [[{ lockout_seconds: 0, window_attempts: 1 }]] }));
    return recordFailedCredential(`${FAILED_CREDENTIAL_NAMESPACE}abc`).then(() => {
      const charge = emitted("ON DUPLICATE KEY UPDATE")[0].sql;
      const windowAssignment = charge.lastIndexOf("window_start = IF(");
      const attemptsAssignment = charge.lastIndexOf("attempts = IF(");
      const lockoutAssignment = charge.lastIndexOf("locked_until = IF(");
      assert.ok(windowAssignment > attemptsAssignment, "window_start must be written last");
      assert.ok(attemptsAssignment > lockoutAssignment, "attempts must follow locked_until");
      // Each column is written exactly once. A second `attempts = ...` after
      // window_start would silently move a read of the reset value into a later
      // assignment, which is the ordering this statement is written to avoid.
      for (const column of ["locked_until", "attempts", "window_start", "last_attempt_at"]) {
        assert.equal(
          (charge.match(new RegExp(`${column} = `, "g")) || []).length,
          1,
          `${column} must have exactly one assignment`,
        );
      }
      // Each derived expression re-tests the window itself instead of trusting a
      // reset that an earlier assignment may or may not have performed.
      assert.equal(
        (charge.match(/window_start < DATE_SUB\(CURRENT_TIMESTAMP, INTERVAL \? MINUTE\)/g) || [])
          .length,
        3,
        "rollover must be recomputed, not read back",
      );
    });
  });

  it("binds the policy numbers and applies the lockout at the threshold", () => {
    reset(respond({ lockout_seconds: [[{ lockout_seconds: 0, window_attempts: 1 }]] }));
    return recordFailedCredential(`${FAILED_CREDENTIAL_NAMESPACE}abc`).then(() => {
      const charge = emitted("ON DUPLICATE KEY UPDATE")[0];
      assert.deepEqual(charge.params, [
        `${FAILED_CREDENTIAL_NAMESPACE}abc`,
        15,
        MAX_FAILED_LOGINS,
        15,
        15,
        15,
      ]);
      assert.ok(charge.sql.includes(">= ?"), "threshold is a bound comparison");
      assert.ok(charge.sql.includes("DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)"));
    });
  });

  it("carries the server-reported lockout back to the caller", async () => {
    reset(respond({ lockout_seconds: [[{ lockout_seconds: 900, window_attempts: MAX_FAILED_LOGINS }]] }));
    const result = await recordFailedCredential(`${FAILED_CREDENTIAL_NAMESPACE}abc`);
    assert.equal(result.locked, true);
    assert.equal(result.retryAfterSeconds, 900);
  });

  it("reports an unusable store instead of assuming the attempt was counted", async () => {
    reset((sql) => (sql.includes("ON DUPLICATE KEY") ? new Error("deadlock") : [[]]));
    const result = await recordFailedCredential(`${FAILED_CREDENTIAL_NAMESPACE}abc`);
    assert.equal(result.storeUnavailable, true);
  });
});

describe("successful-login clearing", () => {
  it("deletes only the failure bucket for this account", async () => {
    reset();
    const result = await clearFailedCredentials("user@example.test");
    assert.equal(result.cleared, true);
    const [statement] = fakeQueries;
    assert.ok(statement.sql.startsWith("DELETE FROM auth_throttle WHERE bucket = ?"));
    assert.equal(statement.params.length, 1);
    assert.ok(statement.params[0].startsWith(FAILED_CREDENTIAL_NAMESPACE));
  });

  it("announces when the clear could not be written", async () => {
    reset(() => new Error("lock wait timeout"));
    const result = await clearFailedCredentials("user@example.test");
    assert.equal(result.cleared, false);
    assert.equal(result.storeUnavailable, true);
  });
});

describe("lockout audit and retention", () => {
  it("records the transition, not the attempt, and never references a user id", async () => {
    reset();
    await recordLockoutAudit({
      bucket: `${FAILED_CREDENTIAL_NAMESPACE}deadbeef`,
      ipAddress: "203.0.113.7",
      userAgent: "UnitRunner",
    });
    const insert = fakeQueries[0];
    assert.ok(insert.sql.includes("INSERT INTO audit_logs"));
    assert.equal(insert.params[0], ACCOUNT_LOCKED_ACTION);
    assert.ok(insert.sql.includes("VALUES (NULL, ?"));
    assert.ok(insert.params.includes(`${FAILED_CREDENTIAL_NAMESPACE}deadbeef`));
  });

  it("does not turn a working lockout into a login outage when the audit write fails", async () => {
    reset(() => new Error("audit_logs is not writable"));
    const result = await recordLockoutAudit({ bucket: "acct:fail:x" });
    assert.equal(result.recorded, false);
  });

  it("sweeps only idle buckets and never an active lockout", async () => {
    reset(respond({ "SELECT COUNT(*)": [[{ total: 40 }]] }));
    const result = await sweepExpiredBuckets();
    const deletes = fakeQueries.filter((entry) => entry.sql?.startsWith("DELETE"));
    assert.equal(deletes.length, 1, "under the cap only the idle sweep runs");
    for (const statement of deletes) {
      assert.ok(
        statement.sql.includes(
          "(locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)",
        ),
        "every deletion path must exclude a live lockout",
      );
    }
    assert.equal(result.total, 40);
    assert.equal(result.capRemoved, 0);
  });

  it("trims an over-cap table from the oldest inactive rows only", async () => {
    reset(respond({ "SELECT COUNT(*)": [[{ total: 100050 }]] }));
    const result = await sweepExpiredBuckets({ rowCap: 100000 });
    const capDelete = fakeQueries.filter((entry) => entry.sql?.startsWith("DELETE"))[1];
    assert.ok(capDelete.sql.includes("ORDER BY last_attempt_at ASC"));
    assert.ok(capDelete.sql.includes("LIMIT ?"));
    assert.equal(capDelete.params[0], 50);
    assert.ok(
      capDelete.sql.includes(
        "(locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)",
      ),
      "the cap must not be bought with active lockouts",
    );
    assert.equal(result.total, 100000);
  });
});

describe("login controller", () => {
  const REAL_HASH = "$2a$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvwxy";

  const stubCompare = (onCompare, result = false) => {
    const real = bcrypt.compare;
    bcrypt.compare = async (candidate, hash) => {
      onCompare?.(hash);
      return result;
    };
    return () => {
      bcrypt.compare = real;
    };
  };

  const stubUsers = (lookup) => {
    const real = User.findByEmail;
    User.findByEmail = async (email) => lookup(email);
    return () => {
      User.findByEmail = real;
    };
  };

  const gateState = (state) =>
    respond({
      "FROM auth_throttle": [
        [
          {
            window_attempts: state.attempts ?? 0,
            lockout_seconds: state.lockoutSeconds ?? 0,
          },
        ],
      ],
      ...state.extra,
    });

  it("rejects a malformed request before spending any throttle work", async () => {
    reset();
    const restore = stubUsers(() => {
      throw new Error("must not look the account up");
    });
    try {
      const missing = await callLogin({ email: "", password: "x" });
      assert.equal(missing.status, 400);

      const oversized = await callLogin({
        email: `${"a".repeat(250)}@example.test`,
        password: "x",
      });
      assert.equal(oversized.status, 400);
      assert.equal(fakeQueries.length, 0, "no query for a request that cannot match");
    } finally {
      restore();
    }
  });

  it("answers a locked bucket with 429 and never reaches the password", async () => {
    reset(gateState({ attempts: MAX_FAILED_LOGINS, lockoutSeconds: 660 }));
    let compared = false;
    const restoreCompare = stubCompare(() => {
      compared = true;
    });
    const restoreUsers = stubUsers(() => {
      throw new Error("must not look the account up while locked");
    });
    try {
      const response = await callLogin({
        email: "locked@example.test",
        password: "whatever",
      });
      assert.equal(response.status, 429);
      assert.equal(response.headers["Retry-After"], "660");
      assert.equal(compared, false);
      assert.equal(emitted("FROM users").length, 0);
      assert.equal(
        emitted("ON DUPLICATE KEY").length,
        0,
        "a refused request must not extend the failure window",
      );
      assert.ok(!JSON.stringify(response.body).includes("660"));
    } finally {
      restoreCompare();
      restoreUsers();
    }
  });

  it("fails closed with 503 when the throttle store is unreadable", async () => {
    reset(() => new Error("ER_NO_SUCH_TABLE: Table 'workzen_hrms.auth_throttle' doesn't exist"));
    const response = await callLogin({
      email: "someone@example.test",
      password: "whatever",
    });
    assert.equal(response.status, 503);
    assert.ok(!JSON.stringify(response.body).includes("auth_throttle"));
    assert.ok(!JSON.stringify(response.body).includes("ER_NO_SUCH_TABLE"));
    assert.equal(emitted("FROM users").length, 0);
  });

  it("compares a dummy hash for an unknown address and still charges it", async () => {
    let comparedHash = null;
    reset(
      gateState({
        attempts: 0,
        extra: { "FROM users u": [[]] },
      }),
    );
    const restoreCompare = stubCompare((hash) => {
      comparedHash = hash;
    });
    try {
      const response = await callLogin({
        email: "ghost@example.test",
        password: "guess",
      });
      assert.equal(response.status, 401);
      assert.deepEqual(response.body, { success: false, message: "Invalid credentials" });
      assert.ok(comparedHash, "the unknown path must still run bcrypt");
      assert.match(comparedHash, /^\$2[aby]\$10\$/, "dummy digest must cost what real ones cost");
      const charge = emitted("ON DUPLICATE KEY UPDATE");
      assert.equal(charge.length, 1, "an unknown address cannot be a free guess");
      assert.ok(charge[0].params[0].startsWith(FAILED_CREDENTIAL_NAMESPACE));
    } finally {
      restoreCompare();
    }
  });

  it("gives the unknown address and the wrong password the same answer", async () => {
    // One handler, two lookups: the existing account must really exist in the
    // fixture, or this only proves two identical misses look identical.
    const existing = {
      user_id: 9,
      email: "someone@example.test",
      password_hash: REAL_HASH,
      is_active: 1,
      role_id: 2,
      role_name: "Employee",
    };
    fakeQueries.length = 0;
    handler = (sql, params) => {
      if (sql.includes("FROM auth_throttle")) {
        return [[{ window_attempts: 2, lockout_seconds: 0 }]];
      }
      if (sql.includes("FROM users u")) {
        return params[0] === "someone@example.test" ? [[existing]] : [[]];
      }
      return [[]];
    };
    const restoreCompare = stubCompare();
    try {
      const ghost = await callLogin({ email: "ghost@example.test", password: "guess" });
      const wrong = await callLogin({
        email: "someone@example.test",
        password: "wrong",
      });
      assert.deepEqual(wrong.body, ghost.body);
      assert.equal(wrong.status, ghost.status);
      assert.equal(wrong.status, 401);
    } finally {
      restoreCompare();
    }
  });

  it("verifies the password before revealing that the account is closed", async () => {
    const inactive = {
      user_id: 42,
      email: "off@example.test",
      password_hash: REAL_HASH,
      is_active: 0,
      role_id: 2,
      role_name: "Employee",
    };
    let comparedHash = null;
    reset(
      gateState({
        attempts: 3,
        extra: { "FROM users u": [[inactive]] },
      }),
    );
    const restoreCompare = stubCompare(
      (hash) => {
        comparedHash = hash;
      },
      // The credentials are correct; only the account is closed.
      true,
    );
    try {
      const response = await callLogin({
        email: "off@example.test",
        password: "the-real-password",
      });
      assert.ok(comparedHash, "deactivation must not be answered before the password");
      assert.equal(comparedHash, REAL_HASH);
      assert.equal(response.status, 403);
      assert.equal(
        emitted("ON DUPLICATE KEY").length,
        0,
        "correct credentials on a closed account are not a failed credential",
      );
      assert.equal(
        emitted("DELETE FROM auth_throttle").length,
        0,
        "a closed account has no successful authentication to reward",
      );
    } finally {
      restoreCompare();
    }
  });

  it("charges the tenth wrong password and locks the account out", async () => {
    const active = {
      user_id: 7,
      email: "on@example.test",
      password_hash: REAL_HASH,
      is_active: 1,
      role_id: 2,
      role_name: "Employee",
    };
    reset();
    // The gate read and the post-charge read are the same statement, so the
    // fixture answers them by sequence: nine and unlocked going in, ten and
    // locked coming out. That is the transition this case is about.
    let throttleReads = 0;
    handler = (sql) => {
      if (sql.includes("FROM auth_throttle") && sql.startsWith("SELECT")) {
        throttleReads += 1;
        return throttleReads === 1
          ? [[{ window_attempts: MAX_FAILED_LOGINS - 1, lockout_seconds: 0 }]]
          : [[{ window_attempts: MAX_FAILED_LOGINS, lockout_seconds: 900 }]];
      }
      if (sql.includes("FROM users u")) return [[active]];
      if (sql.includes("ON DUPLICATE KEY")) return [{ affectedRows: 1 }];
      if (sql.startsWith("INSERT INTO audit_logs")) return [{ insertId: 1 }];
      return [[]];
    };
    const restoreCompare = stubCompare();
    try {
      const response = await callLogin({ email: "on@example.test", password: "nope" });
      assert.equal(response.status, 401);
      const audit = emitted("INSERT INTO audit_logs");
      assert.equal(audit.length, 1, "the lockout transition is the one audited event");
      assert.equal(audit[0].params[0], ACCOUNT_LOCKED_ACTION);
    } finally {
      restoreCompare();
    }
  });

  it("does not audit a lockout that was already in force", async () => {
    const active = {
      user_id: 7,
      email: "on@example.test",
      password_hash: REAL_HASH,
      is_active: 1,
      role_id: 2,
      role_name: "Employee",
    };
    reset(
      gateState({
        attempts: MAX_FAILED_LOGINS,
        extra: { "FROM users u": [[active]] },
      }),
    );
    const restoreCompare = stubCompare();
    try {
      const response = await callLogin({ email: "on@example.test", password: "nope" });
      // The gate refused it, so this is the 429 shape, and no audit row was written.
      assert.equal(response.status, 429);
      assert.equal(emitted("INSERT INTO audit_logs").length, 0);
    } finally {
      restoreCompare();
    }
  });

  it("clears the failure bucket and opens a capped session on success", async () => {
    const active = {
      user_id: 7,
      email: "on@example.test",
      password_hash: REAL_HASH,
      is_active: 1,
      role_id: 2,
      role_name: "Employee",
    };
    reset(
      gateState({
        attempts: 4,
        extra: {
          "FROM users u": [[active]],
          "UPDATE users SET last_login": [{ affectedRows: 1 }],
          "FROM employee_profiles": [[]],
          "INSERT INTO user_sessions": [{ insertId: 501, affectedRows: 1 }],
          "ORDER BY issued_at DESC": [[{ session_id: 501 }]],
          "UPDATE user_sessions": [{ affectedRows: 0 }],
          "SELECT user_id FROM users": [[{ user_id: 7 }]],
          "DELETE FROM auth_throttle": [{ affectedRows: 1 }],
        },
      }),
    );
    const realCompare = bcrypt.compare;
    bcrypt.compare = async () => true;
    try {
      const response = await callLogin({
        email: "on@example.test",
        password: "correct",
      });
      assert.equal(response.status, 200);
      assert.equal(emitted("DELETE FROM auth_throttle").length, 1);
      assert.ok(
        emitted("INSERT INTO user_sessions").length === 1,
        "login opens exactly one session",
      );
      assert.ok(response.body.data.token, "a session-bound token is returned");
      assert.equal(response.body.data.sessionId, 501);
    } finally {
      bcrypt.compare = realCompare;
    }
  });

  it("refuses to issue a token when the failure window could not be cleared", async () => {
    const active = {
      user_id: 7,
      email: "on@example.test",
      password_hash: REAL_HASH,
      is_active: 1,
      role_id: 2,
      role_name: "Employee",
    };
    reset(
      gateState({
        attempts: 4,
        extra: { "FROM users u": [[active]] },
      }),
    );
    const realCompare = bcrypt.compare;
    bcrypt.compare = async () => true;
    const realQuery = fakeConnection.query;
    fakeConnection.query = async (sql, params = []) => {
      if (normalize(sql).startsWith("DELETE FROM auth_throttle")) {
        throw new Error("deadlock found when trying to get lock");
      }
      return realQuery(sql, params);
    };
    try {
      const response = await callLogin({
        email: "on@example.test",
        password: "correct",
      });
      assert.equal(response.status, 503);
      assert.equal(
        emitted("INSERT INTO user_sessions").length,
        0,
        "no session while the throttle state is unknown",
      );
      assert.ok(!JSON.stringify(response.body).includes("deadlock"));
    } finally {
      fakeConnection.query = realQuery;
      bcrypt.compare = realCompare;
    }
  });

  it("never echoes a driver error to an unauthenticated caller", async () => {
    reset(gateState({ attempts: 0 }));
    const realCompare = bcrypt.compare;
    bcrypt.compare = async () => {
      throw new Error(
        "ER_ACCESS_DENIED_ERROR: Access denied for user 'workzen'@'localhost'",
      );
    };
    const restoreUsers = stubUsers(() => ({
      user_id: 7,
      email: "on@example.test",
      password_hash: REAL_HASH,
      is_active: 1,
      role_id: 2,
      role_name: "Employee",
    }));
    try {
      const response = await callLogin({ email: "on@example.test", password: "x" });
      assert.equal(response.status, 500);
      const body = JSON.stringify(response.body);
      assert.ok(!body.includes("ER_ACCESS_DENIED"));
      assert.ok(!body.includes("workzen"));
      assert.ok(!body.includes("password_hash"));
      assert.equal(response.body.error, undefined, "no raw error in the response");
    } finally {
      bcrypt.compare = realCompare;
      restoreUsers();
    }
  });
});

describe("session cap", () => {
  const liveSessions = (count, firstId = 100) =>
    Array.from({ length: count }, (_, index) => ({ session_id: firstId + index }));

  const captureCreate = (userId, { live, capOptions } = {}) => {
    fakeQueries.length = 0;
    const keep = liveSessions(Math.min(live.length + 1, 5));
    handler = (sql, params) => {
      if (sql.startsWith("SELECT user_id FROM users")) return [[{ user_id: userId }]];
      if (sql.startsWith("INSERT INTO user_sessions")) {
        return [{ insertId: 999, affectedRows: 1 }];
      }
      // T-002: the absolute window is stamped right after the INSERT.
      if (sql.includes("SET expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)")) {
        return [{ affectedRows: 1 }];
      }
      // T-002: already-expired rows are revoked before the cap counts.
      if (sql.includes("expires_at <= NOW()")) {
        return [{ affectedRows: 0 }];
      }
      if (sql.includes("ORDER BY session_id DESC")) {
        return [
          live
            .concat([{ session_id: 999 }])
            .sort((a, b) => b.session_id - a.session_id)
            .slice(0, 5),
        ];
      }
      if (sql.startsWith("UPDATE user_sessions")) {
        return [
          {
            affectedRows: Math.max(0, live.length + 1 - keep.length),
            revokedParams: params,
          },
        ];
      }
      return [[]];
    };
    return Session.create(userId, capOptions).then((sessionId) => ({
      sessionId,
    }));
  };

  it("serializes concurrent logins for one account on the user row", async () => {
    await captureCreate(7, { live: liveSessions(5) });
    const order = fakeQueries
      .filter((entry) => entry.sql || entry.transaction)
      .map((entry) => entry.transaction ?? entry.sql.split(" ")[0]);
    assert.equal(order[0], "begin", "the cap is enforced inside a transaction");
    const lock = emitted("SELECT user_id FROM users")[0];
    assert.ok(lock.sql.endsWith("FOR UPDATE"), "the account row is the mutex");
    assert.deepEqual(lock.params, [7]);
    assert.ok(
      emitted("SELECT user_id FROM users")[0].sql.length > 0 &&
        fakeQueries.findIndex((entry) => entry.sql?.includes("FOR UPDATE")) <
          fakeQueries.findIndex((entry) => entry.sql?.startsWith("INSERT INTO user_sessions")),
      "the lock must be taken before the new session exists",
    );
    assert.equal(order[order.length - 2], "commit");
  });

  it("keeps the newest five and revokes exactly the overflow", async () => {
    const live = liveSessions(5, 100);
    await captureCreate(7, { live });
    const revoke = emitted("UPDATE user_sessions").find((c) =>
      c.sql.includes("session_id NOT IN"),
    );
    assert.ok(revoke, "the cap revokes via a NOT IN keep-set");
    assert.ok(revoke.sql.includes("revoked_at IS NULL"), "idempotent per row");
    const keepSelect = emitted("ORDER BY session_id DESC")[0];
    assert.deepEqual(keepSelect.params, [7, 5], "the cap is bound, not interpolated");
    // The UPDATE protects the keep-set: `session_id NOT IN (...)` is what decides
    // who dies. 100..104 were live and 999 is the one just opened, so the newest
    // five are 999,104,103,102,101 and the oldest is the only casualty.
    const protectedIds = revoke.params.filter((value) => value !== 7);
    assert.equal(revoke.params[0], 7, "revocation stays inside this account");
    assert.equal(protectedIds.length, 5, "exactly the cap survives");
    assert.ok(
      !protectedIds.includes(100),
      "the oldest live session is the one the cap gives up",
    );
    assert.ok(
      protectedIds.includes(999),
      "the session just opened is never the victim",
    );
  });

  it("orders deterministically when two sessions share a second", () => {
    fakeQueries.length = 0;
    handler = (sql) => {
      if (sql.startsWith("SELECT user_id FROM users")) return [[{ user_id: 7 }]];
      if (sql.startsWith("INSERT INTO user_sessions")) return [{ insertId: 999 }];
      if (sql.includes("SET expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)")) return [{ affectedRows: 1 }];
      if (sql.includes("expires_at <= NOW()")) return [{ affectedRows: 0 }];
      if (sql.includes("ORDER BY session_id DESC")) return [[]];
      return [[]];
    };
    return Session.create(7).then(() => {
      const select = emitted("ORDER BY session_id DESC")[0];
      assert.ok(select.sql.includes("ORDER BY session_id DESC"));
    });
  });

  it("never revokes a session that is already revoked", async () => {
    await captureCreate(7, { live: [] });
    const revoke = emitted("UPDATE user_sessions").find((c) =>
      c.sql.includes("session_id NOT IN"),
    );
    assert.ok(revoke.sql.includes("revoked_at IS NULL"));
  });

  it("rolls back and refuses to open a session for an unknown account", async () => {
    fakeQueries.length = 0;
    handler = (sql) => {
      if (sql.startsWith("SELECT user_id FROM users")) return [[]];
      if (sql.startsWith("INSERT INTO user_sessions")) {
        throw new Error("the insert must not run without the account");
      }
      return [[]];
    };
    await assert.rejects(() => Session.create(9999), /unknown account/);
    assert.equal(emitted("INSERT INTO user_sessions").length, 0);
    assert.deepEqual(
      fakeQueries.map((entry) => entry.transaction).filter(Boolean),
      ["begin", "rollback", "release"],
    );
  });

  it("rejects a nonsensical cap before touching the database", async () => {
    reset();
    await assert.rejects(() => Session.create(7, { maxActiveSessions: 0 }));
    await assert.rejects(() => Session.create(7, { maxActiveSessions: "five" }));
    assert.equal(fakeQueries.length, 0);
  });

  it("reuses the pool-level path for revocation without a cap", async () => {
    reset(respond({ "UPDATE user_sessions": [{ affectedRows: 2 }] }));
    await Session.revokeOthersForUser(7, 501);
    const update = emitted("UPDATE user_sessions")[0];
    assert.ok(update.sql.includes("session_id <> ?"));
    assert.deepEqual(update.params, [7, 501]);
  });
});
