import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import TripPage from "./TripPage";
import { AuthProvider } from "../auth/AuthProvider";
import { api } from "../api/client";
import { ApiError } from "../api/ApiError";

vi.mock("../api/client", () => ({
  api: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

const TRIP = {
  id: 5,
  name: "Yosemite",
  imported_lists: [],
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
    if (path === "/auth/me/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/categories/") return Promise.resolve(CATEGORIES);
    if (path === "/saved-lists/")
      return Promise.resolve([
        { id: 99, name: "Camping" },
        { id: 98, name: "Beach" },
      ]);
    if (path === "/trips/5/") return Promise.resolve(overrides.trip ?? TRIP);
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
afterEach(() => {
  vi.restoreAllMocks();
});

test("renders the hero progress and groups items by category name", async () => {
  baseMock();
  renderTrip();

  const hero = await screen.findByRole("progressbar", {
    name: "Yosemite packing progress",
  });
  expect(hero).toHaveAttribute("aria-valuenow", "1"); // 1 of 3 packed
  expect(hero).toHaveAttribute("aria-valuemax", "3");

  expect(screen.getByRole("heading", { name: /Clothes/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Gear/ })).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: /Uncategorized/ }),
  ).toBeInTheDocument();
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
        ? Promise.reject(new ApiError(500))
        : undefined,
  });
  renderTrip();
  await screen.findByRole("progressbar", { name: "Yosemite packing progress" });

  const socks = screen.getByRole("checkbox", { name: /Socks/ });
  await userEvent.click(socks);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not update that item",
  );
  // Reverted back to unchecked.
  await waitFor(() =>
    expect(screen.getByRole("checkbox", { name: /Socks/ })).not.toBeChecked(),
  );
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

  const importForm = screen
    .getByRole("heading", { name: "Import a saved list" })
    .closest("form");
  // The dropdown fills from a separate /saved-lists/ request; wait for it.
  await within(importForm).findAllByRole("option", { name: "Camping" });
  await userEvent.selectOptions(
    within(importForm).getByLabelText("Saved list"),
    "99",
  );
  await userEvent.click(
    within(importForm).getByRole("button", { name: "Import" }),
  );

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trips/5/import-list/", {
      method: "POST",
      body: { saved_list_id: 99 },
    }),
  );
});

test("choosing a list that was already imported shows a popup and doesn't re-import", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  baseMock({ trip: { ...TRIP, imported_lists: [99] } });
  renderTrip();
  await screen.findByRole("progressbar", { name: "Yosemite packing progress" });

  const importForm = screen
    .getByRole("heading", { name: "Import a saved list" })
    .closest("form");
  // The dropdown fills from a separate /saved-lists/ request; wait for it.
  await within(importForm).findAllByRole("option", { name: "Camping" });
  await userEvent.selectOptions(
    within(importForm).getByLabelText("Saved list"),
    "99",
  );
  await userEvent.click(
    within(importForm).getByRole("button", { name: "Import" }),
  );

  expect(alert).toHaveBeenCalledWith(
    '"Camping" has already been imported into this trip.',
  );
  expect(api).not.toHaveBeenCalledWith(
    "/trips/5/import-list/",
    expect.anything(),
  );
});

test("a 409 from the server (imported elsewhere) also shows the popup", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  baseMock({
    handler: (path, opts) =>
      path === "/trips/5/import-list/" && opts?.method === "POST"
        ? Promise.reject(new ApiError(409))
        : undefined,
  });
  renderTrip();
  await screen.findByRole("progressbar", { name: "Yosemite packing progress" });

  const importForm = screen
    .getByRole("heading", { name: "Import a saved list" })
    .closest("form");
  // The dropdown fills from a separate /saved-lists/ request; wait for it.
  await within(importForm).findAllByRole("option", { name: "Camping" });
  await userEvent.selectOptions(
    within(importForm).getByLabelText("Saved list"),
    "98",
  );
  await userEvent.click(
    within(importForm).getByRole("button", { name: "Import" }),
  );

  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith(
      '"Beach" has already been imported into this trip.',
    ),
  );
  expect(screen.queryByText(/Could not import/)).not.toBeInTheDocument();
});

test("adding an ad-hoc item can set its category", async () => {
  baseMock({
    handler: (path, opts) =>
      path === "/trip-items/" && opts?.method === "POST"
        ? Promise.resolve({ id: 9 })
        : undefined,
  });
  renderTrip();
  await screen.findByRole("progressbar", { name: "Yosemite packing progress" });

  await userEvent.type(
    screen.getByLabelText("Item name", { selector: "#trip-add-name" }),
    "Hat",
  );
  // Categories load in a separate request; wait for the option to exist.
  await screen.findAllByRole("option", { name: "Clothes" });
  await userEvent.selectOptions(
    screen.getByLabelText("Category (optional)", {
      selector: "#trip-add-category",
    }),
    "10",
  );
  await userEvent.click(screen.getByRole("button", { name: "Add item" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-items/", {
      method: "POST",
      body: { trip: 5, name: "Hat", quantity: null, category: 10 },
    }),
  );
});
