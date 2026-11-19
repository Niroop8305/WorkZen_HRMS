import assert from "node:assert/strict";
import { beforeEach, it } from "node:test";

// V9: a HTTP suite that executes nothing must not look green.
//
// Every *-http.test.js used to open with `const base = process.env.<NAME>` and run
// under `describe(..., { skip: !base })`. A wrong or missing URL therefore produced
// "# tests 0" and exit code 0 - indistinguishable from a full pass, which is the
// one failure mode a security suite must not be able to hide.
//
// Both halves are handled here:
//   requiredBaseUrl()  - stops the run before a single test is registered, with the
//                        exact variable and command to use;
//   guardExecutedTests() - counts the cases that actually ran and fails if the plan
//                        was not met, so a filtered or accidentally skipped suite
//                        cannot pass either.
//
// The plan is a floor, not a tally: adding cases never needs the number updated,
// but losing, skipping or filtering one trips the guard.

export const requiredBaseUrl = (envName, scriptName) => {
  const base = process.env[envName];
  if (!base) {
    throw new Error(
      `${envName} is required by ${scriptName}. Start an isolated backend ` +
        `(never port 5000) and export the URL, e.g. ` +
        `${envName}='http://localhost:5062/api' npm run ${scriptName}`,
    );
  }
  return base;
};

export const guardExecutedTests = (label, planned) => {
  let executed = 0;

  // Registered at module scope, so it fires for every test in the file including
  // nested suites. Node 22 confirms this: a root beforeEach counts nested cases.
  beforeEach(() => {
    executed += 1;
  });

  // Registered last, so by the time it runs the whole plan has been counted. The
  // guard counts itself, hence the correction.
  it(`${label}: executed the full plan`, () => {
    const ran = executed - 1;
    assert.ok(
      ran >= planned,
      `${ran} test(s) ran but ${planned} were planned. A skipped, filtered or ` +
        `partially-registered HTTP suite is never a pass (${label}).`,
    );
  });
};
