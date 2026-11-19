// D-6: date keys must come from the Asia/Kolkata wall clock, never UTC.
// 05:29 IST = 23:59 UTC the previous day; 05:30 IST = 00:00 UTC the same day.
// toISOString().split("T")[0] named the WRONG day for every morning instant —
// these tests pin the fix.

import { describe, expect, it } from "vitest";
import {
  BUSINESS_TIMEZONE,
  formatLocalDate,
  toLocalDateKey,
  todayLocalKey,
} from "./dates";

// 2026-11-20 02:00 IST === 2026-11-19 20:30 UTC — the case the UTC bug broke.
const IST_EARLY_MORNING = new Date("2026-11-19T20:30:00.000Z");
// 2026-11-20 06:00 IST === 2026-11-20 00:30 UTC.
const IST_AFTER_SIX = new Date("2026-11-20T00:30:00.000Z");

describe("toLocalDateKey (D-6)", () => {
  it("uses the business timezone, not UTC", () => {
    expect(BUSINESS_TIMEZONE).toBe("Asia/Kolkata");
    expect(toLocalDateKey(IST_EARLY_MORNING)).toBe("2026-11-20");
    expect(IST_EARLY_MORNING.toISOString().split("T")[0]).toBe("2026-11-19");
  });

  it("agrees with UTC after 05:30 IST", () => {
    expect(toLocalDateKey(IST_AFTER_SIX)).toBe("2026-11-20");
    expect(IST_AFTER_SIX.toISOString().split("T")[0]).toBe("2026-11-20");
  });

  it("produces the YYYY-MM-DD shape", () => {
    expect(toLocalDateKey(new Date("2026-02-03T10:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("defaults to now without throwing", () => {
    expect(todayLocalKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formats a human label in the business timezone", () => {
    expect(formatLocalDate(IST_EARLY_MORNING)).toContain("Nov 2026");
    expect(formatLocalDate(IST_EARLY_MORNING)).toMatch(/^20 Nov 2026$/);
  });
});
