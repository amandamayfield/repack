import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import CategoriesPage from "./CategoriesPage";
import { AuthProvider } from "../auth/AuthProvider";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

function renderPage(categories = [{ id: 10, name: "Clothes", order: 0 }]) {
  api.mockImplementation((path) => {
    if (path === "/auth/me/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/categories/") return Promise.resolve(categories);
    return Promise.resolve(null);
  });
  return render(
    <AuthProvider>
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  api.mockReset();
});

test("creates a category", async () => {
  renderPage([]);
  await screen.findByText(/No categories yet/);

  await userEvent.type(screen.getByLabelText("Category name"), "Toiletries");
  await userEvent.click(screen.getByRole("button", { name: "Add category" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/categories/", {
      method: "POST",
      body: { name: "Toiletries" },
    }),
  );
});

test("renames a category inline", async () => {
  renderPage();
  await userEvent.click(
    await screen.findByRole("button", { name: "Rename Clothes" }),
  );

  const input = screen.getByLabelText("Category name", {
    selector: "#edit-category-10-name",
  });
  await userEvent.clear(input);
  await userEvent.type(input, "Clothing");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/categories/10/", {
      method: "PATCH",
      body: { name: "Clothing" },
    }),
  );
});

test("deleting asks first and explains items become Uncategorized", async () => {
  renderPage();
  await userEvent.click(
    await screen.findByRole("button", { name: "Delete Clothes" }),
  );

  const dialog = await screen.findByRole("dialog", {
    name: 'Delete "Clothes"?',
  });
  expect(dialog).toHaveTextContent("move to Uncategorized");
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/categories/10/", { method: "DELETE" }),
  );
});
