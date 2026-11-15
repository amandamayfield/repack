import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./authContext";
import { api, setUnauthorizedHandler } from "../api/client";
import { ApiError } from "../api/ApiError";

vi.mock("../api/client", () => ({
  api: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

function Probe() {
  const { user, loading, register } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p>user:{user ? user.username : "none"}</p>
      <button onClick={() => register("amanda", "pw12345!")}>register</button>
    </div>
  );
}

beforeEach(() => {
  api.mockReset();
  setUnauthorizedHandler.mockReset();
});

test("register chains a login and sets the authenticated user", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/") return Promise.reject(new ApiError(401)); // anonymous on mount
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

test("a 401 from any request clears the session", async () => {
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

  // The api client calls whatever handler AuthProvider registered on a 401.
  const onUnauthorized = setUnauthorizedHandler.mock.calls.at(-1)[0];
  act(() => onUnauthorized());

  await waitFor(() =>
    expect(screen.getByText("user:none")).toBeInTheDocument(),
  );
});
