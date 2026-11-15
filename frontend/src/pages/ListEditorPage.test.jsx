import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ListEditorPage from "./ListEditorPage";
import { AuthProvider } from "../auth/AuthProvider";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

const LIST = {
  id: 3,
  name: "Camping",
  description: "",
  items: [
    { id: 1, name: "Shirts", quantity: 4, order: 0 },
    { id: 2, name: "Sunscreen", quantity: null, order: 1 },
  ],
};

function renderEditor() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/lists/3"]}>
        <Routes>
          <Route path="/lists/:id" element={<ListEditorPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function baseMock(overrides = {}) {
  api.mockImplementation((path, opts) => {
    if (path === "/auth/me/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/saved-lists/3/") return Promise.resolve(LIST);
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

test("renders items as one flat list in order, with no categories or checkboxes", async () => {
  baseMock();
  renderEditor();

  await screen.findByRole("heading", { name: "Camping" });
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(rows.map((r) => r.textContent)).toEqual([
    expect.stringContaining("Shirts (4)"),
    expect.stringContaining("Sunscreen"),
  ]);
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
    "Camping",
    "Add an item",
  ]);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(api).not.toHaveBeenCalledWith("/categories/");
  // Templates have no packed state.
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

test("adding an item posts with saved_list (server assigns order), then refetches", async () => {
  baseMock({
    handler: (path, opts) =>
      path === "/saved-list-items/" && opts?.method === "POST"
        ? Promise.resolve({ id: 9 })
        : undefined,
  });
  renderEditor();
  await screen.findByRole("heading", { name: "Camping" });

  const addForm = screen
    .getByLabelText("Item name", { selector: "#add-name" })
    .closest("form");

  await userEvent.type(
    screen.getByLabelText("Item name", { selector: "#add-name" }),
    "Boots",
  );
  await userEvent.click(
    within(addForm).getByRole("button", { name: "Add item" }),
  );

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/saved-list-items/", {
      method: "POST",
      body: { saved_list: 3, name: "Boots", quantity: null },
    }),
  );
});

test("editing an item PATCHes its fields", async () => {
  baseMock({
    handler: (path, opts) =>
      path === "/saved-list-items/1/" && opts?.method === "PATCH"
        ? Promise.resolve({ id: 1 })
        : undefined,
  });
  renderEditor();
  await screen.findByRole("heading", { name: "Camping" });

  // Open the edit form on the "Shirts" row.
  const shirtsRow = screen.getByText("Shirts (4)").closest("li");
  await userEvent.click(
    within(shirtsRow).getByRole("button", { name: "Edit Shirts" }),
  );

  const qty = screen.getByLabelText("Quantity (optional)", {
    selector: "#edit-1-qty",
  });
  await userEvent.clear(qty);
  await userEvent.type(qty, "6");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/saved-list-items/1/", {
      method: "PATCH",
      body: { name: "Shirts", quantity: 6 },
    }),
  );
});

test("deleting an item (confirmed) issues a DELETE", async () => {
  baseMock({
    handler: (path, opts) =>
      path === "/saved-list-items/2/" && opts?.method === "DELETE"
        ? Promise.resolve(null)
        : undefined,
  });
  renderEditor();
  await screen.findByRole("heading", { name: "Camping" });

  const sunscreenRow = screen.getByText("Sunscreen").closest("li");
  await userEvent.click(
    within(sunscreenRow).getByRole("button", { name: "Delete Sunscreen" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: 'Delete "Sunscreen"?',
  });
  // Sync removes it from current trips, so the old "trips keep their copy" would be wrong.
  expect(dialog).toHaveTextContent(
    "It will also come off your current and upcoming trips. Past trips keep it.",
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/saved-list-items/2/", {
      method: "DELETE",
    }),
  );
});

test("editing the list's details PATCHes name and description", async () => {
  baseMock();
  renderEditor();
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit details" }),
  );

  const name = screen.getByLabelText("List name");
  await userEvent.clear(name);
  await userEvent.type(name, "Backpacking");
  await userEvent.type(
    screen.getByLabelText("Description (optional)"),
    "Multi-day",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save list" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/saved-lists/3/", {
      method: "PATCH",
      body: { name: "Backpacking", description: "Multi-day" },
    }),
  );
});
