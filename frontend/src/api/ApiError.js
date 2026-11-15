// Thrown by api() for any non-2xx response. `body` is the parsed JSON error
// from DRF when there is one (e.g. {detail: "..."} or {password: ["..."]}).
export class ApiError extends Error {
  constructor(status, body = null) {
    super(body?.detail ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  // Every message in a DRF error body, flattened: field errors, detail, etc.
  messages() {
    if (!this.body || typeof this.body !== "object") return [];
    return Object.values(this.body).flat().map(String);
  }
}

// What a form should show for a failed save: the server's validation messages
// for a 400 (e.g. "End date can't be before the start date."), else `fallback`.
export function errorMessage(err, fallback) {
  if (err?.status === 400) {
    const messages = err.messages?.() ?? [];
    if (messages.length > 0) return messages.join(" ");
  }
  return fallback;
}
