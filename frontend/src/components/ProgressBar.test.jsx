import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import ProgressBar from "./ProgressBar";

test("reports the packed count via ARIA and fills proportionally", () => {
  render(<ProgressBar value={1} max={2} label="Beach packing progress" />);
  const bar = screen.getByRole("progressbar", { name: "Beach packing progress" });
  expect(bar).toHaveAttribute("aria-valuenow", "1");
  expect(bar).toHaveAttribute("aria-valuemax", "2");
  expect(bar.firstChild).toHaveStyle({ width: "50%" });
});

test("an empty set (max 0) reads as 0% rather than NaN", () => {
  render(<ProgressBar value={0} max={0} label="Empty trip" />);
  const bar = screen.getByRole("progressbar", { name: "Empty trip" });
  expect(bar).toHaveAttribute("aria-valuemax", "0");
  expect(bar.firstChild).toHaveStyle({ width: "0%" });
});
