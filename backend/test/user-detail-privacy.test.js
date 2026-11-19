import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import pool from "../src/config/database.js";
import { User } from "../src/models/userModel.js";
import userRoutes from "../src/routes/userRoutes.js";

// V8 lock: the user-detail read path must never project a credential column.
//
// GET /api/users/profile/:userId is intentionally readable by the employee and by
// HR Officers - that policy is not what this suite tests. It pins the narrower
// promise that whatever those callers are shown came from an explicit display
// projection, so no response can carry `password_hash` (or a wildcard that would
// silently include any column added later).
//
// The route handler is reached past `protect` (the role gate itself is covered by
// test/profile-update-http.test.js and test/directory-authorization-http.test.js).
// No query is ever sent: pool.query is replaced with a recorder that answers from
// canned rows, so this file touches neither the schema nor the data.

const realQuery = pool.query;

const USER_ROW = {
  user_id: 7,
  role_id: 2,
  email: "privacy@example.test",
  is_active: 1,
  last_login: null,
  created_at: "2026-10-16 09:00:00",
  updated_at: "2026-10-16 09:00:00",
  role_name: "Employee",
};

const PROFILE_ROW = {
  profile_id: 7,
  user_id: 7,
  employee_code: "WZ-PRIVACY",
  first_name: "Priya",
  last_name: "Test",
};

const recordQueries = () => {
  const queries = [];
  pool.query = async (sql, values) => {
    queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), values });
    if (/view_user_details/i.test(sql)) return [[{ ...USER_ROW }]];
    if (/employee_profiles/i.test(sql)) return [[{ ...PROFILE_ROW }]];
    if (/password_hash/i.test(sql)) {
      // The credential lookup is answered separately so the display projections and
      // the hash-bearing one cannot be confused by a stub that returns one shape.
      return [[{ user_id: 7, email: USER_ROW.email, is_active: 1, password_hash: "$2b$10$fakefakefakefakefakefake" }]];
    }
    if (/FROM users/i.test(sql)) return [[{ ...USER_ROW }]];
    return [[]];
  };
  return queries;
};

const credentialKeys = (value, found = []) => {
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/pass|hash|secret|salt|token|otp/i.test(key)) found.push(key);
      credentialKeys(child, found);
    }
  }
  return found;
};

const selectList = (sql) => {
  const match = /^SELECT([\s\S]*?)FROM /i.exec(sql);
  assert.ok(match, `no projection found in: ${sql}`);
  return match[1];
};

const profileHandler = () => {
  const layer = userRoutes.stack.find(
    (candidate) => candidate.route?.path === "/profile/:userId",
  );
  assert.ok(layer, "GET /users/profile/:userId is mounted");
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const readProfile = async (requester, targetUserId) => {
  let body = null;
  const res = {
    status: () => res,
    json: (payload) => {
      body = payload;
      return payload;
    },
  };
  await profileHandler()({ params: { userId: String(targetUserId) }, user: requester }, res);
  return body;
};

after(() => {
  pool.query = realQuery;
});

describe("user-detail credential projection", () => {
  it("projects no credential column in any user read used for a response", async () => {
    const queries = recordQueries();
    try {
      await User.findById(7);
      await User.findByIdWithProfile(7);
      await User.findAllWithProfiles();
      await User.findAll();
    } finally {
      pool.query = realQuery;
    }

    assert.equal(queries.length, 4, "one query per reader");
    const userReads = queries.filter(({ sql }) => /FROM users/i.test(sql));
    assert.equal(userReads.length, 3, "three readers go straight at the users table");
    for (const { sql } of userReads) {
      const projection = selectList(sql);
      assert.doesNotMatch(projection, /password_hash/i, `credential column read in: ${sql}`);
      assert.doesNotMatch(projection, /u\.\*/, `wildcard over users in: ${sql}`);
    }
    // The directory read goes through view_user_details, which schema.sql projects
    // without any credential column, so `SELECT *` there stays inside the promise.
    assert.ok(
      queries.some(({ sql }) => /view_user_details/i.test(sql)),
      "the fourth reader is the pre-projected view",
    );
  });

  it("keeps a separate, hash-bearing lookup for the change-password path", async () => {
    const queries = recordQueries();
    try {
      const credentials = await User.findCredentialsById(7);
      assert.match(credentials.password_hash, /^\$2b\$/, "the credential reader still works");
    } finally {
      pool.query = realQuery;
    }
    assert.match(queries[0].sql, /password_hash/i, "it is the only reader that asks for it");
  });

  it("answers an Employee reading their own profile without a credential", async () => {
    recordQueries();
    try {
      const body = await readProfile({ userId: 7, roleName: "Employee" }, 7);
      assert.equal(body.success, true);
      assert.deepEqual(credentialKeys(body), [], "no credential-shaped key");
      assert.deepEqual(Object.keys(body.data.user).sort(), [
        "created_at",
        "email",
        "is_active",
        "last_login",
        "role_id",
        "role_name",
        "updated_at",
        "user_id",
      ]);
      assert.equal(body.data.profile.employee_code, "WZ-PRIVACY", "profile data is intact");
    } finally {
      pool.query = realQuery;
    }
  });

  it("answers an HR Officer reading the same profile without a credential", async () => {
    recordQueries();
    try {
      const body = await readProfile({ userId: 3, roleName: "HR Officer" }, 7);
      assert.equal(body.success, true);
      assert.deepEqual(credentialKeys(body), [], "no credential-shaped key");
      assert.deepEqual(body.data.user.role_name, "Employee");
    } finally {
      pool.query = realQuery;
    }
  });

  it("refuses a Payroll Officer without querying at all", async () => {
    const queries = recordQueries();
    try {
      const body = await readProfile({ userId: 4, roleName: "Payroll Officer" }, 7);
      assert.equal(body.success, false);
    } finally {
      pool.query = realQuery;
    }
    assert.deepEqual(queries, [], "the authorization decision is made before any read");
  });
});
