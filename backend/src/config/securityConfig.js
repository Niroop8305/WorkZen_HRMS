// Central source of truth for the HTTP perimeter: Helmet security headers and
// the global /api rate limiter (T-004). server.js stays a thin mount point so
// the configuration is importable and testable without booting the database.
//
// Threat model notes:
// - The CSP is SPA-compatible: the Vite build emits inline <style> in the HTML
//   shell, so styleSrc allows 'unsafe-inline'. Scripts stay 'self' only - the
//   build never emits inline scripts.
// - HSTS is deliberately off until the deployment terminates TLS; enabling it
//   over plain HTTP would brick the API for browsers that remember it.
// - The limiter is a blunt flood guard in front of the per-account, DB-backed
//   auth throttles (auth_throttle), not a replacement for them: it bounds
//   request volume per IP without any storage, so it cannot be defeated by
//   clearing a table and cannot fail the request path on a DB outage.

import helmet from "helmet";
import rateLimit from "express-rate-limit";

const ON_VALUES = new Set(["true", "yes", "on"]);
// "1" is deliberately NOT an on-token: as TRUST_PROXY it means "trust one
// hop", a hop count, and the ON check would have swallowed it.
const OFF_VALUES = new Set(["", "false", "0", "no", "off"]);
const TRUST_PROXY_PATTERN =
  /^(loopback|linklocal|uniquelocal|\d{1,2}|[0-9a-fA-F:.]+)(,( ?)(loopback|linklocal|uniquelocal|\d{1,2}|[0-9a-fA-F:.]+))*$/;

export const resolveTrustProxy = (raw = process.env.TRUST_PROXY) => {
  const value = (raw ?? "").trim();
  if (OFF_VALUES.has(value.toLowerCase())) return false;
  if (ON_VALUES.has(value.toLowerCase())) return true;
  if (TRUST_PROXY_PATTERN.test(value)) return value;
  throw new Error(
    "TRUST_PROXY must be true, false, loopback/linklocal/uniquelocal, a hop " +
      `count, an IP/CIDR list, or unset (got an unsafe value). Unset keeps ` +
      "Express's default (no proxy) so X-Forwarded-For cannot be spoofed.",
  );
};

export const corsOrigins = () => {
  const primary = process.env.CORS_ORIGIN || "http://localhost:5173";
  return primary
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const buildHelmetOptions = () => {
  const self = "'self'";
  const apiOrigins = [...new Set([self, ...corsOrigins()])];
  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: [self],
        scriptSrc: [self],
        styleSrc: [self, "'unsafe-inline'"],
        imgSrc: [self, "data:", "blob:"],
        fontSrc: [self, "data:"],
        connectSrc: apiOrigins,
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: [self],
        formAction: [self],
        // Same-origin by default; the SPA is served from the same origin or
        // same host in every supported deployment shape.
        frameSrc: ["'none'"],
        workerSrc: [self],
        upgradeInsecureRequests: null,
      },
    },
    // Off until the stack terminates TLS; flip on in DEPLOYMENT.md's TLS step.
    hsts: false,
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
  };
};

export const securityHeaders = () => helmet(buildHelmetOptions());

export const resolveLimiterWindows = () => {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  // Tier rationale: a legitimate HR workflow is bursty - a role-permission
  // sweep, a bulk attendance correction or a report run can issue hundreds of
  // calls in a minute from one seat. The tiers keep a flood bound (a few
  // requests per second sustained) without criminalizing real usage; the
  // credential-guessing burden stays with the per-account DB throttle.
  const authedReads = Number(process.env.RATE_LIMIT_AUTHED_READS ?? 900);
  // Unauthenticated 300/min: an office behind one NAT IP shares this budget,
  // so it must be roomy; credential-stuffing stays bounded by the per-account
  // DB throttle, which is the layer that actually keys on the account.
  const unauthed = Number(process.env.RATE_LIMIT_UNAUTHED ?? 300);
  const mutations = Number(process.env.RATE_LIMIT_MUTATIONS ?? 300);
  const finite = (value) => Number.isFinite(value) && value > 0;
  if (![windowMs, authedReads, unauthed, mutations].every(finite)) {
    throw new Error(
      "RATE_LIMIT_* variables must be positive finite numbers of requests.",
    );
  }
  return { windowMs, authedReads, unauthed, mutations };
};

export const createApiLimiter = (overrides = {}) => {
  const { windowMs, authedReads, unauthed, mutations } = resolveLimiterWindows();
  const limit = (req) => {
    // Preflight must never be counted: a blocked OPTIONS response with no CORS
    // headers would look like a broken API rather than a rate limit.
    if (req.method === "OPTIONS") return Number.MAX_SAFE_INTEGER;
    const isMutation = !["GET", "HEAD"].includes(req.method);
    if (isMutation) return mutations;
    return req.headers?.authorization ? authedReads : unauthed;
  };
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.method === "OPTIONS" || req.path === "/health" || req.path === "/api/health",
    message: {
      success: false,
      message: "Too many requests. Please slow down and try again shortly.",
    },
    ...overrides,
  });
};
