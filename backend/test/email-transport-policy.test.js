import assert from "node:assert/strict";
import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";
import { after, describe, it } from "node:test";
import nodemailer from "nodemailer";

// HIGH-4 P1 mail policy suite.
//
// It proves one property with two tripwires installed before any mail module is
// loaded, so the proof cannot be argued away by a transport that "would" connect:
//
//   1. every nodemailer transport request is recorded, and only the offline
//      jsonTransport is honoured - a service/host transport gets a fake whose
//      sendMail and verify both throw;
//   2. the socket, TLS and DNS entry points are replaced with counters that
//      throw, so any real network attempt fails loudly and is counted.
//
// Nothing here sends mail or opens a connection. The suite stubs the transport
// factory and the network entry points before the mail modules are loaded, so the
// route handler covered at the end is reached directly (past `protect`) and no
// query is ever issued.

const transportRequests = [];
const networkAttempts = [];

// The suite must be runnable under a caller that already exports EMAIL_DRY_RUN
// (npm test does), so it records what the environment was and promises to hand it
// back unchanged instead of promising to clear it.
const AMBIENT_ENV = {
  EMAIL_DRY_RUN: process.env.EMAIL_DRY_RUN,
  EMAIL_FORCE_FAIL: process.env.EMAIL_FORCE_FAIL,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
};

const realCreateTransport = nodemailer.createTransport;
const realSocketConnect = net.Socket.prototype.connect;
const realTlsConnect = tls.connect;
const realDnsLookup = dns.lookup;

const offlineTransport = (options) => ({
  sendMail: async () => {
    throw new Error("A live SMTP transport was asked to send");
  },
  verify: async () => {
    throw new Error("A live SMTP transport was asked to verify");
  },
  options,
});

nodemailer.createTransport = (options, ...rest) => {
  transportRequests.push(options ?? {});
  if (options && options.jsonTransport) {
    return realCreateTransport(options, ...rest);
  }
  return offlineTransport(options ?? {});
};

const tripwire = (label) => () => {
  networkAttempts.push(label);
  throw new Error(`Network use is forbidden in the mail policy suite (${label})`);
};

net.Socket.prototype.connect = tripwire("net.SOCKET_CONNECT");
tls.connect = tripwire("tls.connect");
dns.lookup = tripwire("dns.lookup");

// Imported only after the stubs are in place: config/email.js captures
// createTransport when it is evaluated.
const authMail = await import("../src/config/email.js");
const staffMail = await import("../src/services/emailService.js");

const RECIPIENT = "policy-probe@example.test";
const CODE = "123456";
const CREDENTIAL = "Policy@12345";

const withEnv = async (overrides, run) => {
  const keys = Object.keys(overrides);
  const previous = keys.map((key) => process.env[key]);
  keys.forEach((key, index) => {
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  });
  try {
    return await run();
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
};

// Every sender the product owns, called the way its caller calls it. The list is
// the point: a sender added later has to be added here or the suite stops
// covering "no code path".
const allSenders = () => [
  {
    name: "sendPasswordResetCodeEmail",
    call: () => authMail.sendPasswordResetCodeEmail(RECIPIENT, "Policy Probe", CODE),
  },
  {
    name: "sendPasswordChangeEmail",
    call: () => authMail.sendPasswordChangeEmail(RECIPIENT, "Policy Probe"),
  },
  {
    name: "sendPasswordResetByAdminEmail",
    call: () => authMail.sendPasswordResetByAdminEmail(RECIPIENT, "Policy Probe", CREDENTIAL),
  },
  {
    name: "sendWelcomeEmail",
    call: () =>
      staffMail.sendWelcomeEmail({
        email: RECIPIENT,
        full_name: "Policy Probe",
        employee_code: "WZ-POLICY",
        temporary_password: CREDENTIAL,
        role: "Employee",
        company_name: "WorkZen",
      }),
  },
  {
    name: "sendLeaveNotification",
    call: () =>
      staffMail.sendLeaveNotification({
        recipients: [RECIPIENT],
        employeeEmail: RECIPIENT,
        employeeName: "Policy Probe",
        action: "approved",
        leaveType: "Casual",
        startDate: "2026-10-15",
        endDate: "2026-10-16",
        totalDays: 2,
      }),
  },
  {
    name: "testEmailConnection",
    call: () => staffMail.testEmailConnection(),
  },
];

const liveTransport = (options) =>
  Object.keys(options).some((key) => ["service", "host", "port", "auth"].includes(key));

const resetRecords = () => {
  transportRequests.length = 0;
  networkAttempts.length = 0;
};

describe("mail transport policy", () => {
  it("never constructs an SMTP transport or touches the network when EMAIL_DRY_RUN=true", async () => {
    await withEnv(
      {
        EMAIL_DRY_RUN: "true",
        EMAIL_FORCE_FAIL: undefined,
        EMAIL_USER: "configured@example.test",
        EMAIL_PASSWORD: "configured-app-password",
      },
      async () => {
        resetRecords();
        const outcomes = [];
        for (const sender of allSenders()) {
          outcomes.push({ name: sender.name, result: await sender.call() });
        }

        assert.deepEqual(networkAttempts, [], "no socket, TLS or DNS call was attempted");
        assert.ok(
          transportRequests.every((options) => options.jsonTransport === true),
          `every transport request was the offline JSON transport: ${JSON.stringify(transportRequests)}`,
        );
        assert.ok(
          !transportRequests.some(liveTransport),
          "no service/host/auth transport was ever built",
        );

        for (const { name, result } of outcomes) {
          assert.equal(result.transport, "dry-run", `${name} reports the dry-run transport`);
          assert.equal(result.delivered, false, `${name} never claims delivery`);
          assert.equal(result.success, true, `${name} succeeded as a rendered message`);
        }

        const connectionTest = outcomes.find((o) => o.name === "testEmailConnection").result;
        assert.match(
          connectionTest.message,
          /no smtp connection was attempted/i,
          "the SMTP test says what it skipped",
        );

        // The credential the admin path emails must not leak through the report.
        const admin = outcomes.find((o) => o.name === "sendPasswordResetByAdminEmail").result;
        assert.ok(
          !JSON.stringify(admin).includes(CREDENTIAL),
          "the delivery report never carries the credential",
        );
      },
    );
  });

  it("exercises the failure branches deterministically under EMAIL_FORCE_FAIL", async () => {
    // The forced-failure senders log the simulated error to stderr. Under the
    // test runner's child-process IPC, interleaving those multi-line stack
    // dumps with runner messages intermittently corrupted the stream
    // ("Unable to deserialize cloned data") and killed the run. The logs are
    // captured here instead — which additionally lets the suite assert that
    // every simulated failure actually WAS logged for operators.
    const loggedErrors = [];
    const originalConsoleError = console.error;
    console.error = (...parts) => {
      loggedErrors.push(parts.map(String).join(" "));
    };
    try {
    await withEnv(
      {
        // Dry-run stays on underneath, so a mode-ordering regression still cannot
        // build a live transport from this case.
        EMAIL_DRY_RUN: "true",
        EMAIL_FORCE_FAIL: "true",
        EMAIL_USER: "configured@example.test",
        EMAIL_PASSWORD: "configured-app-password",
      },
      async () => {
        resetRecords();
        for (const sender of allSenders()) {
          const result = await sender.call();
          assert.equal(result.transport, "forced-failure", `${sender.name} uses the seam`);
          assert.equal(result.success, false, `${sender.name} reports failure`);
          assert.equal(result.delivered, false, `${sender.name} reports no delivery`);
        }
        assert.deepEqual(networkAttempts, [], "the failure seam never dials out");
        assert.equal(transportRequests.length, 0, "the seam short-circuits before transport");
      },
    );
    } finally {
      console.error = originalConsoleError;
    }
    assert.ok(
      loggedErrors.length >= 1,
      "the simulated failures were logged for operators",
    );
    assert.ok(
      loggedErrors.some((line) =>
        /Simulated mail transport failure/.test(line)),
      "the operator log carries the seam's own message",
    );
  });

  it("skips instead of dialing a provider when SMTP is neither dry-run nor configured", async () => {
    await withEnv(
      {
        EMAIL_DRY_RUN: undefined,
        EMAIL_FORCE_FAIL: undefined,
        EMAIL_USER: undefined,
        EMAIL_PASSWORD: undefined,
      },
      async () => {
        resetRecords();
        const outcomes = [];
        for (const sender of allSenders()) {
          const result = await sender.call();
          outcomes.push({ name: sender.name, result });
          assert.equal(result.skipped, true, `${sender.name} reports a skip`);
          assert.equal(result.success, false, `${sender.name} is not a success`);
          assert.equal(result.delivered, false, `${sender.name} is not a delivery`);
        }
        assert.deepEqual(networkAttempts, [], "an unconfigured deployment opens no connection");
        // The connection diagnostic is now covered by the same guard, so an
        // unconfigured deployment never even reaches the transport factory.
        assert.deepEqual(transportRequests, [], "no transport of any kind was constructed");
        assert.ok(
          !transportRequests.some(liveTransport),
          "placeholder credentials are never turned into a transport",
        );

        const connectionTest = outcomes.find((o) => o.name === "testEmailConnection").result;
        assert.match(
          connectionTest.reason,
          /smtp credentials are not configured/i,
          "the diagnostic names the configuration gap instead of probing a provider",
        );
      },
    );
  });

  it("still builds the real SMTP transport when dry-run is off and credentials exist", async () => {
    await withEnv(
      {
        EMAIL_DRY_RUN: undefined,
        EMAIL_FORCE_FAIL: undefined,
        EMAIL_USER: "real-account@example.test",
        EMAIL_PASSWORD: "real-app-password",
      },
      async () => {
        resetRecords();
        // Only through the stubbed factory: the fake transport throws before
        // smtp-connection can reach the network, which is what keeps this case safe.
        const result = await authMail.sendPasswordResetCodeEmail(RECIPIENT, "Policy Probe", CODE);
        assert.equal(result.transport, "smtp", "production mode is unchanged");
        assert.equal(result.success, false, "the stubbed transport failed");
        assert.equal(result.delivered, false, "nothing left the process");
        assert.ok(
          transportRequests.some(liveTransport),
          "the policy really does build a live transport outside dry-run",
        );
        assert.equal(transportRequests[0].auth.user, "real-account@example.test");
        assert.deepEqual(networkAttempts, [], "and the stub stopped it at the boundary");
      },
    );
  });

  it("treats any set, non-off EMAIL_DRY_RUN value as dry-run instead of guessing", async () => {
    // "TRUE", "1" or a stray space used to fall through to real SMTP, so an
    // operator who meant to disable delivery would have sent reset codes out.
    for (const value of ["TRUE", "True", " true ", "1", "yes", "on", "maybe"]) {
      await withEnv(
        {
          EMAIL_DRY_RUN: value,
          EMAIL_FORCE_FAIL: undefined,
          EMAIL_USER: "configured@example.test",
          EMAIL_PASSWORD: "configured-app-password",
        },
        async () => {
          resetRecords();
          const result = await authMail.sendPasswordResetCodeEmail(
            RECIPIENT,
            "Policy Probe",
            CODE,
          );
          assert.equal(result.transport, "dry-run", `${JSON.stringify(value)} disables delivery`);
          assert.equal(result.delivered, false, `${JSON.stringify(value)} sends nothing`);
          assert.deepEqual(networkAttempts, [], `${JSON.stringify(value)} opens no connection`);
          assert.ok(
            !transportRequests.some(liveTransport),
            `${JSON.stringify(value)} builds no live transport`,
          );
        },
      );
    }

    // An explicit off token still means real delivery, which is what a
    // production deployment relies on.
    for (const value of ["false", "FALSE", "0", "no", "off", ""]) {
      await withEnv(
        {
          EMAIL_DRY_RUN: value,
          EMAIL_FORCE_FAIL: undefined,
          EMAIL_USER: "configured@example.test",
          EMAIL_PASSWORD: "configured-app-password",
        },
        async () => {
          assert.equal(
            authMail.emailTransportMode(),
            "smtp",
            `${JSON.stringify(value)} keeps real delivery`,
          );
        },
      );
    }
  });

  it("warns about an unreadable switch without echoing its value", () => {
    // Restored by assignment, not delete: the ambient value may be set by the
    // caller, and the suite's last case proves the environment comes back as it
    // was found.
    const ambient = process.env.EMAIL_DRY_RUN;
    const restore = () => {
      if (ambient === undefined) delete process.env.EMAIL_DRY_RUN;
      else process.env.EMAIL_DRY_RUN = ambient;
    };
    try {
      delete process.env.EMAIL_DRY_RUN;
      assert.deepEqual(authMail.emailConfigWarnings(), [], "unset is not a warning");

      for (const value of ["true", "false", "TRUE", "Off", "1", "  true  "]) {
        process.env.EMAIL_DRY_RUN = value;
        assert.deepEqual(authMail.emailConfigWarnings(), [], `${JSON.stringify(value)} is readable`);
      }

      for (const value of ["nope-nope", "sentinel-42", "3"]) {
        process.env.EMAIL_DRY_RUN = value;
        const warnings = authMail.emailConfigWarnings();
        assert.equal(warnings.length, 1, `${JSON.stringify(value)} is flagged`);
        assert.match(warnings[0], /EMAIL_DRY_RUN/, "the warning names the variable");
        assert.ok(
          !warnings[0].includes(value),
          `the warning never echoes the value (${warnings[0]})`,
        );
        assert.match(warnings[0], /disabled/, "and says which way it fails");
      }
    } finally {
      restore();
    }
  });

  it("answers GET /api/email/test without dialling a provider in either mode", async () => {
    // Reached past `protect` on purpose: this case is about what the handler does
    // to the mail transport and what it puts on the wire, not about RBAC (that is
    // covered by the authorization suites).
    const route = (await import("../src/routes/emailRoutes.js")).default.stack.find(
      (layer) => layer.route?.path === "/test",
    );
    assert.ok(route, "the /test route is mounted");
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    const invoke = async () => {
      let body = null;
      let statusCode = 200;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
        json: (payload) => {
          body = payload;
          return payload;
        },
      };
      await handler({}, res);
      return { body, statusCode };
    };

    const cases = [
      {
        label: "dry-run",
        env: {
          EMAIL_DRY_RUN: "true",
          EMAIL_FORCE_FAIL: undefined,
          EMAIL_USER: "configured@example.test",
          EMAIL_PASSWORD: "configured-app-password",
        },
        assert: (body) => {
          assert.equal(body.success, true, "dry-run is not reported as a failure");
          assert.equal(body.delivered, false, "dry-run never claims delivery");
          assert.equal(body.transport, "dry-run");
          assert.match(body.message, /no smtp connection was attempted/i);
        },
      },
      {
        label: "unconfigured",
        env: {
          EMAIL_DRY_RUN: undefined,
          EMAIL_FORCE_FAIL: undefined,
          EMAIL_USER: undefined,
          EMAIL_PASSWORD: undefined,
        },
        assert: (body) => {
          assert.equal(body.success, false, "an unconfigured transport is not a success");
          assert.equal(body.delivered, false, "nothing was delivered");
          assert.equal(body.skipped, true, "the skip is reported as a skip");
          assert.match(body.message, /not configured/i);
          assert.doesNotMatch(body.message, /fail/i, "a configuration gap is not a failure");
        },
      },
    ];

    for (const testCase of cases) {
      await withEnv(testCase.env, async () => {
        resetRecords();
        const { body, statusCode } = await invoke();
        assert.equal(statusCode, 200, `${testCase.label} answers 200`);
        testCase.assert(body);
        assert.equal(body.error, undefined, `${testCase.label} echoes no provider detail`);
        assert.deepEqual(networkAttempts, [], `${testCase.label} opened no connection`);
        assert.ok(
          !transportRequests.some(liveTransport),
          `${testCase.label} built no live transport`,
        );
        assert.ok(
          !JSON.stringify(body).includes("configured-app-password"),
          `${testCase.label} never leaks the configured password`,
        );
      });
    }
  });

  it("leaves the ambient mail environment exactly as it found it", () => {
    for (const [key, ambient] of Object.entries(AMBIENT_ENV)) {
      assert.equal(process.env[key], ambient, `${key} restored`);
    }
    resetRecords();
    assert.deepEqual(networkAttempts, [], "no network attempt was ever recorded");
  });
});

after(() => {
  nodemailer.createTransport = realCreateTransport;
  net.Socket.prototype.connect = realSocketConnect;
  tls.connect = realTlsConnect;
  dns.lookup = realDnsLookup;
});
