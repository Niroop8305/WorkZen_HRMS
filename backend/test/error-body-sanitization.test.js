// Regression guard for the verified information-disclosure defect: every 500
// handler used to echo the driver's own message (`ER_NO_SUCH_TABLE: Table
// 'workzen_hrms.users' doesn't exist`, truncated SQL, column names) straight
// into the response body, and no controller called `next(error)`, so the
// centralized errorHandler never ran.
//
// Two layers, because the two kinds of site fail differently:
//   1. runtime - a controller is invoked against a driver that always rejects,
//      and the response body is asserted to carry a generic message and no
//      database detail;
//   2. static - no controller or route file may reintroduce `error: error.message`.
//      The route files with inline try/catch (dashboardRoutes, userRoutes) are
//      covered only by this layer.
//
// Database-free by construction: mysql2's createPool is replaced before any
// application module is imported, and `after()` proves the real driver was
// never asked for a connection.

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const realCreatePool = mysql.createPool;

const DRIVER_ERROR_TEXT =
  "ER_NO_SUCH_TABLE: Table 'workzen_hrms.users' doesn't exist";

const rejectingConnection = {
  async query() {
    throw Object.assign(new Error(DRIVER_ERROR_TEXT), {
      code: "ER_NO_SUCH_TABLE",
      errno: 1146,
      sql: "SELECT u.user_id, u.email, r.role_name FROM users u",
    });
  },
  async beginTransaction() {},
  async commit() {},
  async rollback() {},
  release() {},
};

const fakePool = {
  query() {
    return rejectingConnection.query();
  },
  async getConnection() {
    return rejectingConnection;
  },
};

mysql.createPool = () => fakePool;

const {
  getAllUsers,
  getUserById,
} = await import("../src/controllers/userController.js");
const {
  getAttendanceStatus,
  markAttendance,
} = await import("../src/controllers/attendanceController.js");
const { getMyPayroll } = await import("../src/controllers/payrollController.js");
const { getMe } = await import("../src/controllers/authController.js");

const makeRes = () => {
  const res = {
    statusCode: 200,
    status(code) {
      res.statusCode = code;
      return res;
    },
    set() {
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const authedReq = (body = {}) => ({
  body,
  query: {},
  params: { id: "12" },
  ip: "127.0.0.1",
  headers: {},
  get: () => undefined,
  user: { userId: 12, roleName: "Admin", sessionId: "sess-1", email: "admin@workzen.demo" },
});

// The whole point: an unauthenticated caller must not learn the schema, the
// SQL, or the driver error code from a failure response.
const assertSanitized = (res, label) => {
  assert.equal(res.statusCode, 500, `${label}: still a 500`);
  assert.equal(res.body.success, false, `${label}: reports failure`);
  assert.equal(res.body.error, undefined, `${label}: echoes no raw error`);
  const rendered = JSON.stringify(res.body);
  for (const leak of [
    "ER_",
    "errno",
    "workzen_hrms",
    "SELECT",
    "Table",
    DRIVER_ERROR_TEXT,
  ]) {
    assert.ok(
      !rendered.includes(leak),
      `${label}: response body leaks ${JSON.stringify(leak)} -> ${rendered}`,
    );
  }
  assert.ok(
    typeof res.body.message === "string" && res.body.message.length > 0,
    `${label}: carries a usable generic message`,
  );
};

describe("500 responses carry no database detail", () => {
  it("userController.getAllUsers", async () => {
    const res = makeRes();
    await getAllUsers(authedReq(), res);
    assertSanitized(res, "getAllUsers");
  });

  it("userController.getUserById", async () => {
    const res = makeRes();
    await getUserById(authedReq(), res);
    assertSanitized(res, "getUserById");
  });

  it("attendanceController.getAttendanceStatus", async () => {
    const res = makeRes();
    await getAttendanceStatus(authedReq(), res);
    assertSanitized(res, "getAttendanceStatus");
  });

  it("attendanceController.markAttendance", async () => {
    const res = makeRes();
    const req = authedReq({
      attendance_date: "2026-10-16",
      check_in_time: "09:15:00",
    });
    await markAttendance(req, res);
    assertSanitized(res, "markAttendance");
  });

  it("payrollController.getMyPayroll", async () => {
    const res = makeRes();
    await getMyPayroll(authedReq(), res);
    assertSanitized(res, "getMyPayroll");
  });

  it("authController.getMe", async () => {
    const res = makeRes();
    await getMe(authedReq(), res);
    assertSanitized(res, "getMe");
  });
});

describe("no controller reintroduces the raw error field", () => {
  const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
  const offenders = [];

  for (const dir of ["controllers", "routes"]) {
    const absolute = path.join(srcRoot, dir);
    for (const entry of fs.readdirSync(absolute)) {
      if (!entry.endsWith(".js")) continue;
      const file = path.join(absolute, entry);
      const source = fs.readFileSync(file, "utf8");
      if (/error:\s*error\.message/.test(source)) {
        offenders.push(`${dir}/${entry}`);
      }
    }
  }

  it("scans every controller and route file", () => {
    assert.ok(
      offenders.length === 0,
      `files echoing the raw error: ${offenders.join(", ") || "none"}`,
    );
  });
});

after(() => {
  mysql.createPool = realCreatePool;
});
