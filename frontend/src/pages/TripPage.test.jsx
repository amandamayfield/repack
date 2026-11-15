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
    "Couldn't update that item",
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

  const dialog = await screen.findByRole("dialog", {
    name: "Already imported",
  });
  expect(dialog).toHaveTextContent(
    '"Camping" has already been imported into this trip.',
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "OK" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api).not.toHaveBeenCalledWith(
    "/trips/5/import-list/",
    expect.anything(),
  );
});

test("a 409 from the server (imported elsewhere) also shows the popup", async () => {
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

  const dialog = await screen.findByRole("dialog", {
    name: "Already imported",
  });
  expect(dialog).toHaveTextContent(
    '"Beach" has already been imported into this trip.',
  );
  expect(screen.queryByText(/Couldn't import/)).not.toBeInTheDocument();
});

test("links back to all trips", async () => {
  baseMock();
  renderTrip();
  expect(
    await screen.findByRole("link", { name: "← All trips" }),
  ).toHaveAttribute("href", "/trips");
});

test("editing the trip PATCHes its name and dates", async () => {
  baseMock();
  renderTrip();
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit trip" }),
  );

  const name = screen.getByLabelText("Trip name");
  await userEvent.clear(name);
  await userEvent.type(name, "Yosemite Valley");
  await userEvent.type(
    screen.getByLabelText("Start date (optional)"),
    "2026-07-01",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save trip" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trips/5/", {
      method: "PATCH",
      body: {
        name: "Yosemite Valley",
        start_date: "2026-07-01",
        end_date: null,
      },
    }),
  );
});

test("deleting the trip asks first, then returns to the trips list", async () => {
  baseMock();
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/trips/5"]}>
        <Routes>
          <Route path="/trips/:id" element={<TripPage />} />
          <Route path="/trips" element={<h1>All trips</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Delete trip" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: 'Delete "Yosemite"?',
  });
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Delete trip" }),
  );

  expect(
    await screen.findByRole("heading", { name: "All trips" }),
  ).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/trips/5/", { method: "DELETE" });
});

test("trip items can be edited and deleted", async () => {
  baseMock();
  renderTrip();
  await screen.findByRole("progressbar", { name: "Yosemite packing progress" });

  await userEvent.click(screen.getByRole("button", { name: "Edit Tent" }));
  await userEvent.type(
    screen.getByLabelText("Quantity (optional)", { selector: "#edit-2-qty" }),
    "2",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-items/2/", {
      method: "PATCH",
      body: { name: "Tent", quantity: 2 },
    }),
  );

  await userEvent.click(screen.getByRole("button", { name: "Delete Snacks" }));
  const dialog = await screen.findByRole("dialog", {
    name: 'Delete "Snacks"?',
  });
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-items/3/", { method: "DELETE" }),
  );
});

test("a fully packed trip shows the All packed stamp", async () => {
  baseMock({
    trip: { ...TRIP, items: TRIP.items.map((i) => ({ ...i, packed: true })) },
  });
  renderTrip();
  const ring = await screen.findByRole("progressbar", {
    name: "Yosemite packing progress",
  });
  expect(ring).toHaveClass("progress-ring--complete");
  expect(ring).toHaveTextContent("All packed");
});

test("duplicate trip posts and opens the copy", async () => {
  baseMock({
    handler: (path) =>
      path === "/trips/5/duplicate/"
        ? Promise.resolve({ id: 6, name: "Copy of Yosemite" })
        : undefined,
  });
  renderTrip();
  await userEvent.click(
    await screen.findByRole("button", { name: "Duplicate trip" }),
  );

  expect(api).toHaveBeenCalledWith("/trips/5/duplicate/", { method: "POST" });
  // Navigated to the copy, which loads its own trip.
  await waitFor(() => expect(api).toHaveBeenCalledWith("/trips/6/"));
});

test("save as list asks for a name and links to the new list", async () => {
  baseMock({
    handler: (path) =>
      path === "/trips/5/save-as-list/"
        ? Promise.resolve({ id: 77, name: "Park kit" })
        : undefined,
  });
  renderTrip();
  await userEvent.click(
    await screen.findByRole("button", { name: "Save as list" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Save as a list" });
  const input = within(dialog).getByRole("textbox", { name: "List name" });
  expect(input).toHaveValue("Yosemite");
  await userEvent.clear(input);
  await userEvent.type(input, "Park kit");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Save list" }),
  );

  expect(api).toHaveBeenCalledWith("/trips/5/save-as-list/", {
    method: "POST",
    body: { name: "Park kit" },
  });
  expect(await screen.findByText(/Saved as a list/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Park kit" })).toHaveAttribute(
    "href",
    "/lists/77",
  );
});

test("cancelling save as list sends nothing", async () => {
  baseMock();
  renderTrip();
  await userEvent.click(
    await screen.findByRole("button", { name: "Save as list" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Save as a list" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(api).not.toHaveBeenCalledWith(
    "/trips/5/save-as-list/",
    expect.anything(),
  );
});
