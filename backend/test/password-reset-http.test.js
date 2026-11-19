import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import pool from "../src/config/database.js";
import {
  RESET_CODE_INVALID_ACTION,
  RESET_CODE_ISSUED_ACTION,
} from "../src/models/authThrottleModel.js";
import { guardExecutedTests } from "./support/httpSuite.js";
import { assertScratchDatabase } from "./support/dbGuard.js";

// T-007 tripwire: this suite spawns database-writing backends; the schema they
// point at must be an approved scratch one. Fails closed before any test
// registers.
assertScratchDatabase("password-reset-http");

// HIGH-4 HTTP regression suite for the password-reset lifecycle.
//
// The suite boots its own isolated backend instead of reusing a developer
// server, and does so with EMAIL_DRY_RUN=true. That is deliberate: the reset
// path emails a live code, and no test run may be able to hand a real message
// to nodemailer's SMTP transport. The dry-run transport renders the message and
// returns without any network connection, so the codes under test are read
// back from password_reset_codes.
//
// Isolation: dedicated temporary users with real logins; their codes and
// session rows disappear with the users in teardown (ON DELETE CASCADE). Demo
// accounts are never contacted by this suite.
const PORT = 5068;
// Extra isolated backends for the multi-process budget cases. Ports 5060-5061 are
// rejected by fetch on this host, so this suite stays clear of them.
const PEER_PORT = 5069;
const MAIL_FAIL_PORT = 5070;
const backendDir = fileURLToPath(new URL("..", import.meta.url));
const stamp = Date.now();

// Every spawned backend records its rendered dry-run mail here (injected via
// NODE_OPTIONS + the WZ_MAIL_CAPTURE_FILE env var), so the suite can recover
// the plaintext reset code the way the user does - from the message, not from
// the now-hashed storage row.
const MAIL_CAPTURE_FILE = join(backendDir, "..", "..", "wz-mail-capture.jsonl");
const PASSWORD = "Temp@12345";
const NEXT_PASSWORD = "Reset@12345";

const tempUserIds = [];
const userEmails = new Map();
let server;

const callOn = async (port, method, path, token, body) => {
  const response = await fetch(`http://localhost:${port}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text };
};

const call = (method, path, token, body) => callOn(PORT, method, path, token, body);

const loginOn = (port, email, password) =>
  callOn(port, "POST", "/auth/login", null, { email, password }).then((result) => ({
    ...result,
    token: result.body?.data?.token,
    sessionId: result.body?.data?.sessionId,
  }));
const meOn = (port, token) => callOn(port, "GET", "/auth/me", token);

const login = (email, password) => loginOn(PORT, email, password);
const me = (token) => meOn(PORT, token);

const createUser = async (tag, roleName = "Employee") => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = ? LIMIT 1",
    [roleName],
  );
  const email = `h4-http-${tag}-${stamp}@example.test`;
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [res] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, ?, TRUE)`,
    [roles[0].role_id, email, hash],
  );
  tempUserIds.push(res.insertId);
  userEmails.set(res.insertId, email);
  await pool.query(
    `INSERT INTO employee_profiles (user_id, employee_code, first_name, last_name, department)
     VALUES (?, ?, 'Reset', 'Http', 'QA')`,
    [res.insertId, `H4HTTP-${res.insertId}`],
  );
  return { userId: res.insertId, email };
};

const signedIn = async (tag, roleName = "Employee") => {
  const user = await createUser(tag, roleName);
  const first = await login(user.email, PASSWORD);
  assert.equal(first.status, 200, `temp ${roleName} can log in`);
  const second = await login(user.email, PASSWORD);
  assert.equal(second.status, 200);
  return { ...user, first, second };
};

const digestOf = (value) =>
  createHash("sha256").update(String(value).trim()).digest("hex");

// T-003: the usable plaintext code exists only in the rendered dry-run mail of
// the spawned backend, which the preload module (test/support/
// capture-dry-run-mail.cjs, injected via NODE_OPTIONS) records to a JSONL file.
// liveCode resolves the newest emailed code whose digest matches one of the
// user's live stored rows - the same channel the user experiences.
const liveCode = async (userId) => {
  const [rows] = await pool.query(
    `SELECT reset_code FROM password_reset_codes
     WHERE user_id = ? AND is_used = FALSE AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId],
  );
  const digest = rows[0]?.reset_code ?? null;
  if (!digest) return null;

  const captureFile = MAIL_CAPTURE_FILE;
  if (!captureFile || !existsSync(captureFile)) return null;
  const lines = readFileSync(captureFile, "utf8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let mail;
    try {
      mail = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!String(mail.to ?? "").includes(userEmails.get(userId) ?? "missing-user")) {
      continue;
    }
    const text = `${mail.subject ?? ""} ${mail.html ?? ""} ${mail.text ?? ""}`;
    for (const candidate of text.match(/\b\d{6}\b/g) ?? []) {
      if (digestOf(candidate) === digest) return candidate;
    }
  }
  return null;
};

const countLiveCodes = async (userId) => {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM password_reset_codes WHERE user_id = ? AND is_used = FALSE AND expires_at > NOW()",
    [userId],
  );
  return Number(rows[0].n);
};

// The budgets recover by elapsed time, and waiting out a 15 minute window is not
// a test. Aging the accounting rows of one temporary account is the smallest
// honest way to prove that recovery, and nothing else, releases the block.
const ageBudget = async (userId) => {
  await pool.query(
    `UPDATE audit_logs
     SET created_at = DATE_SUB(created_at, INTERVAL 20 MINUTE)
     WHERE user_id = ? AND action IN (?, ?)`,
    [userId, RESET_CODE_ISSUED_ACTION, RESET_CODE_INVALID_ACTION],
  );
};

const request = (token, port = PORT) =>
  callOn(port, "POST", "/auth/request-reset-code", token, {});
const submit = (token, resetCode, newPassword = NEXT_PASSWORD, port = PORT) =>
  callOn(port, "POST", "/auth/reset-password-with-code", token, {
    resetCode,
    newPassword,
    confirmPassword: newPassword,
  });

// A second backend on its own port is how the suite proves the budget lives in
// MySQL rather than in a process: a JWT minted by one server authenticates at
// the other, because both validate the same user_sessions row.
const spawnServer = async (port, extraEnv = {}) => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(port),
      EMAIL_DRY_RUN: "true",
      WZ_MAIL_CAPTURE_FILE: MAIL_CAPTURE_FILE,
      NODE_OPTIONS: `--require ${join(backendDir, "test", "support", "capture-dry-run-mail.cjs")}`,
      ...extraEnv,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d;
  });

  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`isolated backend on port ${port} exited early: ${stderr}`);
    }
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill("SIGKILL");
  throw new Error(`isolated backend on port ${port} never became healthy`);
};

const stopServer = async (child) => {
  if (child && child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
};

const startServer = async () => {
  server = await spawnServer(PORT);
};

describe("HIGH-4 password reset HTTP integration", () => {
  before(async () => {
    await startServer();
  });

  after(async () => {
    await stopServer(server);
    for (const userId of tempUserIds) {
      // Budget rows are the only residue an account leaves behind: audit_logs
      // releases its user reference with ON DELETE SET NULL, so they have to be
      // removed by user id before the account goes.
      await pool.query(
        "DELETE FROM audit_logs WHERE user_id = ? AND action IN (?, ?)",
        [userId, RESET_CODE_ISSUED_ACTION, RESET_CODE_INVALID_ACTION],
      );
      await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
    }
    await pool.end();
  });

  describe("route exposure and anonymous access", () => {
    it("refuses both reset steps without a token", async () => {
      const anonRequest = await request(null);
      assert.equal(anonRequest.status, 401);
      assert.equal(anonRequest.body.success, false);

      const anonSubmit = await submit(null, "123456");
      assert.equal(anonSubmit.status, 401);
      assert.equal(anonSubmit.body.success, false);
    });

    it("offers no anonymous forgot-password oracle to enumerate accounts", async () => {
      // Requirement B: a forgot-password form keyed on email address is the
      // classic enumeration surface. This application has none, so an
      // unauthenticated caller cannot ask "does this email exist" at all.
      for (const path of [
        "/auth/forgot-password",
        "/auth/forgot",
        "/auth/reset-password",
        "/auth/request-reset",
      ]) {
        const probeEmail = `nobody-${stamp}@example.test`;
        const result = await call("POST", path, null, { email: probeEmail });
        assert.equal(result.status, 404, `${path} is not routed`);
        assert.equal(result.body?.success, false);
        assert.equal(result.body?.message, "Route not found");
        assert.ok(
          !result.text.includes(probeEmail),
          `404 for ${path} echoes no account information`,
        );
      }
    });

    it("answers a live account identically in shape, without leaking the code", async () => {
      const user = await signedIn("generic-shape");
      const result = await request(user.first.token);
      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(typeof result.body.message, "string");
      // The backend this suite spawns always runs with EMAIL_DRY_RUN=true, so the
      // code is issued but nothing can leave the process. The response must say so
      // instead of sending the caller to an inbox that received nothing.
      assert.equal(
        /sent to your email/i.test(result.body.message),
        result.body.emailSent === true,
        `message and emailSent disagree: ${JSON.stringify(result.body)}`,
      );
      assert.equal(result.body.emailSent, false, "nothing can be delivered in this environment");
      assert.equal(result.body.mailTransport, "dry-run");
      assert.doesNotMatch(result.body.message, /check your inbox/i);

      const code = await liveCode(user.userId);
      assert.ok(code, "code persisted for the signed-in account");
      assert.ok(!result.text.includes(code), "response text does not carry the code");
    });
  });

  describe("successful reset over HTTP", () => {
    it("rotates the credential, keeps the acting session and kills the others", async () => {
      const user = await signedIn("success-flow");
      const acting = user.first;
      const intruder = user.second;

      const issued = await request(acting.token);
      assert.equal(issued.status, 200);
      const code = await liveCode(user.userId);
      assert.match(code, /^\d{6}$/);

      const reset = await submit(acting.token, code);
      assert.equal(reset.status, 200, reset.text);
      assert.equal(reset.body.success, true);
      assert.ok(!reset.text.includes(code), "success response does not echo the code");

      // New credential authenticates; the old one is dead.
      assert.equal((await login(user.email, NEXT_PASSWORD)).status, 200);
      assert.equal((await login(user.email, PASSWORD)).status, 401);

      // Chosen policy: the session that completed the reset survives, every
      // other session for the account is revoked.
      assert.equal((await me(acting.token)).status, 200, "acting session survives");
      assert.equal((await me(intruder.token)).status, 401, "other session revoked");

      // And the flow leaves the account fully usable: logout still works.
      const logout = await call("POST", "/auth/logout", acting.token);
      assert.equal(logout.status, 200);
      assert.equal((await me(acting.token)).status, 401, "logout still revokes");
    });

    it("consumes the code exactly once under concurrent HTTP submissions", async () => {
      const user = await signedIn("success-race");
      await request(user.first.token);
      const code = await liveCode(user.userId);

      const [a, b] = await Promise.all([
        submit(user.first.token, code),
        submit(user.second.token, code),
      ]);
      const statuses = [a.status, b.status].sort();
      assert.deepEqual(statuses, [200, 400], "one submission wins, one is rejected");
      assert.equal(await countLiveCodes(user.userId), 0, "no live code remains");
    });

    it("rejects a replay of the consumed code and leaves the password alone", async () => {
      const user = await signedIn("success-replay");
      await request(user.first.token);
      const code = await liveCode(user.userId);

      assert.equal((await submit(user.first.token, code)).status, 200);

      const replay = await submit(user.first.token, code);
      assert.equal(replay.status, 400);
      assert.match(replay.body.message, /invalid or expired/i);

      assert.equal((await login(user.email, NEXT_PASSWORD)).status, 200);
    });

    it("survives an expired code and a wrong code without changing the account", async () => {
      const user = await signedIn("fail-paths");

      await request(user.first.token);
      await pool.query(
        "UPDATE password_reset_codes SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?",
        [user.userId],
      );
      const [expired] = await pool.query(
        "SELECT reset_code FROM password_reset_codes WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        [user.userId],
      );
      const expiredResult = await submit(user.first.token, expired[0].reset_code);
      assert.equal(expiredResult.status, 400);
      assert.match(expiredResult.body.message, /invalid or expired/i);

      const issued = await request(user.first.token);
      assert.equal(issued.status, 200);
      const code = await liveCode(user.userId);
      const wrong = code === "100000" ? "100001" : "100000";
      assert.equal((await submit(user.first.token, wrong)).status, 400);

      // Nothing changed: old credential still valid, sessions untouched.
      assert.equal((await login(user.email, PASSWORD)).status, 200);
      assert.equal((await me(user.first.token)).status, 200);
      assert.equal((await me(user.second.token)).status, 200, "failed attempts revoke nothing");

      // The live code is still usable afterwards.
      const fresh = await liveCode(user.userId);
      assert.ok(fresh, "a live code survived the failures");
      assert.equal((await submit(user.first.token, fresh)).status, 200);
    });

    it("enforces the password policy before consuming anything", async () => {
      const user = await signedIn("fail-policy");
      await request(user.first.token);
      const code = await liveCode(user.userId);

      const weak = await submit(user.first.token, code, "weak");
      assert.equal(weak.status, 400);
      assert.match(weak.body.message, /at least 8 characters/i);

      const mismatch = await call("POST", "/auth/reset-password-with-code", user.first.token, {
        resetCode: code,
        newPassword: NEXT_PASSWORD,
        confirmPassword: "Another@123",
      });
      assert.equal(mismatch.status, 400);
      assert.match(mismatch.body.message, /do not match/i);

      const same = await submit(user.first.token, code, PASSWORD);
      assert.equal(same.status, 400);
      assert.match(same.body.message, /different from the current password/i);

      assert.equal(await countLiveCodes(user.userId), 1, "code was not burned");

      const missing = await call("POST", "/auth/reset-password-with-code", user.first.token, {
        newPassword: NEXT_PASSWORD,
      });
      assert.equal(missing.status, 400);

      assert.equal((await submit(user.first.token, code)).status, 200);
    });

    it("throttles repeated wrong codes with 429", async () => {
      const user = await signedIn("fail-throttle");
      await request(user.first.token);

      for (let i = 0; i < 4; i += 1) {
        const result = await submit(user.first.token, "123456");
        assert.equal(result.status, 400, `guess ${i + 1}`);
      }

      const blocked = await submit(user.first.token, "123456");
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.success, false);
      assert.equal(
        (await login(user.email, PASSWORD)).status,
        200,
        "throttling does not damage the account itself",
      );

      // P1: the budget is durable and per account, so the bypass that made the
      // in-memory limiter worthless must not work here.
      const fresh = await request(user.first.token);
      assert.equal(fresh.status, 200, "issuance itself is still available");
      const code = await liveCode(user.userId);
      assert.equal(
        (await submit(user.first.token, code)).status,
        429,
        "even a correct new code is refused: re-issuing launders nothing",
      );
      assert.equal((await login(user.email, PASSWORD)).status, 200, "account still usable");

      await ageBudget(user.userId);
      assert.equal(
        (await submit(user.first.token, code)).status,
        200,
        "the window expires by itself, so no legitimate owner is locked out for good",
      );
    });

    it("caps a twenty-request guessing wave at the budget", async () => {
      const user = await signedIn("throttle-wave");
      await request(user.first.token);

      const wave = await Promise.all(
        Array.from({ length: 20 }, () => submit(user.first.token, "123456")),
      );
      const evaluated = wave.filter((r) => r.status === 400).length;
      const refused = wave.filter((r) => r.status === 429).length;
      assert.equal(evaluated, 4, "no more than four guesses are ever hashed against");
      assert.equal(refused, 16, "the rest are refused before any work");
      assert.equal((await login(user.email, PASSWORD)).status, 200, "the wave changed no credential");

      const [rows] = await pool.query(
        "SELECT is_used FROM password_reset_codes WHERE user_id = ?",
        [user.userId],
      );
      assert.equal(Number(rows[0].is_used), 0, "the live code survived the wave");
    });

    it("caps verification code issuance at three requests per window", async () => {
      const user = await signedIn("issuance-cap");
      for (let i = 1; i <= 3; i += 1) {
        assert.equal((await request(user.first.token)).status, 200, `issuance ${i} is allowed`);
      }

      const blocked = await request(user.first.token);
      assert.equal(blocked.status, 429);
      assert.match(blocked.body.message, /too many verification code requests/i);
      assert.equal(await countLiveCodes(user.userId), 1, "only the newest code is live");

      await ageBudget(user.userId);
      assert.equal(
        (await request(user.first.token)).status,
        200,
        "issuance capacity returns on its own",
      );
    });

    it("shares one budget across server processes and survives a restart", async () => {
      const user = await signedIn("throttle-shared");
      const token = user.first.token;
      await request(token);

      const peer = await spawnServer(PEER_PORT);
      try {
        // Four guesses split between two processes. A per-process counter would
        // have allowed four more, and a restart would have cleared all of them.
        const results = [
          await submit(token, "123456", NEXT_PASSWORD, PORT),
          await submit(token, "123456", NEXT_PASSWORD, PEER_PORT),
          await submit(token, "123456", NEXT_PASSWORD, PEER_PORT),
          await submit(token, "123456", NEXT_PASSWORD, PORT),
        ];
        assert.deepEqual(
          results.map((result) => result.status),
          [400, 400, 400, 400],
          "each process spends part of the same shared budget",
        );

        assert.equal(
          (await submit(token, "123456", NEXT_PASSWORD, PORT)).status,
          429,
          "exhausted here",
        );
        assert.equal(
          (await submit(token, "123456", NEXT_PASSWORD, PEER_PORT)).status,
          429,
          "and exhausted for the peer",
        );
      } finally {
        await stopServer(peer);
      }

      // Restart the primary backend: the block has to come back out of MySQL.
      await stopServer(server);
      server = await spawnServer(PORT);

      const code = await liveCode(user.userId);
      assert.ok(code, "the live code is still stored");
      assert.equal(
        (await submit(token, code)).status,
        429,
        "a fresh process reloads the exhausted budget instead of granting a new one",
      );
      assert.equal((await login(user.email, PASSWORD)).status, 200, "the account is intact");

      await ageBudget(user.userId);
      assert.equal((await submit(token, code)).status, 200, "the aged window releases the owner");
    });
  });

  describe("mail transport failure", () => {
    let mailFailServer;

    before(async () => {
      mailFailServer = await spawnServer(MAIL_FAIL_PORT, { EMAIL_FORCE_FAIL: "true" });
    });

    after(async () => {
      await stopServer(mailFailServer);
    });

    it("refuses an admin reset and leaves the target untouched when the mail fails", async () => {
      const admin = await signedIn("mailfail-admin", "Admin");
      const target = await signedIn("mailfail-target");

      const result = await callOn(MAIL_FAIL_PORT, "POST", "/auth/reset-user-password", admin.first.token, {
        targetUserId: target.userId,
        newPassword: NEXT_PASSWORD,
      });

      assert.equal(result.status, 500, result.text);
      assert.equal(result.body.success, false);
      assert.match(result.body.message, /password was not changed/i);
      assert.ok(
        !result.text.includes(NEXT_PASSWORD),
        "the undelivered credential is never echoed back",
      );

      assert.equal(
        (await loginOn(MAIL_FAIL_PORT, target.email, PASSWORD)).status,
        200,
        "the old password still signs in",
      );
      assert.equal(
        (await loginOn(MAIL_FAIL_PORT, target.email, NEXT_PASSWORD)).status,
        401,
        "the password nobody received was never stored",
      );
      assert.equal(
        (await meOn(MAIL_FAIL_PORT, target.first.token)).status,
        200,
        "no session was revoked by a reset that did not happen",
      );
    });

    it("stores nothing and answers generically when the code email fails", async () => {
      const user = await signedIn("mailfail-code");

      const result = await request(user.first.token, MAIL_FAIL_PORT);
      assert.equal(result.status, 500, result.text);
      assert.match(result.body.message, /failed to send verification code/i);
      assert.ok(
        !/password_reset_codes|user_sessions|ER_[A-Z_]+|mysql|SELECT |UPDATE |INSERT /i.test(
          result.text,
        ),
        `no database internals in the response: ${result.text}`,
      );
      assert.equal(await countLiveCodes(user.userId), 0, "an undeliverable code is never persisted");
    });
  });

  describe("admin reset path", () => {
    it("keeps the endpoint Admin-only and drops every target session", async () => {
      const admin = await signedIn("admin-actor", "Admin");
      const target = await signedIn("admin-target");

      const denied = await call("POST", "/auth/reset-user-password", target.first.token, {
        targetUserId: target.userId,
        newPassword: NEXT_PASSWORD,
      });
      assert.equal(denied.status, 403);
      assert.equal((await login(target.email, PASSWORD)).status, 200, "denied reset changed nothing");

      await request(target.first.token);
      assert.ok(await liveCode(target.userId), "target had a live code");

      const tempPassword = "AdmReset@123";
      const allowed = await call("POST", "/auth/reset-user-password", admin.first.token, {
        targetUserId: target.userId,
        newPassword: tempPassword,
      });
      assert.equal(allowed.status, 200, allowed.text);

      assert.equal(await countLiveCodes(target.userId), 0, "outstanding code voided");
      assert.equal((await me(target.first.token)).status, 401, "target session revoked");
      assert.equal((await me(target.second.token)).status, 401, "second target session revoked");
      assert.equal((await login(target.email, PASSWORD)).status, 401);
      assert.equal((await login(target.email, tempPassword)).status, 200);
      assert.equal((await me(admin.first.token)).status, 200, "admin session untouched");
    });
  });
});

guardExecutedTests("PASSWORD_RESET_HTTP", 15);
