import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import pool from "../src/config/database.js";

// HIGH-3 HTTP regression suite. Exercises the real auth endpoints with live
// JWTs bound to server-side user_sessions rows: logout revokes, revocation
// survives process restarts, deactivation and demotion cut off old tokens,
// password rotation kills other sessions, and unsafe JWT config refuses boot.
//
// Isolation: dedicated temporary users (Employee + Admin) with real logins,
// hard-deleted in teardown. Demo accounts are only logged into (which now
// creates session rows) and never modified.
import { requiredBaseUrl, guardExecutedTests } from "./support/httpSuite.js";
import { assertScratchDatabase } from "./support/dbGuard.js";
const base = requiredBaseUrl("SESSION_API_URL", "test:session:http");
// T-007 tripwire: the target server writes to the database; the schema it
// points at must be an approved scratch one. Fails closed before any test
// registers.
assertScratchDatabase("auth-session-http");
const stamp = Date.now();
const TEMP_PASSWORD = "Temp@12345";
const ROTATED_PASSWORD = "NewPass@123";
const CHILD_PORT = 5063;
const backendDir = fileURLToPath(new URL("..", import.meta.url));

const children = [];

let adminToken;
let employeeUserId;
let employeeToken;
let adminTempUserId;
let adminTempToken;
const tempUserIds = [];

const call = async (method, path, token, body) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
};

const login = async (email, password) => {
  const { status, body } = await call("POST", "/auth/login", null, {
    email,
    password,
  });
  return { status, token: body?.data?.token, sessionId: body?.data?.sessionId };
};

const me = (token, port = null) => {
  const root = port ? `http://localhost:${port}/api` : base;
  return fetch(`${root}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
};

const spawnServer = async (port, envOverrides = {}) => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: backendDir,
    env: { ...process.env, ...envOverrides, PORT: String(port), EMAIL_DRY_RUN: "true" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  children.push(child);
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d;
  });

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return { child, exited: true, stderr };
    }
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) {
        return { child, exited: false, stderr };
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  child.kill("SIGKILL");
  throw new Error(`child server on port ${port} did not become healthy`);
};

const createTempUser = async (roleName) => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = ? LIMIT 1",
    [roleName],
  );
  const email = `session-http-${roleName.replace(/\s+/g, "-").toLowerCase()}-${stamp}@example.test`;
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
  const [res] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, ?, TRUE)`,
    [roles[0].role_id, email, hash],
  );
  tempUserIds.push(res.insertId);
  await pool.query(
    `INSERT INTO employee_profiles (user_id, employee_code, first_name, last_name, department)
     VALUES (?, ?, 'Session', 'Http', 'QA')`,
    [res.insertId, `SESSHTTP-${res.insertId}`],
  );
  return { userId: res.insertId, email };
};

describe("HIGH-3 session HTTP integration", () => {
  before(async () => {
    adminToken = (await login("admin@workzen.demo", "Admin@123")).token;
    assert.ok(adminToken, "demo admin token issued");

    const emp = await createTempUser("Employee");
    employeeUserId = emp.userId;
    const empLogin = await login(emp.email, TEMP_PASSWORD);
    assert.equal(empLogin.status, 200);
    employeeToken = empLogin.token;
    assert.ok(employeeToken, "temp employee token issued");

    const adm = await createTempUser("Admin");
    adminTempUserId = adm.userId;
    const admLogin = await login(adm.email, TEMP_PASSWORD);
    adminTempToken = admLogin.token;
    assert.ok(adminTempToken, "temp admin token issued");
  });

  after(async () => {
    for (const child of children) {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }
    for (const userId of tempUserIds) {
      await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
    }
    await pool.end();
  });

  describe("tokens are session-bound and still serve normal traffic", () => {
    it("login returns a sessionId and the token authenticates with the right role", async () => {
      const again = await login(
        `session-http-employee-${stamp}@example.test`,
        TEMP_PASSWORD,
      );
      assert.equal(again.status, 200);
      assert.ok(Number.isInteger(again.sessionId), "login data carries sessionId");

      const meRes = await me(again.token);
      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.data.userId, employeeUserId);

      // RBAC surfaces unchanged: employee is still 403 on payroll, 200 on self payroll
      assert.equal((await call("GET", "/payroll/all", again.token)).status, 403);
      assert.equal(
        (await call("GET", "/payroll/my-payroll", again.token)).status,
        200,
      );
      await call("POST", "/auth/logout", again.token);
    });

    it("rejects malformed, expired and sessionless tokens", async () => {
      const garbage = await fetch(`${base}/auth/me`, {
        headers: { Authorization: "Bearer not.a.token" },
      });
      assert.equal(garbage.status, 401);

      const expired = jwt.sign(
        { userId: employeeUserId, roleId: 4, roleName: "Employee", sessionId: 1 },
        process.env.JWT_SECRET,
        { expiresIn: "1ms" },
      );
      await new Promise((r) => setTimeout(r, 20));
      assert.equal((await me(expired)).status, 401);

      const noSession = jwt.sign(
        { userId: employeeUserId, roleId: 4, roleName: "Employee" },
        process.env.JWT_SECRET,
        { expiresIn: "5m" },
      );
      assert.equal((await me(noSession)).status, 401);
    });
  });

  describe("logout", () => {
    it("revokes the current session but leaves the user's other sessions valid", async () => {
      const s1 = await login(`session-http-employee-${stamp}@example.test`, TEMP_PASSWORD);
      const s2 = await login(`session-http-employee-${stamp}@example.test`, TEMP_PASSWORD);
      assert.notEqual(s1.sessionId, s2.sessionId);

      const out = await call("POST", "/auth/logout", s1.token);
      assert.equal(out.status, 200);
      assert.equal(out.body.success, true);

      assert.equal((await me(s1.token)).status, 401, "logged-out token is dead");
      const still = await me(s2.token);
      assert.equal(still.status, 200, "other session unaffected");
      await call("POST", "/auth/logout", s2.token);
    });

    it("revocation persists across a full server restart", async () => {
      const { token } = await login(
        `session-http-employee-${stamp}@example.test`,
        TEMP_PASSWORD,
      );

      // sanity: a different server process accepts the token
      const first = await spawnServer(CHILD_PORT);
      assert.equal(first.exited, false);
      assert.equal((await me(token, CHILD_PORT)).status, 200);

      // log out on the primary server, then kill the child process entirely
      assert.equal((await call("POST", "/auth/logout", token)).status, 200);
      first.child.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 1000));

      // brand new process, same database: the token must stay dead
      const second = await spawnServer(CHILD_PORT);
      assert.equal(second.exited, false);
      assert.equal((await me(token, CHILD_PORT)).status, 401);

      // the database row proves persistence, not in-memory state
      const [rows] = await pool.query(
        "SELECT revoked_at FROM user_sessions WHERE user_id = ? ORDER BY session_id DESC LIMIT 1",
        [employeeUserId],
      );
      assert.notEqual(rows[0].revoked_at, null);
      second.child.kill("SIGKILL");
    });
  });

  describe("deactivation and demotion cut off old tokens", () => {
    it("deactivating a user blocks their token, and re-login is required after reactivation", async () => {
      const { token } = await login(
        `session-http-employee-${stamp}@example.test`,
        TEMP_PASSWORD,
      );

      const off = await call("PUT", `/users/${employeeUserId}/status`, adminToken, {
        is_active: false,
      });
      assert.equal(off.status, 200);

      const blocked = await me(token);
      assert.equal(blocked.status, 403);
      assert.match(blocked.body.message, /deactivated/i);

      // sessions were revoked at deactivation, so reactivation does not
      // resurrect the old token
      const on = await call("PUT", `/users/${employeeUserId}/status`, adminToken, {
        is_active: true,
      });
      assert.equal(on.status, 200);
      assert.equal((await me(token)).status, 401);

      const fresh = await login(`session-http-employee-${stamp}@example.test`, TEMP_PASSWORD);
      assert.equal((await me(fresh.token)).status, 200, "fresh login works again");
      await call("POST", "/auth/logout", fresh.token);
    });

    it("demotion strips the old role without waiting for token expiry", async () => {
      const adminWorks = await me(adminTempToken);
      assert.equal(adminWorks.status, 200);
      assert.equal(adminWorks.body.data.role, "Admin");
      assert.equal((await call("GET", "/users", adminTempToken)).status, 200);

      const [empRole] = await pool.query(
        "SELECT role_id FROM roles WHERE role_name = 'Employee' LIMIT 1",
      );
      await pool.query("UPDATE users SET role_id = ? WHERE user_id = ?", [
        empRole[0].role_id,
        adminTempUserId,
      ]);

      try {
        const demoted = await me(adminTempToken);
        assert.equal(demoted.status, 401, "stale role claims are rejected");
        assert.equal((await call("GET", "/users", adminTempToken)).status, 401);
      } finally {
        const [adminRole] = await pool.query(
          "SELECT role_id FROM roles WHERE role_name = 'Admin' LIMIT 1",
        );
        await pool.query("UPDATE users SET role_id = ? WHERE user_id = ?", [
          adminRole[0].role_id,
          adminTempUserId,
        ]);
      }
    });
  });

  describe("password rotation", () => {
    it("change-password keeps the current session and revokes the others", async () => {
      const email = `session-http-employee-${stamp}@example.test`;
      const current = await login(email, TEMP_PASSWORD);
      const other = await login(email, TEMP_PASSWORD);

      const changed = await call("POST", "/auth/change-password", current.token, {
        oldPassword: TEMP_PASSWORD,
        newPassword: ROTATED_PASSWORD,
      });
      assert.equal(changed.status, 200);

      assert.equal((await me(other.token)).status, 401, "other session revoked");
      assert.equal((await me(current.token)).status, 200, "current session survives");

      // old password no longer works, rotated password does
      assert.equal((await login(email, TEMP_PASSWORD)).status, 401);
      assert.equal((await login(email, ROTATED_PASSWORD)).status, 200);

      // leave the temp user back on its original password for teardown sanity
      const back = await call("POST", "/auth/change-password", current.token, {
        oldPassword: ROTATED_PASSWORD,
        newPassword: TEMP_PASSWORD,
      });
      assert.equal(back.status, 200);
      await call("POST", "/auth/logout", current.token);
    });

    // The response is the contract the profile page shows, so it must agree with
    // what the transport actually did. No backend this suite can target configures
    // SMTP credentials, so a delivery claim here would always be a lie.
    it("change-password response agrees with the real mail outcome", async () => {
      const email = `session-http-employee-${stamp}@example.test`;
      const current = await login(email, TEMP_PASSWORD);
      assert.equal(current.status, 200, "the suite employee is back on its base password");

      const changed = await call("POST", "/auth/change-password", current.token, {
        oldPassword: TEMP_PASSWORD,
        newPassword: ROTATED_PASSWORD,
      });
      assert.equal(changed.status, 200);
      assert.equal(changed.body.success, true);

      const claimsDelivery = /confirmation email has been sent/i.test(
        changed.body.message,
      );
      assert.equal(
        claimsDelivery,
        changed.body.emailSent === true,
        `message and emailSent disagree: ${JSON.stringify(changed.body)}`,
      );
      assert.equal(changed.body.emailSent, false, "nothing can be delivered in this environment");
      assert.match(changed.body.mailTransport, /^(dry-run|smtp|forced-failure)$/);

      const back = await call("POST", "/auth/change-password", current.token, {
        oldPassword: ROTATED_PASSWORD,
        newPassword: TEMP_PASSWORD,
      });
      assert.equal(back.status, 200);
      await call("POST", "/auth/logout", current.token);
    });
  });

  describe("startup refuses unsafe JWT configuration", () => {
    it("exits when JWT_EXPIRE is missing or malformed", async () => {
      const child = await spawnServer(5064, { JWT_EXPIRE: "" });
      assert.equal(child.exited, true, "server exited");
      assert.match(child.stderr, /JWT_EXPIRE/);
    });

    it("exits when JWT_SECRET is missing or too weak", async () => {
      const child = await spawnServer(5065, { JWT_SECRET: "short" });
      assert.equal(child.exited, true, "server exited");
      assert.match(child.stderr, /JWT_SECRET/);
    });
  });
});

guardExecutedTests("SESSION_API_URL", 10);
