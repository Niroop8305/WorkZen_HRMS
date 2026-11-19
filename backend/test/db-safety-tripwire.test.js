// Regression guard for T-007: every database-writing suite refuses to run
// unless the operator explicitly points it at an approved scratch schema.
//
// The failure this prevents: the application's DB_NAME resolves to the
// protected `workzen_hrms`, and a DB-writing suite that inherits it would
// create, mutate and delete temporary rows inside live data. The guard is pure
// environment validation - this suite never imports mysql2, never opens a
// connection and never touches the network, which the first test pins
// statically.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROTECTED_SCHEMAS,
  assertScratchDatabase,
  isScratchSchemaName,
} from "./support/dbGuard.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Invoke the guard with an explicit environment, never the real one. */
const guard = (suite, env) => {
  try {
    return { ok: true, dbName: assertScratchDatabase(suite, env) };
  } catch (error) {
    return { ok: false, error };
  };
};

describe("scratch-schema guard (T-007)", () => {
  describe("validation rules", () => {
    it("rejects a missing DB_NAME before any connection attempt", () => {
      // "" rather than undefined: an explicit undefined would let the guard's
      // destructuring default fall back to the real process.env.DB_NAME and
      // make this case sensitive to the shell it runs in.
      const result = guard("suite", { dbName: "", optIn: "1" });
      assert.equal(result.ok, false);
      assert.match(result.error.message, /REFUSING TO RUN \(suite\)/);
      assert.match(result.error.message, /DB_NAME is not set/);
    });

    for (const protectedName of PROTECTED_SCHEMAS) {
      it(`refuses the protected database "${protectedName}" even with the opt-in`, () => {
        const result = guard("suite", { dbName: protectedName, optIn: "1" });
        assert.equal(result.ok, false);
        assert.match(result.error.message, /protected application/);
        assert.match(result.error.message, new RegExp(protectedName));
      });

      it(`refuses a case-variant of "${protectedName}"`, () => {
        const result = guard("suite", {
          dbName: protectedName.toUpperCase(),
          optIn: "1",
        });
        assert.equal(result.ok, false);
        assert.match(result.error.message, /protected application/);
      });
    }

    it("refuses a non-scratch-shaped name", () => {
      for (const bad of ["production_db", "workzen_hrms_prod", "hrms", "test", "scratch"]) {
        const result = guard("suite", { dbName: bad, optIn: "1" });
        assert.equal(result.ok, false, `${bad} must be refused`);
        assert.match(result.error.message, /not scratch-shaped/);
      }
    });

    it("refuses names with characters unsafe for SQL identifiers", () => {
      for (const bad of ["workzen_hrms-test", "workzen;hrms_test", "workzen hrms_test", "a".repeat(65) + "_test"]) {
        const result = guard("suite", { dbName: bad, optIn: "1" });
        assert.equal(result.ok, false, `${bad.slice(0, 20)}… must be refused`);
      }
    });

    it("refuses a scratch-shaped name without the explicit opt-in", () => {
      const result = guard("suite", { dbName: "workzen_hrms_test", optIn: "" });
      assert.equal(result.ok, false);
      assert.match(result.error.message, /ALLOW_SCRATCH_DB=1/);
    });

    it("refuses opt-in values other than exactly 1", () => {
      for (const bad of ["true", "yes", "0", "", "1 "]) {
        const result = guard("suite", { dbName: "workzen_hrms_test", optIn: bad });
        assert.equal(result.ok, false, `opt-in "${bad}" must be refused`);
      }
    });

    it("accepts an explicit approved scratch schema with the opt-in", () => {
      for (const good of ["workzen_hrms_test", "workzen_scratch", "auth_throttle_spike_test"]) {
        const result = guard("suite", { dbName: good, optIn: "1" });
        assert.equal(result.ok, true, `${good} must be accepted`);
        assert.equal(result.dbName, good);
      }
    });

    it("isScratchSchemaName is the pure shape predicate", () => {
      assert.equal(isScratchSchemaName("workzen_hrms_test"), true);
      assert.equal(isScratchSchemaName("workzen_hrms"), false);
      assert.equal(isScratchSchemaName("workzen_hrms_fresh"), false);
      assert.equal(isScratchSchemaName(undefined), false);
      assert.equal(isScratchSchemaName("workzen;hrms_test"), false);
    });
  });

  describe("the guard is wired into every DB-writing suite", () => {
    // The census of suites that write to a database: 8 unit suites, the 12
    // HTTP suites and the leave performance benchmark.
    // auth-throttle-concurrency.test.js keeps its own dedicated scratch-schema
    // guard and is asserted separately.
    const DB_WRITING_SUITES = [
      "attendance.test.js",
      "auth-session.test.js",
      "leave.test.js",
      "password-reset.test.js",
      "payroll.test.js",
      "payslip.test.js",
      "salary.test.js",
      "profile-update.test.js",
      "attendance-http.test.js",
      "auth-registration-http.test.js",
      "auth-session-http.test.js",
      "demo-dataset-http.test.js",
      "directory-authorization-http.test.js",
      "leave-http.test.js",
      "password-reset-http.test.js",
      "payroll-generation-http.test.js",
      "payroll-http.test.js",
      "payslip-http.test.js",
      "profile-update-http.test.js",
      "salary-http.test.js",
      "leave-performance.test.js",
    ];

    it("every DB-writing suite calls assertScratchDatabase at module scope", () => {
      for (const file of DB_WRITING_SUITES) {
        const source = fs.readFileSync(path.join(here, file), "utf8");
        assert.match(
          source,
          /import \{ assertScratchDatabase \} from ['"]\.\/support\/dbGuard\.js['"];/,
          `${file} must import the guard`,
        );
        assert.match(
          source,
          /assertScratchDatabase\(["'][a-z-]+["']\)/,
          `${file} must invoke the guard at module scope`,
        );
      }
    });

    it("no DB-writing suite name is missing from the census (import-based cross-check)", () => {
      // Anything under test/ that imports the real pool module must be in the
      // census above. Suites listed there but not importing the pool are fine
      // (HTTP suites drive the database through a server), but a pool import
      // outside the census would be an unguarded writer.
      const census = new Set(DB_WRITING_SUITES);
      const poolImporters = fs
        .readdirSync(here)
        .filter((f) => f.endsWith(".test.js"))
        .filter((f) => {
          const source = fs.readFileSync(path.join(here, f), "utf8");
          return /from ["'\.]+\/?\.?\/?src\/config\/database\.js"|from "\.\.\/src\/config\/database\.js"/.test(source);
        })
        .filter((f) => {
          // DB-free suites may import the pool module to stub it; the stubbing
          // files are excluded by their documented createPool replacement.
          const source = fs.readFileSync(path.join(here, f), "utf8");
          return !/mysql\.createPool\s*=/.test(source) && !/pool\.query\s*=/.test(source);
        });
      for (const file of poolImporters) {
        assert.ok(
          census.has(file) || file === "auth-throttle-concurrency.test.js",
          `${file} imports the real pool but is not guarded by the T-007 census`,
        );
      }
    });

    it("the throttle-concurrency suite keeps its own dedicated scratch guard", () => {
      const source = fs.readFileSync(
        path.join(here, "auth-throttle-concurrency.test.js"),
        "utf8",
      );
      assert.match(source, /THROTTLE_CONCURRENCY_SCHEMA/);
      assert.match(source, /PROTECTED_SCHEMAS|protected/);
    });

    it("the guard helper itself never imports a database driver", () => {
      const source = fs.readFileSync(path.join(here, "support", "dbGuard.js"), "utf8");
      assert.doesNotMatch(
        source,
        /^import .*mysql/m,
        "the guard must never import a database driver",
      );
      assert.doesNotMatch(source, /createPool\(|createConnection\(/);
    });
  });
});
