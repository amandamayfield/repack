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

// "Camping" is synced to saved list 99 (Hat is a trip-only extra); "Wedding" is a trip-only heading.
const TRIP = {
  id: 5,
  name: "Yosemite",
  sections: [
    {
      id: 11,
      name: "Camping",
      saved_list: 99,
      is_synced: true,
      order: 0,
      items: [
        { id: 1, name: "Socks", quantity: 3, packed: false, is_synced: true },
        { id: 2, name: "Tent", quantity: null, packed: true, is_synced: true },
        { id: 4, name: "Hat", quantity: null, packed: false, is_synced: false },
      ],
    },
    {
      id: 12,
      name: "Wedding",
      saved_list: null,
      is_synced: false,
      order: 1,
      items: [
        {
          id: 3,
          name: "Suit",
          quantity: null,
          packed: false,
          is_synced: false,
        },
      ],
    },
  ],
};

function renderTrip() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/trips/5"]}>
        <Routes>
          <Route path="/trips/:id" element={<TripPage />} />
          <Route path="/trips" element={<h1>All trips</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// Baseline: session + trip + saved lists.
function baseMock(overrides = {}) {
  api.mockImplementation((path, opts) => {
    if (overrides.handler) {
      const r = overrides.handler(path, opts);
      if (r !== undefined) return r;
    }
    if (path === "/auth/me/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/saved-lists/")
      return Promise.resolve(
        overrides.lists ?? [
          { id: 99, name: "Camping" },
          { id: 98, name: "Beach" },
        ],
      );
    if (path === "/trips/5/") return Promise.resolve(overrides.trip ?? TRIP);
    return Promise.resolve(null);
  });
}

async function loaded() {
  return screen.findByRole("progressbar", {
    name: "Yosemite packing progress",
  });
}

function section(name) {
  return screen.getByRole("region", { name });
}

beforeEach(() => {
  api.mockReset();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("renders sections in order with their names, counts and items", async () => {
  baseMock();
  renderTrip();

  const hero = await loaded();
  expect(hero).toHaveAttribute("aria-valuenow", "1"); // 1 of 4 packed, across sections
  expect(hero).toHaveAttribute("aria-valuemax", "4");

  const regions = screen
    .getAllByRole("region")
    .filter((r) => r.classList.contains("trip-section"));
  expect(
    regions.map((r) => within(r).getAllByRole("heading")[0].textContent),
  ).toEqual(["Camping", "Wedding"]);
  expect(
    within(section("Camping")).getByText("1/3 packed"),
  ).toBeInTheDocument();
  expect(
    within(section("Wedding")).getByText("0/1 packed"),
  ).toBeInTheDocument();
  // The amount shows as ×N and is read out as "quantity N".
  expect(
    within(section("Camping")).getByRole("checkbox", {
      name: "Socks, quantity 3",
    }),
  ).toBeInTheDocument();
  expect(
    within(section("Wedding")).getByRole("checkbox", { name: "Suit" }),
  ).toBeInTheDocument();
});

test("the old import form, Save as list and categories are gone", async () => {
  baseMock();
  renderTrip();
  await loaded();

  expect(
    screen.queryByRole("button", { name: "Save as list" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Import" }),
  ).not.toBeInTheDocument();
  expect(api).not.toHaveBeenCalledWith("/categories/");
});

test("an empty trip says how to start", async () => {
  baseMock({ trip: { ...TRIP, sections: [] } });
  renderTrip();
  await loaded();

  expect(screen.getByText(/Nothing to pack yet/)).toBeInTheDocument();
});

test("checking an item optimistically updates the hero and PATCHes the server", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.click(screen.getByRole("checkbox", { name: /Socks/ }));

  await waitFor(() =>
    expect(
      screen.getByRole("progressbar", { name: "Yosemite packing progress" }),
    ).toHaveAttribute("aria-valuenow", "2"),
  );
  expect(
    within(section("Camping")).getByText("2/3 packed"),
  ).toBeInTheDocument();
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
  await loaded();

  await userEvent.click(screen.getByRole("checkbox", { name: /Socks/ }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't update that item",
  );
  await waitFor(() =>
    expect(screen.getByRole("checkbox", { name: /Socks/ })).not.toBeChecked(),
  );
});

// --- Adding sections ---

test("lists already on the trip are left out of the picker", async () => {
  baseMock();
  renderTrip();
  await loaded();

  const picker = screen.getByLabelText("Saved list");
  await within(picker).findByRole("option", { name: "Beach" });
  expect(
    within(picker).queryByRole("option", { name: "Camping" }),
  ).not.toBeInTheDocument();
});

test("when every list is on the trip, the picker says so", async () => {
  baseMock({ lists: [{ id: 99, name: "Camping" }] });
  renderTrip();
  await loaded();

  expect(
    await screen.findByText("All your saved lists are on this trip."),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Saved list")).not.toBeInTheDocument();
});

test("adding a saved list posts to /trip-sections/", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await screen.findAllByRole("option", { name: "Beach" });
  await userEvent.selectOptions(screen.getByLabelText("Saved list"), "98");
  await userEvent.click(screen.getByRole("button", { name: "Add list" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-sections/", {
      method: "POST",
      body: { trip: 5, saved_list: 98 },
    }),
  );
});

test("double-clicking Add list sends one request", async () => {
  baseMock({
    handler: (path, opts) =>
      path === "/trip-sections/" && opts?.method === "POST"
        ? new Promise(() => {}) // still in flight
        : undefined,
  });
  renderTrip();
  await loaded();

  await screen.findAllByRole("option", { name: "Beach" });
  await userEvent.selectOptions(screen.getByLabelText("Saved list"), "98");
  await userEvent.dblClick(screen.getByRole("button", { name: "Add list" }));

  const posts = api.mock.calls.filter(
    ([path, opts]) => path === "/trip-sections/" && opts?.method === "POST",
  );
  expect(posts).toHaveLength(1);
});

test("adding a trip-only heading posts its name", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.type(
    screen.getByLabelText("New heading, just for this trip"),
    "Hiking",
  );
  await userEvent.click(screen.getByRole("button", { name: "Add heading" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-sections/", {
      method: "POST",
      body: { trip: 5, name: "Hiking" },
    }),
  );
});

test("a failed add shows the server's message", async () => {
  baseMock({
    handler: (path, opts) =>
      path === "/trip-sections/" && opts?.method === "POST"
        ? Promise.reject(
            new ApiError(400, {
              saved_list: ["This list is already on this trip."],
            }),
          )
        : undefined,
  });
  renderTrip();
  await loaded();

  await screen.findAllByRole("option", { name: "Beach" });
  await userEvent.selectOptions(screen.getByLabelText("Saved list"), "98");
  await userEvent.click(screen.getByRole("button", { name: "Add list" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This list is already on this trip.",
  );
});

// --- Section controls ---

test("renaming a section uses the prompt and PATCHes its name", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.click(screen.getByRole("button", { name: "Rename Camping" }));
  const dialog = await screen.findByRole("dialog", { name: "Rename section" });
  expect(dialog).toHaveTextContent("Your saved list keeps its name.");
  const field = within(dialog).getByLabelText("Section name");
  await userEvent.clear(field);
  await userEvent.type(field, "Yosemite camping");
  await userEvent.click(within(dialog).getByRole("button", { name: "Rename" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-sections/11/", {
      method: "PATCH",
      body: { name: "Yosemite camping" },
    }),
  );
});

test("move up and move down reorder the sections", async () => {
  baseMock();
  renderTrip();
  await loaded();

  expect(
    screen.getByRole("button", { name: "Move Camping up" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Move Wedding down" }),
  ).toBeDisabled();

  await userEvent.click(
    screen.getByRole("button", { name: "Move Camping down" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trips/5/reorder-sections/", {
      method: "POST",
      body: { section_ids: [12, 11] },
    }),
  );

  api.mockClear();
  await userEvent.click(
    screen.getByRole("button", { name: "Move Wedding up" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trips/5/reorder-sections/", {
      method: "POST",
      body: { section_ids: [12, 11] },
    }),
  );
});

test("removing a section asks first, and says the saved list isn't affected", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.click(screen.getByRole("button", { name: "Remove Camping" }));
  const dialog = await screen.findByRole("dialog", {
    name: 'Remove "Camping" from this trip?',
  });
  expect(dialog).toHaveTextContent("Your saved list isn't affected");
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(api).not.toHaveBeenCalledWith("/trip-sections/11/", {
    method: "DELETE",
  });

  await userEvent.click(screen.getByRole("button", { name: "Remove Camping" }));
  const again = await screen.findByRole("dialog", {
    name: 'Remove "Camping" from this trip?',
  });
  await userEvent.click(
    within(again).getByRole("button", { name: "Remove section" }),
  );

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-sections/11/", {
      method: "DELETE",
    }),
  );
});

test("hiding a section leaves only its heading and count", async () => {
  baseMock();
  renderTrip();
  await loaded();

  const toggle = screen.getByRole("button", { name: "Hide Camping" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await userEvent.click(toggle);

  const camping = section("Camping");
  expect(within(camping).getByText("1/3 packed")).toBeInTheDocument();
  expect(within(camping).queryByRole("checkbox")).not.toBeInTheDocument();
  expect(
    within(camping).queryByRole("button", { name: "Rename Camping" }),
  ).not.toBeInTheDocument();
  expect(
    within(camping).queryByRole("button", { name: "Add item" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Show Camping" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  // Other sections stay open.
  expect(
    within(section("Wedding")).getByRole("checkbox", { name: "Suit" }),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Show Camping" }));
  expect(within(section("Camping")).getAllByRole("checkbox")).toHaveLength(3);
});

test("a hidden section stays hidden on the next visit", async () => {
  baseMock();
  const first = renderTrip();
  await loaded();
  await userEvent.click(screen.getByRole("button", { name: "Hide Camping" }));
  first.unmount();

  renderTrip();
  await loaded();

  expect(screen.getByRole("button", { name: "Show Camping" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(
    within(section("Camping")).queryByRole("checkbox"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Hide Wedding" }),
  ).toBeInTheDocument();
});

test("hiding still works when the browser blocks storage", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.click(screen.getByRole("button", { name: "Hide Camping" }));

  expect(
    within(section("Camping")).queryByRole("checkbox"),
  ).not.toBeInTheDocument();
});

// --- Items in sections ---

test("adding an item under a section posts to that section", async () => {
  baseMock();
  renderTrip();
  await loaded();

  const wedding = section("Wedding");
  await userEvent.type(within(wedding).getByLabelText("Item name"), "Tie");
  await userEvent.click(
    within(wedding).getByRole("button", { name: "Add item" }),
  );

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-items/", {
      method: "POST",
      body: { section: 12, name: "Tie", quantity: null },
    }),
  );
});

test("a synced item's edit form changes only its amount", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.click(screen.getByRole("button", { name: "Edit Socks" }));
  const row = screen
    .getByLabelText("Quantity (optional)", { selector: "#edit-1-qty" })
    .closest("li");
  expect(within(row).queryByLabelText("Item name")).not.toBeInTheDocument();
  expect(row).toHaveTextContent("Change the name on its saved list.");
  const qty = within(row).getByLabelText("Quantity (optional)");
  await userEvent.clear(qty);
  await userEvent.type(qty, "5");
  await userEvent.click(within(row).getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-items/1/", {
      method: "PATCH",
      body: { name: "Socks", quantity: 5 },
    }),
  );
});

test("an extra's edit form can change its name", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.click(screen.getByRole("button", { name: "Edit Hat" }));
  const name = screen.getByLabelText("Item name", { selector: "#edit-4-name" });
  await userEvent.clear(name);
  await userEvent.type(name, "Sun hat");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-items/4/", {
      method: "PATCH",
      body: { name: "Sun hat", quantity: null },
    }),
  );
});

test("deleting a synced item asks first, and says the list keeps it", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.click(screen.getByRole("button", { name: "Delete Socks" }));
  const dialog = await screen.findByRole("dialog", {
    name: 'Remove "Socks" from this trip?',
  });
  expect(dialog).toHaveTextContent("Your saved list keeps it");
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-items/1/", { method: "DELETE" }),
  );
});

test("deleting an extra asks first, and says it can't be undone", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.click(screen.getByRole("button", { name: "Delete Suit" }));
  const dialog = await screen.findByRole("dialog", { name: 'Delete "Suit"?' });
  expect(dialog).toHaveTextContent("can't be undone");
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-items/3/", { method: "DELETE" }),
  );
});

// --- The trip itself ---

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
  renderTrip();
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

test("a fully packed trip shows the All packed stamp", async () => {
  baseMock({
    trip: {
      ...TRIP,
      sections: TRIP.sections.map((s) => ({
        ...s,
        items: s.items.map((i) => ({ ...i, packed: true })),
      })),
    },
  });
  renderTrip();
  const ring = await loaded();
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
  await waitFor(() => expect(api).toHaveBeenCalledWith("/trips/6/"));
});
