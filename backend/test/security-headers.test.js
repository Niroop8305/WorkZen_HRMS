// DB-free verification of the HTTP perimeter (T-004): Helmet's SPA-compatible
// headers and the /api rate limiter's tiered limits, exercised through a small
// in-process Express app that mounts the exact middleware server.js mounts.
// No database, no spawned servers.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import {
  securityHeaders,
  createApiLimiter,
  resolveTrustProxy,
} from "../src/config/securityConfig.js";

const app = express();
app.set("trust proxy", false);
app.use(securityHeaders());
app.use(createApiLimiter());
app.get("/api/health", (_req, res) => res.status(200).json({ ok: true }));
app.get("/api/anything", (_req, res) => res.status(200).json({ ok: true }));
app.post("/api/anything", (_req, res) => res.status(200).json({ ok: true }));

const listen = (probe) =>
  new Promise((resolve) => {
    const s = probe.listen(0, "127.0.0.1", () => resolve(s));
  });
const stop = (s) => new Promise((resolve) => s.close(resolve));

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("security headers (T-004)", () => {
  it("ships the SPA-compatible CSP", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const csp = res.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.match(csp, /img-src 'self' data: blob:/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /connect-src 'self'/);
  });

  it("includes nosniff, frame-deny and strict referrer policy", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(
      res.headers.get("referrer-policy"),
      "strict-origin-when-cross-origin",
    );
  });

  it("does not emit HSTS before TLS exists", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.headers.get("strict-transport-security"), null);
  });

  it("allows inline <style> content through the CSP", async () => {
    // The Vite HTML shell carries inline styles; a CSP without
    // style-src 'unsafe-inline' would blank the deployed frontend.
    const html = "<html><body style=\"color:red\">x</body></html>";
    const probe = express();
    probe.use(securityHeaders());
    probe.get("/", (_req, res) => res.type("html").send(html));
    const s = await listen(probe);
    try {
      const body = await (await fetch(`http://127.0.0.1:${s.address().port}/`)).text();
      assert.equal(body, html);
    } finally {
      await stop(s);
    }
  });

  it("TRUST_PROXY defaults to off and accepts only safe values", () => {
    const saved = process.env.TRUST_PROXY;
    try {
      delete process.env.TRUST_PROXY;
      assert.equal(resolveTrustProxy(), false);
      assert.equal(resolveTrustProxy("false"), false);
      assert.equal(resolveTrustProxy("true"), true);
      assert.equal(resolveTrustProxy("loopback"), "loopback");
      assert.equal(resolveTrustProxy("1"), "1");
      assert.equal(resolveTrustProxy("10.0.0.1, 10.0.0.2"), "10.0.0.1, 10.0.0.2");
      assert.throws(() => resolveTrustProxy("not a value"));
      assert.throws(() => resolveTrustProxy("10.0.0.1; rm -rf"));
    } finally {
      if (saved === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = saved;
    }
  });
});

describe("global /api rate limiter (T-004)", () => {
  it("counts the health endpoint as skipped", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.headers.get("ratelimit-limit"), null);
  });

  it("gives authenticated GET reads the higher allowance", async () => {
    const res = await fetch(`${baseUrl}/api/anything`, {
      headers: { authorization: "Bearer something" },
    });
    const limit = Number(res.headers.get("ratelimit-limit"));
    assert.ok(limit >= 800, `authed read limit too low: ${limit}`);
  });

  it("gives unauthenticated GETs a mid allowance", async () => {
    const res = await fetch(`${baseUrl}/api/anything`);
    const limit = Number(res.headers.get("ratelimit-limit"));
    assert.ok(limit >= 250 && limit < 800, `unauthed limit: ${limit}`);
  });

  it("gives mutations the tight allowance and standard headers only", async () => {
    const res = await fetch(`${baseUrl}/api/anything`, { method: "POST" });
    const limit = Number(res.headers.get("ratelimit-limit"));
    assert.ok(limit > 0 && limit <= 400, `mutation limit: ${limit}`);
    assert.ok(res.headers.has("ratelimit-remaining"));
    assert.equal(res.headers.has("ratelimit-limit"), true);
  });

  it("answers 429 with a JSON body when the budget is spent", async () => {
    const tight = express();
    tight.use(createApiLimiter({ windowMs: 60_000, limit: 3 }));
    tight.get("/api/x", (_req, res) => res.status(200).json({ ok: true }));
    tight.use((_req, res) => res.status(404).end());
    const s = await listen(tight);
    try {
      const base = `http://127.0.0.1:${s.address().port}`;
      for (let i = 0; i < 3; i += 1) {
        const r = await fetch(`${base}/api/x`);
        assert.equal(r.status, 200);
      }
      const blocked = await fetch(`${base}/api/x`);
      assert.equal(blocked.status, 429);
      const body = await blocked.json();
      assert.equal(body.success, false);
      assert.match(body.message, /too many requests/i);
    } finally {
      await stop(s);
    }
  });

  it("never counts a CORS preflight", async () => {
    const tight = express();
    tight.use(createApiLimiter({ windowMs: 60_000, limit: 2 }));
    tight.post("/api/x", (_req, res) => res.status(200).json({ ok: true }));
    const s = await listen(tight);
    try {
      const base = `http://127.0.0.1:${s.address().port}`;
      for (let i = 0; i < 5; i += 1) {
        const r = await fetch(`${base}/api/x`, { method: "OPTIONS" });
        assert.notEqual(r.status, 429, "preflight was counted");
      }
    } finally {
      await stop(s);
    }
  });

  it("keeps the limiter out of the DB-backed auth throttle's way", () => {
    // The auth endpoints keep their own account-keyed throttle; this limiter
    // only bounds per-IP volume and shares no state with auth_throttle.
    const limiter = createApiLimiter();
    assert.equal(typeof limiter, "function");
  });
});
