// Retention policy, verified without a database. `prune-sessions.js` only opens a
// connection in its direct-run branch, so these cases hand the exported functions
// a scripted connection and read back exactly what each run would do.
//
// The point of the suite is the shape of the predicates, not the row counts: a
// retention job that can delete a live session, or that deletes by default, is a
// worse outage than the unbounded table it was written to fix.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pruneRevokedSessions,
  pruneThrottleBuckets,
} from "../src/database/prune-sessions.js";

const connectionOf = (script) => {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const statement = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: statement, params });
      const match = Object.entries(script).find(([fragment]) =>
        statement.includes(fragment),
      );
      if (!match) return [[]];
      const value = match[1];
      return typeof value === "function" ? value(statement, params) : value;
    },
  };
};

describe("revoked-session retention", () => {
  it("does not write anything unless a caller asks it to", async () => {
    const connection = connectionOf({
      "COUNT(*) AS expired": [[{ expired: 120, kept_active: "3" }]],
      "COUNT(*) AS live": [[{ live: 40 }]],
    });
    const report = await pruneRevokedSessions(connection);
    assert.equal(report.apply, false);
    assert.equal(report.removed, 0);
    assert.equal(report.batches, 0);
    assert.deepEqual(
      connection.calls.map((call) => call.sql.split(" ")[0]),
      ["SELECT", "SELECT"],
      "a dry run cannot issue a DELETE",
    );
  });

  it("can only ever select rows that are already revoked", async () => {
    const connection = connectionOf({
      "COUNT(*) AS expired": [[{ expired: 0, kept_active: null }]],
      "DELETE FROM user_sessions": [{ affectedRows: 0 }],
      "COUNT(*) AS live": [[{ live: 12 }]],
    });
    await pruneRevokedSessions(connection, { apply: true });
    // Every statement that can *choose* rows must carry both halves of the
    // predicate: revoked, and older than the window.
    const selectors = connection.calls.filter((call) => call.sql.includes("INTERVAL"));
    assert.equal(selectors.length, 2, "the count and the delete");
    for (const call of selectors) {
      assert.ok(
        call.sql.includes("revoked_at IS NOT NULL"),
        "a live session must not be a candidate",
      );
    }
  });

  it("measures retention in database time and binds the window", async () => {
    const connection = connectionOf({
      "COUNT(*) AS expired": [[{ expired: 3, kept_active: "3" }]],
      "COUNT(*) AS live": [[{ live: 5 }]],
      "DELETE FROM user_sessions": [{ affectedRows: 0 }],
    });
    const report = await pruneRevokedSessions(connection, { apply: true });
    const delete_ = connection.calls.find((call) => call.sql.startsWith("DELETE"));
    assert.ok(delete_.sql.includes("DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)"));
    assert.ok(!/\d+ DAY/.test(delete_.sql), "the window is never inlined");
    assert.equal(report.retentionDays, 90);
  });

  it("works in bounded batches and stops when a batch is empty", async () => {
    let remaining = 12_003;
    const connection = connectionOf({
      "COUNT(*) AS expired": [[{ expired: 12_003, kept_active: "12003" }]],
      "COUNT(*) AS live": [[{ live: 400 }]],
      "DELETE FROM user_sessions": () => {
        const affected = Math.min(5000, remaining);
        remaining -= affected;
        return [{ affectedRows: affected }];
      },
    });
    const report = await pruneRevokedSessions(connection, { apply: true });
    assert.equal(report.removed, 12_003);
    assert.equal(report.batches, 4, "three full batches and one short one");
    assert.equal(report.truncated, false);
  });

  it("refuses a retention window that would delete recent history", async () => {
    const connection = connectionOf({});
    await assert.rejects(() => pruneRevokedSessions(connection, { retentionDays: 0 }));
    await assert.rejects(() =>
      pruneRevokedSessions(connection, { retentionDays: "90" }),
    );
    assert.equal(connection.calls.length, 0);
  });

  it("reports what it left alone", async () => {
    const connection = connectionOf({
      "COUNT(*) AS expired": [[{ expired: 7, kept_active: "7" }]],
      "COUNT(*) AS live": [[{ live: 33 }]],
    });
    const report = await pruneRevokedSessions(connection);
    assert.equal(report.expiredCandidates, 7);
    assert.equal(report.liveSessionsProtected, 33);
  });
});

describe("throttle-bucket retention", () => {
  const ledger = [
    { total: 500, reclaimable: "480", live_lockouts: "20" },
  ];

  it("counts live lockouts as protected and writes nothing by default", async () => {
    const connection = connectionOf({ "COUNT(*) AS total": [ledger] });
    const report = await pruneThrottleBuckets(connection);
    assert.equal(report.apply, false);
    assert.equal(report.totalRows, 500);
    assert.equal(report.reclaimable, 480);
    assert.equal(report.liveLockoutsProtected, 20);
    assert.equal(report.idleRemoved, 0);
    assert.equal(report.capRemoved, 0);
    assert.equal(
      connection.calls.filter((call) => call.sql.startsWith("DELETE")).length,
      0,
    );
  });

  it("hands the same connection and the same limits to the real sweep", async () => {
    let seen = null;
    const connection = connectionOf({ "COUNT(*) AS total": [ledger] });
    const report = await pruneThrottleBuckets(connection, {
      apply: true,
      idleMinutes: 45,
      rowCap: 400,
      sweep: async (options) => {
        seen = options;
        return { idleRemoved: 60, capRemoved: 5, total: 400 };
      },
    });
    assert.equal(seen.idleMinutes, 45);
    assert.equal(seen.rowCap, 400);
    assert.equal(seen.connection, connection, "one connection for the whole run");
    assert.equal(report.idleRemoved, 60);
    assert.equal(report.capRemoved, 5);
  });

  it("reaches the sweep through the model when nothing is injected", async () => {
    // The production path must not silently lose the connection parameter, or the
    // operator's --apply run would sweep a different database than it reported.
    const model = await import("../src/models/loginThrottleModel.js");
    const connection = connectionOf({ "COUNT(*) AS total": [ledger] });
    const swept = await model.sweepExpiredBuckets({
      idleMinutes: 30,
      rowCap: 10,
      connection,
    });
    assert.equal(swept.total, 10, "trimmed from 500 to the cap of 10");
    const deletes = connection.calls.filter((call) => call.sql.startsWith("DELETE"));
    assert.equal(deletes.length, 2);
    for (const call of deletes) {
      assert.ok(
        call.sql.includes(
          "(locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)",
        ),
      );
    }
    assert.equal(swept.capRemoved, 0, "the fake reports no affected rows");
  });
});
