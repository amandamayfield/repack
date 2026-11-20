import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import TripsPage from "./TripsPage";
import { AuthProvider } from "../auth/AuthProvider";
import { api } from "../api/client";
import { ApiError } from "../api/ApiError";

vi.mock("../api/client", () => ({
  api: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/trips"]}>
        <Routes>
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/:id" element={<h1>Trip page</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  api.mockReset();
});

async function fillDates(start = "2026-07-01", end = "2026-07-03") {
  await userEvent.type(screen.getByLabelText("Start date"), start);
  await userEvent.type(screen.getByLabelText("End date"), end);
}

test("renders a card per trip with server-provided progress counts", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/trips/")
      return Promise.resolve([
        {
          id: 7,
          name: "Beach",
          start_date: "2026-07-01",
          end_date: "2026-07-03",
          packed_count: 1,
          total_count: 2,
        },
      ]);
    return Promise.resolve(null);
  });

  renderPage();

  const bar = await screen.findByRole("progressbar", {
    name: "Beach packing progress",
  });
  expect(bar).toHaveAttribute("aria-valuenow", "1");
  expect(screen.getByText("1 / 2 packed")).toBeInTheDocument();
  expect(screen.getByText(/Jul 1\s*–\s*3, 2026/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Beach/ })).toHaveAttribute(
    "href",
    "/trips/7",
  );
});

test("shows an empty state when there are no trips", async () => {
  api.mockImplementation((path) => {
    if (path === "/auth/me/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/trips/") return Promise.resolve([]);
    return Promise.resolve(null);
  });

  renderPage();
  expect(await screen.findByText(/No trips yet/)).toBeInTheDocument();
});

// No trips yet; saved lists as given; creating a trip returns id 9.
function createMock(lists = []) {
  api.mockImplementation((path, opts) => {
    if (path === "/auth/me/")
      return Promise.resolve({ id: 1, username: "amanda" });
    if (path === "/trips/" && opts?.method === "POST")
      return Promise.resolve({ id: 9 });
    if (path === "/trips/") return Promise.resolve([]);
    if (path === "/saved-lists/") return Promise.resolve(lists);
    return Promise.resolve(null);
  });
}

test("creating a trip posts name + dates and opens it", async () => {
  createMock();
  renderPage();
  await screen.findByText(/No trips yet/);

  await userEvent.type(screen.getByLabelText("Trip name"), "Yosemite");
  await fillDates();
  await userEvent.click(screen.getByRole("button", { name: "Add trip" }));

  expect(
    await screen.findByRole("heading", { name: "Trip page" }),
  ).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/trips/", {
    method: "POST",
    body: {
      name: "Yosemite",
      start_date: "2026-07-01",
      end_date: "2026-07-03",
    },
  });
});

test("adding a trip without its dates says which are missing", async () => {
  createMock();
  renderPage();
  await screen.findByText(/No trips yet/);
  const add = screen.getByRole("button", { name: "Add trip" });

  await userEvent.type(screen.getByLabelText("Trip name"), "Yosemite");
  expect(screen.getByLabelText("Start date")).toBeRequired();
  expect(screen.getByLabelText("End date")).toBeRequired();
  expect(add).toBeEnabled();
  await userEvent.click(add);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Add a start date and an end date.",
  );

  await userEvent.type(screen.getByLabelText("Start date"), "2026-07-01");
  await userEvent.click(add);
  expect(screen.getByRole("alert")).toHaveTextContent("Add an end date.");

  expect(api).not.toHaveBeenCalledWith("/trips/", expect.anything());
});

test("saved lists ticked on the new trip form are added with it", async () => {
  createMock([
    { id: 98, name: "Beach" },
    { id: 97, name: "Hiking" },
  ]);
  renderPage();
  await screen.findByText(/No trips yet/);

  await userEvent.type(screen.getByLabelText("Trip name"), "Lisbon");
  await fillDates();
  await userEvent.click(
    await screen.findByRole("checkbox", { name: "Hiking" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Add trip" }));

  await screen.findByRole("heading", { name: "Trip page" });
  expect(api).toHaveBeenCalledWith("/trips/", {
    method: "POST",
    body: {
      name: "Lisbon",
      start_date: "2026-07-01",
      end_date: "2026-07-03",
      saved_lists: [97],
    },
  });
});

test("with no saved lists, the new trip form has no list picker", async () => {
  createMock([]);
  renderPage();
  await screen.findByText(/No trips yet/);

  expect(screen.queryByRole("group")).not.toBeInTheDocument();
});

test("a trip name you already use shows why and stays on the form", async () => {
  const message =
    'You already have a trip called "Lisbon". Trip names can\'t match, so pick another.';
  createMock();
  const created = api.getMockImplementation();
  api.mockImplementation((path, opts) =>
    path === "/trips/" && opts?.method === "POST"
      ? Promise.reject(new ApiError(400, { name: [message] }))
      : created(path, opts),
  );
  renderPage();
  await screen.findByText(/No trips yet/);

  await userEvent.type(screen.getByLabelText("Trip name"), "Lisbon");
  await fillDates();
  await userEvent.click(screen.getByRole("button", { name: "Add trip" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByLabelText("Trip name")).toHaveValue("Lisbon");
});
