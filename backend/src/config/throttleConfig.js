import crypto from "crypto";

// Login-throttle policy and key material.
//
// The values here are the approved product decisions, stated once so the model,
// the controller and the tests cannot drift apart:
//   * 10 failed credentials inside a 15-minute fixed window locks the account,
//   * the lockout lasts 15 minutes,
//   * a maximum of 5 sessions may be active for one user,
//   * revoked sessions stay queryable for 90 days before pruning may remove them,
//   * an idle failure bucket may be swept after the retention floor,
//   * a throttle-store failure refuses the login with 503 instead of skipping it,
//   * IP-address buckets stay defined but unused until the deployment proxy
//     topology is confirmed, because trusting a client-supplied forwarding header
//     would make the budget trivially bypassable.
export const MAX_FAILED_LOGINS = 10;
export const FAILURE_WINDOW_MINUTES = 15;
export const LOCKOUT_MINUTES = 15;
export const MAX_ACTIVE_SESSIONS = 5;
export const SESSION_RETENTION_DAYS = 90;
// T-002: absolute session lifetime. A refresh-token is not part of this stack,
// so the JWT itself only carries a session id; without a server-side absolute
// expiry a session (and therefore the account) stays valid for as long as the
// JWT's configured lifetime allows on every device that kept the token.
// Hours, wall-clock from issuance, enforced at issuance and at validation.
export const SESSION_ABSOLUTE_TTL_HOURS = 24;
export const THROTTLE_IDLE_RETENTION_MINUTES = 60;
export const THROTTLE_ROW_CAP = 100000;
export const MAX_EMAIL_LENGTH = 255;

// One client-facing sentence for every way the throttle storage can be unusable.
// It names no table, driver or reason, because the response is rendered to an
// unauthenticated caller.
export const THROTTLE_UNAVAILABLE_MESSAGE =
  "Sign-in is temporarily unavailable. Please try again.";

// Bucket namespaces. Keeping a failed-credential count and a request count in
// separate namespaces is what stops a flood of malformed requests from becoming
// an account lockout, and lets a successful login clear one budget without
// touching the other. `ip:req` is declared for the future request budget and is
// deliberately not written to by any request path yet.
export const FAILED_CREDENTIAL_NAMESPACE = "acct:fail:";
export const REQUEST_NAMESPACE = "acct:req:";
export const IP_REQUEST_NAMESPACE = "ip:req:";

const KEY_SALT = "workzen-auth-throttle-v1";
const KEY_INFO = "bucket-digest";
const MIN_KEY_MATERIAL_LENGTH = 32;

let cachedKey;
let cachedKeySource;

// Bucket keys must not be reversible, so an email is never stored. The digest
// key comes from deployment secret rather than from anything in the repository:
// an explicit THROTTLE_DIGEST_KEY when the operator provides one, otherwise an
// HKDF expansion of JWT_SECRET with its own salt and info, which keeps the
// throttle domain cryptographically separate from token signing. Rotating the
// source secret resets counters, which is a documented and acceptable cost: the
// state is a short-lived window, not an audit record.
export const getThrottleDigestKey = () => {
  if (cachedKey) return cachedKey;

  const explicit = process.env.THROTTLE_DIGEST_KEY;
  if (typeof explicit === "string" && explicit.trim().length >= MIN_KEY_MATERIAL_LENGTH) {
    cachedKey = Buffer.from(explicit.trim(), "utf8");
    cachedKeySource = "THROTTLE_DIGEST_KEY";
    return cachedKey;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (typeof jwtSecret === "string" && jwtSecret.trim().length >= MIN_KEY_MATERIAL_LENGTH) {
    cachedKey = Buffer.from(
      crypto.hkdfSync("sha256", Buffer.from(jwtSecret.trim(), "utf8"), Buffer.from(KEY_SALT), Buffer.from(KEY_INFO), 32),
    );
    cachedKeySource = "derived from JWT_SECRET";
    return cachedKey;
  }

  // No usable key means no safe bucket, and an unthrottled login path is not an
  // acceptable fallback. The caller turns this into a 503.
  throw new Error(
    "Throttle configuration unavailable: set THROTTLE_DIGEST_KEY (>=32 chars) or a JWT_SECRET of at least 32 characters",
  );
};

// Test support only: the cache must not leak a key across a mocked secret change.
export const resetThrottleDigestKeyCache = () => {
  cachedKey = undefined;
  cachedKeySource = undefined;
};

export const getThrottleDigestKeySource = () => cachedKeySource;

// The lookup that decides whether a bucket already exists is the same
// case-insensitive, trimmed comparison `users.email = ?` performs under
// utf8mb4_unicode_ci. Normalizing any other way would let an attacker vary the
// casing of one address to start a fresh counter, so this is load-bearing.
// Known limitation: a collation-equivalent pair that differs beyond ASCII case
// (for example a dotted and dotless 'i') hashes to two buckets for one account;
// the failure then applies to only one of the two spellings.
export const normalizeThrottleEmail = (email) => {
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) return null;
  return trimmed.toLowerCase();
};
