import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./authContext";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: vi.fn() }));

function Probe() {
  const { user, loading, register, handle403 } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p>user:{user ? user.username : "none"}</p>
      <button onClick={() => register("amanda", "pw12345!")}>
        register
      </button>
      <button onClick={() => handle403(new Error("403"))}>
        expire
      </button>
    </div>
  );
}

beforeEach(() => {
  api.mockReset();
});

test("register chains a login and sets the authenticated user", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/") return Promise.reject(new Error("403")); // anonymous on mount
    if (path === "/auth/register/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/auth/login/")
      return Promise.resolve({ id: 1, username: "amanda" });
    return Promise.resolve(null);
  });

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText("user:none");

  await userEvent.click(screen.getByText("register"));

  await waitFor(() =>
    expect(screen.getByText("user:amanda")).toBeInTheDocument(),
  );
  expect(api).toHaveBeenCalledWith("/auth/register/", {
    method: "POST",
    body: { username: "amanda", password: "pw12345!" },
  });
  expect(api).toHaveBeenCalledWith("/auth/login/", {
    method: "POST",
    body: { username: "amanda", password: "pw12345!" },
  });
});

test("handle403 clears an active session", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/")
      return Promise.resolve({ id: 1, username: "amanda" }); // existing session
    return Promise.resolve(null);
  });

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText("user:amanda");

  await userEvent.click(screen.getByText("expire"));

  await waitFor(() =>
    expect(screen.getByText("user:none")).toBeInTheDocument(),
  );
});
