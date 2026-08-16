import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { api } from "./api/client";

vi.mock("./api/client", () => ({ api: vi.fn() }));

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
  api.mockRejectedValue(new Error("403"));

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
  expect(
    screen.getByRole("button", { name: "Log out" }),
  ).toBeInTheDocument();
});
