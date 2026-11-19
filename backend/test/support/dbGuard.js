// T-007: fail-closed scratch-schema guard for every database-writing test suite.
//
// DB-writing suites (the 8 unit suites, the 12 HTTP suites and the leave
// performance benchmark) must never run against an application database. In
// normal development the app's DB_NAME resolves to the protected
// `workzen_hrms`, so a suite that inherits that name would create, mutate and
// delete temporary rows inside live data - the exact silent failure the rest
// of the harness exists to prevent.
//
// The guard is pure environment validation: it never imports mysql2, never
// opens a connection and never touches the network. Called at module scope, it
// throws before a single test is registered, so a misconfigured run is loud,
// registers nothing and cannot look green (the same principle as
// httpSuite.requiredBaseUrl).
//
// Rules - all four must hold, in this order:
//   1. DB_NAME is set at all;
//   2. DB_NAME is not one of the protected application schemas (checked
//      case-insensitively, because MySQL name resolution is case-insensitive
//      on some platforms);
//   3. DB_NAME is scratch-shaped: it ends in `_test` or `_scratch` and uses
//      only letters, digits and underscores (the same charset rule
//      schemaSetup.assertSafeSchemaName applies), so a real-looking name such
//      as `workzen_hrms_prod` or `hr_production` cannot slip through;
//   4. ALLOW_SCRATCH_DB=1 is exported - the operator's explicit opt-in, so a
//      scratch-looking name alone can never silently become the test target.

export const PROTECTED_SCHEMAS = Object.freeze([
  "workzen_hrms",
  "workzen_hrms_fresh",
  "workzen_hrms_demo",
]);

const SCHEMA_CHARSET = /^[A-Za-z0-9_]{1,64}$/;
const SCRATCH_SUFFIX = /_(test|scratch)$/;

export const isScratchSchemaName = (name) =>
  typeof name === "string" &&
  SCHEMA_CHARSET.test(name) &&
  SCRATCH_SUFFIX.test(name);

/**
 * Throws (before any test registers) unless every scratch-safety rule holds.
 * Returns the validated database name.
 */
export const assertScratchDatabase = (
  suiteName,
  { dbName = process.env.DB_NAME, optIn = process.env.ALLOW_SCRATCH_DB } = {},
) => {
  if (!dbName) {
    throw new Error(
      `REFUSING TO RUN (${suiteName}): this suite writes to the database and ` +
        "DB_NAME is not set. Point it at an approved scratch schema " +
        "(e.g. workzen_hrms_test), export ALLOW_SCRATCH_DB=1, and follow the " +
        "T-007 approval plan in WORKZEN_HRMS_DEVELOPMENT_TRACKER.md. Protected " +
        `databases: ${PROTECTED_SCHEMAS.join(", ")}.`,
    );
  }

  if (
    PROTECTED_SCHEMAS.some(
      (protectedName) => protectedName.toLowerCase() === dbName.toLowerCase(),
    )
  ) {
    throw new Error(
      `REFUSING TO RUN (${suiteName}): "${dbName}" is a protected application ` +
        "database. DB-writing suites run only against an approved scratch " +
        "schema (e.g. workzen_hrms_test) with ALLOW_SCRATCH_DB=1 exported.",
    );
  }

  if (!isScratchSchemaName(dbName)) {
    throw new Error(
      `REFUSING TO RUN (${suiteName}): DB_NAME "${dbName}" is not scratch-shaped. ` +
        "A scratch schema name must end in _test or _scratch and use only letters, " +
        "digits and underscores (e.g. workzen_hrms_test).",
    );
  }

  if (optIn !== "1") {
    throw new Error(
      `REFUSING TO RUN (${suiteName}): "${dbName}" looks like a scratch schema, ` +
        "but ALLOW_SCRATCH_DB=1 is not exported. The opt-in flag proves an " +
        "operator chose this target on purpose rather than inheriting it.",
    );
  }

  return dbName;
};
