import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ListEditorPage from "./ListEditorPage";
import { AuthProvider } from "../auth/AuthProvider";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: vi.fn() }));

const LIST = {
  id: 3,
  name: "Camping",
  description: "",
  items: [
    { id: 1, name: "Shirts", quantity: 4, category: 10, order: 0 },
    { id: 2, name: "Sunscreen", quantity: null, category: null, order: 1 },
  ],
};
const CATEGORIES = [{ id: 10, name: "Clothes" }];

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
    if (path === "/auth/me/") return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/categories/") return Promise.resolve(CATEGORIES);
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

test("renders items grouped by category with no packed checkboxes", async () => {
  baseMock();
  renderEditor();

  await screen.findByRole("heading", { name: "Camping" });
  expect(screen.getByRole("heading", { name: "Clothes" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Uncategorized" })).toBeInTheDocument();
  expect(screen.getByText("Shirts (4)")).toBeInTheDocument();
  // Templates have no packed state.
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

test("adding an item posts with saved_list + order, then refetches", async () => {
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

  await userEvent.type(screen.getByLabelText("Item name", { selector: "#add-name" }), "Boots");
  await userEvent.selectOptions(
    screen.getByLabelText("Category (optional)", { selector: "#add-category" }),
    "10",
  );
  await userEvent.click(within(addForm).getByRole("button", { name: "Add item" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/saved-list-items/", {
      method: "POST",
      body: { saved_list: 3, order: 2, name: "Boots", quantity: null, category: 10 },
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
  await userEvent.click(within(shirtsRow).getByRole("button", { name: "Edit" }));

  const qty = screen.getByLabelText("Quantity (optional)", { selector: "#edit-1-qty" });
  await userEvent.clear(qty);
  await userEvent.type(qty, "6");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/saved-list-items/1/", {
      method: "PATCH",
      body: { name: "Shirts", quantity: 6, category: 10 },
    }),
  );
});

test("deleting an item (confirmed) issues a DELETE", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  baseMock({
    handler: (path, opts) =>
      path === "/saved-list-items/2/" && opts?.method === "DELETE"
        ? Promise.resolve(null)
        : undefined,
  });
  renderEditor();
  await screen.findByRole("heading", { name: "Camping" });

  const sunscreenRow = screen.getByText("Sunscreen").closest("li");
  await userEvent.click(within(sunscreenRow).getByRole("button", { name: "Delete" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/saved-list-items/2/", { method: "DELETE" }),
  );
});
