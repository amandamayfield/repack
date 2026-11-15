import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { api } from "./api/client";
import { ApiError } from "./api/ApiError";

vi.mock("./api/client", () => ({
  api: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

function renderAt(path) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  api.mockReset();
});

test("anonymous users hitting a protected route are redirected to login", async () => {
  api.mockRejectedValue(new ApiError(401));

  renderAt("/trips");

  expect(
    await screen.findByRole("heading", { name: "Sign in" }),
  ).toBeInTheDocument();
});

test("authenticated users land in the app, and the index redirects to /trips", async () => {
  api.mockResolvedValue({ id: 1, username: "amanda" });

  renderAt("/");

  expect(
    await screen.findByRole("heading", { name: "Trips" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("navigation", { name: "Primary" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
});

test("the nav links to Trips and Lists only", async () => {
  api.mockResolvedValue({ id: 1, username: "amanda" });

  renderAt("/trips");

  const nav = await screen.findByRole("navigation", { name: "Primary" });
  expect(
    within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent),
  ).toEqual(["Trips", "Lists"]);
});

test("/categories is no longer a page and redirects to trips", async () => {
  api.mockResolvedValue({ id: 1, username: "amanda" });

  renderAt("/categories");

  expect(
    await screen.findByRole("heading", { name: "Trips" }),
  ).toBeInTheDocument();
});
