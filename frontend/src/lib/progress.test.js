import { expect, test } from "vitest";
import { computeProgress } from "./progress";

test("computeProgress counts packed vs total, empty is 0/0", () => {
  expect(computeProgress([])).toEqual({ packed: 0, total: 0 });
  expect(
    computeProgress([{ packed: true }, { packed: false }, { packed: true }]),
  ).toEqual({ packed: 2, total: 3 });
});
