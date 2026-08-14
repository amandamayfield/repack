function getCookie(name) {
  return document.cookie
    .split("; ")
    .find((r) => r.startsWith(name + "="))
    ?.split("=")[1];
}

export async function api(path, { method = "GET", body } = {}) {
  // For writes, make sure we have a CSRF cookie first, then echo it in the header.
  if (method !== "GET")
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
  if (!res.ok) throw new Error(String(res.status));
  return res.status === 204 ? null : res.json();
}
