import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { api, setUnauthorizedHandler } from "./api/client";
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

// --- Being signed out ---

// Signed in as amanda; /saved-lists/ has nothing; login succeeds.
function signedInMock() {
  api.mockImplementation((path) => {
    if (path === "/auth/me/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/auth/login/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/saved-lists/") return Promise.resolve([]);
    return Promise.resolve(null);
  });
}

async function signIn() {
  await userEvent.type(screen.getByLabelText("Username"), "amanda");
  await userEvent.type(screen.getByLabelText("Password"), "pw12345!");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

test("a session that ends mid-use says so, and signing in returns to the same page", async () => {
  signedInMock();
  renderAt("/lists");
  await screen.findByRole("heading", { name: "Saved lists" });

  // The api client calls whatever handler AuthProvider registered on a 401.
  const onUnauthorized = setUnauthorizedHandler.mock.calls.at(-1)[0];
  act(() => onUnauthorized());

  await screen.findByRole("heading", { name: "Sign in" });
  expect(screen.getByRole("status")).toHaveTextContent("You were signed out");

  await signIn();

  expect(
    await screen.findByRole("heading", { name: "Saved lists" }),
  ).toBeInTheDocument();
});

test("opening a page while signed out returns to it after sign-in, with no notice", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/") return Promise.reject(new ApiError(401));
    if (path === "/auth/login/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/saved-lists/") return Promise.resolve([]);
    return Promise.resolve(null);
  });
  renderAt("/lists");
  await screen.findByRole("heading", { name: "Sign in" });
  expect(screen.queryByText(/You were signed out/)).not.toBeInTheDocument();

  await signIn();

  expect(
    await screen.findByRole("heading", { name: "Saved lists" }),
  ).toBeInTheDocument();
});

test("logging out and back in lands on trips, with no notice", async () => {
  signedInMock();
  renderAt("/lists");
  await screen.findByRole("heading", { name: "Saved lists" });

  await userEvent.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByRole("heading", { name: "Sign in" });
  expect(screen.queryByText(/You were signed out/)).not.toBeInTheDocument();

  await signIn();

  expect(
    await screen.findByRole("heading", { name: "Trips" }),
  ).toBeInTheDocument();
});
