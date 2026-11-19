import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import pool from "../src/config/database.js";

// A1 regression suite for organization-wide directory authorization:
//   GET /api/users                 (employee directory)
//   GET /api/attendance/all-status (org-wide attendance presence map)
//
// Both routes used to sit behind `protect` alone, so any valid JWT - including
// an Employee's - received the whole organization. This suite proves the
// staff-only policy over the real routes, bypassing the UI completely, while
// the authorized roles keep their exact response contract.
//
// Isolation: creates its own temporary users (one per role) with real logins
// and hard-deletes them in teardown; `user_sessions` and `employee_profiles`
// cascade from `users`. Demo accounts are only used to log in and read. Nothing
// here mutates or deletes pre-existing records.
import { requiredBaseUrl, guardExecutedTests } from "./support/httpSuite.js";
import { assertScratchDatabase } from "./support/dbGuard.js";
const base = requiredBaseUrl("DIRECTORY_API_URL", "test:directory:http");
// T-007 tripwire: the target server writes to the database; the schema it
// points at must be an approved scratch one. Fails closed before any test
// registers.
assertScratchDatabase("directory-authorization-http");
const stamp = Date.now();
const TEMP_PASSWORD = "Temp@12345";

const STAFF_ROLES = ["Admin", "HR Officer", "Payroll Officer"];

const tokens = {};
const tempIds = [];
let syntheticEmployeeId, syntheticEmployeeCode;

const call = async (method, path, token, body) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text };
};

const login = async (email, password) => {
  const { body } = await call("POST", "/auth/login", null, { email, password });
  return body?.data?.token;
};

// Temp fixtures are keyed tempAdmin / tempHROfficer / tempPayrollOfficer /
// tempEmployee so every matrix below reads the same way.
const tempKey = (role) => `temp${role.replace(/\s+/g, "")}`;

const createTempUser = async (roleName, tag) => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = ? LIMIT 1",
    [roleName],
  );
  assert.ok(roles.length === 1, `role '${roleName}' is seeded`);

  const email = `a1-directory-${tag}-${stamp}@example.test`;
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
  const [res] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, ?, TRUE)`,
    [roles[0].role_id, email, hash],
  );
  const code = `A1DIR-${stamp}-${res.insertId}`;
  await pool.query(
    `INSERT INTO employee_profiles (user_id, employee_code, first_name, last_name, department)
     VALUES (?, ?, 'Directory', 'Probe', 'QA')`,
    [res.insertId, code],
  );
  tempIds.push(res.insertId);
  return { userId: res.insertId, email, code, token: await login(email, TEMP_PASSWORD) };
};

describe("Employee directory authorization (A1)", () => {
  before(async () => {
    for (const [email, password, role] of [
      ["admin@workzen.demo", "Admin@123", "Admin"],
      ["hr@workzen.demo", "Hr@123", "HR Officer"],
      ["payroll@workzen.demo", "Payroll@123", "Payroll Officer"],
      ["employee@workzen.demo", "Employee@123", "Employee"],
    ]) {
      tokens[role] = await login(email, password);
      assert.ok(tokens[role], `demo ${role} token issued`);
    }

    for (const role of [...STAFF_ROLES, "Employee"]) {
      const tag = role.replace(/\s+/g, "-").toLowerCase();
      tokens[tempKey(role)] = (await createTempUser(role, tag)).token;
      assert.ok(tokens[tempKey(role)], `temp ${role} token issued`);
    }

    // A second synthetic Employee: proves the denial is role-based and not a
    // quirk of the single demo employee account.
    const extra = await createTempUser("Employee", "synthetic-2");
    syntheticEmployeeId = extra.userId;
    syntheticEmployeeCode = extra.code;
    tokens.tempEmployee2 = extra.token;
  });

  after(async () => {
    for (const userId of tempIds) {
      await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
    }
    await pool.end();
  });

  describe("GET /api/users", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const { status, body } = await call("GET", "/users", null);
      assert.equal(status, 401);
      assert.equal(body.success, false);
    });

    it("RBAC matrix: Admin 200, HR 200, Payroll 200, Employee 403, anon 401", async () => {
      for (const role of STAFF_ROLES) {
        assert.equal(
          (await call("GET", "/users", tokens[role])).status,
          200,
          `demo ${role} keeps directory access`,
        );
        assert.equal(
          (await call("GET", "/users", tokens[tempKey(role)])).status,
          200,
          `temp ${role} keeps directory access`,
        );
      }
      assert.equal(
        (await call("GET", "/users", tokens.Employee)).status,
        403,
        "demo Employee is denied",
      );
      assert.equal((await call("GET", "/users", null)).status, 401);
    });

    it("denies each synthetic Employee account created for this run", async () => {
      for (const token of [tokens.tempEmployee, tokens.tempEmployee2]) {
        const { status, body } = await call("GET", "/users", token);
        assert.equal(status, 403);
        assert.equal(body.success, false);
        assert.match(body.message, /not authorized/i);
      }
    });

    it("cannot be bypassed by calling the API directly with params or slashes", async () => {
      for (const path of [
        "/users/",
        "/users?limit=100000&offset=0",
        "/users?role=Admin",
        "/users?search=a",
        "/users?page=1&pageSize=5000",
      ]) {
        const { status, text } = await call("GET", path, tokens.tempEmployee2);
        assert.equal(status, 403, `${path} must stay forbidden`);
        assert.ok(
          !text.includes(syntheticEmployeeCode),
          `${path} must not leak directory rows`,
        );
      }
    });

    it("denied responses return no protected employee data", async () => {
      const { status, body, text } = await call("GET", "/users", tokens.tempEmployee2);
      assert.equal(status, 403);
      assert.equal(body.data, undefined, "no directory array is returned");
      assert.equal(body.count, undefined, "no org size is returned");
      assert.ok(!text.includes(syntheticEmployeeCode), "synthetic employee code absent");
      assert.ok(!text.includes(String(syntheticEmployeeId)), "synthetic user id absent");
    });

    it("keeps the existing response contract for authorized roles", async () => {
      for (const role of STAFF_ROLES) {
        const { status, body } = await call("GET", "/users", tokens[role]);
        assert.equal(status, 200);
        assert.equal(body.success, true);
        assert.ok(Array.isArray(body.data), "data is still an array");
        assert.equal(body.count, body.data.length, "count still matches data length");

        const row = body.data.find((u) => u.employee_code === syntheticEmployeeCode);
        assert.ok(row, `${role} still sees the full org-wide directory`);
        assert.equal(row.user_id, syntheticEmployeeId);
        for (const field of [
          "user_id",
          "email",
          "role_name",
          "employee_code",
          "full_name",
          "department",
          "is_active",
        ]) {
          assert.ok(field in row, `${field} is still part of the contract`);
        }
      }
    });

    it("never leaks password hashes to an authorized directory caller", async () => {
      const { text } = await call("GET", "/users", tokens.Admin);
      assert.ok(!text.includes("password_hash"), "password column name absent");
      assert.ok(!text.includes("$2a$"), "bcrypt hash absent");
    });
  });

  describe("GET /api/attendance/all-status", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const { status, body } = await call("GET", "/attendance/all-status", null);
      assert.equal(status, 401);
      assert.equal(body.success, false);
    });

    it("RBAC matrix: Admin 200, HR 200, Payroll 200, Employee 403, anon 401", async () => {
      for (const role of STAFF_ROLES) {
        for (const [label, token] of [
          [`demo ${role}`, tokens[role]],
          [`temp ${role}`, tokens[tempKey(role)]],
        ]) {
          const { status, body } = await call("GET", "/attendance/all-status", token);
          assert.equal(status, 200, `${label} keeps presence access`);
          assert.equal(body.success, true);
          assert.equal(typeof body.data, "object");
          assert.ok(
            Object.values(body.data).every((s) =>
              ["checked_in", "checked_out", "not_checked_in"].includes(s),
            ),
            "status map format is unchanged",
          );
        }
      }
      assert.equal(
        (await call("GET", "/attendance/all-status", tokens.Employee)).status,
        403,
        "demo Employee is denied",
      );
      assert.equal(
        (await call("GET", "/attendance/all-status", tokens.tempEmployee)).status,
        403,
        "synthetic Employee is denied",
      );
      assert.equal(
        (await call("GET", "/attendance/all-status", tokens.tempEmployee2)).status,
        403,
        "the other role must be denied too",
      );
      assert.equal(
        (await call("GET", "/attendance/all-status", null)).status,
        401,
      );
    });

    it("denied responses return no org-wide presence data", async () => {
      const { status, body, text } = await call(
        "GET",
        "/attendance/all-status",
        tokens.tempEmployee2,
      );
      assert.equal(status, 403);
      assert.equal(body.success, false);
      assert.equal(body.data, undefined, "no presence map is returned");
      assert.ok(!text.includes(String(syntheticEmployeeId)), "other user ids absent");
    });

    it("keeps an Employee's own attendance status readable", async () => {
      const { status, body } = await call(
        "GET",
        "/attendance/status",
        tokens.tempEmployee2,
      );
      assert.equal(status, 200, "self-service presence is unaffected");
      assert.equal(body.success, true);
    });
  });

  describe("adjacent employee self-service is unaffected", () => {
    it("an Employee still reads and edits their own profile", async () => {
      const read = await call(
        "GET",
        `/users/profile/${syntheticEmployeeId}`,
        tokens.tempEmployee2,
      );
      assert.equal(read.status, 200);
      assert.equal(read.body.success, true);

      const write = await call(
        "PUT",
        `/users/profile/${syntheticEmployeeId}`,
        tokens.tempEmployee2,
        { department: "Quality Assurance" },
      );
      assert.equal(write.status, 200);

      const [rows] = await pool.query(
        "SELECT department FROM employee_profiles WHERE user_id = ?",
        [syntheticEmployeeId],
      );
      assert.equal(rows[0].department, "Quality Assurance");
    });

    it("an Employee still cannot reach the Admin-only user-status route", async () => {
      const { status } = await call(
        "PUT",
        `/users/${syntheticEmployeeId}/status`,
        tokens.tempEmployee2,
        { is_active: true },
      );
      assert.equal(status, 403);
    });

    it("a valid JWT is not by itself a reason to serve employee records", async () => {
      // The directory must be denied even when the token is fresh and the
      // session row is active, i.e. authentication succeeded and was overridden
      // by authorization.
      const me = await call("GET", "/auth/me", tokens.tempEmployee2);
      assert.equal(me.status, 200);
      assert.equal(me.body.data.role, "Employee");
      assert.equal((await call("GET", "/users", tokens.tempEmployee2)).status, 403);
    });
  });
});

guardExecutedTests("DIRECTORY_API_URL", 14);
