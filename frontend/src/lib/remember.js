// On/off view choices remembered per browser. Storage can be blocked (some
// private windows); the choice then still works, it just isn't remembered.
export function readFlag(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeFlag(key, on) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // Not remembered; see above.
  }
}
