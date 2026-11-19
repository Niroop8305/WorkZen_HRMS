// Regression guard for T-005: JWT verification and signing are pinned to a
// single algorithm (HS256) with no fallback.
//
// The defect was that `jwt.verify(token, secret)` accepted any HMAC variant
// (HS384, HS512) signed with the same secret, and any future key-type change
// could have broadened what a forged `alg` header could reach. The sign path
// relied on the library default instead of stating the algorithm outright.
//
// Database-free by construction: mysql2's createPool is replaced before any
// application module is imported, so no connection can be requested and
// nothing can be written to the protected application schema. `after()` proves
// both. The static contract tests read source files only — they never import
// the controller.

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";

const realCreatePool = mysql.createPool;

const TEST_SECRET = "jwt-algorithm-pinning-test-secret-32-chars-minimum";

/** Recorded SQL, so every assertion is about what the code actually asked for. */
const calls = [];
let storedRows = [];

const fakePool = {
  async query(sql, values = []) {
    calls.push({ sql, values });
    return [storedRows, []];
  },
  async getConnection() {
    throw new Error("algorithm pinning must not need a transaction connection");
  },
  end() {},
};

mysql.createPool = () => fakePool;

const { protect } = await import("../src/middleware/auth.js");
const { JWT_ALGORITHM } = await import("../src/config/authConfig.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const authMiddlewareSource = fs.readFileSync(
  path.join(backendRoot, "src", "middleware", "auth.js"),
  "utf8",
);
const authControllerSource = fs.readFileSync(
  path.join(backendRoot, "src", "controllers", "authController.js"),
  "utf8",
);
const authConfigSource = fs.readFileSync(
  path.join(backendRoot, "src", "config", "authConfig.js"),
  "utf8",
);

// `protect` reads the secret from the environment at verify time, so pin it for
// the whole file. 32+ characters satisfies the boot guard's own policy.
process.env.JWT_SECRET = TEST_SECRET;

// A session row exactly as `Session.findActiveById` returns it (user_sessions
// joined to users + roles).
const liveSessionRow = (sessionId, overrides = {}) => ({
  session_id: sessionId,
  user_id: 12,
  issued_at: new Date(),
  revoked_at: null,
  is_active: 1,
  role_id: 1,
  role_name: "Admin",
  ...overrides,
});

const resetStore = (rows = []) => {
  calls.length = 0;
  storedRows = rows;
};

const claims = (sessionId, extra = {}) => ({
  userId: 12,
  roleId: 1,
  roleName: "Admin",
  sessionId,
  ...extra,
});

const signWith = (alg, secret = TEST_SECRET, payload = claims(101)) =>
  jwt.sign(payload, secret, { algorithm: alg, expiresIn: "5m" });

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

// Hand-craft a token with an arbitrary header/payload/signature triple, for
// forgeries the library would never sign itself (alg: none, asymmetric algs).
const forgedToken = (header, payload, signature) =>
  [
    Buffer.from(JSON.stringify(header)).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    signature,
  ].join(".");

describe("JWT algorithm pinning (T-005)", () => {
  describe("verification accepts exactly the pinned algorithm", () => {
    it("exposes the pinned algorithm as HS256", () => {
      assert.equal(JWT_ALGORITHM, "HS256");
    });

    it("accepts a correctly signed HS256 token for a live session", async () => {
      resetStore([liveSessionRow(101)]);
      const token = signWith("HS256");
      assert.equal(jwt.decode(token, { complete: true }).header.alg, "HS256");

      const result = await runProtect(token);
      assert.ok(result.nextCalled, "request passed protect");
      assert.equal(result.req.user.userId, 12);
      assert.equal(result.req.user.sessionId, 101);
    });

    it("rejects an HS384 token signed with the same secret", async () => {
      resetStore([liveSessionRow(102)]);
      const token = signWith("HS384");
      const { status, body } = await runProtect(token);
      assert.equal(status, 401);
      assert.equal(body.success, false);
      assert.deepEqual(calls, [], "no session lookup ran for a rejected token");
    });

    it("rejects an HS512 token signed with the same secret", async () => {
      resetStore([liveSessionRow(103)]);
      const { status } = await runProtect(signWith("HS512"));
      assert.equal(status, 401);
    });
  });

  describe("forged algorithm headers cannot bypass verification", () => {
    it("rejects an alg:none token with an empty signature", async () => {
      resetStore([liveSessionRow(104)]);
      const token = forgedToken(
        { alg: "none", typ: "JWT" },
        claims(104),
        "",
      );
      const { status } = await runProtect(token);
      assert.equal(status, 401);
      assert.deepEqual(calls, [], "an unsigned token never reached the session store");
    });

    it("rejects a hand-crafted RS256 header (asymmetric downgrade attempt)", async () => {
      resetStore([liveSessionRow(105)]);
      const token = forgedToken(
        { alg: "RS256", typ: "JWT" },
        claims(105),
        Buffer.from("attacker-controlled-signature").toString("base64url"),
      );
      const { status } = await runProtect(token);
      assert.equal(status, 401);
    });

    it("rejects a token whose HS256 header was swapped to HS384 after signing", async () => {
      resetStore([liveSessionRow(106)]);
      const token = signWith("HS256");
      const [, payload, signature] = token.split(".");
      const swapped = forgedToken(
        { alg: "HS384", typ: "JWT" },
        JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
        signature,
      );
      const { status } = await runProtect(swapped);
      assert.equal(status, 401);
    });

    it("rejects an HS256 token signed with the wrong secret", async () => {
      resetStore([liveSessionRow(107)]);
      const { status } = await runProtect(
        signWith("HS256", "not-the-real-secret-not-the-real-secret"),
      );
      assert.equal(status, 401);
    });

    it("rejects an HS256 token with an altered payload", async () => {
      resetStore([liveSessionRow(108)]);
      const token = signWith("HS256");
      const [header, , signature] = token.split(".");
      const tampered = `${header}.${Buffer.from(
        JSON.stringify(claims(108, { roleName: "Admin" })),
      ).toString("base64url")}.${signature}`;
      const { status } = await runProtect(tampered);
      assert.equal(status, 401);
    });

    it("rejects a structurally invalid token", async () => {
      resetStore([liveSessionRow(109)]);
      const { status } = await runProtect("not-a-jwt");
      assert.equal(status, 401);
    });
  });

  describe("static contract: both JWT call sites are pinned", () => {
    it("verify passes an explicit algorithms option", () => {
      assert.match(
        authMiddlewareSource,
        /algorithms:\s*\[JWT_ALGORITHM\]/,
        "auth.js must pin the verify algorithms list",
      );
      assert.doesNotMatch(
        authMiddlewareSource,
        /jwt\.verify\(\s*token,\s*process\.env\.JWT_SECRET\s*\)/,
        "no unpinned jwt.verify call may remain",
      );
    });

    it("the sign path states the algorithm explicitly", () => {
      assert.match(
        authControllerSource,
        /algorithm:\s*JWT_ALGORITHM/,
        "generateToken must pin the signing algorithm",
      );
    });

    it("the middleware and controller share the same exported constant", () => {
      assert.match(
        authMiddlewareSource,
        /import\s*\{\s*JWT_ALGORITHM\s*\}\s*from\s*"\.\.\/config\/authConfig\.js"/,
      );
      assert.match(
        authControllerSource,
        /import\s*\{\s*JWT_ALGORITHM\s*\}\s*from\s*"\.\.\/config\/authConfig\.js"/,
      );
    });

    it("no other JWT sign or verify call sites exist in the backend", () => {
      const srcDir = path.join(backendRoot, "src");
      const files = fs.readdirSync(srcDir, { recursive: true, encoding: "utf8" })
        .filter((f) => f.endsWith(".js"))
        .map((f) => path.join(srcDir, f));
      const signSites = [];
      const verifySites = [];
      for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        for (const match of source.matchAll(/jwt\.(sign|verify)\(/g)) {
          (match[1] === "sign" ? signSites : verifySites).push(
            path.relative(backendRoot, file),
          );
        }
      }
      assert.deepEqual(verifySites, ["src\\middleware\\auth.js"]);
      assert.deepEqual(signSites, ["src\\controllers\\authController.js"]);
    });

    it("the constant is defined once in authConfig.js", () => {
      const definitions = authConfigSource.match(/JWT_ALGORITHM\s*=/g) ?? [];
      assert.equal(definitions.length, 1);
      assert.match(authConfigSource, /export const JWT_ALGORITHM = "HS256"/);
    });
  });
});

after(() => {
  mysql.createPool = realCreatePool;
});
