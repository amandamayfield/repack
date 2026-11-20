import { expect, test } from "vitest";
import { formatDateRange, sameLengthFromToday } from "./dates";

test("formats a range, and a one-day trip as one date", () => {
  expect(formatDateRange("2026-07-01", "2026-07-03")).toMatch(
    /Jul 1\s*–\s*3, 2026/,
  );
  expect(formatDateRange("2026-07-01", "2026-07-01")).toBe("Jul 1, 2026");
});

test("treats dates as calendar days, not local midnight", () => {
  // new Date("2026-07-01") is UTC midnight, which is June 30 west of UTC.
  expect(formatDateRange("2026-07-01", "2026-07-03")).toContain("Jul 1");
});

test("moves a trip to start today, keeping its length", () => {
  const today = new Date(2026, 10, 29); // Nov 29, local time
  expect(sameLengthFromToday("2026-07-01", "2026-07-05", today)).toEqual({
    start_date: "2026-11-29",
    end_date: "2026-12-03",
  });
  expect(sameLengthFromToday("2026-07-01", "2026-07-01", today)).toEqual({
    start_date: "2026-11-29",
    end_date: "2026-11-29",
  });
});
