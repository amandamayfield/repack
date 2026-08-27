import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import TripPage from "./TripPage";
import { AuthProvider } from "../auth/AuthProvider";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: vi.fn() }));

const TRIP = {
  id: 5,
  name: "Yosemite",
  items: [
    { id: 1, name: "Socks", quantity: 3, category: 10, packed: false },
    { id: 2, name: "Tent", category: 20, packed: true },
    { id: 3, name: "Snacks", category: null, packed: false },
  ],
};
const CATEGORIES = [
  { id: 10, name: "Clothes" },
  { id: 20, name: "Gear" },
];

function renderTrip() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/trips/5"]}>
        <Routes>
          <Route path="/trips/:id" element={<TripPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// Baseline: session + trip + categories + saved lists.
function baseMock(overrides = {}) {
  api.mockImplementation((path, opts) => {
    if (path === "/auth/me/") return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/categories/") return Promise.resolve(CATEGORIES);
    if (path === "/saved-lists/") return Promise.resolve([{ id: 99, name: "Camping" }]);
    if (path === "/trips/5/") return Promise.resolve(TRIP);
    if (overrides.handler) {
      const r = overrides.handler(path, opts);
      if (r !== undefined) return r;
    }
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  api.mockReset();
});

test("renders the hero progress and groups items by category name", async () => {
  baseMock();
  renderTrip();

  const hero = await screen.findByRole("progressbar", { name: "Yosemite packing progress" });
  expect(hero).toHaveAttribute("aria-valuenow", "1"); // 1 of 3 packed
  expect(hero).toHaveAttribute("aria-valuemax", "3");

  expect(screen.getByRole("heading", { name: /Clothes/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Gear/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Uncategorized/ })).toBeInTheDocument();
  // quantity is shown alongside the name
  expect(screen.getByText("Socks (3)")).toBeInTheDocument();
});

test("checking an item optimistically updates the hero and PATCHes the server", async () => {
  baseMock();
  renderTrip();
  await screen.findByRole("progressbar", { name: "Yosemite packing progress" });

  const socks = screen.getByRole("checkbox", { name: /Socks/ });
  await userEvent.click(socks);

  // Hero recomputes immediately: now 2 of 3.
  await waitFor(() =>
    expect(
      screen.getByRole("progressbar", { name: "Yosemite packing progress" }),
    ).toHaveAttribute("aria-valuenow", "2"),
  );
  expect(api).toHaveBeenCalledWith("/trip-items/1/", {
    method: "PATCH",
    body: { packed: true },
  });
});

test("a failed toggle reverts the checkbox and shows an error", async () => {
  baseMock({
    handler: (path, opts) =>
      path === "/trip-items/1/" && opts?.method === "PATCH"
        ? Promise.reject(new Error("500"))
        : undefined,
  });
  renderTrip();
  await screen.findByRole("progressbar", { name: "Yosemite packing progress" });

  const socks = screen.getByRole("checkbox", { name: /Socks/ });
  await userEvent.click(socks);

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not update that item");
  // Reverted back to unchecked.
  await waitFor(() => expect(screen.getByRole("checkbox", { name: /Socks/ })).not.toBeChecked());
});

test("importing a saved list posts to /import-list/ with the chosen id", async () => {
  baseMock({
    handler: (path, opts) =>
      path === "/trips/5/import-list/" && opts?.method === "POST"
        ? Promise.resolve(null)
        : undefined,
  });
  renderTrip();
  await screen.findByRole("progressbar", { name: "Yosemite packing progress" });

  const importForm = screen.getByRole("heading", { name: "Import a saved list" }).closest("form");
  await userEvent.selectOptions(within(importForm).getByLabelText("Saved list"), "99");
  await userEvent.click(within(importForm).getByRole("button", { name: "Import" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trips/5/import-list/", {
      method: "POST",
      body: { saved_list_id: 99 },
    }),
  );
});
