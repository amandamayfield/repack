// Dates arrive as "YYYY-MM-DD". Parse them as calendar dates in UTC so a trip
// starting July 1 never shows as June 30 in a timezone west of UTC.
const fmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function parse(iso) {
  return iso ? new Date(`${iso}T00:00:00Z`) : null;
}

// "Jul 1 – 3, 2026", "Jul 1, 2026", or null when the trip has no dates.
export function formatDateRange(start, end) {
  const s = parse(start);
  const e = parse(end);
  if (s && e) return fmt.formatRange(s, e);
  if (s) return `From ${fmt.format(s)}`;
  if (e) return `Until ${fmt.format(e)}`;
  return null;
}
