import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import TripsPage from "./TripsPage";
import { AuthProvider } from "../auth/AuthProvider";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: vi.fn() }));

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <TripsPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  api.mockReset();
});

test("renders a card per trip with server-provided progress counts", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/") return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/trips/")
      return Promise.resolve([
        { id: 7, name: "Beach", packed_count: 1, total_count: 2 },
      ]);
    return Promise.resolve(null);
  });

  renderPage();

  const bar = await screen.findByRole("progressbar", { name: "Beach packing progress" });
  expect(bar).toHaveAttribute("aria-valuenow", "1");
  expect(screen.getByText("1 / 2 packed")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Beach/ })).toHaveAttribute("href", "/trips/7");
});

test("shows an empty state when there are no trips", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/") return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/trips/") return Promise.resolve([]);
    return Promise.resolve(null);
  });

  renderPage();
  expect(await screen.findByText(/No trips yet/)).toBeInTheDocument();
});

test("creating a trip posts name + days and refetches the list", async () => {
  const calls = [];
  api.mockImplementation((path, opts) => {
    calls.push([path, opts]);
    if (path === "/auth/me/") return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/trips/" && opts?.method === "POST") return Promise.resolve({ id: 9 });
    if (path === "/trips/") {
      // first GET empty, subsequent GET (after reload) shows the new trip
      const created = calls.some(([p, o]) => p === "/trips/" && o?.method === "POST");
      return Promise.resolve(
        created ? [{ id: 9, name: "Yosemite", packed_count: 0, total_count: 0 }] : [],
      );
    }
    return Promise.resolve(null);
  });

  renderPage();
  await screen.findByText(/No trips yet/);

  await userEvent.type(screen.getByLabelText("Trip name"), "Yosemite");
  await userEvent.type(screen.getByLabelText("Days (optional)"), "3");
  await userEvent.click(screen.getByRole("button", { name: "Add trip" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/trips/", {
      method: "POST",
      body: { name: "Yosemite", days: 3 },
    }),
  );
  expect(await screen.findByText("Yosemite")).toBeInTheDocument();
});
