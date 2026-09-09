// =====================================================================
// POLICY ENGINE TESTS — Login-Time evaluation (FreeRADIUS syntax subset)
// Run: bun test tests/policy-engine.test.ts
// =====================================================================

import { describe, test, expect } from "bun:test";
import { isWithinLoginTime } from "../mini-services/radius-server/src/authenticator";
import { scheduleToLoginTime } from "../src/core/policy/radius-sync";

// Wednesday 2026-09-09 (day 3), 14:30 local
const WED_1430 = new Date(2026, 8, 9, 14, 30);
const MON_0900 = new Date(2026, 8, 7, 9, 0); // Monday
const SUN_2359 = new Date(2026, 8, 6, 23, 59);

describe("isWithinLoginTime", () => {
  test("single day window inside", () => {
    expect(isWithinLoginTime("We0800-2200", WED_1430)).toBe(true);
  });
  test("single day window outside hours", () => {
    expect(isWithinLoginTime("We0800-1200", WED_1430)).toBe(false);
  });
  test("wrong day rejects", () => {
    expect(isWithinLoginTime("Mo0800-2200", WED_1430)).toBe(false);
  });
  test("whole-day entry matches any time on that day", () => {
    expect(isWithinLoginTime("Su", SUN_2359)).toBe(true);
    expect(isWithinLoginTime("Mo", SUN_2359)).toBe(false);
  });
  test("Any matches every day", () => {
    expect(isWithinLoginTime("Any0000-2359", WED_1430)).toBe(true);
  });
  test("comma-separated multi-day expression", () => {
    const expr = "Mo0800-1200,We0800-2200";
    expect(isWithinLoginTime(expr, MON_0900)).toBe(true);
    expect(isWithinLoginTime(expr, WED_1430)).toBe(true);
    expect(isWithinLoginTime(expr, SUN_2359)).toBe(false);
  });
  test("boundary: start minute is inclusive", () => {
    expect(isWithinLoginTime("We0800-2200", new Date(2026, 8, 9, 8, 0))).toBe(true);
  });
  test("boundary: end minute is inclusive", () => {
    expect(isWithinLoginTime("We0800-2200", new Date(2026, 8, 9, 22, 0))).toBe(true);
  });
  test("malformed expression → deny (fail closed)", () => {
    expect(isWithinLoginTime("garbage", WED_1430)).toBe(false);
  });
  test("empty expression → deny", () => {
    expect(isWithinLoginTime("", WED_1430)).toBe(false);
  });
});

describe("scheduleToLoginTime (JSON → FreeRADIUS)", () => {
  test("converts day windows", () => {
    const schedule = JSON.stringify({
      mon: [{ start: "08:00", end: "22:00" }],
      tue: [{ start: "00:00", end: "23:59" }],
    });
    expect(scheduleToLoginTime(schedule)).toBe("Mo0800-2200,Tu");
  });

  test("full-day windows collapse to bare day tokens", () => {
    const schedule = JSON.stringify({
      sat: [{ start: "00:00", end: "23:59" }],
      sun: [{ start: "00:00", end: "23:59" }],
    });
    expect(scheduleToLoginTime(schedule)).toBe("Sa,Su");
  });

  test("malformed JSON → null", () => {
    expect(scheduleToLoginTime("not json")).toBeNull();
  });

  test("empty schedule → null", () => {
    expect(scheduleToLoginTime("{}")).toBeNull();
  });
});
