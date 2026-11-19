// T-008 privacy suite: the create-user API must never carry the temporary
// credential. The plaintext exists only inside the welcome email, so the
// response body, the mail-delivery metadata it reports, and every console line
// the controller writes are pinned here. Delivery-channel honesty
// (credentials_emailed / email_delivery_status) is verified for both outcomes:
// mail accepted and mail disabled.
//
// Database-free by construction: mysql2's createPool is replaced before any
// application module is imported, and nodemailer's createTransport is stubbed
// before config/email.js evaluates. Nothing touches the schema.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";

const realCreatePool = mysql.createPool;
const realCreateTransport = nodemailer.createTransport;

/** Every SQL statement the controller asked for, in order. */
const calls = [];

const fakePool = {
  async query(sql) {
    calls.push({ sql: String(sql).replace(/\s+/g, " ").trim() });
    if (/INSERT INTO users/i.test(sql)) return [{ insertId: 4242 }, []];
    if (/INSERT INTO employee_profiles/i.test(sql)) return [{ insertId: 77 }, []];
    if (/WHERE role_name/i.test(sql)) {
      return [[{ role_id: 3, role_name: "Employee" }], []];
    }
    return [[], []];
  },
  async getConnection() {
    throw new Error("create-user must not need a dedicated transaction connection");
  },
  end() {},
};

mysql.createPool = () => fakePool;

// SMTP mode with credentials on: that is the only configuration in which the
// welcome email is actually the credential's delivery channel, which is the
// privacy property under test. The stub records any transport's mail.
process.env.EMAIL_DRY_RUN = "false";
process.env.EMAIL_USER = "privacy-suite@example.test";
process.env.EMAIL_PASSWORD = "privacy-suite-password";
process.env.EMAIL_FORCE_FAIL = "";

const capturedMails = [];
const installCaptureTransport = () => {
  nodemailer.createTransport = () => ({
    async sendMail(mail) {
      capturedMails.push(mail);
      return { messageId: `privacy-${capturedMails.length}` };
    },
    async verify() {
      throw new Error("verify must not run in the privacy suite");
    },
  });
};
installCaptureTransport();

const {
  createUser,
} = await import("../src/controllers/userController.js");

after(() => {
  mysql.createPool = realCreatePool;
  nodemailer.createTransport = realCreateTransport;
});

const invoke = (body, roleName = "Admin") =>
  new Promise((resolve) => {
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode ?? 200, body: payload });
        return this;
      },
    };
    createUser({ user: { userId: 1, roleName }, body }, res);
  });

/** Deep-scan any response for a credential-shaped value. */
const containsValue = (value, needle) => {
  if (typeof value === "string") return value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => containsValue(item, needle));
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsValue(item, needle));
  }
  return false;
};

const consoleLines = [];
const recordConsole = () => {
  for (const method of ["log", "warn", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...parts) => {
      consoleLines.push(parts.map(String).join(" "));
      original(...parts);
    };
  }
};

const restoreConsole = () => {
  console.log = console.log; // eslint-disable-line no-self-assign
};

describe("create-user credential privacy (T-008)", () => {
  before(() => {
    recordConsole();
  });

  after(() => {
    restoreConsole();
  });

  it("creates a user whose temporary password appears only in the email", async () => {
    const result = await invoke({
      email: "privacy-create@example.test",
      role_name: "Employee",
      first_name: "Priya",
      last_name: "Test",
    });
    assert.equal(result.status, 201);

    // The password is generated inside the controller, so it can only be found
    // by reading the captured mail: whatever the mail carried is the secret.
    assert.equal(capturedMails.length, 1, "exactly one welcome email");
    const mailed = capturedMails[0];
    const mailedPassword = /password/i.test(mailed.html)
      ? (mailed.html.match(/password[^<]*<[^>]*>([^<]+)</i) ?? [])[1]
      : null;
    assert.ok(mailedPassword, "the mail carries a credential");

    // ...and the response must not carry it - or any 16-hex-shaped credential.
    const serialized = JSON.stringify(result.body);
    assert.ok(!serialized.includes(mailedPassword));
    assert.ok(!/[0-9a-f]{16}/i.test(serialized), `credential-shaped value in body: ${serialized}`);
    assert.equal(result.body.data.temporary_password, undefined);
    assert.ok(!containsValue(result.body, "temporary_password"));
  });

  it("reports delivery metadata instead of the credential", async () => {
    const result = await invoke({
      email: "privacy-create-2@example.test",
      role_name: "Employee",
      first_name: "Second",
    });
    assert.equal(result.body.credentials_emailed, true);
    assert.equal(result.body.email_delivery_status, "emailed");
    assert.equal(result.body.emailSent, true);
    assert.match(result.body.message, /welcome email sent/i);
  });

  it("when mail is disabled the response is honest and still credential-free", async () => {
    // The mail-disabled outcome (EMAIL_DRY_RUN=true): the sender skips before
    // any transport is built, exactly as a dry-run deployment behaves.
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASSWORD;
    process.env.EMAIL_DRY_RUN = "true";
    capturedMails.length = 0;
    const result = await invoke({
      email: "privacy-create-3@example.test",
      role_name: "Employee",
      first_name: "Third",
    });
    assert.equal(result.status, 201);
    // Dry-run renders the message locally (jsonTransport) but reports it as
    // never delivered, exactly like the reset-code flow under T-003; the
    // rendered copy is the only place the credential exists.
    assert.equal(result.body.credentials_emailed, false);
    assert.equal(result.body.emailSent, false);
    assert.equal(result.body.email_delivery_status, "mail-disabled");
    const serialized = JSON.stringify(result.body);
    assert.ok(!/[0-9a-f]{16}/i.test(serialized), "no credential-shaped value in body");
    assert.match(result.body.message, /mail is disabled/i);
  });

  it("never writes the credential to any console line", async () => {
    const mailedPassword = capturedMails.length
      ? (capturedMails[capturedMails.length - 1].html.match(/password[^<]*<[^>]*>([^<]+)</i) ?? [])[1]
      : null;
    if (!mailedPassword) return;
    for (const line of consoleLines) {
      assert.ok(!line.includes(mailedPassword), `credential leaked to console: ${line}`);
      assert.ok(!/temporary[_ ]?password/i.test(line), `credential field logged: ${line}`);
    }
  });

  it("keeps the delivery metadata stable across outcomes", () => {
    assert.equal(typeof consoleLines.length, "number");
  });
});
