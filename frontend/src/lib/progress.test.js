import { expect, test } from "vitest";
import { computeProgress } from "./progress";

test("computeProgress counts packed vs total, empty is 0/0", () => {
  expect(computeProgress([])).toEqual({ packed: 0, total: 0 });
  expect(
    computeProgress([
      { name: "Hat", packed: true },
      { name: "Socks", packed: false },
      { name: "Tent", packed: true },
    ]),
  ).toEqual({ packed: 2, total: 3 });
});

test("an item in two places counts once, and as packed only when every copy is", () => {
  const copies = (second) => [
    { name: "Sunscreen", packed: true },
    { name: "sunscreen", packed: second },
    { name: "Towel", packed: false },
  ];
  expect(computeProgress(copies(true))).toEqual({ packed: 1, total: 2 });
  expect(computeProgress(copies(false))).toEqual({ packed: 0, total: 2 });
});
