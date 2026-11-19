// Central validation of the runtime configuration that is not auth-specific.
// Messages name variables only, never values: a boot log must not echo a
// database credential or any other secret held in the environment.
const REQUIRED_VARIABLES = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

const isTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
};

// Throws when the process could only fail later in a more confusing place:
// an unset database target, an unreadable port, or a time zone that makes every
// attendance request throw after the server is already accepting traffic.
export const assertBootConfig = () => {
  const issues = [];
  let bootTrustProxyWarning = null;

  const missing = REQUIRED_VARIABLES.filter((name) => isBlank(process.env[name]));
  if (missing.length > 0) {
    issues.push(`missing required variable(s): ${missing.join(", ")}`);
  }

  const port = process.env.PORT;
  if (!isBlank(port) && !/^\d+$/.test(port.trim())) {
    issues.push("PORT must be a number");
  }

  const dbPort = process.env.DB_PORT;
  if (!isBlank(dbPort) && !/^\d+$/.test(dbPort.trim())) {
    issues.push("DB_PORT must be a number");
  }

  const timeZone = process.env.APP_TIMEZONE;
  if (!isBlank(timeZone) && !isTimeZone(timeZone.trim())) {
    issues.push("APP_TIMEZONE is not a valid IANA time zone");
  }

  // Production extras: a JWT secret that would mint forgeable tokens and a
  // TRUST_PROXY value that would let X-Forwarded-For be spoofed must stop the
  // boot, not just warn.
  if (process.env.NODE_ENV === "production") {
    // Presence and length are assertAuthConfig's job; this pass only rejects
    // the shipped placeholder surviving into production.
    const secret = (process.env.JWT_SECRET || "").trim();
    if (/change[-_]?this|your[-_]?super[-_]?secret/i.test(secret)) {
      issues.push(
        "JWT_SECRET is still the placeholder value; generate a real secret",
      );
    }
    // resolveTrustProxy is validated at its call site in server.js; here we
    // only fail fast on an obviously production-hostile wildcard trust.
    if ((process.env.TRUST_PROXY || "").trim().toLowerCase() === "true") {
      // Deliberately allowed behind a real proxy, but a proxy-less production
      // host with "true" trusts any spoofed header; warn at boot instead of
      // refusing, because only the operator knows their topology.
      bootTrustProxyWarning =
        "TRUST_PROXY=true in production: make sure a real proxy actually sits " +
        "in front of this API, otherwise client IPs are spoofable";
    }
  }

  if (issues.length > 0) {
    throw new Error(`Invalid runtime configuration: ${issues.join("; ")}`);
  }

  if (bootTrustProxyWarning) {
    console.warn(`⚠️  ${bootTrustProxyWarning}`);
  }

  return true;
};

// Configuration that works but will surprise an operator. Reported instead of
// fatal, because each of these has a legitimate development use.
export const bootWarnings = () => {
  const warnings = [];
  const production = process.env.NODE_ENV === "production";
  const origin = (process.env.CORS_ORIGIN || "").trim();

  if (production && !origin) {
    warnings.push(
      "CORS_ORIGIN is unset: the development origin is being used, so a deployed browser client will be blocked",
    );
  }
  if (production && origin === "*") {
    warnings.push(
      'CORS_ORIGIN=* cannot be combined with credentialed requests; list the deployed origins instead',
    );
  }
  if (!production && origin === "*") {
    warnings.push("CORS_ORIGIN=* allows any origin to call the API with a stolen token");
  }

  return warnings;
};
