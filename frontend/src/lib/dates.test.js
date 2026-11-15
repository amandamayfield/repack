import { expect, test } from "vitest";
import { formatDateRange } from "./dates";

test("formats ranges, open ends, and no dates", () => {
  expect(formatDateRange("2026-07-01", "2026-07-03")).toMatch(
    /Jul 1\s*–\s*3, 2026/,
  );
  expect(formatDateRange("2026-07-01", null)).toBe("From Jul 1, 2026");
  expect(formatDateRange(null, "2026-07-03")).toBe("Until Jul 3, 2026");
  expect(formatDateRange(null, null)).toBeNull();
});

test("treats dates as calendar days, not local midnight", () => {
  // new Date("2026-07-01") is UTC midnight, which is June 30 west of UTC.
  expect(formatDateRange("2026-07-01", null)).toContain("Jul 1");
});
