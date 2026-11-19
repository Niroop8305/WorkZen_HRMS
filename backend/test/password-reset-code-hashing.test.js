// Regression guard for T-003: password-reset codes are stored as SHA-256
// digests, never plaintext.
//
// The defect was `reset_code VARCHAR(6)` holding the emailed 6-digit code in
// cleartext: anyone with database read access (a backup, a support dump, a
// compromised replica) held a live, single-use credential for every account
// with an outstanding code. The fix hashes at issuance and at consume with one
// deterministic digest, so the atomic SQL equality-match is preserved while a
// database reader sees only hashes.
//
// Database-free by construction: mysql2's createPool is replaced before any
// application module is imported, and nodemailer's createTransport is replaced
// before config/email.js loads, so no connection can be opened and no mail can
// leave the process. The capture stub records the rendered mail, which is what
// lets the test tie the emailed plaintext to the stored digest without a real
// SMTP round-trip. `after()` restores both.

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import crypto from "crypto";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

const realCreatePool = mysql.createPool;
const realCreateTransport = nodemailer.createTransport;

process.env.JWT_SECRET =
  "reset-code-hashing-test-secret-value-32-chars-minimum";
process.env.EMAIL_DRY_RUN = "true";
delete process.env.EMAIL_FORCE_FAIL;

/** Every mail the stub transport "sent", as the raw mailOptions object. */
const sentMails = [];

// Captures the rendered message so the test can read the plaintext code the
// user would have received. Nothing dials out: sendMail resolves locally.
nodemailer.createTransport = () => ({
  async sendMail(mailOptions) {
    sentMails.push(mailOptions);
    return { messageId: `stub-${sentMails.length}` };
  },
  async verify() {
    throw new Error("verify must not be called in the hashing suite");
  },
});

/**
 * Fake pool. Every query is recorded; responses come from `script`, matched by
 * the first SQL fragment whose key is contained in the (whitespace-normalized)
 * statement. Keys are removed after a match so a fragment cannot answer twice
 * unless it is restored.
 */
const script = {};
const statements = [];
const connections = [];

const fakeConnection = () => {
  const connection = {
    queries: [],
    begun: 0,
    committed: 0,
    rolledBack: 0,
    released: 0,
    async query(sql, params = []) {
      const statement = sql.replace(/\s+/g, " ").trim();
      const record = { sql: statement, params };
      statements.push(record);
      connection.queries.push(record);
      const key = Object.keys(script).find((fragment) =>
        statement.includes(fragment),
      );
      if (key === undefined) return [[], []];
      const value = script[key];
      delete script[key];
      return [typeof value === "function" ? value(statement) : value, []];
    },
    async beginTransaction() {
      connection.begun += 1;
    },
    async commit() {
      connection.committed += 1;
    },
    async rollback() {
      connection.rolledBack += 1;
    },
    release() {
      connection.released += 1;
    },
  };
  connections.push(connection);
  return connection;
};

mysql.createPool = () => ({
  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g, " ").trim();
    const record = { sql: statement, params };
    statements.push(record);
    const key = Object.keys(script).find((fragment) =>
      statement.includes(fragment),
    );
    if (key === undefined) return [[], []];
    const value = script[key];
    delete script[key];
    return [typeof value === "function" ? value(statement) : value, []];
  },
  async getConnection() {
    return fakeConnection();
  },
  end() {},
});

const { requestPasswordResetCode, resetPasswordWithCode, hashResetCode } =
  await import("../src/controllers/authController.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const readSource = (relative) =>
  fs.readFileSync(path.join(backendRoot, relative), "utf8");

/** Console capture: nothing the handlers log may carry the plaintext code. */
const consoleCalls = [];
const realConsole = {};
const captureConsole = () => {
  for (const level of ["log", "warn", "error"]) {
    realConsole[level] = console[level];
    console[level] = (...args) =>
      consoleCalls.push({ level, text: args.map(String).join(" ") });
  }
};
const restoreConsole = () => {
  for (const level of ["log", "warn", "error"]) {
    console[level] = realConsole[level];
  }
};

const resetHarness = () => {
  for (const key of Object.keys(script)) delete script[key];
  statements.length = 0;
  connections.length = 0;
  sentMails.length = 0;
  consoleCalls.length = 0;
};

const USER_ID = 12;
const USER_EMAIL = "reset-hasher@example.test";
const SESSION_ID = 4242;
const OLD_PASSWORD_HASH = bcrypt.hashSync("OldStrong@Pass1", 10);
const NEW_PASSWORD = "NewStrong@Pass2";

// Shared account state for both handlers: a live user, an empty reservation
// window, and a profile lookup that finds nothing (userName falls back to the
// email - one fewer scripted branch, same code paths).
const baseScript = () => {
  script["FROM users u INNER"] = [
    { user_id: USER_ID, email: USER_EMAIL, role_name: "Employee", is_active: 1 },
  ];
  script["FROM employee_profiles WHERE user_id"] = [];
  script["SELECT user_id FROM users WHERE user_id = ? FOR UPDATE"] = [
    { user_id: USER_ID },
  ];
  script["AS in_window"] = [];
  script["INSERT INTO audit_logs"] = { insertId: 501 };
};

const makeReq = (overrides = {}) => ({
  headers: { "user-agent": "hashing-suite" },
  ip: "127.0.0.1",
  user: { userId: USER_ID, roleId: 2, roleName: "Employee", sessionId: SESSION_ID },
  body: {},
  ...overrides,
});

const makeRes = () => {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const digestOf = (value) =>
  crypto.createHash("sha256").update(String(value).trim()).digest("hex");

/** Every distinct 6-digit sequence that appears in the rendered reset mail. */
const codesInMail = (mail) => {
  const text = `${mail.subject ?? ""} ${mail.html ?? ""} ${mail.text ?? ""}`;
  return [...new Set(text.match(/\b\d{6}\b/g) ?? [])];
};

describe("password-reset code hashing (T-003)", () => {
  after(() => {
    mysql.createPool = realCreatePool;
    nodemailer.createTransport = realCreateTransport;
    restoreConsole();
  });

  describe("the digest helper", () => {
    it("is the deterministic SHA-256 hex digest of the trimmed code", () => {
      assert.equal(hashResetCode("123456"), digestOf("123456"));
      assert.equal(hashResetCode("123456"), hashResetCode("123456"));
      assert.equal(hashResetCode(" 123456 "), digestOf("123456"));
      assert.match(hashResetCode("000000"), /^[0-9a-f]{64}$/);
      assert.notEqual(hashResetCode("123456"), hashResetCode("123457"));
    });
  });

  describe("issuance stores the digest, never the plaintext", () => {
    it("writes the 64-char digest and emails the plaintext 6-digit code", async () => {
      resetHarness();
      baseScript();
      script["INSERT INTO password_reset_codes"] = { insertId: 901 };

      captureConsole();
      let res;
      try {
        await requestPasswordResetCode(makeReq(), res = makeRes());
      } finally {
        restoreConsole();
      }

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);

      const mail = sentMails[0];
      assert.ok(mail, "the reset mail was rendered");
      const candidates = codesInMail(mail);
      assert.ok(candidates.length > 0, "the rendered mail carries the code");

      const insert = statements.find((s) =>
        s.sql.includes("INSERT INTO password_reset_codes"),
      );
      assert.ok(insert, "the issuance INSERT ran");
      const stored = insert.params[1];
      assert.match(stored, /^[0-9a-f]{64}$/, "storage is a SHA-256 hex digest");
      assert.ok(
        !candidates.includes(stored),
        "the plaintext code must never be stored",
      );
      assert.ok(
        candidates.some((code) => digestOf(code) === stored),
        `stored digest must be sha256 of the emailed code (${candidates.join(", ")})`,
      );
      assert.equal(insert.params[0], USER_ID);
    });

    it("never writes or logs the plaintext code anywhere", async () => {
      resetHarness();
      baseScript();
      script["INSERT INTO password_reset_codes"] = { insertId: 901 };

      captureConsole();
      try {
        await requestPasswordResetCode(makeReq(), makeRes());
      } finally {
        restoreConsole();
      }

      const mail = sentMails[0];
      const code = codesInMail(mail).find((c) =>        statements.some(
          (s) =>
            s.sql.includes("INSERT INTO password_reset_codes") &&
            s.params[1] === digestOf(c),
        ),
      );
      assert.ok(code, "precondition: the emailed code is identifiable");

      // Every recorded SQL parameter, flattened: no 6-digit code anywhere.
      const flatParams = statements.flatMap((s) => s.params.map(String));
      assert.ok(
        !flatParams.includes(code),
        "no SQL parameter may carry the plaintext code",
      );

      // The budget reservation row is audit metadata only.
      const auditInsert = statements.find((s) =>
        s.sql.includes("INSERT INTO audit_logs"),
      );
      assert.ok(auditInsert, "the issuance budget row was written");
      assert.equal(auditInsert.params[0], USER_ID);
      assert.equal(
        typeof auditInsert.params[1], "string",
        "the audit row carries the action name",
      );
      assert.deepEqual(
        auditInsert.params.slice(2),
        ["127.0.0.1", "hashing-suite"],
        "the only value params are ip and user-agent",
      );
      assert.match(
        auditInsert.sql,
        /NULL, NULL, NULL/,
        "record_id, old_value and new_value are literal NULLs - no code in audit_logs",
      );

      // Stdout/stderr: the issuance log names the user and transport only.
      const everything = consoleCalls.map((c) => c.text).join("\n");
      assert.ok(
        !everything.includes(code),
        "the plaintext code must never reach stdout/stderr",
      );
      assert.match(
        everything,
        /Password reset code issued for user/,
        "the issuance log still explains itself",
      );
    });
  });

  describe("consume verifies the digest of the submitted code", () => {
    const runConsume = async (resetCode, res, { lookupFinds = true } = {}) => {
      script["SELECT password_hash, email FROM users WHERE user_id = ? FOR UPDATE"] = [
        { password_hash: OLD_PASSWORD_HASH, email: USER_EMAIL },
      ];
      script["INSERT INTO password_reset_codes"] = { insertId: 901 };
      script["SELECT id FROM password_reset_codes"] = lookupFinds
        ? [{ id: 77 }]
        : [];
      script["UPDATE password_reset_codes SET is_used = TRUE WHERE id = ?"] = {
        affectedRows: 1,
      };
      script["UPDATE users SET password_hash"] = { affectedRows: 1 };
      script["DELETE FROM audit_logs"] = { affectedRows: 1 };

      captureConsole();
      try {
        await resetPasswordWithCode(
          makeReq({
            body: {
              resetCode,
              newPassword: NEW_PASSWORD,
              confirmPassword: NEW_PASSWORD,
            },
          }),
          res,
        );
      } finally {
        restoreConsole();
      }
      return res;
    };

    it("queries with the digest of the emailed code and consumes atomically", async () => {
      // Mint a real code through issuance so the digest round-trips end-to-end.
      resetHarness();
      baseScript();
      captureConsole();
      try {
        await requestPasswordResetCode(makeReq(), makeRes());
      } finally {
        restoreConsole();
      }
      const mail = sentMails[0];
      const insert = statements.find((s) =>
        s.sql.includes("INSERT INTO password_reset_codes"),
      );
      const storedDigest = insert.params[1];
      const emailedCode = codesInMail(mail).find(
        (code) => digestOf(code) === storedDigest,
      );
      assert.ok(emailedCode, "precondition: issuance code identified");

      resetHarness();
      baseScript();
      const res = makeRes();
      await runConsume(emailedCode, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);

      const lookup = statements.find(
        (s) =>
          s.sql.includes("SELECT id FROM password_reset_codes") &&
          s.sql.includes("FOR UPDATE"),
      );
      assert.ok(lookup, "the live-code lookup ran");
      assert.deepEqual(lookup.params, [USER_ID, digestOf(emailedCode)]);
      assert.match(
        lookup.sql,
        /reset_code = \? AND is_used = FALSE AND expires_at > NOW\(\)/,
        "the atomic equality-match predicate is unchanged",
      );

      const consume = statements.find(
        (s) => s.sql.includes("WHERE id = ? AND is_used = FALSE"),
      );
      assert.ok(consume, "the single-use consumption UPDATE ran");
      assert.equal(consume.params[0], 77);

      // The submitted plaintext never appears as a query parameter.
      const flatParams = statements.flatMap((s) => s.params.map(String));
      assert.ok(!flatParams.includes(emailedCode));
    });

    it("an already-consumed or missing row still answers 400 without rotating the credential", async () => {
      resetHarness();
      baseScript();
      const res = makeRes();
      await runConsume("000000", res, { lookupFinds: false });

      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /Invalid or expired verification code/i);
      assert.equal(
        statements.some((s) => s.sql.includes("WHERE id = ? AND is_used = FALSE")),
        false,
        "nothing was consumed",
      );
      assert.equal(
        statements.some((s) => s.sql.includes("UPDATE users SET password_hash")),
        false,
        "the credential was not rotated",
      );
      assert.equal(
        statements.some((s) => s.sql.startsWith("DELETE FROM audit_logs")),
        false,
        "a wrong guess keeps its budget charge",
      );
      const consumeConnection = connections.at(-1);
      assert.equal(consumeConnection.committed, 0, "the transaction rolled back");
      assert.ok(consumeConnection.rolledBack >= 1);
    });

    it("a correct code refunds the guessing reservation", async () => {
      resetHarness();
      baseScript();
      await runConsume("654321", makeRes());

      const release = statements.find((s) => s.sql.startsWith("DELETE FROM audit_logs"));
      assert.ok(release, "the reservation was released");
      assert.equal(release.params[0], 501);
      assert.match(
        release.sql,
        /record_id IS NULL AND new_value IS NULL/,
        "only reservation rows are refundable - real audit history is not",
      );
    });

    it("credential rotation, code voiding and sibling-session revocation commit together", async () => {
      resetHarness();
      baseScript();
      await runConsume("654321", makeRes());

      const consumeConnection = connections.at(-1);
      assert.equal(consumeConnection.committed, 1);

      const revoke = statements.find((s) =>
        s.sql.includes("UPDATE user_sessions SET revoked_at"),
      );
      assert.ok(revoke, "sibling sessions were revoked in the same transaction");
      assert.deepEqual(revoke.params, [USER_ID, SESSION_ID]);
      assert.match(revoke.sql, /session_id <> \?/);

      // Supersede: every outstanding code for the account is voided afterwards.
      const supersede = statements.find(
        (s) =>
          s.sql.includes("SET is_used = TRUE WHERE user_id = ? AND is_used = FALSE") &&
          s.sql.includes("password_reset_codes"),
      );
      assert.ok(supersede, "outstanding codes were voided");
    });
  });

  describe("gates before any hashing work", () => {
    it("rejects a malformed code shape before touching the store", async () => {
      resetHarness();
      baseScript();
      const res = makeRes();
      await resetPasswordWithCode(
        makeReq({
          body: { resetCode: "abc123", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
        }),
        res,
      );
      assert.equal(res.statusCode, 400);
      assert.deepEqual(statements, [], "no query ran for a malformed submission");
    });

    it("still enforces the guessing budget before verification", async () => {
      resetHarness();
      baseScript();
      // Full window: four in-window rows for the ceiling of 4.
      script["AS in_window"] = [
        { in_window: 1 },
        { in_window: 1 },
        { in_window: 1 },
        { in_window: 1 },
      ];
      const res = makeRes();
      await resetPasswordWithCode(
        makeReq({
          body: { resetCode: "654321", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
        }),
        res,
      );
      assert.equal(res.statusCode, 429);
      assert.match(res.body.message, /Too many invalid verification codes/i);
      assert.equal(
        statements.some((s) => s.sql.includes("SELECT id FROM password_reset_codes")),
        false,
        "a blocked request costs no lookup",
      );
    });
  });

  describe("static schema alignment", () => {
    const schemaFiles = [
      { file: "src/database/schema.sql", create: "CREATE TABLE IF NOT EXISTS password_reset_codes" },
      { file: "src/database/migrate-password-reset-codes.js", create: "CREATE TABLE password_reset_codes" },
      { file: "database/migrations/013_create_password_reset_codes_table.sql", create: "CREATE TABLE IF NOT EXISTS password_reset_codes" },
    ];

    for (const { file } of schemaFiles) {
      it(`${file} stores a 64-char digest over a DATETIME expiry`, () => {
        const source = readSource(file);
        assert.match(source, /reset_code VARCHAR\(64\) NOT NULL/);
        assert.doesNotMatch(source, /reset_code VARCHAR\(6\)\b/);
        const start = source.indexOf("password_reset_codes (");
        assert.ok(start >= 0, "the CREATE TABLE statement exists");
        const table = source.slice(start, source.indexOf(") ENGINE", start));
        assert.match(table, /expires_at DATETIME NOT NULL/);
        assert.doesNotMatch(table, /expires_at TIMESTAMP/);
      });

      it(`${file} indexes the digest under the account, not standalone`, () => {
        const source = readSource(file);
        assert.doesNotMatch(
          source,
          /INDEX\s+idx_reset_code\s*\(reset_code\)/,
          "a standalone code index is a plaintext-era artifact",
        );
        assert.match(source, /INDEX\s+idx_user_reset_code\s*\(user_id,\s*reset_code\)/);
      });
    }
  });
});
