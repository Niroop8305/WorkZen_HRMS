// Central validation of the JWT configuration. Anything signed here must
// expire: a missing, malformed or absurdly long JWT_EXPIRE must never produce
// a token without a finite lifetime, and a weak/absent JWT_SECRET must not be
// accepted silently.
const UNIT_SECONDS = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31536000,
};

const MAX_EXPIRY_SECONDS = 30 * 86400;

// The one JWT algorithm this application uses. `jwt.sign` defaults to HS256,
// but `jwt.verify` without an `algorithms` option would accept any HMAC variant
// (HS384, HS512) signed with the same secret, and a future key type change
// could silently broaden that further. The algorithm is therefore pinned
// explicitly on both the signing and the verification side, with no fallback:
// a token carrying any other `alg` header fails verification before the
// signature is even considered.
export const JWT_ALGORITHM = "HS256";

// Mirrors the duration formats jsonwebtoken/ms accept: a plain number of
// seconds, or <number><unit> with unit in s|m|h|d|w|y (optionally 'ms').
// Returns seconds as a finite positive number, or NaN when invalid.
export const resolveJwtExpirySeconds = (raw) => {
  if (typeof raw !== "string") {
    return NaN;
  }
  const value = raw.trim();
  if (!value) {
    return NaN;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const match = /^(\d+(?:\.\d+)?)(ms|[smhdwy])$/i.exec(value);
  if (!match) {
    return NaN;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const seconds = unit === "ms" ? amount / 1000 : amount * UNIT_SECONDS[unit];
  return seconds;
};

export const getJwtExpirySeconds = () =>
  resolveJwtExpirySeconds(process.env.JWT_EXPIRE);

// Throws when the configuration could mint unsafe tokens. Called once at
// server startup before any route can issue a JWT.
export const assertAuthConfig = () => {
  const secret = process.env.JWT_SECRET;
  if (typeof secret !== "string" || secret.trim().length < 32) {
    throw new Error(
      "Invalid JWT configuration: JWT_SECRET must be set and at least 32 characters long",
    );
  }

  const seconds = getJwtExpirySeconds();
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > MAX_EXPIRY_SECONDS
  ) {
    throw new Error(
      "Invalid JWT configuration: JWT_EXPIRE must be a finite duration (e.g. 30m, 12h, 7d, plain seconds) no longer than 30 days",
    );
  }

  return { secret: secret.trim(), expiresIn: process.env.JWT_EXPIRE.trim() };
};
