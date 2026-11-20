// Dates arrive as "YYYY-MM-DD". Parse them as calendar dates in UTC so a trip
// starting July 1 never shows as June 30 in a timezone west of UTC.
const fmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function parse(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

// "Jul 1 – 3, 2026", or "Jul 1, 2026" for a one-day trip.
export function formatDateRange(start, end) {
  return fmt.formatRange(parse(start), parse(end));
}

function iso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// The same number of days as start–end, starting on the user's own today.
export function sameLengthFromToday(start, end, today = new Date()) {
  const from = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const length = parse(end) - parse(start);
  return { start_date: iso(from), end_date: iso(from + length) };
}
