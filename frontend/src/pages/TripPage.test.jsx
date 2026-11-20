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
  copy_name: "Copy of Yosemite",
  start_date: "2026-07-01",
  end_date: "2026-07-03",
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
  vi.useRealTimers();
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

// Camping has Tent ticked; Wedding's Suit is ticked too, so both sections have something to untick.
const PACKED_TRIP = {
  ...TRIP,
  sections: TRIP.sections.map((s) => ({
    ...s,
    items: s.items.map((i) => (i.name === "Suit" ? { ...i, packed: true } : i)),
  })),
};

test("untick all in a section asks first, then unticks only that section", async () => {
  baseMock({ trip: PACKED_TRIP });
  renderTrip();
  await loaded();

  await userEvent.click(
    screen.getByRole("button", { name: "Untick all in Camping" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: 'Untick everything in "Camping"?',
  });
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("checkbox", { name: /Tent/ })).toBeChecked();

  await userEvent.click(
    screen.getByRole("button", { name: "Untick all in Camping" }),
  );
  const again = await screen.findByRole("dialog", {
    name: 'Untick everything in "Camping"?',
  });
  await userEvent.click(
    within(again).getByRole("button", { name: "Untick all" }),
  );

  await waitFor(() =>
    expect(screen.getByRole("checkbox", { name: /Tent/ })).not.toBeChecked(),
  );
  expect(screen.getByRole("checkbox", { name: /Suit/ })).toBeChecked();
  expect(api).toHaveBeenCalledWith("/trips/5/untick-all/", {
    method: "POST",
    body: { section: 11 },
  });
});

test("start repacking unticks the whole trip", async () => {
  baseMock({ trip: PACKED_TRIP });
  renderTrip();
  await loaded();

  await userEvent.click(
    screen.getByRole("button", { name: "Start repacking" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Start repacking?",
  });
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Untick all" }),
  );

  await waitFor(() =>
    expect(
      screen.getByRole("progressbar", { name: "Yosemite packing progress" }),
    ).toHaveAttribute("aria-valuenow", "0"),
  );
  expect(api).toHaveBeenCalledWith("/trips/5/untick-all/", { method: "POST" });
});

test("a failed untick puts the ticks back and shows an error", async () => {
  baseMock({
    trip: PACKED_TRIP,
    handler: (path) =>
      path === "/trips/5/untick-all/"
        ? Promise.reject(new ApiError(500))
        : undefined,
  });
  renderTrip();
  await loaded();

  await userEvent.click(
    screen.getByRole("button", { name: "Start repacking" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Start repacking?",
  });
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Untick all" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't untick those items",
  );
  expect(screen.getByRole("checkbox", { name: /Tent/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Suit/ })).toBeChecked();
});

test("untick buttons only appear where something is packed", async () => {
  const nothingPacked = {
    ...TRIP,
    sections: TRIP.sections.map((s) => ({
      ...s,
      items: s.items.map((i) => ({ ...i, packed: false })),
    })),
  };
  baseMock({ trip: nothingPacked });
  renderTrip();
  await loaded();

  expect(
    screen.queryByRole("button", { name: "Start repacking" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /^Untick all in/ }),
  ).not.toBeInTheDocument();
});

// --- Adding sections ---

test("lists already on the trip are left out of the picker", async () => {
  baseMock();
  renderTrip();
  await loaded();

  const picker = await screen.findByRole("group", { name: "Saved lists" });
  await within(picker).findByRole("checkbox", { name: "Beach" });
  expect(
    within(picker).queryByRole("checkbox", { name: "Camping" }),
  ).not.toBeInTheDocument();
});

test("when every list is on the trip, the picker says so", async () => {
  baseMock({ lists: [{ id: 99, name: "Camping" }] });
  renderTrip();
  await loaded();

  expect(
    await screen.findByText("All your saved lists are on this trip."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("group", { name: "Saved lists" }),
  ).not.toBeInTheDocument();
});

test("adding several saved lists sends them in one request, in the order shown", async () => {
  baseMock({
    lists: [
      { id: 99, name: "Camping" },
      { id: 98, name: "Beach" },
      { id: 97, name: "Hiking" },
    ],
  });
  renderTrip();
  await loaded();

  await userEvent.click(
    await screen.findByRole("checkbox", { name: "Hiking" }),
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Beach" }));
  await userEvent.click(screen.getByRole("button", { name: "Add lists" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trips/5/add-lists/", {
      method: "POST",
      body: { saved_lists: [98, 97] },
    }),
  );
});

test("double-clicking Add lists sends one request", async () => {
  baseMock({
    handler: (path) =>
      path === "/trips/5/add-lists/"
        ? new Promise(() => {}) // still in flight
        : undefined,
  });
  renderTrip();
  await loaded();

  await userEvent.click(await screen.findByRole("checkbox", { name: "Beach" }));
  await userEvent.dblClick(screen.getByRole("button", { name: "Add lists" }));

  const posts = api.mock.calls.filter(
    ([path]) => path === "/trips/5/add-lists/",
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
    handler: (path) =>
      path === "/trips/5/add-lists/"
        ? Promise.reject(
            new ApiError(400, {
              saved_lists: ["Beach is already on this trip."],
            }),
          )
        : undefined,
  });
  renderTrip();
  await loaded();

  await userEvent.click(await screen.findByRole("checkbox", { name: "Beach" }));
  await userEvent.click(screen.getByRole("button", { name: "Add lists" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Beach is already on this trip.",
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

// --- Hide packed items ---

test("hiding packed items leaves only what's left, and counts keep the full totals", async () => {
  baseMock();
  renderTrip();
  await loaded();

  await userEvent.click(
    screen.getByRole("button", { name: "Hide packed items" }),
  );

  const camping = section("Camping");
  expect(
    within(camping).queryByRole("checkbox", { name: "Tent" }),
  ).not.toBeInTheDocument();
  expect(within(camping).getAllByRole("checkbox")).toHaveLength(2);
  expect(within(camping).getByText("1/3 packed")).toBeInTheDocument();
  expect(
    within(camping).getByText("1 packed item hidden."),
  ).toBeInTheDocument();
  // Nothing packed in Wedding, so no note there.
  expect(
    within(section("Wedding")).queryByText(/hidden/),
  ).not.toBeInTheDocument();

  await userEvent.click(
    screen.getByRole("button", { name: "Show packed items" }),
  );
  expect(within(section("Camping")).getAllByRole("checkbox")).toHaveLength(3);
  expect(screen.queryByText(/packed item hidden/)).not.toBeInTheDocument();
});

test("ticking an item while packed items are hidden hides it and moves focus to the note", async () => {
  baseMock();
  renderTrip();
  await loaded();
  await userEvent.click(
    screen.getByRole("button", { name: "Hide packed items" }),
  );

  await userEvent.click(screen.getByRole("checkbox", { name: /Socks/ }));

  const camping = section("Camping");
  expect(
    within(camping).queryByRole("checkbox", { name: /Socks/ }),
  ).not.toBeInTheDocument();
  const note = within(camping).getByText("2 packed items hidden.");
  expect(note).toHaveFocus();
  expect(within(camping).getByText("2/3 packed")).toBeInTheDocument();
});

test("a fully packed section says so when packed items are hidden", async () => {
  baseMock({ trip: PACKED_TRIP });
  renderTrip();
  await loaded();
  await userEvent.click(
    screen.getByRole("button", { name: "Hide packed items" }),
  );

  const wedding = section("Wedding");
  expect(within(wedding).queryByRole("checkbox")).not.toBeInTheDocument();
  expect(
    within(wedding).getByText("Everything here is packed."),
  ).toBeInTheDocument();
  expect(within(wedding).queryByText("No items yet.")).not.toBeInTheDocument();
});

test("hiding packed items is remembered for this trip", async () => {
  baseMock();
  const first = renderTrip();
  await loaded();
  await userEvent.click(
    screen.getByRole("button", { name: "Hide packed items" }),
  );
  first.unmount();

  renderTrip();
  await loaded();

  expect(
    screen.getByRole("button", { name: "Show packed items" }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("repack.hide-packed.5")).toBe("1");
});

test("an empty trip has no Hide packed items button", async () => {
  baseMock({ trip: { ...TRIP, sections: [] } });
  renderTrip();
  await loaded();

  expect(
    screen.queryByRole("button", { name: "Hide packed items" }),
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

test("a removed synced item is listed under its section and can be restored", async () => {
  const camping = {
    ...TRIP.sections[0],
    removed_items: [{ id: 7, name: "Floss" }],
  };
  const trip = { ...TRIP, sections: [camping, TRIP.sections[1]] };
  baseMock({ trip });
  renderTrip();
  await loaded();

  const removed = within(section("Camping")).getByRole("list", {
    name: "Removed from this trip",
  });
  expect(removed).toHaveTextContent("Floss");
  expect(screen.queryByRole("checkbox", { name: /Floss/ })).toBeNull();

  await userEvent.click(
    within(removed).getByRole("button", { name: "Restore Floss" }),
  );

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trip-items/7/restore/", {
      method: "POST",
    }),
  );
  await waitFor(() =>
    expect(
      api.mock.calls.filter(([path]) => path === "/trips/5/"),
    ).toHaveLength(2),
  );
});

test("a section with nothing removed has no removed list", async () => {
  baseMock();
  renderTrip();
  await loaded();

  expect(
    screen.queryByRole("list", { name: "Removed from this trip" }),
  ).toBeNull();
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
  const end = screen.getByLabelText("End date");
  expect(end).toHaveValue("2026-07-03");
  await userEvent.clear(end);
  await userEvent.type(end, "2026-07-09");
  await userEvent.click(screen.getByRole("button", { name: "Save trip" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trips/5/", {
      method: "PATCH",
      body: {
        name: "Yosemite Valley",
        start_date: "2026-07-01",
        end_date: "2026-07-09",
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

test("duplicate offers the same length from today, then opens the copy", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 29)); // the trip is Jul 1–3, so 3 days
  baseMock({
    handler: (path) =>
      path === "/trips/5/duplicate/"
        ? Promise.resolve({ id: 6, name: "Yosemite again" })
        : undefined,
  });
  renderTrip();
  await userEvent.click(
    await screen.findByRole("button", { name: "Duplicate trip" }),
  );

  const form = screen.getByRole("region", { name: "Duplicate this trip" });
  const name = within(form).getByLabelText("Trip name");
  expect(name).toHaveValue("Copy of Yosemite");
  await userEvent.clear(name);
  await userEvent.type(name, "Yosemite again");
  expect(within(form).getByLabelText("Start date")).toHaveValue("2026-11-29");
  expect(within(form).getByLabelText("End date")).toHaveValue("2026-12-01");
  await userEvent.click(
    within(form).getByRole("button", { name: "Make the copy" }),
  );

  await waitFor(() => expect(api).toHaveBeenCalledWith("/trips/6/"));
  expect(api).toHaveBeenCalledWith("/trips/5/duplicate/", {
    method: "POST",
    body: {
      name: "Yosemite again",
      start_date: "2026-11-29",
      end_date: "2026-12-01",
    },
  });
});

test("a name that's already taken shows why in the duplicate form", async () => {
  const message =
    'You already have a trip called "Yosemite". Trip names can\'t match, so pick another.';
  baseMock({
    handler: (path) =>
      path === "/trips/5/duplicate/"
        ? Promise.reject(new ApiError(400, { name: [message] }))
        : undefined,
  });
  renderTrip();
  await userEvent.click(
    await screen.findByRole("button", { name: "Duplicate trip" }),
  );

  const form = screen.getByRole("region", { name: "Duplicate this trip" });
  await userEvent.clear(within(form).getByLabelText("Trip name"));
  await userEvent.type(within(form).getByLabelText("Trip name"), "Yosemite");
  await userEvent.click(
    within(form).getByRole("button", { name: "Make the copy" }),
  );

  expect(await within(form).findByRole("alert")).toHaveTextContent(message);
});

test("cancelling duplicate makes no copy", async () => {
  baseMock();
  renderTrip();
  await userEvent.click(
    await screen.findByRole("button", { name: "Duplicate trip" }),
  );

  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(
    screen.queryByRole("region", { name: "Duplicate this trip" }),
  ).not.toBeInTheDocument();
  expect(api).not.toHaveBeenCalledWith(
    "/trips/5/duplicate/",
    expect.anything(),
  );
});

test("double-clicking Make the copy makes one copy", async () => {
  baseMock({
    handler: (path) =>
      path === "/trips/5/duplicate/"
        ? new Promise(() => {}) // still in flight
        : undefined,
  });
  renderTrip();
  await userEvent.click(
    await screen.findByRole("button", { name: "Duplicate trip" }),
  );

  await userEvent.dblClick(
    screen.getByRole("button", { name: "Make the copy" }),
  );

  const posts = api.mock.calls.filter(
    ([path]) => path === "/trips/5/duplicate/",
  );
  expect(posts).toHaveLength(1);
});
