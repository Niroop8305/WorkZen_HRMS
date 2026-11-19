import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import pool from "../src/config/database.js";

// Critical-2 HTTP regression suite for PUT /api/users/profile/:userId.
// Proves the column allowlist is enforced over the real route: injection-style
// property names and non-editable columns are rejected with 400 without touching
// the database, while self / HR Officer / Admin editing keeps working.
//
// Isolation: creates its own temporary employee with a real login and hard
// deletes it in teardown. Demo profiles are only ever used to *attempt* forbidden
// writes (which short-circuit at 403), so demo data is never mutated.
import { requiredBaseUrl, guardExecutedTests } from "./support/httpSuite.js";
import { assertScratchDatabase } from "./support/dbGuard.js";
const base = requiredBaseUrl("PROFILE_API_URL", "test:profile:http");
// T-007 tripwire: the target server writes to the database; the schema it
// points at must be an approved scratch one. Fails closed before any test
// registers.
assertScratchDatabase("profile-update-http");
const stamp = Date.now();
const TEMP_PASSWORD = "Temp@12345";

let adminToken, hrToken, payrollToken, demoEmployeeToken, tempToken, tempUserId;

const call = async (method, path, token, body) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
};

const login = async (email, password) => {
  const { body } = await call("POST", "/auth/login", null, { email, password });
  return body?.data?.token;
};

const readProfile = async (userId = tempUserId) => {
  const [rows] = await pool.query(
    `SELECT profile_id, user_id, employee_code, first_name, last_name, department,
            designation, phone, city, company_name
     FROM employee_profiles WHERE user_id = ?`,
    [userId],
  );
  return rows[0];
};

const put = (token, payload) =>
  call("PUT", `/users/profile/${tempUserId}`, token, payload);

describe("Profile update HTTP allowlist", () => {
  before(async () => {
    adminToken = await login("admin@workzen.demo", "Admin@123");
    hrToken = await login("hr@workzen.demo", "Hr@123");
    payrollToken = await login("payroll@workzen.demo", "Payroll@123");
    demoEmployeeToken = await login("employee@workzen.demo", "Employee@123");
    assert.ok(
      adminToken && hrToken && payrollToken && demoEmployeeToken,
      "demo staff tokens issued",
    );

    const [roles] = await pool.query(
      "SELECT role_id FROM roles WHERE role_name = 'Employee' LIMIT 1",
    );
    const email = `profile-http-${stamp}@example.test`;
    const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
    const [userRes] = await pool.query(
      `INSERT INTO users (role_id, email, password_hash, is_active)
       VALUES (?, ?, ?, TRUE)`,
      [roles[0].role_id, email, hash],
    );
    tempUserId = userRes.insertId;
    await pool.query(
      `INSERT INTO employee_profiles
        (user_id, employee_code, first_name, last_name, department, designation, phone, city, company_name)
       VALUES (?, ?, 'Http', 'Profile', 'Finance', 'Tester', '9999999999', 'Chennai', 'Acme Ltd')`,
      [tempUserId, `PROFHTTP-${tempUserId}`],
    );

    tempToken = await login(email, TEMP_PASSWORD);
    assert.ok(tempToken, "temp employee token issued");
  });

  after(async () => {
    if (tempUserId) {
      await pool.query("DELETE FROM users WHERE user_id = ?", [tempUserId]);
    }
    await pool.end();
  });

  describe("intended editing still works", () => {
    it("an employee can update their own permitted fields", async () => {
      const r = await put(tempToken, { city: "Pune", phone: "8888888888" });
      assert.equal(r.status, 200);
      assert.equal(r.body.success, true);

      const profile = await readProfile();
      assert.equal(profile.city, "Pune");
      assert.equal(profile.phone, "8888888888");
    });

    it("an HR Officer can update another employee's permitted fields", async () => {
      const r = await put(hrToken, { department: "Operations" });
      assert.equal(r.status, 200);
      assert.equal((await readProfile()).department, "Operations");
    });

    it("an Admin can update another employee's permitted fields", async () => {
      const r = await put(adminToken, { designation: "Lead Tester" });
      assert.equal(r.status, 200);
      assert.equal((await readProfile()).designation, "Lead Tester");
    });
  });

  describe("existing authorization rules are intact", () => {
    it("rejects anonymous requests with 401", async () => {
      assert.equal((await put(null, { city: "Nowhere" })).status, 401);
      assert.equal((await readProfile()).city, "Pune");
    });

    it("rejects a Payroll Officer editing someone else's profile", async () => {
      assert.equal((await put(payrollToken, { city: "Blocked" })).status, 403);
      assert.equal((await readProfile()).city, "Pune");
    });

    it("rejects another employee editing this profile", async () => {
      const r = await put(demoEmployeeToken, { city: "Blocked" });
      assert.equal(r.status, 403);
      assert.equal(r.body.success, false);
      assert.equal((await readProfile()).city, "Pune");
    });
  });

  describe("credential columns never reach the wire", () => {
    // V8: GET /users/profile/:userId is deliberately readable by the employee and
    // by HR Officers, and it used to serialize the whole `users` row - hash
    // included. The policy is unchanged; the payload must not carry a credential.
    const credentialKeys = (value, found = []) => {
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          if (/pass|hash|secret|salt|token|otp/i.test(key)) found.push(key);
          credentialKeys(child, found);
        }
      }
      return found;
    };

    const SAFE_USER_COLUMNS = [
      "created_at",
      "email",
      "is_active",
      "last_login",
      "role_id",
      "role_name",
      "updated_at",
      "user_id",
    ];

    it("an Employee reading their own profile gets no credential column", async () => {
      const r = await call("GET", `/users/profile/${tempUserId}`, tempToken);
      assert.equal(r.status, 200);
      assert.deepEqual(credentialKeys(r.body), [], "no credential-shaped key in the response");
      assert.deepEqual(
        Object.keys(r.body.data.user).sort(),
        SAFE_USER_COLUMNS,
        "the user block is the display column list",
      );
      assert.equal(r.body.data.user.email, `profile-http-${stamp}@example.test`);
      assert.ok(r.body.data.profile, "the profile itself is still returned");
    });

    it("an HR Officer reading the same profile gets no credential column", async () => {
      const r = await call("GET", `/users/profile/${tempUserId}`, hrToken);
      assert.equal(r.status, 200);
      assert.deepEqual(credentialKeys(r.body), [], "no credential-shaped key in the response");
      assert.deepEqual(Object.keys(r.body.data.user).sort(), SAFE_USER_COLUMNS);
    });

    it("an Admin detail read and /auth/me stay credential-free", async () => {
      const detail = await call("GET", `/users/${tempUserId}`, adminToken);
      assert.equal(detail.status, 200);
      assert.deepEqual(credentialKeys(detail.body), [], "GET /users/:id is credential-free");

      const me = await call("GET", "/auth/me", tempToken);
      assert.equal(me.status, 200);
      assert.deepEqual(credentialKeys(me.body), [], "GET /auth/me is credential-free");
    });

    it("the stored hash is still what login verifies against", async () => {
      // Guards against "fixed" by deleting the credential instead of the read:
      // the column must still exist and still work, it just may not be returned.
      const [rows] = await pool.query(
        "SELECT password_hash FROM users WHERE user_id = ?",
        [tempUserId],
      );
      assert.match(rows[0].password_hash, /^\$2[aby]\$/, "a bcrypt hash is stored");
      assert.ok(await login(`profile-http-${stamp}@example.test`, TEMP_PASSWORD), "login works");
    });
  });

  describe("arbitrary column identifiers cannot reach SQL", () => {
    it("rejects a property name that tries to close the SET clause", async () => {
      const r = await put(adminToken, {
        "city = 'pwned', employee_code": "HACKED",
      });
      assert.equal(r.status, 400);
      assert.equal(r.body.success, false);

      const profile = await readProfile();
      assert.equal(profile.city, "Pune");
      assert.match(profile.employee_code, /^PROFHTTP-/);
    });

    it("rejects stacked-query and comment-bearing property names", async () => {
      assert.equal(
        (await put(adminToken, { "city'; DROP TABLE employee_profiles; --": "x" }))
          .status,
        400,
      );
      assert.equal((await put(adminToken, { "phone = '0' -- ": "x" })).status, 400);

      const [tables] = await pool.query("SHOW TABLES LIKE 'employee_profiles'");
      assert.equal(tables.length, 1, "employee_profiles still exists");
      assert.equal((await readProfile()).phone, "8888888888");
    });

    it("never echoes the raw property name into the response", async () => {
      const evil = "city = 'pwned', employee_code";
      const r = await put(adminToken, { [evil]: "HACKED" });
      assert.equal(r.status, 400);
      assert.ok(
        !JSON.stringify(r.body).includes("pwned"),
        "response does not reflect the injection payload",
      );
    });
  });

  describe("protected fields cannot be mass-assigned", () => {
    it("rejects account and profile identifiers", async () => {
      const snapshot = await readProfile();
      for (const payload of [
        { employee_code: "ZZZ-HACKED" },
        { user_id: 1 },
        { profile_id: 1 },
        { created_at: "2000-01-01 00:00:00" },
      ]) {
        const r = await put(adminToken, payload);
        assert.equal(r.status, 400, `${Object.keys(payload)[0]} rejected`);
      }

      const after = await readProfile();
      assert.equal(after.employee_code, snapshot.employee_code);
      assert.equal(after.user_id, snapshot.user_id);
      assert.equal(after.profile_id, snapshot.profile_id);
    });

    it("rejects privileged and foreign-table fields", async () => {
      for (const payload of [
        { role_id: 1 },
        { is_admin: true },
        { password_hash: "attacker" },
      ]) {
        assert.equal(
          (await put(adminToken, payload)).status,
          400,
          `${Object.keys(payload)[0]} rejected`,
        );
      }

      const [rows] = await pool.query(
        "SELECT u.role_id, u.password_hash, r.role_name FROM users u JOIN roles r USING (role_id) WHERE u.user_id = ?",
        [tempUserId],
      );
      assert.equal(rows[0].role_name, "Employee");
      assert.notEqual(rows[0].password_hash, "attacker");
    });

    it("rejects a profile key that has no column in the table", async () => {
      assert.equal((await put(tempToken, { skills: ["a"] })).status, 400);
      assert.equal((await put(tempToken, { about: "text" })).status, 400);
    });
  });

  describe("validation is atomic and consistent", () => {
    it("a payload mixing valid and prohibited fields persists nothing", async () => {
      const snapshot = await readProfile();
      const r = await put(tempToken, {
        city: "Should Not Persist",
        company_name: "Should Not Persist",
        employee_code: "HACKED",
      });
      assert.equal(r.status, 400);

      const after = await readProfile();
      assert.equal(after.city, snapshot.city);
      assert.equal(after.company_name, snapshot.company_name);
      assert.equal(after.employee_code, snapshot.employee_code);
    });

    it("an empty body is rejected instead of producing invalid SQL", async () => {
      const r = await put(tempToken, {});
      assert.equal(r.status, 400);
      assert.equal(r.body.success, false);
    });

    it("a non-scalar value is rejected", async () => {
      assert.equal((await put(tempToken, { city: { nested: 1 } })).status, 400);
      assert.equal((await readProfile()).city, "Pune");
    });

    it("still lets a legitimate multi-field save succeed afterwards", async () => {
      const r = await put(tempToken, {
        first_name: "Final",
        last_name: "Saved",
        department: "Finance",
        designation: "Accountant",
        company_name: "Acme Ltd",
      });
      assert.equal(r.status, 200);

      const profile = await readProfile();
      assert.equal(profile.first_name, "Final");
      assert.equal(profile.last_name, "Saved");
      assert.equal(profile.department, "Finance");
      assert.equal(profile.designation, "Accountant");
      assert.equal(profile.company_name, "Acme Ltd");
      assert.match(profile.employee_code, /^PROFHTTP-/);
    });
  });
});

guardExecutedTests("PROFILE_API_URL", 20);
