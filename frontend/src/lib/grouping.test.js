import { expect, test } from "vitest";
import { computeProgress, groupByCategory, UNCATEGORIZED } from "./grouping";

test("computeProgress counts packed vs total, empty is 0/0", () => {
  expect(computeProgress([])).toEqual({ packed: 0, total: 0 });
  expect(
    computeProgress([{ packed: true }, { packed: false }, { packed: true }]),
  ).toEqual({ packed: 2, total: 3 });
});

test("groupByCategory resolves category ids to names", () => {
  const items = [
    { id: 1, name: "Socks", category: 10 },
    { id: 2, name: "Tent", category: 20 },
    { id: 3, name: "More socks", category: 10 },
  ];
  const categories = [
    { id: 10, name: "Clothes" },
    { id: 20, name: "Gear" },
  ];
  const groups = groupByCategory(items, categories);
  expect(groups.map((g) => g.name)).toEqual(["Clothes", "Gear"]);
  expect(groups[0].items).toHaveLength(2);
});

test("null category and unknown ids fall back to Uncategorized", () => {
  const items = [
    { id: 1, name: "Loose", category: null },
    { id: 2, name: "Ghost", category: 999 }, // id not in categories list
  ];
  const groups = groupByCategory(items, [{ id: 10, name: "Clothes" }]);
  expect(groups).toHaveLength(1);
  expect(groups[0].name).toBe(UNCATEGORIZED);
  expect(groups[0].items).toHaveLength(2);
});
