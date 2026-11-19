// Regression guard for the boot-time configuration gate added to server.js.
//
// Before this, a missing DB_NAME, a typo'd PORT or an invalid APP_TIMEZONE all
// started the server successfully and then failed per request (attendance threw
// RangeError on every call for a bad zone), or failed with a driver error that
// had already been written into a response body. The gate refuses boot instead,
// and its messages must name variables without echoing values, because the
// variables include a database password.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertBootConfig, bootWarnings } from "../src/config/bootConfig.js";

// Deliberately distinctive: any message that contains one of these leaked a
// value that was only supposed to be described by its variable name.
const SENTINELS = {
  DB_HOST: "sentinel-db-host",
  DB_USER: "sentinel-db-user",
  DB_PASSWORD: "Sentinel-Db-Passw0rd",
  DB_NAME: "sentinel_db_name",
  DB_PORT: "3307",
  APP_TIMEZONE: "Asia/Kolkata",
  CORS_ORIGIN: "https://sentinel.example.test",
  PORT: "8131",
  NODE_ENV: "production",
};

const KEYS = Object.keys(SENTINELS);

const withEnv = (overrides, run) => {
  const previous = KEYS.map((key) => process.env[key]);
  KEYS.forEach((key) => {
    const value = key in overrides ? overrides[key] : SENTINELS[key];
    if (value === undefined || value === null) delete process.env[key];
    else process.env[key] = value;
  });
  try {
    return run();
  } finally {
    KEYS.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
};

const complete = {};

const assertNoValueLeak = (message, label) => {
  for (const key of ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]) {
    assert.ok(
      !message.includes(SENTINELS[key]),
      `${label}: message echoes the ${key} value -> ${message}`,
    );
  }
};

// assert.throws() returns nothing here, and the message is what the assertions
// are really about.
const thrownMessage = (run) => {
  try {
    run();
  } catch (error) {
    return error.message;
  }
  assert.fail("expected boot to be refused");
};

describe("boot configuration gate", () => {
  it("accepts a complete, readable configuration", () => {
    withEnv(complete, () => {
      assert.equal(assertBootConfig(), true);
    });
  });

  it("refuses to boot on a missing database target and names only the variables", () => {
    const message = withEnv(
      { DB_NAME: null, DB_PASSWORD: "" },
      () => thrownMessage(() => assertBootConfig()),
    );
    assert.match(message, /DB_NAME/, "names the unset database");
    assert.match(message, /DB_PASSWORD/, "names the blank password");
    assertNoValueLeak(message, "missing database target");
  });

  it("refuses to boot on a time zone that would break every attendance request", () => {
    const message = withEnv(
      { APP_TIMEZONE: "Asia/Calcutta-Invalid" },
      () => thrownMessage(() => assertBootConfig()),
    );
    assert.match(message, /APP_TIMEZONE is not a valid IANA time zone/);
    assertNoValueLeak(message, "invalid time zone");
  });

  it("lets an absent time zone fall through to the default", () => {
    withEnv({ APP_TIMEZONE: null }, () => {
      assert.equal(assertBootConfig(), true, "APP_TIMEZONE is optional");
    });
  });

  it("refuses to boot on a non-numeric port instead of listening on a bogus one", () => {
    for (const [key, value] of [
      ["PORT", "8131px"],
      ["DB_PORT", "3306;drop"],
    ]) {
      const message = withEnv(
        { [key]: value },
        () => thrownMessage(() => assertBootConfig()),
      );
      assert.match(message, new RegExp(`${key} must be a number`));
      assert.ok(
        !message.includes(value),
        `${key}: message echoes the bad value -> ${message}`,
      );
    }
  });

  it("warns about an origin that will not work in production", () => {
    const unset = withEnv({ CORS_ORIGIN: null }, () => bootWarnings());
    assert.ok(
      unset.some((w) => /CORS_ORIGIN is unset/.test(w)),
      `production without CORS_ORIGIN warns: ${JSON.stringify(unset)}`,
    );

    const wildcard = withEnv({ CORS_ORIGIN: "*" }, () => bootWarnings());
    assert.ok(
      wildcard.some((w) => /cannot be combined with credentialed requests/.test(w)),
      `CORS_ORIGIN=* warns: ${JSON.stringify(wildcard)}`,
    );

    const named = withEnv({ CORS_ORIGIN: "https://hr.example.test" }, () => bootWarnings());
    assert.deepEqual(named, [], "an explicit production origin is silent");
  });

  it("does not warn a development server for the same settings", () => {
    const warnings = withEnv(
      { NODE_ENV: "development", CORS_ORIGIN: null },
      () => bootWarnings(),
    );
    assert.deepEqual(warnings, [], "the development default origin is expected");
  });
});
