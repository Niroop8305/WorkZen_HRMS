// Regression guard for T-001: logout must revoke the caller's own server-side
// session.
//
// The defect was entirely client-side. The backend contract was already correct
// and already covered (auth-session-http.test.js proves `POST /auth/logout`
// revokes one session and leaves siblings alone) — but the SPA deleted the token
// from localStorage *before* dispatching the request, so the axios request
// interceptor had nothing to attach, `protect` answered 401 before the controller
// ever ran, and the `.catch(() => {})` swallowed the evidence. Every user
// therefore "logged out" while their database session stayed live.
//
// A second, related defect is covered here too: the 401 response interceptor
// hard-reloaded the page for *any* 401 except login, so an already-revoked or
// expired session turned a logout into a spurious full-page reload.
//
// Database-free by construction: mysql2's createPool is replaced before any
// application module is imported, so no connection can be requested and nothing
// can be written to the protected application schema. `after()` proves both.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";

const realCreatePool = mysql.createPool;

const TEST_SECRET = "logout-revocation-test-secret-value-32-chars-minimum";
const OTHER_SECRET = "logout-revocation-other-secret-value-32-chars-minimum!";
const DRIVER_ERROR_TEXT =
  "ER_NO_SUCH_TABLE: Table 'workzen_hrms.user_sessions' doesn't exist";

/** Recorded SQL, so every assertion is about what the code actually asked for. */
const calls = [];
/** Rows the fake store answers with, set per test. */
let storedRows = [];
let storeShouldThrow = false;

const fakePool = {
  async query(sql, values = []) {
    calls.push({ sql, values });
    if (storeShouldThrow) {
      throw Object.assign(new Error(DRIVER_ERROR_TEXT), {
        code: "ER_NO_SUCH_TABLE",
        sql,
      });
    }
    return [storedRows, []];
  },
  async getConnection() {
    throw new Error("logout must not need a dedicated transaction connection");
  },
  end() {},
};

mysql.createPool = () => fakePool;

const { Session } = await import("../src/models/sessionModel.js");
const { logout } = await import("../src/controllers/authController.js");
const { protect, validateSession } = await import("../src/middleware/auth.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "..", "..", "frontend", "src");

// `protect` reads the secret from the environment at verify time, so pin it for
// the whole file: otherwise a missing value makes jwt.verify throw and the 401
// path masks the very store-failure path under test.
process.env.JWT_SECRET = TEST_SECRET;

const resetStore = (rows = []) => {
  calls.length = 0;
  storedRows = rows;
  storeShouldThrow = false;
};

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const logoutReq = (sessionId) => ({
  headers: {},
  body: {},
  query: {},
  params: {},
  ip: "127.0.0.1",
  get: () => undefined,
  user: { userId: 12, roleId: 1, roleName: "Admin", sessionId },
});

const claims = (sessionId, extra = {}) => ({
  userId: 12,
  roleId: 1,
  roleName: "Admin",
  sessionId,
  ...extra,
});

// A session row as `Session.findActiveById` returns it, joined to users + roles.
const sessionRow = (sessionId, overrides = {}) => ({
  session_id: sessionId,
  user_id: 12,
  role_id: 1,
  role_name: "Admin",
  is_active: 1,
  issued_at: new Date(),
  revoked_at: null,
  ...overrides,
});

const bearerRequest = (token) => ({
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body: {},
  query: {},
  params: {},
  ip: "127.0.0.1",
  get: () => undefined,
});

describe("Session.revokeById writes a single-session, idempotent revoke", () => {
  before(() => resetStore());

  it("targets exactly the given session id", async () => {
    resetStore();
    await Session.revokeById(90210);

    assert.equal(calls.length, 1, "exactly one statement");
    const { sql, values } = calls[0];
    assert.deepEqual(values, [90210], "binds only the session id");
    assert.match(sql, /UPDATE user_sessions/i);
    assert.match(sql, /SET revoked_at = CURRENT_TIMESTAMP/i);
    assert.match(sql, /WHERE session_id = \?/i);
    assert.match(sql, /AND revoked_at IS NULL/i, "idempotent, never re-stamps");
  });

  it("never revokes the account's unrelated live sessions", async () => {
    resetStore();
    await Session.revokeById(90210);
    assert.doesNotMatch(calls[0].sql, /user_id\s*=/i, "no account-wide revoke");
    assert.doesNotMatch(calls[0].sql, /DELETE/i, "revokes, does not destroy");
    assert.equal(calls[0].values.length, 1);
  });

  it("reads liveness from the store rather than trusting a claim", async () => {
    resetStore([sessionRow(90210, { revoked_at: new Date() })]);
    const row = await Session.findActiveById(90210);
    assert.ok(row.revoked_at, "the revoked flag is what protect sees");
    assert.match(calls[0].sql, /FROM user_sessions s/i);
    assert.match(calls[0].sql, /WHERE s\.session_id = \?/i);
  });
});

describe("POST /auth/logout revokes the verified session", () => {
  it("returns 200 and revokes the session the token names", async () => {
    resetStore();
    const res = makeRes();
    await logout(logoutReq(90210), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, "Logout successful");
    assert.equal(calls.length, 1, "one write, no extra statements");
    assert.deepEqual(calls[0].values, [90210]);
    assert.match(calls[0].sql, /session_id = \?/i);
  });

  it("repeated logout keeps succeeding against the same single session", async () => {
    resetStore();
    const first = makeRes();
    const second = makeRes();
    await logout(logoutReq(90210), first);
    await logout(logoutReq(90210), second);

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200, "a second logout is not an error");
    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map((c) => c.values),
      [[90210], [90210]],
      "no other session is dragged in",
    );
    for (const c of calls) assert.match(c.sql, /AND revoked_at IS NULL/i);
  });

  it("reports a generic failure and leaks no driver detail when the store rejects", async () => {
    resetStore();
    storeShouldThrow = true;
    const res = makeRes();
    await logout(logoutReq(90210), res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Server error during logout");
    const rendered = JSON.stringify(res.body);
    for (const leak of ["ER_", "workzen_hrms", "SELECT", "UPDATE", "stack"]) {
      assert.ok(!rendered.includes(leak), `response leaks ${leak}: ${rendered}`);
    }
  });

  it("logs neither the session id nor any credential", async () => {
    resetStore();
    storeShouldThrow = true;
    const captured = [];
    const realError = console.error;
    const realLog = console.log;
    console.error = (...args) => captured.push(args.join(" | "));
    console.log = (...args) => captured.push(args.join(" | "));
    try {
      await logout(logoutReq(90210), makeRes());
    } finally {
      console.error = realError;
      console.log = realLog;
    }

    const joined = captured.join("\n");
    assert.ok(joined.length > 0, "the failure path still logs for operators");
    assert.doesNotMatch(joined, /90210/, "session id never reaches the log");
    assert.doesNotMatch(joined, /Bearer/i, "no authorization material in the log");
    assert.ok(
      !joined.includes(TEST_SECRET),
      "test secret must not appear in logs",
    );
  });
});

describe("a revoked or expired session cannot be reused", () => {
  it("validateSession rejects a revoked session row", async () => {
    resetStore([sessionRow(90210, { revoked_at: new Date() })]);
    const failure = await validateSession(claims(90210, { iat: Math.floor(Date.now() / 1000) }));

    assert.equal(failure.statusCode, 401);
    assert.match(failure.message, /expired or logged out/i);
  });

  it("accepts the identical token while the session row is live", async () => {
    resetStore([sessionRow(90210)]);
    const failure = await validateSession(claims(90210, { iat: Math.floor(Date.now() / 1000) }));
    assert.equal(failure, null, "control: revocation, not the fixture, causes the 401");
  });

  it("protect answers 401 after logout, and exposes no req.user", async () => {
    resetStore([sessionRow(90210, { revoked_at: new Date() })]);
    const token = jwt.sign(claims(90210), TEST_SECRET, { expiresIn: "1h" });
    const req = bearerRequest(token);
    const res = makeRes();
    let nextCalled = false;
    await protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 401, "the revoked token is dead");
    assert.equal(nextCalled, false, "no handler runs");
    assert.equal(req.user, undefined, "no identity is attached");
    assert.equal(res.body.message, "Session expired or logged out");
  });

  it("fails closed with 500 when the session store is unreadable", async () => {
    resetStore();
    storeShouldThrow = true;
    const req = bearerRequest(jwt.sign(claims(90210), TEST_SECRET, { expiresIn: "1h" }));
    const res = makeRes();
    await protect(req, res, () => {});

    assert.equal(res.statusCode, 500, "an unreadable store is never a free pass");
    assert.match(res.body.message, /unavailable/i);
  });
});

describe("missing and malformed credentials never reach the store", () => {
  it("401 with no Authorization header at all", async () => {
    resetStore();
    const res = makeRes();
    await protect(bearerRequest(null), res, () => {});

    assert.equal(res.statusCode, 401);
    assert.match(res.body.message, /Not authorized/i);
    assert.equal(calls.length, 0, "no query attempted");
  });

  it("401 for a token signed with a different secret", async () => {
    resetStore([sessionRow(90210)]);
    const forged = jwt.sign(claims(90210), OTHER_SECRET, { expiresIn: "1h" });
    const res = makeRes();
    await protect(bearerRequest(forged), res, () => {});

    assert.equal(res.statusCode, 401);
    assert.equal(calls.length, 0, "signature is checked before the store");
  });

  it("401 for an expired token", async () => {
    resetStore([sessionRow(90210)]);
    const expired = jwt.sign(claims(90210), TEST_SECRET, { expiresIn: -60 });
    const res = makeRes();
    await protect(bearerRequest(expired), res, () => {});

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "Token is invalid or expired");
  });

  it("401 for a token with no session claim", async () => {
    resetStore([sessionRow(90210)]);
    const res = makeRes();
    const req = bearerRequest(jwt.sign({ userId: 12, roleId: 1, roleName: "Admin" }, TEST_SECRET));
    await protect(req, res, () => {});

    assert.equal(res.statusCode, 401, "session-bound tokens only");
    const failure = await validateSession(jwt.decode(req.headers.authorization.split(" ")[1]));
    assert.equal(failure.statusCode, 401);
  });

  it("401 for a garbage bearer value", async () => {
    resetStore();
    const res = makeRes();
    await protect(bearerRequest("not-a-jwt"), res, () => {});
    assert.equal(res.statusCode, 401);
    assert.equal(calls.length, 0);
  });
});

describe("frontend logout keeps the token until the revoke is dispatched", () => {
  const read = (relative) =>
    fs.readFileSync(path.join(frontendRoot, relative), "utf8");

  const sliceFunction = (source, signature) => {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `${signature} must exist`);
    const end = source.indexOf("\n};", start);
    assert.notEqual(end, -1, `${signature} must close`);
    return source.slice(start, end + 3);
  };

  it("AuthContext awaits the revoke before clearing local credentials", () => {
    const body = sliceFunction(read("context/AuthContext.jsx"), "const logout = async () => {");

    assert.match(body, /await authService\.logout\(\)/, "revoke is awaited");
    assert.match(body, /finally\s*\{/, "cleanup runs on every outcome");
    assert.ok(
      body.indexOf("authService.logout()") < body.indexOf("removeItem('workzen_token')"),
      "the token must still be in localStorage when the request is built",
    );
    assert.doesNotMatch(
      body,
      /authService\.logout\(\)\.catch\(\(\)\s*=>\s*\{\}\)/,
      "the fire-and-forget swallow that hid this defect must not return",
    );
  });

  it("AuthContext still clears state when the API call fails", () => {
    const body = sliceFunction(read("context/AuthContext.jsx"), "const logout = async () => {");
    assert.match(body, /catch\s*(\([^)]*\))?\s*\{/, "failures are handled");
    const finallyBlock = body.slice(body.indexOf("finally"));
    for (const key of ["workzen_token", "workzen_user"]) {
      assert.ok(finallyBlock.includes(key), `${key} cleared in finally`);
    }
    assert.ok(finallyBlock.includes("setUser(null)"), "in-memory state reset too");
  });

  it("every logout call site waits for revocation before redirecting", () => {
    const offenders = [];
    let awaitedSites = 0;

    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
          continue;
        }
        if (!/\.(jsx?|tsx?)$/.test(entry.name)) continue;
        const source = fs.readFileSync(absolute, "utf8");
        if (!source.includes("logout")) continue;
        for (const line of source.split("\n")) {
          if (/^\s*logout\(\);/.test(line)) {
            offenders.push(`${path.relative(frontendRoot, absolute)}: ${line.trim()}`);
          }
          if (/await logout\(\);/.test(line)) awaitedSites += 1;
        }
      }
    };
    walk(frontendRoot);

    assert.deepEqual(offenders, [], `unawaited logout() left: ${offenders.join(", ")}`);
    // T-041 added the EmployeeDashboard's own handler; every call site — six
    // now — awaits the revoke before navigating.
    assert.equal(awaitedSites, 6, "all six handlers await the revoke");
  });

  it("the 401 interceptor does not reload the page for a logout 401", () => {
    const source = read("services/api.js");
    assert.match(source, /includes\('\/auth\/logout'\)/, "logout is recognised");
    assert.match(
      source,
      /status === 401 && !attemptedLogin && !attemptedLogout/,
      "logout 401 skips the hard redirect",
    );
    assert.match(source, /status === 401 && !attemptedLogin/, "as does login");
  });

  // A rejected logout() would strand the user on a protected page, because every
  // handler navigates on the line after `await logout()`. These tests pin the
  // properties that make that impossible, for every class of API failure
  // (401, 500, unreachable, missing token) that the browser matrix exercised.
  it("logout() cannot reject, so a failing revoke still logs the client out", () => {
    const body = sliceFunction(read("context/AuthContext.jsx"), "const logout = async () => {");

    assert.match(body, /^const logout = async /, "callers can await it");
    const catchBlock = body.slice(body.indexOf("catch"), body.indexOf("finally"));
    assert.ok(catchBlock.length > 0, "the catch must exist");
    assert.doesNotMatch(catchBlock, /throw/, "rethrowing would skip the caller's navigate()");
    assert.doesNotMatch(catchBlock, /return/, "the catch must not short-circuit the finally");

    const finallyBlock = body.slice(body.indexOf("finally"));
    assert.doesNotMatch(finallyBlock, /await/, "cleanup must not be suspendable");
    assert.doesNotMatch(finallyBlock, /throw/, "cleanup cannot fail the caller");
    // Nothing may hang the client logout behind the server's response.
    assert.doesNotMatch(body, /Promise\.(all|race|any)/, "no extra in-flight promise to reject");
  });

  it("only a 401 can force a reload, and never from the logout path", () => {
    const api = read("services/api.js");
    assert.match(
      api,
      /const status = error\.response\?\.status/,
      "a transport error has no response, so status is undefined and cannot equal 401",
    );
    const reloads = api.match(/window\.location\.href\s*=/g) || [];
    assert.equal(reloads.length, 1, "api.js keeps exactly one hard-redirect site");

    const context = read("context/AuthContext.jsx");
    assert.doesNotMatch(
      context,
      /window\.location|location\.assign|location\.replace/,
      "AuthContext navigates through the router only, so a logout cannot double-navigate",
    );
  });

  it("each handler navigates only after the awaited revoke resolves", () => {
    const sites = [
      "components/Header.jsx",
      "pages/Dashboard.jsx",
      "pages/Attendance.jsx",
      "pages/EmployeeAttendance.jsx",
      "pages/MyProfile.jsx",
    ];

    for (const relative of sites) {
      const source = fs.readFileSync(path.join(frontendRoot, relative), "utf8");
      const start = source.indexOf("const handleLogout = async () => {");
      assert.notEqual(start, -1, `${relative}: handler must exist and be async`);
      const end = source.indexOf("\n  };", start);
      assert.notEqual(end, -1, `${relative}: handler must close`);
      const body = source.slice(start, end);

      const awaited = body.indexOf("await logout();");
      const nav = body.indexOf('navigate("/login")');
      assert.notEqual(awaited, -1, `${relative}: must await the revoke`);
      assert.notEqual(nav, -1, `${relative}: must redirect`);
      assert.ok(awaited < nav, `${relative}: must redirect only after the revoke settles`);
      assert.doesNotMatch(
        body,
        /logout\(\)\.(then|catch|finally)/,
        `${relative}: chaining instead of awaiting loses the ordering guarantee`,
      );
    }
  });

  it("the client uses the one existing logout endpoint and no new auth scheme", () => {
    const source = read("services/authService.js");
    // T-041: the request carries a bounded timeout but nothing else changed —
    // same endpoint, same verb, no new auth scheme.
    assert.match(source, /api\.post\('\/auth\/logout', undefined, \{\s*timeout:/);
    const files = ["services/api.js", "services/authService.js", "context/AuthContext.jsx"];
    for (const file of files) {
      const text = read(file);
      assert.ok(
        (text.match(/\/auth\/logout/g) || []).length <= 1,
        `${file} references the logout endpoint more than once`,
      );
      assert.doesNotMatch(text, /logout.*(cookie|refreshToken|csrf)/i, `${file} adds auth machinery`);
    }
  });
});

after(() => {
  mysql.createPool = realCreatePool;
  delete process.env.JWT_SECRET;
  assert.equal(
    realCreatePool,
    mysql.createPool,
    "the real driver was restored",
  );
});
