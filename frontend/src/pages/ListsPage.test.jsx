import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ListsPage from "./ListsPage";
import { AuthProvider } from "../auth/AuthProvider";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: vi.fn() }));

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <ListsPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  api.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("lists the user's saved lists with links to each editor", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/") return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/saved-lists/") return Promise.resolve([{ id: 3, name: "Camping" }]);
    return Promise.resolve(null);
  });

  renderPage();
  const link = await screen.findByRole("link", { name: "Camping" });
  expect(link).toHaveAttribute("href", "/lists/3");
});

test("creating a list posts the name and refetches", async () => {
  const calls = [];
  api.mockImplementation((path, opts) => {
    calls.push([path, opts]);
    if (path === "/auth/me/") return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/saved-lists/" && opts?.method === "POST") return Promise.resolve({ id: 5 });
    if (path === "/saved-lists/") {
      const created = calls.some(([p, o]) => p === "/saved-lists/" && o?.method === "POST");
      return Promise.resolve(created ? [{ id: 5, name: "Ski" }] : []);
    }
    return Promise.resolve(null);
  });

  renderPage();
  await screen.findByText(/No saved lists yet/);

  await userEvent.type(screen.getByLabelText("List name"), "Ski");
  await userEvent.click(screen.getByRole("button", { name: "Add list" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/saved-lists/", {
      method: "POST",
      body: { name: "Ski" },
    }),
  );
  expect(await screen.findByRole("link", { name: "Ski" })).toBeInTheDocument();
});

test("deleting a list (confirmed) issues a DELETE", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  api.mockImplementation((path, opts) => {
    if (path === "/auth/me/") return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/saved-lists/3/" && opts?.method === "DELETE") return Promise.resolve(null);
    if (path === "/saved-lists/") return Promise.resolve([{ id: 3, name: "Camping" }]);
    return Promise.resolve(null);
  });

  renderPage();
  await screen.findByRole("link", { name: "Camping" });

  await userEvent.click(screen.getByRole("button", { name: "Delete" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/saved-lists/3/", { method: "DELETE" }),
  );
});
