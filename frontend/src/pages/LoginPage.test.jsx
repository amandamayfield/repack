import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import LoginPage from "./LoginPage";
import { AuthProvider } from "../auth/AuthProvider";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: vi.fn() }));

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/trips" element={<h1>Trips</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  api.mockReset();
  // Default: no session on mount so the form renders.
  api.mockRejectedValue(new Error("403"));
});

test("successful login authenticates and redirects to /trips", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/") return Promise.reject(new Error("403"));
    if (path === "/auth/login/") return Promise.resolve({ id: 1, username: "amanda" });
    return Promise.resolve(null);
  });

  renderLogin();
  await screen.findByRole("heading", { name: "Sign in" });

  await userEvent.type(screen.getByLabelText("Username"), "amanda");
  await userEvent.type(screen.getByLabelText("Password"), "pw12345!");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByRole("heading", { name: "Trips" })).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/auth/login/", {
    method: "POST",
    body: { username: "amanda", password: "pw12345!" },
  });
});

test("a 400 from login shows an inline error and stays on the form", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/") return Promise.reject(new Error("403"));
    if (path === "/auth/login/") return Promise.reject(new Error("400"));
    return Promise.resolve(null);
  });

  renderLogin();
  await screen.findByRole("heading", { name: "Sign in" });

  await userEvent.type(screen.getByLabelText("Username"), "amanda");
  await userEvent.type(screen.getByLabelText("Password"), "wrong");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Incorrect username or password.");
  // Still on the login form, submit re-enabled for retry.
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("toggling to register mode switches the heading and calls register", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/") return Promise.reject(new Error("403"));
    if (path === "/auth/register/") return Promise.resolve({ id: 2, username: "newbie" });
    if (path === "/auth/login/") return Promise.resolve({ id: 2, username: "newbie" });
    return Promise.resolve(null);
  });

  renderLogin();
  await screen.findByRole("heading", { name: "Sign in" });

  await userEvent.click(screen.getByRole("button", { name: "Create one" }));
  expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText("Username"), "newbie");
  await userEvent.type(screen.getByLabelText("Password"), "pw12345!");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/auth/register/", {
      method: "POST",
      body: { username: "newbie", password: "pw12345!" },
    }),
  );
});
