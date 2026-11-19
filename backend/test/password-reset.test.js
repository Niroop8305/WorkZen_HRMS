import { assertScratchDatabase } from "./support/dbGuard.js";

// T-007 tripwire: this suite writes to the database; it must never run
// against a protected application schema. Fails closed before any test
// registers.
assertScratchDatabase("password-reset");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import pool from "../src/config/database.js";
import { Session } from "../src/models/sessionModel.js";
import {
  RESET_CODE_INVALID_ACTION,
  RESET_CODE_ISSUED_ACTION,
  ageReservations,
  countReservations,
} from "../src/models/authThrottleModel.js";

// T-003: codes are stored as SHA-256 digests, so the suite can no longer read
// the usable plaintext out of password_reset_codes. The plaintext exists in
// exactly one place - the rendered dry-run mail the user would receive - so the
// transport is stubbed here, BEFORE config/email.js evaluates (its
// createTransport destructuring binds the reference at module load), and every
// issued code is recovered from the captured mail and verified against the
// stored digest.
const capturedMails = [];
const realCreateTransport = nodemailer.createTransport;
nodemailer.createTransport = () => ({
  async sendMail(mailOptions) {
    capturedMails.push(mailOptions);
    return { messageId: `dry-run-${capturedMails.length}` };
  },
  async verify() {
    throw new Error("verify must not be called in the reset suite");
  },
});

const {
  changePassword,
  credentialCodeMailNotice,
  credentialMailNotice,
  credentialMailOutcome,
  requestPasswordResetCode,
  resetPasswordWithCode,
  resetUserPassword,
} = await import("../src/controllers/authController.js");

// HIGH-4 unit regression suite for the self-service reset-code lifecycle.
// Drives the real controllers against the configured database with the dry-run
// mail transport, so no SMTP traffic ever leaves the process.
//
// Isolation: every case gets its own temporary user, code rows and session
// rows, all hard-deleted in teardown. Demo accounts are never touched.
process.env.EMAIL_DRY_RUN = "true";

const stamp = Date.now();
const PASSWORD = "Temp@12345";
const NEXT_PASSWORD = "Reset@12345";

const tempUserIds = [];

// Controllers always terminate the response, so a minimal fake res is enough to
// read back the exact status code and body the route would return.
const invoke = (handler, user, body) =>
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
    handler({ user, body }, res);
  });

const createTempUser = async (tag, roleName = "Employee") => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = ? LIMIT 1",
    [roleName],
  );
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [res] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, ?, TRUE)`,
    [roles[0].role_id, `h4-reset-${tag}-${stamp}@example.test`, hash],
  );
  tempUserIds.push(res.insertId);
  await pool.query(
    `INSERT INTO employee_profiles (user_id, employee_code, first_name, last_name, department)
     VALUES (?, ?, 'Reset', 'Unit', 'QA')`,
    [res.insertId, `H4UNIT-${res.insertId}`],
  );
  const sessionId = await Session.create(res.insertId);
  return { userId: res.insertId, email: `h4-reset-${tag}-${stamp}@example.test`, sessionId };
};

const codesFor = async (userId) => {
  const [rows] = await pool.query(
    `SELECT id, reset_code, is_used, expires_at
     FROM password_reset_codes WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  return rows;
};

const liveCodes = async (userId) =>
  (await codesFor(userId)).filter(
    (row) => !row.is_used && new Date(row.expires_at).getTime() > Date.now(),
  );

const sessionsOf = async (userId) => {
  const [rows] = await pool.query(
    "SELECT session_id, revoked_at FROM user_sessions WHERE user_id = ?",
    [userId],
  );
  return rows;
};

const digestOf = (value) =>
  crypto.createHash("sha256").update(String(value).trim()).digest("hex");

/**
 * The plaintext code the user actually received, recovered from the captured
 * dry-run mail and proven to hash to one of the user's stored digests.
 * Returns null when no captured mail matches - callers assert on that.
 */
const emailedCodeFor = async (user) => {
  const digests = (await liveCodes(user.userId)).map((row) => row.reset_code);
  for (let i = capturedMails.length - 1; i >= 0; i--) {
    const mail = capturedMails[i];
    if (!String(mail.to ?? "").includes(user.email)) continue;
    const text = `${mail.subject ?? ""} ${mail.html ?? ""} ${mail.text ?? ""}`;
    for (const candidate of text.match(/\b\d{6}\b/g) ?? []) {
      if (digests.includes(digestOf(candidate))) return candidate;
    }
  }
  return null;
};

const issue = async (user) => {
  const result = await invoke(requestPasswordResetCode, user, {});
  assert.equal(result.status, 200, `code request succeeded: ${JSON.stringify(result.body)}`);
  const [code] = await liveCodes(user.userId);
  assert.ok(code, "a live code was persisted");
  // T-003 contract: the stored row is the digest of the emailed plaintext, and
  // the plaintext itself only exists in the rendered mail.
  assert.match(code.reset_code, /^[0-9a-f]{64}$/, "storage holds a SHA-256 digest");
  const mailed = await emailedCodeFor(user);
  assert.ok(mailed, "the issued code was captured from the dry-run mail");
  assert.equal(code.reset_code, digestOf(mailed), "stored digest matches the emailed code");
  return mailed;
};

const attempt = (user, resetCode, newPassword = NEXT_PASSWORD) =>
  invoke(resetPasswordWithCode, user, {
    resetCode,
    newPassword,
    confirmPassword: newPassword,
  });

// The guessing and issuance budgets are counts of audit rows, so a case has to
// be able to read its own accounting to prove it.
const throttleCount = async (userId, action) => countReservations(userId, action);

const clearThrottle = async (userId) => {
  await pool.query(
    "DELETE FROM audit_logs WHERE user_id = ? AND action IN (?, ?)",
    [userId, RESET_CODE_ISSUED_ACTION, RESET_CODE_INVALID_ACTION],
  );
};

describe("HIGH-4 password reset code lifecycle", () => {
  after(async () => {
    for (const userId of tempUserIds) {
      // audit_logs.user_id is ON DELETE SET NULL, so the throttle rows of a test
      // account are removed by id first instead of being orphaned into the trail.
      await clearThrottle(userId);
      await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
    }
    await pool.end();
  });

  describe("code issuance", () => {
    it("issues a six-digit code with a bounded expiry and no code in the response", async () => {
      const user = await createTempUser("issue-shape");
      const before = Date.now();
      const result = await invoke(requestPasswordResetCode, user, {});

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);

      const [row] = await liveCodes(user.userId);
      const mailed = await emailedCodeFor(user);
      assert.ok(mailed, "the emailed code was captured");
      assert.match(mailed, /^\d{6}$/, "the emailed code keeps the 6-digit contract");
      assert.equal(
        row.reset_code,
        digestOf(mailed),
        "storage keeps only the digest of the emailed code (T-003)",
      );

      const ttlMinutes =
        (new Date(row.expires_at).getTime() - before) / 60000;
      assert.ok(
        ttlMinutes > 9 && ttlMinutes < 11,
        `expiry is bounded to the 10 minute window, got ${ttlMinutes.toFixed(2)}`,
      );

      // Read back on the clock that authorizes the code rather than the one that
      // wrote it, so an application host in another timezone cannot widen the
      // window without this assertion failing.
      const [dbTtl] = await pool.query(
        `SELECT TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds
         FROM password_reset_codes WHERE id = ?`,
        [row.id],
      );
      const ttlSeconds = Number(dbTtl[0].seconds);
      assert.ok(
        ttlSeconds > 590 && ttlSeconds <= 600,
        `database clock reports the 600 second TTL, got ${ttlSeconds}`,
      );

      // The advertised lifetime is the persisted lifetime.
      assert.equal(result.body.expiresIn, `${Math.round(ttlSeconds / 60)} minutes`);

      // The response body is the API contract; it must not carry the secret.
      assert.ok(
        !JSON.stringify(result.body).includes(row.reset_code) &&
          !JSON.stringify(result.body).includes(mailed),
        "response body does not leak the code (neither plaintext nor digest)",
      );
    });

    it("supersedes outstanding codes so only the newest one validates", async () => {
      const user = await createTempUser("issue-supersede");
      await invoke(requestPasswordResetCode, user, {});
      const second = await issue(user);

      const live = await liveCodes(user.userId);
      assert.equal(live.length, 1, "exactly one live code after two requests");
      assert.equal(live[0].reset_code, digestOf(second));

      const old = (await codesFor(user.userId)).find(
        (row) => row.reset_code !== digestOf(second),
      );
      assert.equal(Number(old.is_used), 1, "the superseded code is marked used");
    });

    it("caps issuance at three codes per window and persists nothing beyond the cap", async () => {
      const user = await createTempUser("issue-cap");

      for (let i = 1; i <= 3; i += 1) {
        const result = await invoke(requestPasswordResetCode, user, {});
        assert.equal(result.status, 200, `issuance ${i} is allowed`);
      }

      const blocked = await invoke(requestPasswordResetCode, user, {});
      assert.equal(blocked.status, 429, "the fourth request in the window is refused");
      assert.equal(blocked.body.success, false);
      assert.match(blocked.body.message, /too many verification code requests/i);

      // The refusal must not disturb the code the account already holds.
      const live = await liveCodes(user.userId);
      assert.equal(live.length, 1, "the newest issued code is still live");
      assert.equal(
        await throttleCount(user.userId, RESET_CODE_ISSUED_ACTION),
        3,
        "only the three allowed issuances are charged",
      );

      // Capacity returns by itself: no permanent denial of service.
      await ageReservations(user.userId);
      const afterWindow = await invoke(requestPasswordResetCode, user, {});
      assert.equal(afterWindow.status, 200, "an aged window issues again");
    });

    it("concurrent issuance requests cannot exceed the cap or flood delivery", async () => {
      const user = await createTempUser("issue-cap-race");

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          invoke(requestPasswordResetCode, user, {}),
        ),
      );

      const accepted = results.filter((r) => r.status === 200).length;
      const refused = results.filter((r) => r.status === 429).length;
      assert.equal(accepted, 3, "exactly three issuances proceed");
      assert.equal(refused, 5, "the rest are refused before any mail is queued");
      assert.equal(
        await throttleCount(user.userId, RESET_CODE_ISSUED_ACTION),
        3,
        "the reservation is charged before delivery, so a burst cannot refill itself",
      );
      assert.equal((await liveCodes(user.userId)).length, 1, "one live code remains");
    });

    it("returns a not-found shape for an account that no longer exists", async () => {
      // The only "nonexistent account" path is an already revoked principal:
      // both reset steps sit behind protect(), so an anonymous caller can never
      // reach it to probe whether an email address is registered.
      const user = await createTempUser("issue-missing");
      await pool.query("DELETE FROM users WHERE user_id = ?", [user.userId]);

      const result = await invoke(requestPasswordResetCode, user, {});
      assert.equal(result.status, 404);
      assert.equal(result.body.success, false);
      assert.equal((await codesFor(user.userId)).length, 0, "no code persisted");
    });

    it("never writes the code to stdout", async () => {
      const user = await createTempUser("issue-logging");
      const realLog = console.log;
      const captured = [];
      console.log = (...args) => captured.push(args.join(" "));
      let code;
      try {
        code = await issue(user);
      } finally {
        console.log = realLog;
      }

      assert.ok(code, "a code was issued to compare against");
      const joined = captured.join("\n");
      assert.ok(joined.length > 0, "issuance still logs something");
      assert.ok(
        !joined.includes(code),
        "log output must not contain the reset code",
      );
    });
  });

  describe("code verification rejects without changing state", () => {
    it("rejects a malformed code and leaves the account untouched", async () => {
      const user = await createTempUser("verify-malformed");
      const code = await issue(user);
      const [before] = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [user.userId],
      );

      for (const bad of ["1234", "1234567", "abcdef", "12ab56", "12 34", code + "7"]) {
        const result = await attempt(user, bad);
        assert.equal(result.status, 400, `${JSON.stringify(bad)} is rejected`);
        assert.equal(result.body.success, false);
      }

      const [after] = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [user.userId],
      );
      assert.equal(after[0].password_hash, before[0].password_hash, "password unchanged");
      assert.equal((await liveCodes(user.userId)).length, 1, "live code unconsumed");
    });

    it("rejects a well-formed code that is not the one issued", async () => {
      const user = await createTempUser("verify-wrong");
      const code = await issue(user);
      const intruder = code === "100000" ? "100001" : "100000";

      const result = await attempt(user, intruder);
      assert.equal(result.status, 400);
      assert.equal((await liveCodes(user.userId)).length, 1, "real code still usable");
    });

    it("rejects an expired code and does not consume it", async () => {
      const user = await createTempUser("verify-expired");
      const code = await issue(user);
      await pool.query(
        "UPDATE password_reset_codes SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?",
        [user.userId],
      );

      const result = await attempt(user, code);
      assert.equal(result.status, 400);
      assert.match(result.body.message, /invalid or expired/i);

      const [rows] = await pool.query(
        "SELECT is_used FROM password_reset_codes WHERE user_id = ?",
        [user.userId],
      );
      assert.equal(Number(rows[0].is_used), 0, "expired code state is not mutated");
    });

    it("refuses a new password identical to the current one without burning the code", async () => {
      const user = await createTempUser("verify-same-password");
      const code = await issue(user);

      const rejected = await attempt(user, code, PASSWORD);
      assert.equal(rejected.status, 400);
      assert.match(rejected.body.message, /different from the current password/);

      // Requirement C: a failed reset must not partially modify token state.
      assert.equal((await liveCodes(user.userId)).length, 1, "code survived");

      const retried = await attempt(user, code);
      assert.equal(retried.status, 200, "the same code still works afterwards");
    });

    it("enforces the password policy and confirmation match server-side", async () => {
      const user = await createTempUser("verify-policy");
      const code = await issue(user);

      const weak = await invoke(resetPasswordWithCode, user, {
        resetCode: code,
        newPassword: "short1!",
        confirmPassword: "short1!",
      });
      assert.equal(weak.status, 400);
      assert.match(weak.body.message, /at least 8 characters/);

      const mismatch = await invoke(resetPasswordWithCode, user, {
        resetCode: code,
        newPassword: NEXT_PASSWORD,
        confirmPassword: "Different@123",
      });
      assert.equal(mismatch.status, 400);
      assert.match(mismatch.body.message, /do not match/);

      const missing = await invoke(resetPasswordWithCode, user, {
        newPassword: NEXT_PASSWORD,
      });
      assert.equal(missing.status, 400);

      assert.equal((await liveCodes(user.userId)).length, 1, "code untouched");
    });

    it("revokes no session when verification fails", async () => {
      const user = await createTempUser("fail-no-revoke");
      const code = await issue(user);
      await Session.create(user.userId);

      const wrong = code === "100000" ? "100001" : "100000";
      const rejected = await attempt(user, wrong);
      assert.equal(rejected.status, 400);

      const sessions = await sessionsOf(user.userId);
      assert.equal(sessions.length, 2, "two sessions exist for this user");
      for (const row of sessions) {
        assert.equal(row.revoked_at, null, `session ${row.session_id} stays live`);
      }
    });

    it("spends the guessing budget and refuses to restore it by re-issuing a code", async () => {
      const user = await createTempUser("verify-budget");
      await issue(user);

      for (let i = 0; i < 4; i += 1) {
        const result = await attempt(user, "123456");
        assert.equal(result.status, 400, `attempt ${i + 1} is a plain rejection`);
      }

      // The fifth guess is refused up front, so only four are ever evaluated.
      const fifth = await attempt(user, "123456");
      assert.equal(fifth.status, 429, "guessing is throttled");
      assert.equal(fifth.body.success, false);
      assert.equal(
        await throttleCount(user.userId, RESET_CODE_INVALID_ACTION),
        4,
        "refusals are not charged, so repeated attempts cannot push the window forward",
      );

      // The bypass this replaces: requesting a fresh code used to clear the counter,
      // which turned the five-guess cap into an unlimited number of five-guess runs.
      const fresh = await invoke(requestPasswordResetCode, user, {});
      assert.equal(fresh.status, 200, "issuance itself is still available");
      const issued = await emailedCodeFor(user);
      assert.ok(issued, "the fresh code was captured from the mail");

      const stillBlocked = await attempt(user, issued);
      assert.equal(
        stillBlocked.status,
        429,
        "even the correct new code is refused: re-issuing launders nothing",
      );

      const [account] = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [user.userId],
      );
      assert.ok(
        await bcrypt.compare(PASSWORD, account[0].password_hash),
        "a refused submission changes no credential",
      );

      // And still no permanent denial of service: the window ages out on its own.
      await ageReservations(user.userId);
      const ok = await attempt(user, issued);
      assert.equal(ok.status, 200, "legitimate user is not locked out");
    });

    it("charges no budget for submissions that can never match a code", async () => {
      const user = await createTempUser("verify-not-charged");
      const code = await issue(user);

      for (const junk of ["12345", "1234567", "abcdef", "12 345", "12345a"]) {
        const result = await attempt(user, junk);
        assert.equal(result.status, 400, `"${junk}" is rejected`);
        assert.match(result.body.message, /invalid or expired/i);
      }

      assert.equal(
        await throttleCount(user.userId, RESET_CODE_INVALID_ACTION),
        0,
        "a shape that cannot match is not evidence of guessing",
      );
      assert.equal((await attempt(user, code)).status, 200, "the real code still works");
    });

    it("refuses more guesses than the budget even when twenty arrive at once", async () => {
      const user = await createTempUser("verify-budget-race");
      await issue(user);

      const results = await Promise.all(
        Array.from({ length: 20 }, () => attempt(user, "123456")),
      );

      const evaluated = results.filter((r) => r.status === 400).length;
      const refused = results.filter((r) => r.status === 429).length;
      assert.equal(evaluated, 4, "no more than the budget is evaluated");
      assert.equal(refused, 16, "the remaining submissions are refused up front");
      assert.equal(
        await throttleCount(user.userId, RESET_CODE_INVALID_ACTION),
        evaluated,
        "the charge equals the work done, so no wave slips past the counter",
      );

      const [rows] = await pool.query(
        "SELECT is_used FROM password_reset_codes WHERE user_id = ?",
        [user.userId],
      );
      assert.equal(Number(rows[0].is_used), 0, "the live code was not consumed");
    });

    it("reports a server failure without leaking database internals", async () => {
      const user = await createTempUser("verify-error-shape");
      await issue(user);

      const realGetConnection = pool.getConnection;
      pool.getConnection = async () => {
        throw new Error(
          "ER_LOCK_WAIT_TIMEOUT: Lock wait timeout exceeded; try restarting transaction on password_reset_codes",
        );
      };

      try {
        const result = await attempt(user, "123456");
        assert.equal(result.status, 500);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, "Server error while resetting password");

        const body = JSON.stringify(result.body);
        for (const leak of [
          "password_reset_codes",
          "user_sessions",
          "ER_",
          "Lock wait",
          "mysql",
          "SELECT",
          "UPDATE",
          "workzen",
        ]) {
          assert.ok(!body.includes(leak), `response must not contain "${leak}"`);
        }

        // Fail closed: an unreadable budget authorizes nothing.
        assert.equal((await liveCodes(user.userId)).length, 1, "code untouched");
      } finally {
        pool.getConnection = realGetConnection;
      }

      assert.equal(
        (await attempt(user, "123456")).status,
        400,
        "the handler works again once the pool is restored",
      );
    });

    it("consumes the code exactly once under concurrent submissions", async () => {
      const user = await createTempUser("verify-race");
      const code = await issue(user);

      const [first, second] = await Promise.all([
        attempt(user, code),
        attempt(user, code),
      ]);

      const statuses = [first.status, second.status].sort();
      assert.deepEqual(statuses, [200, 400], "exactly one submission wins the code");

      const rows = await codesFor(user.userId);
      assert.equal(
        rows.filter((row) => Number(row.is_used) === 1).length,
        rows.length,
        "no code row is left live after the race",
      );

      const sessions = await sessionsOf(user.userId);
      assert.equal(
        sessions.filter((row) => row.revoked_at === null).length,
        1,
        "only the acting session survived",
      );
    });

    it("rejects reuse of a consumed code", async () => {
      const user = await createTempUser("verify-reuse");
      const code = await issue(user);

      assert.equal((await attempt(user, code)).status, 200);
      const reused = await attempt(user, code);
      assert.equal(reused.status, 400);
      assert.match(reused.body.message, /invalid or expired/i);

      const stored = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [user.userId],
      );
      assert.ok(
        await bcrypt.compare(NEXT_PASSWORD, stored[0][0].password_hash),
        "the replay did not rotate the credential again",
      );
    });
  });

  describe("successful reset", () => {
    it("rotates the credential, voids every outstanding code and revokes other sessions", async () => {
      const user = await createTempUser("success-full");
      const code = await issue(user);
      const otherA = await Session.create(user.userId);
      const otherB = await Session.create(user.userId);

      const result = await attempt(user, code);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.success, true);
      assert.ok(
        !JSON.stringify(result.body).includes(code),
        "success body does not echo the code",
      );

      const [rows] = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [user.userId],
      );
      assert.ok(
        await bcrypt.compare(NEXT_PASSWORD, rows[0].password_hash),
        "new password is stored as a bcrypt hash",
      );
      assert.ok(
        !rows[0].password_hash.includes(NEXT_PASSWORD),
        "plaintext never reaches the hash column",
      );
      assert.ok(
        !(await bcrypt.compare(PASSWORD, rows[0].password_hash)),
        "the previous password no longer verifies",
      );

      assert.equal((await liveCodes(user.userId)).length, 0, "no live code remains");

      const sessions = await sessionsOf(user.userId);
      assert.equal(
        sessions.filter((row) => row.revoked_at === null).length,
        1,
        "exactly the acting session survives",
      );
      const revoked = sessions.filter((row) => row.revoked_at !== null).map((r) => r.session_id);
      assert.ok(revoked.includes(otherA) && revoked.includes(otherB), "prior sessions revoked");
    });

    it("voids outstanding codes for a user whose password is reset by an Admin", async () => {
      const target = await createTempUser("admin-target");
      const admin = await createTempUser("admin-actor", "Admin");
      const targetOther = await Session.create(target.userId);
      const code = await issue(target);

      const result = await invoke(
        resetUserPassword,
        { userId: admin.userId, sessionId: admin.sessionId, roleName: "Admin" },
        { targetUserId: target.userId, newPassword: NEXT_PASSWORD },
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));

      assert.equal((await liveCodes(target.userId)).length, 0, "code issued earlier is void");
      const sessions = await sessionsOf(target.userId);
      assert.equal(
        sessions.filter((row) => row.revoked_at === null).length,
        0,
        "every target session is revoked",
      );
      assert.ok(targetOther, "target had a second live session before the reset");

      // The admin's own session must not be collateral damage.
      const [adminSessions] = await pool.query(
        "SELECT revoked_at FROM user_sessions WHERE session_id = ?",
        [admin.sessionId],
      );
      assert.equal(adminSessions[0].revoked_at, null, "admin session survives");

      const replay = await attempt(target, code);
      assert.equal(replay.status, 400, "the voided code can no longer reset anything");
      assert.match(replay.body.message, /invalid or expired/i);
    });

    it("changes nothing when the admin reset email cannot be delivered", async () => {
      const target = await createTempUser("admin-fail-target");
      const admin = await createTempUser("admin-fail-actor", "Admin");
      const code = await issue(target);
      const targetOther = await Session.create(target.userId);

      // EMAIL_FORCE_FAIL is the only way to exercise this branch without dialling
      // a real server. EMAIL_DRY_RUN stays on underneath it, so even a mode-ordering
      // regression cannot open SMTP from this case.
      const previous = process.env.EMAIL_FORCE_FAIL;
      process.env.EMAIL_FORCE_FAIL = "true";
      let result;
      try {
        result = await invoke(
          resetUserPassword,
          { userId: admin.userId, sessionId: admin.sessionId, roleName: "Admin" },
          { targetUserId: target.userId, newPassword: NEXT_PASSWORD },
        );
      } finally {
        if (previous === undefined) delete process.env.EMAIL_FORCE_FAIL;
        else process.env.EMAIL_FORCE_FAIL = previous;
      }

      assert.equal(result.status, 500, JSON.stringify(result.body));
      assert.equal(result.body.success, false);
      assert.match(result.body.message, /password was not changed/i);
      assert.ok(
        !JSON.stringify(result.body).includes(NEXT_PASSWORD),
        "the response never echoes the credential",
      );

      const [rows] = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [target.userId],
      );
      assert.ok(
        await bcrypt.compare(PASSWORD, rows[0].password_hash),
        "the target can still sign in with the old password",
      );
      assert.ok(
        !(await bcrypt.compare(NEXT_PASSWORD, rows[0].password_hash)),
        "the undelivered password was never stored",
      );

      assert.equal(
        (await liveCodes(target.userId)).length,
        1,
        "the code the target already holds survives the aborted admin reset",
      );
      const sessions = await sessionsOf(target.userId);
      assert.equal(sessions.length, 2, "target held two sessions");
      assert.ok(
        sessions.every((row) => row.revoked_at === null),
        "no session is revoked by a reset that never happened",
      );
      assert.ok(targetOther, "the second session is the pre-reset one");

      const recovered = await attempt(target, code);
      assert.equal(
        recovered.status,
        200,
        "the target can still self-serve after the failed admin reset",
      );
    });

    it("refuses a non-admin caller of the admin reset path", async () => {
      const actor = await createTempUser("admin-actor-deny");
      const target = await createTempUser("admin-target-deny");

      const result = await invoke(
        resetUserPassword,
        { userId: actor.userId, sessionId: actor.sessionId, roleName: "Employee" },
        { targetUserId: target.userId, newPassword: NEXT_PASSWORD },
      );
      assert.equal(result.status, 403);

      const [rows] = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [target.userId],
      );
      assert.ok(
        await bcrypt.compare(PASSWORD, rows[0].password_hash),
        "denied reset leaves the target credential intact",
      );
    });
  });

  // V7: the per-account guessing budget IS audit history, so a wipe of
  // audit_logs silently re-arms code guessing for every account. Neither seed is
  // executed here - and none may be run against a real database - so the lock is
  // on the wipe statement itself, checked against the action names the throttle
  // really counts rather than a copy-pasted string.
  describe("seed scripts preserve the reset throttle", () => {
    const seededScripts = ["src/database/seed.js", "src/database/production-seed.js"];

    for (const relative of seededScripts) {
      it(`${relative} keeps the throttle actions out of its audit wipe`, () => {
        const source = readFileSync(
          new URL(`../${relative}`, import.meta.url),
          "utf8",
        );

        assert.doesNotMatch(
          source,
          /TRUNCATE TABLE audit_logs/i,
          "the audit trail is never truncated as a block",
        );

        const clause =
          /DELETE FROM audit_logs WHERE action NOT IN \(([^)]*)\)/i.exec(source);
        assert.ok(clause, "the audit wipe is a filtered DELETE");

        for (const action of [RESET_CODE_ISSUED_ACTION, RESET_CODE_INVALID_ACTION]) {
          assert.ok(
            clause[1].includes(action),
            `${action} is excluded from the wipe`,
          );
        }
      });
    }
  });

  // A credential mail has three outcomes that never left the process (dry-run,
  // unconfigured skip, transport failure) and exactly one that did. Claiming
  // "sent" for the first three is the misleading-log defect this locks, and it is
  // locked on the real controllers so the wording cannot be re-unconditioned in a
  // caller. The delivered branch has no safe test seam - reaching it needs a real
  // SMTP account - so it is asserted on the outcome formatter instead.
  describe("confirmation mail outcome is never overstated", () => {
    const withEnv = async (vars, run) => {
      const saved = {};
      for (const key of Object.keys(vars)) {
        saved[key] = process.env[key];
        if (vars[key] === undefined) delete process.env[key];
        else process.env[key] = vars[key];
      }
      try {
        return await run();
      } finally {
        // Restored by assignment: deleting here would leave the next case in an
        // environment the suite never set.
        for (const key of Object.keys(saved)) {
          if (saved[key] === undefined) delete process.env[key];
          else process.env[key] = saved[key];
        }
      }
    };

    const captureLogs = async (run) => {
      const lines = [];
      const real = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      for (const level of Object.keys(real)) {
        console[level] = (...args) => {
          lines.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
        };
      }
      try {
        return { result: await run(), lines };
      } finally {
        Object.assign(console, real);
      }
    };

    const mailLines = (lines) => lines.filter((l) => /confirmation email/i.test(l));

    it("describes only SMTP delivery as sent", () => {
      const prefix = "Password changed for user: someone@example.test";
      const sent = credentialMailOutcome(prefix, {
        success: true,
        delivered: true,
        transport: "smtp",
      });
      assert.equal(sent.level, "log");
      assert.equal(sent.message, `${prefix} - Confirmation email sent`);

      const notSent = [
        ["dry-run", { success: true, delivered: false, transport: "dry-run" }],
        [
          "skipped",
          {
            success: false,
            skipped: true,
            delivered: false,
            transport: "smtp",
            reason: "SMTP credentials are not configured",
          },
        ],
        [
          "failed",
          {
            success: false,
            delivered: false,
            transport: "smtp",
            error: "Simulated mail transport failure",
          },
        ],
        // A sender that reported nothing is not proof of delivery either.
        ["silent", undefined],
      ];

      for (const [label, result] of notSent) {
        const outcome = credentialMailOutcome(prefix, result);
        assert.equal(outcome.level, "warn", label);
        assert.doesNotMatch(outcome.message, /email sent/i, label);
        assert.match(
          outcome.message,
          /Confirmation email NOT delivered; transport=/i,
          `${label} names the transport that was used`,
        );
      }
      assert.match(
        credentialMailOutcome(prefix, undefined).message,
        /transport=unknown/,
        "an absent transport is reported, not assumed",
      );
    });

    it("splits the client-facing sentence by the outcome that really happened", () => {
      const sent = credentialMailNotice({
        success: true,
        delivered: true,
        transport: "smtp",
      });
      assert.match(sent, /confirmation email has been sent/i);

      for (const [label, result] of [
        ["dry-run", { success: true, delivered: false, transport: "dry-run" }],
        [
          "skipped",
          {
            success: false,
            skipped: true,
            delivered: false,
            transport: "smtp",
            reason: "SMTP credentials are not configured",
          },
        ],
      ]) {
        const notice = credentialMailNotice(result);
        assert.match(notice, /no confirmation email was sent/i, label);
        assert.doesNotMatch(notice, /has been sent/i, label);
      }

      for (const [label, result] of [
        ["failed", { success: false, delivered: false, transport: "smtp", error: "boom" }],
        ["silent", undefined],
      ]) {
        const notice = credentialMailNotice(result);
        assert.match(notice, /could not be sent/i, label);
        assert.doesNotMatch(notice, /has been sent/i, label);
      }
    });

    it("does not claim delivery when change-password mail only dry-runs", async () => {
      const user = await createTempUser("mail-dry-run");

      const { result, lines } = await captureLogs(() =>
        withEnv(
          {
            EMAIL_DRY_RUN: "true",
            EMAIL_FORCE_FAIL: undefined,
            EMAIL_USER: "dryrun@workzen.test",
            EMAIL_PASSWORD: "never-used-by-json-transport",
          },
          () =>
            invoke(
              changePassword,
              { userId: user.userId, sessionId: user.sessionId, roleName: "Employee" },
              { oldPassword: PASSWORD, newPassword: NEXT_PASSWORD },
            ),
        ),
      );

      assert.equal(result.status, 200, JSON.stringify(result.body));
      const [rows] = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [user.userId],
      );
      assert.ok(
        await bcrypt.compare(NEXT_PASSWORD, rows[0].password_hash),
        "the credential really rotated, so the honest log is not a failed request",
      );

      const mail = mailLines(lines);
      assert.ok(mail.length >= 1, "the mail outcome is reported");
      assert.ok(
        mail.every((l) => !/email sent/i.test(l)),
        `no line claims delivery: ${mail.join(" | ")}`,
      );
      assert.ok(
        mail.some((l) => /NOT delivered; transport=dry-run/i.test(l)),
        `dry-run is named as the transport: ${mail.join(" | ")}`,
      );
      assert.equal(result.body.success, true, "the rotation itself succeeded");
      assert.equal(result.body.emailSent, false);
      assert.equal(result.body.mailTransport, "dry-run");
      assert.match(result.body.message, /no confirmation email was sent/i);
      assert.doesNotMatch(result.body.message, /has been sent/i);
      assert.ok(
        !lines.some((l) => l.includes(NEXT_PASSWORD)),
        "the new password never reaches the log",
      );
    });

    it("does not claim delivery when a self-service reset has no SMTP account", async () => {
      const user = await createTempUser("mail-unconfigured");
      const code = await issue(user);

      const { result, lines } = await captureLogs(() =>
        withEnv(
          {
            EMAIL_DRY_RUN: undefined,
            EMAIL_FORCE_FAIL: undefined,
            EMAIL_USER: undefined,
            EMAIL_PASSWORD: undefined,
          },
          () => attempt(user, code),
        ),
      );

      assert.equal(result.status, 200, JSON.stringify(result.body));
      const mail = mailLines(lines);
      assert.ok(
        mail.every((l) => !/email sent/i.test(l)),
        `no line claims delivery: ${mail.join(" | ")}`,
      );
      assert.ok(
        mail.some(
          (l) =>
            /NOT delivered; transport=smtp, reason=SMTP credentials are not configured/i.test(l),
        ),
        `the skip reason is reported: ${mail.join(" | ")}`,
      );
      // Provider detail stays out of the operator log too.
      assert.ok(
        !mail.some((l) => /gmail|smtp\.[a-z]|app password/i.test(l)),
        `no provider detail in: ${mail.join(" | ")}`,
      );
    });

    it("does not claim delivery when the transport fails, and still rotates the password", async () => {
      const user = await createTempUser("mail-forced-failure");

      const { result, lines } = await captureLogs(() =>
        withEnv(
          {
            EMAIL_DRY_RUN: undefined,
            EMAIL_FORCE_FAIL: "true",
            EMAIL_USER: "configured@workzen.test",
            EMAIL_PASSWORD: "never-used-by-the-failure-seam",
          },
          () =>
            invoke(
              changePassword,
              { userId: user.userId, sessionId: user.sessionId, roleName: "Employee" },
              { oldPassword: PASSWORD, newPassword: NEXT_PASSWORD },
            ),
        ),
      );

      assert.equal(
        result.status,
        200,
        "a mail failure must not fail the credential change, but must not be dressed up as delivery",
      );
      const [rows] = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [user.userId],
      );
      assert.ok(await bcrypt.compare(NEXT_PASSWORD, rows[0].password_hash));

      const mail = mailLines(lines);
      assert.ok(
        mail.every((l) => !/email sent/i.test(l)),
        `no line claims delivery: ${mail.join(" | ")}`,
      );
      assert.ok(
        mail.some((l) => /NOT delivered; transport=forced-failure/i.test(l)),
        `the failing transport is named: ${mail.join(" | ")}`,
      );
      assert.equal(result.body.success, true, "a mail failure is not a failed rotation");
      assert.equal(result.body.emailSent, false);
      assert.equal(result.body.mailTransport, "forced-failure");
      assert.match(result.body.message, /could not be sent/i);
      assert.match(result.body.message, /password has been updated/i);
      assert.doesNotMatch(result.body.message, /has been sent to your/i);
    });

    // A verification code is issued whether or not mail can leave the process, so
    // the request step has the same three outcomes and only one of them may
    // promise an inbox. Locked on the controller, and with the dry-run flow still
    // completing a full reset, so honest wording can never be bought by breaking
    // the development path.
    describe("reset code request never claims an email that was not delivered", () => {
      const requestWith = (user, vars) =>
        captureLogs(() =>
          withEnv(
            {
              EMAIL_DRY_RUN: vars.dryRun ? "true" : undefined,
              EMAIL_FORCE_FAIL: vars.forceFail ? "true" : undefined,
              EMAIL_USER: vars.account ? "code-mail@workzen.test" : undefined,
              EMAIL_PASSWORD: vars.account
                ? "never-used-by-this-seam"
                : undefined,
            },
            () => invoke(requestPasswordResetCode, user, {}),
          ),
        );

      // Only the mail lines of this step, so the password-change wording above
      // cannot mask a claim made here.
      const codeMailLines = (lines) =>
        lines.filter((l) => /verification code/i.test(l));

      const assertNoDeliveryClaim = (lines) => {
        const mail = codeMailLines(lines);
        assert.ok(mail.length >= 1, "the mail step is reported");
        assert.ok(
          mail.every((l) => !/sent to your email|emailed|check your inbox/i.test(l)),
          `no log line claims an emailed code: ${mail.join(" | ")}`,
        );
        return mail;
      };

      it("promises an inbox only to a confirmed SMTP delivery", () => {
        const sent = credentialCodeMailNotice({
          success: true,
          delivered: true,
          transport: "smtp",
        });
        assert.match(sent, /sent to your email/i);
        assert.match(sent, /check your inbox/i);

        for (const [label, result] of [
          ["dry-run", { success: true, delivered: false, transport: "dry-run" }],
          [
            "skipped",
            {
              success: false,
              skipped: true,
              delivered: false,
              transport: "smtp",
              reason: "SMTP credentials are not configured",
            },
          ],
          [
            "failed",
            { success: false, delivered: false, transport: "smtp", error: "boom" },
          ],
          // A sender that reported nothing is not proof of delivery either.
          ["silent", undefined],
        ]) {
          const notice = credentialCodeMailNotice(result);
          assert.doesNotMatch(notice, /sent to your email|check your inbox/i, label);
          assert.match(notice, /no email was sent/i, label);
        }
      });

      it("issues a usable code in dry-run without claiming an email", async () => {
        const user = await createTempUser("code-mail-dry-run");

        const { result, lines } = await requestWith(user, { dryRun: true });

        assert.equal(result.status, 200, JSON.stringify(result.body));
        const [row] = await liveCodes(user.userId);
        assert.ok(row, "the dry-run code is stored and usable, not refused");
        assert.equal(
          result.body.message,
          "Verification code issued. Mail delivery is disabled in this environment, so no email was sent.",
          "the whole sentence is the contract: it reports the issuance and denies the mail",
        );
        assert.match(result.body.message, /no email was sent/i);
        assert.doesNotMatch(result.body.message, /sent to your email|check your inbox/i);
        assert.equal(result.body.success, true, "issuance itself is a success");
        assert.equal(result.body.emailSent, false);
        assert.equal(result.body.mailTransport, "dry-run");
        assert.equal(result.body.expiresIn, "10 minutes", "the advertised lifetime is unchanged");
        const dryRunCode = await emailedCodeFor(user);
        assert.ok(dryRunCode, "the dry-run code was captured from the rendered mail");
        assert.ok(
          !JSON.stringify(result.body).includes(row.reset_code) &&
            !JSON.stringify(result.body).includes(dryRunCode),
          "response body does not leak the code (neither plaintext nor digest)",
        );

        assertNoDeliveryClaim(lines);
        assert.ok(
          lines.some((l) => /mailTransport=dry-run, delivered=false/.test(l)),
          "the issuance log names the transport it actually used",
        );
        assert.ok(
          !lines.some((l) => l.includes(row.reset_code) || l.includes(dryRunCode)),
          "the code never reaches the log (neither plaintext nor digest)",
        );

        // Development usability in full: the code this non-delivering transport
        // issued still completes a real reset.
        const reset = await attempt(user, dryRunCode);
        assert.equal(reset.status, 200, JSON.stringify(reset.body));
        const [rows] = await pool.query(
          "SELECT password_hash FROM users WHERE user_id = ?",
          [user.userId],
        );
        assert.ok(
          await bcrypt.compare(NEXT_PASSWORD, rows[0].password_hash),
          "the reset flowed through on a dry-run issuance",
        );
      });

      it("refuses to issue when mail is not configured, and gives the slot back", async () => {
        const user = await createTempUser("code-mail-unconfigured");

        const { result, lines } = await requestWith(user, {});

        assert.equal(result.status, 500, JSON.stringify(result.body));
        assert.equal(result.body.success, false);
        assert.match(result.body.message, /failed to send verification code/i);
        assert.equal((await liveCodes(user.userId)).length, 0, "no code persisted");
        assert.equal(
          await throttleCount(user.userId, RESET_CODE_ISSUED_ACTION),
          0,
          "an issuance that sent nothing is not charged",
        );
        assertNoDeliveryClaim(lines);
      });

      it("refuses to issue when the transport fails, and gives the slot back", async () => {
        const user = await createTempUser("code-mail-forced-failure");

        const { result, lines } = await requestWith(user, {
          forceFail: true,
          account: true,
        });

        assert.equal(result.status, 500, JSON.stringify(result.body));
        assert.match(result.body.message, /failed to send verification code/i);
        assert.ok(
          !JSON.stringify(result.body).includes("Simulated mail transport failure"),
          "the transport error stays inside the process",
        );
        assert.equal((await liveCodes(user.userId)).length, 0, "no code persisted");
        assert.equal(
          await throttleCount(user.userId, RESET_CODE_ISSUED_ACTION),
          0,
          "a failed send is not charged either",
        );
        assertNoDeliveryClaim(lines);
      });

      it("wording depends on the transport only, never on which account asked", async () => {
        const first = await createTempUser("code-mail-shape-a");
        const second = await createTempUser("code-mail-shape-b", "HR Officer");

        const a = await requestWith(first, { dryRun: true });
        const b = await requestWith(second, { dryRun: true });

        const publicView = ({ result }) => ({
          status: result.status,
          message: result.body.message,
          success: result.body.success,
          emailSent: result.body.emailSent,
          mailTransport: result.body.mailTransport,
          expiresIn: result.body.expiresIn,
        });
        assert.deepEqual(
          publicView(a),
          publicView(b),
          "two accounts in one transport mode answer identically",
        );
        for (const [account, { result }] of [
          [first, a],
          [second, b],
        ]) {
          assert.ok(
            !JSON.stringify(result.body).includes(account.email),
            "no response echoes an account address",
          );
        }
      });
    });
  });
});
