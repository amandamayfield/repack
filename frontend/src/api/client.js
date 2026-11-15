import { ApiError } from "./ApiError";

function getCookie(name) {
  return document.cookie
    .split("; ")
    .find((r) => r.startsWith(name + "="))
    ?.split("=")[1];
}

// Called on any 401, i.e. the session is gone. AuthProvider registers this so
// individual pages don't each have to notice an expired session.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

export async function api(path, { method = "GET", body } = {}) {
  // Writes need the CSRF cookie echoed as a header. Django sets it once (and
  // rotates it on login via Set-Cookie), so only fetch it when it's missing.
  if (method !== "GET" && !getCookie("csrftoken"))
    await fetch("/api/auth/csrf/", { credentials: "include" });
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include", // send the session + csrf cookies
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken") || "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    if (res.status === 401) unauthorizedHandler?.();
    throw new ApiError(res.status, errorBody);
  }
  return res.status === 204 ? null : res.json();
}
