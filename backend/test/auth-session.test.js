import { assertScratchDatabase } from "./support/dbGuard.js";

// T-007 tripwire: this suite writes to the database; it must never run
// against a protected application schema. Fails closed before any test
// registers.
assertScratchDatabase("auth-session");

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { protect } from "../src/middleware/auth.js";
import { Session } from "../src/models/sessionModel.js";
import {
  assertAuthConfig,
  getJwtExpirySeconds,
  resolveJwtExpirySeconds,
} from "../src/config/authConfig.js";
import pool from "../src/config/database.js";

// HIGH-3 regression suite: JWTs are bound to server-side user_sessions rows.
// protect() must fail closed whenever the session store disagrees with the
// token, and JWT configuration must never produce non-expiring tokens.
//
// Isolation: own temporary user + sessions, hard-deleted in teardown.
const stamp = Date.now();
const SECRET = process.env.JWT_SECRET;

let tempUserId;
let employeeRoleId;
let hrRoleId;
const sessionIds = [];

const sign = (payload, options = {}) =>
  jwt.sign(payload, SECRET, { expiresIn: "5m", ...options });

const runProtect = (authorization) =>
  new Promise((resolve) => {
    const req = {
      headers: authorization ? { authorization: `Bearer ${authorization}` } : {},
    };
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ status: this.statusCode, body });
      },
    };
    protect(req, res, () => resolve({ nextCalled: true, req }));
  });

describe("HIGH-3 session-bound JWT validation", () => {
  before(async () => {
    const [roles] = await pool.query(
      "SELECT role_id, role_name FROM roles WHERE role_name IN ('Employee','HR Officer')",
    );
    employeeRoleId = roles.find((r) => r.role_name === "Employee").role_id;
    hrRoleId = roles.find((r) => r.role_name === "HR Officer").role_id;

    const [userRes] = await pool.query(
      `INSERT INTO users (role_id, email, password_hash, is_active)
       VALUES (?, ?, 'x', TRUE)`,
      [employeeRoleId, `session-unit-${stamp}@example.test`],
    );
    tempUserId = userRes.insertId;
  });

  after(async () => {
    if (tempUserId) {
      await pool.query("DELETE FROM users WHERE user_id = ?", [tempUserId]);
    }
    await pool.end();
  });

  describe("token extraction and JWT verification", () => {
    it("rejects requests without a token", async () => {
      const { status, body } = await runProtect(null);
      assert.equal(status, 401);
      assert.equal(body.success, false);
    });

    it("rejects expired tokens", async () => {
      const sessionId = await Session.create(tempUserId);
      sessionIds.push(sessionId);
      const token = sign(
        { userId: tempUserId, roleId: employeeRoleId, roleName: "Employee", sessionId },
        { expiresIn: "1ms" },
      );
      await new Promise((r) => setTimeout(r, 20));
      const { status } = await runProtect(token);
      assert.equal(status, 401);
    });

    it("rejects tokens signed with the wrong secret", async () => {
      const sessionId = await Session.create(tempUserId);
      sessionIds.push(sessionId);
      const token = jwt.sign(
        { userId: tempUserId, roleId: employeeRoleId, roleName: "Employee", sessionId },
        "not-the-real-secret-not-the-real-secret",
        { expiresIn: "5m" },
      );
      const { status } = await runProtect(token);
      assert.equal(status, 401);
    });
  });

  describe("server-side session validation", () => {
    const freshToken = async () => {
      const sessionId = await Session.create(tempUserId);
      sessionIds.push(sessionId);
      return sign({
        userId: tempUserId,
        roleId: employeeRoleId,
        roleName: "Employee",
        sessionId,
      });
    };

    it("accepts a valid token for an active user with a live session", async () => {
      const token = await freshToken();
      const result = await runProtect(token);
      assert.ok(result.nextCalled, "request passed protect");
      assert.equal(result.req.user.userId, tempUserId);
      assert.equal(result.req.user.roleName, "Employee");
      assert.ok(Number.isInteger(result.req.user.sessionId));
    });

    it("rejects a token whose session was revoked (logout)", async () => {
      const sessionId = await Session.create(tempUserId);
      sessionIds.push(sessionId);
      const token = sign({
        userId: tempUserId,
        roleId: employeeRoleId,
        roleName: "Employee",
        sessionId,
      });

      await Session.revokeById(sessionId);
      const { status, body } = await runProtect(token);
      assert.equal(status, 401);
      assert.match(body.message, /expired or logged out/i);

      // idempotent: revoking again is a no-op
      await Session.revokeById(sessionId);
    });

    it("rejects tokens when the account was deactivated", async () => {
      const token = await freshToken();
      await pool.query("UPDATE users SET is_active = 0 WHERE user_id = ?", [
        tempUserId,
      ]);
      try {
        const { status, body } = await runProtect(token);
        assert.equal(status, 403);
        assert.match(body.message, /deactivated/i);
      } finally {
        await pool.query("UPDATE users SET is_active = 1 WHERE user_id = ?", [
          tempUserId,
        ]);
      }
    });

    it("rejects old-role claims after a demotion (DB role is authoritative)", async () => {
      const token = await freshToken();
      await pool.query("UPDATE users SET role_id = ? WHERE user_id = ?", [
        hrRoleId,
        tempUserId,
      ]);
      try {
        const { status, body } = await runProtect(token);
        assert.equal(status, 401);
        assert.match(body.message, /no longer matches/i);
      } finally {
        await pool.query("UPDATE users SET role_id = ? WHERE user_id = ?", [
          employeeRoleId,
          tempUserId,
        ]);
      }
    });

    it("rejects tokens issued before the session was created (superseded)", async () => {
      const sessionId = await Session.create(tempUserId);
      sessionIds.push(sessionId);
      const iat = Math.floor(Date.now() / 1000) - 3600;
      const token = sign(
        {
          userId: tempUserId,
          roleId: employeeRoleId,
          roleName: "Employee",
          sessionId,
          iat,
        },
        { noTimestamp: true },
      );
      const { status } = await runProtect(token);
      assert.equal(status, 401);
    });

    it("rejects tokens without a session id claim", async () => {
      const token = sign({
        userId: tempUserId,
        roleId: employeeRoleId,
        roleName: "Employee",
      });
      const { status } = await runProtect(token);
      assert.equal(status, 401);
    });

    it("rejects session ids that do not exist", async () => {
      const token = sign({
        userId: tempUserId,
        roleId: employeeRoleId,
        roleName: "Employee",
        sessionId: 99999999,
      });
      const { status } = await runProtect(token);
      assert.equal(status, 401);
    });

    it("fails closed when the session store cannot be read", async () => {
      const sessionId = await Session.create(tempUserId);
      sessionIds.push(sessionId);
      const token = sign({
        userId: tempUserId,
        roleId: employeeRoleId,
        roleName: "Employee",
        sessionId,
      });

      const original = Session.findActiveById;
      Session.findActiveById = async () => {
        throw new Error("simulated store outage");
      };
      try {
        const { status, body } = await runProtect(token);
        assert.equal(status, 500);
        assert.match(body.message, /unavailable/i);
      } finally {
        Session.findActiveById = original;
      }

      // store healthy again -> token works
      const ok = await runProtect(token);
      assert.ok(ok.nextCalled);
    });
  });

  describe("revocation helpers", () => {
    it("revokeAllForUser kills every session of the user", async () => {
      const a = await Session.create(tempUserId);
      const b = await Session.create(tempUserId);
      sessionIds.push(a, b);
      await Session.revokeAllForUser(tempUserId);

      const [rows] = await pool.query(
        "SELECT COUNT(*) AS open FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL",
        [tempUserId],
      );
      assert.equal(rows[0].open, 0);
    });

    it("revokeOthersForUser keeps exactly one session", async () => {
      const keep = await Session.create(tempUserId);
      const other = await Session.create(tempUserId);
      sessionIds.push(keep, other);
      await Session.revokeOthersForUser(tempUserId, keep);

      const [rows] = await pool.query(
        `SELECT session_id, revoked_at FROM user_sessions
         WHERE session_id IN (?, ?) ORDER BY session_id`,
        [keep, other],
      );
      const kept = rows.find((r) => r.session_id === keep);
      const dropped = rows.find((r) => r.session_id === other);
      assert.equal(kept.revoked_at, null);
      assert.notEqual(dropped.revoked_at, null);
    });
  });

  describe("JWT configuration guard", () => {
    const savedSecret = process.env.JWT_SECRET;
    const savedExpire = process.env.JWT_EXPIRE;

    after(() => {
      process.env.JWT_SECRET = savedSecret;
      process.env.JWT_EXPIRE = savedExpire;
    });

    it("parses supported expiry formats to finite seconds", () => {
      assert.equal(resolveJwtExpirySeconds("7d"), 604800);
      assert.equal(resolveJwtExpirySeconds("12h"), 43200);
      assert.equal(resolveJwtExpirySeconds("30m"), 1800);
      assert.equal(resolveJwtExpirySeconds("3600"), 3600);
      assert.equal(resolveJwtExpirySeconds("2w"), 1209600);
    });

    it("rejects non-finite or malformed expiry values", () => {
      for (const bad of ["", "abc", "7x", "-1d", "forever", null, undefined]) {
        assert.ok(
          Number.isNaN(resolveJwtExpirySeconds(bad)),
          `${String(bad)} is not a valid expiry`,
        );
      }
      // "0" parses but must be rejected as non-positive by the guard
      assert.equal(resolveJwtExpirySeconds("0"), 0);
    });

    it("assertAuthConfig throws without a usable secret", () => {
      process.env.JWT_SECRET = "";
      process.env.JWT_EXPIRE = "7d";
      assert.throws(() => assertAuthConfig(), /JWT_SECRET/);
      process.env.JWT_SECRET = "tooshort";
      assert.throws(() => assertAuthConfig(), /JWT_SECRET/);
    });

    it("assertAuthConfig throws when expiry is missing, non-finite or too long", () => {
      process.env.JWT_SECRET = "x".repeat(40);
      for (const bad of ["", "never", "abc", "0", "31d", "999d"]) {
        process.env.JWT_EXPIRE = bad;
        assert.throws(() => assertAuthConfig(), /JWT_EXPIRE/, `${bad} rejected`);
      }
    });

    it("assertAuthConfig accepts a finite, sane configuration", () => {
      process.env.JWT_SECRET = "x".repeat(40);
      process.env.JWT_EXPIRE = "7d";
      const config = assertAuthConfig();
      assert.equal(config.expiresIn, "7d");
      assert.ok(getJwtExpirySeconds() > 0);
    });
  });
});
