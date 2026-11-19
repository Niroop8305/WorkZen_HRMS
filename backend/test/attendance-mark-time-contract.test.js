// Regression guard for the legacy POST /api/attendance/mark time contract.
//
// attendance.check_in_time and check_out_time are DATETIME columns, but this
// endpoint accepts clock times ("09:15"), the same format every other
// attendance endpoint documents. Before the fix the raw value went to MySQL
// as-is, so a well-formed HH:mm payload failed in the driver and an
// ISO/garbage payload failed too - both surfacing as a 500 that the client
// could not act on.
//
// Database-free by construction: mysql2's createPool is replaced before any
// application module is imported, and `after()` proves the real driver was
// never asked for a connection.

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import mysql from "mysql2/promise";

const realCreatePool = mysql.createPool;

const recorded = [];

const fakePool = {
  async query(sql, params) {
    recorded.push({ sql, params });
    return [{ affectedRows: 1, insertId: 9001 }];
  },
  async getConnection() {
    throw new Error("this endpoint must not use a transaction");
  },
};

mysql.createPool = () => fakePool;

const { markAttendance } = await import(
  "../src/controllers/attendanceController.js"
);

const makeRes = () => {
  const res = {
    statusCode: 200,
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

const mark = async (body) => {
  recorded.length = 0;
  const res = makeRes();
  await markAttendance(
    {
      body,
      user: { userId: 12, roleName: "Employee" },
    },
    res
  );
  return { res, queries: recorded.slice() };
};

describe("legacy attendance marking validates before touching MySQL", () => {
  it("accepts the documented HH:mm clock times", async () => {
    const { res, queries } = await mark({
      attendance_date: "2026-10-16",
      check_in_time: "09:15",
      check_out_time: "17:45",
    });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(queries.length, 1, "exactly one statement runs");

    const [, , checkIn, checkOut, totalHours] = queries[0].params;
    assert.equal(checkIn, "2026-10-16 09:15:00", "check-in becomes a DATETIME");
    assert.equal(checkOut, "2026-10-16 17:45:00", "check-out becomes a DATETIME");
    assert.equal(totalHours, "8.50", "worked hours are derived from the pair");
    assert.equal(res.body.data.check_in_time, "2026-10-16 09:15:00");
    assert.equal(res.body.data.check_out_time, "2026-10-16 17:45:00");
  });

  it("accepts explicit HH:mm:ss times unchanged", async () => {
    const { res, queries } = await mark({
      attendance_date: "2026-10-16",
      check_in_time: "09:15:30",
      check_out_time: "17:15:30",
    });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(queries[0].params[2], "2026-10-16 09:15:30");
    assert.equal(queries[0].params[3], "2026-10-16 17:15:30");
    assert.equal(queries[0].params[4], "8.00");
  });

  it("still allows an open day with only a check-in", async () => {
    const { res, queries } = await mark({
      attendance_date: "2026-10-16",
      check_in_time: "09:15",
    });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(queries[0].params[3], null, "check-out stays NULL");
    assert.equal(queries[0].params[4], null, "no hours until check-out");
  });

  it("rejects an ISO timestamp for the date with a 400 and no query", async () => {
    const { res, queries } = await mark({
      attendance_date: "2026-10-16T00:00:00.000Z",
      check_in_time: "09:15",
    });

    assert.equal(res.statusCode, 400);
    assert.equal(queries.length, 0, "a bad payload must not reach MySQL");
    assert.match(res.body.message, /attendance_date/);
  });

  it("rejects an ISO timestamp for the time with a 400 and no query", async () => {
    const { res, queries } = await mark({
      attendance_date: "2026-10-16",
      check_in_time: "2026-10-16T09:15:00.000Z",
    });

    assert.equal(res.statusCode, 400);
    assert.equal(queries.length, 0);
    assert.match(res.body.message, /Attendance times must use/);
  });

  it("rejects impossible clock times with a 400 and no query", async () => {
    for (const check_in_time of ["24:00", "09:60", "9:15", "09:15:00 PM"]) {
      const { res, queries } = await mark({
        attendance_date: "2026-10-16",
        check_in_time,
      });

      assert.equal(res.statusCode, 400, `${check_in_time} is not a valid time`);
      assert.equal(queries.length, 0, `${check_in_time} must not reach MySQL`);
    }
  });

  it("rejects a check-out earlier than the check-in with a 400", async () => {
    const { res, queries } = await mark({
      attendance_date: "2026-10-16",
      check_in_time: "17:45",
      check_out_time: "09:15",
    });

    assert.equal(res.statusCode, 400);
    assert.equal(queries.length, 0, "no negative workday is written");
  });

  it("keeps the existing missing-date rejection", async () => {
    const { res, queries } = await mark({ check_in_time: "09:15" });

    assert.equal(res.statusCode, 400);
    assert.equal(queries.length, 0);
    assert.equal(res.body.message, "Attendance date is required");
  });
});

after(() => {
  mysql.createPool = realCreatePool;
});
