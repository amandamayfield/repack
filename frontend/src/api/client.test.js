import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, setUnauthorizedHandler } from "./client";
import { ApiError } from "./ApiError";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      body === undefined
        ? Promise.reject(new Error("no body"))
        : Promise.resolve(body),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});
afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

test("writes skip the CSRF round-trip when the cookie already exists", async () => {
  document.cookie = "csrftoken=abc";
  fetch.mockResolvedValue(jsonResponse(201, { id: 1 }));

  await api("/trips/", { method: "POST", body: { name: "Beach" } });

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].headers["X-CSRFToken"]).toBe("abc");
});

test("writes fetch the CSRF cookie first when it's missing", async () => {
  fetch.mockResolvedValue(jsonResponse(201, { id: 1 }));

  await api("/trips/", { method: "POST", body: { name: "Beach" } });

  expect(fetch.mock.calls.map((c) => c[0])).toEqual([
    "/api/auth/csrf/",
    "/api/trips/",
  ]);
});

test("errors carry the status and DRF's field messages", async () => {
  fetch.mockResolvedValue(
    jsonResponse(400, { password: ["Too short.", "Too common."] }),
  );

  const err = await api("/auth/register/", { method: "POST", body: {} }).catch(
    (e) => e,
  );

  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(400);
  expect(err.messages()).toEqual(["Too short.", "Too common."]);
});

test("a 401 calls the unauthorized handler; a 403 does not", async () => {
  const onUnauthorized = vi.fn();
  setUnauthorizedHandler(onUnauthorized);

  fetch.mockResolvedValueOnce(jsonResponse(403, { detail: "CSRF Failed" }));
  await expect(api("/trips/")).rejects.toMatchObject({
    status: 403,
    message: "CSRF Failed",
  });
  expect(onUnauthorized).not.toHaveBeenCalled();

  fetch.mockResolvedValueOnce(jsonResponse(401, { detail: "Not logged in" }));
  await expect(api("/trips/")).rejects.toMatchObject({ status: 401 });
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});
