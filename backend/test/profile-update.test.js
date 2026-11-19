import { assertScratchDatabase } from "./support/dbGuard.js";

// T-007 tripwire: this suite writes to the database; it must never run
// against a protected application schema. Fails closed before any test
// registers.
assertScratchDatabase("profile-update");

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import EmployeeProfile, {
  EDITABLE_PROFILE_COLUMNS,
} from "../src/models/profileModel.js";
import pool from "../src/config/database.js";

// Critical-2 regression suite: employee-profile updates must build their SQL SET
// clause only from the server-controlled column allowlist. Values stay
// parameterized, request keys can never become identifiers, and non-editable
// columns cannot be mass-assigned.
//
// Isolation: creates its own temporary user + profile and hard-deletes them in
// teardown, so shared demo profiles are never touched.
const stamp = Date.now();

let tempUserId;

const seedProfile = async () => {
  const [roles] = await pool.query(
    "SELECT role_id FROM roles WHERE role_name = 'Employee' LIMIT 1",
  );
  const [userRes] = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, is_active)
     VALUES (?, ?, 'x', TRUE)`,
    [roles[0].role_id, `profile-unit-${stamp}@example.test`],
  );
  tempUserId = userRes.insertId;
  await pool.query(
    `INSERT INTO employee_profiles
      (user_id, employee_code, first_name, last_name, department, designation, phone, city)
     VALUES (?, ?, 'Unit', 'Profile', 'Finance', 'Tester', '9999999999', 'Chennai')`,
    [tempUserId, `PROFUNIT-${tempUserId}`],
  );
};

const readProfile = async () => {
  const [rows] = await pool.query(
    "SELECT * FROM employee_profiles WHERE user_id = ?",
    [tempUserId],
  );
  return rows[0];
};

const expectRejected = async (payload) => {
  const error = await EmployeeProfile.update(tempUserId, payload).then(
    () => null,
    (e) => e,
  );
  assert.ok(error, "update was rejected");
  assert.equal(error.statusCode, 400, "rejected with a client error");
  return error;
};

describe("EmployeeProfile.update column allowlist", () => {
  before(async () => {
    await seedProfile();
  });

  after(async () => {
    if (tempUserId) {
      await pool.query("DELETE FROM users WHERE user_id = ?", [tempUserId]);
    }
    await pool.end();
  });

  describe("allowed edits still work", () => {
    it("updates a single permitted column and persists it", async () => {
      assert.equal(
        await EmployeeProfile.update(tempUserId, { city: "Pune" }),
        undefined,
      );
      assert.equal((await readProfile()).city, "Pune");
    });

    it("updates several permitted columns at once", async () => {
      await EmployeeProfile.update(tempUserId, {
        first_name: "Updated",
        last_name: "Name",
        department: "Operations",
        designation: "Senior Tester",
        phone: "8888888888",
        date_of_birth: "1994-05-06",
      });

      const profile = await readProfile();
      assert.equal(profile.first_name, "Updated");
      assert.equal(profile.last_name, "Name");
      assert.equal(profile.department, "Operations");
      assert.equal(profile.designation, "Senior Tester");
      assert.equal(profile.phone, "8888888888");

      // DATE columns come back as Date objects, so compare the stored day
      // through MySQL rather than through a JS string cast.
      const [dob] = await pool.query(
        `SELECT DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dob
         FROM employee_profiles WHERE user_id = ?`,
        [tempUserId],
      );
      assert.equal(dob[0].dob, "1994-05-06");
    });

    it("keeps every allowlisted column writable on the live table", async () => {
      const [cols] = await pool.query("SHOW COLUMNS FROM employee_profiles");
      const live = new Set(cols.map((c) => c.Field));
      for (const column of Object.values(EDITABLE_PROFILE_COLUMNS)) {
        assert.ok(live.has(column), `${column} exists in employee_profiles`);
      }
    });

    it("excludes identifiers, audit columns and privileged fields", () => {
      for (const protectedColumn of [
        "profile_id",
        "user_id",
        "employee_code",
        "created_at",
        "updated_at",
        "role_id",
        "is_admin",
      ]) {
        assert.ok(
          !(protectedColumn in EDITABLE_PROFILE_COLUMNS),
          `${protectedColumn} is not editable`,
        );
      }
    });
  });

  describe("injection-style property names are rejected", () => {
    it("rejects a key that would close the statement and append SQL", async () => {
      const snapshot = await readProfile();
      await expectRejected({
        "city = 'pwned', employee_code": "HACKED",
      });
      const after = await readProfile();
      assert.equal(after.city, snapshot.city);
      assert.equal(after.employee_code, snapshot.employee_code);
    });

    it("rejects a key carrying a SQL comment and quote characters", async () => {
      await expectRejected({ "phone = '000' -- ": "x" });
      assert.equal((await readProfile()).phone, "8888888888");
    });

    it("rejects stacked-query and subquery style keys", async () => {
      await expectRejected({ "city'; DROP TABLE employee_profiles; --": "x" });
      await expectRejected({ "city = (SELECT role_id FROM users)": "x" });
      const [tables] = await pool.query(
        "SHOW TABLES LIKE 'employee_profiles'",
      );
      assert.equal(tables.length, 1, "employee_profiles still exists");
    });
  });

  describe("mass assignment is rejected", () => {
    it("cannot overwrite the profile or account identifier", async () => {
      const snapshot = await readProfile();
      await expectRejected({ user_id: 1 });
      await expectRejected({ profile_id: 999999 });
      const after = await readProfile();
      assert.equal(after.user_id, snapshot.user_id);
      assert.equal(after.profile_id, snapshot.profile_id);
    });

    it("cannot overwrite server-generated employee_code", async () => {
      await expectRejected({ employee_code: "ZZZ-REASSIGNED" });
      assert.match((await readProfile()).employee_code, /^PROFUNIT-/);
    });

    it("cannot overwrite audit timestamps", async () => {
      await expectRejected({ created_at: "2000-01-01 00:00:00" });
      await expectRejected({ updated_at: "2000-01-01 00:00:00" });
    });

    it("cannot inject fields that belong to other tables", async () => {
      await expectRejected({ role_id: 1 });
      await expectRejected({ is_admin: true });
      await expectRejected({ password_hash: "x" });
    });

    it("rejects a column name that does not exist in the table", async () => {
      await expectRejected({ skills: ["a"] });
      await expectRejected({ about: "free text" });
    });
  });

  describe("validation happens before any SQL runs", () => {
    it("a mixed valid + prohibited payload mutates nothing", async () => {
      const snapshot = await readProfile();
      await expectRejected({
        city: "Should Not Persist",
        department: "Should Not Persist Either",
        employee_code: "HACKED",
      });

      const after = await readProfile();
      assert.equal(after.city, snapshot.city);
      assert.equal(after.department, snapshot.department);
      assert.equal(after.employee_code, snapshot.employee_code);
    });

    it("an empty payload is rejected instead of producing invalid SQL", async () => {
      const error = await expectRejected({});
      assert.match(error.message, /No profile fields/i);
    });

    it("non-scalar values are rejected", async () => {
      await expectRejected({ city: { nested: "object" } });
      await expectRejected({ city: ["a", "b"] });
    });

    it("still reports a missing profile", async () => {
      const error = await EmployeeProfile.update(999999, {
        city: "Nowhere",
      }).then(() => null, (e) => e);
      assert.match(error.message, /profile not found/i);
    });
  });
});
