// Local calendar date as YYYY-MM-DD (R1.2-16). NOT toISOString(), which is UTC
// and can show yesterday/tomorrow near midnight.
export function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// A calendar date is not a moment in time, so build it from parts in local
// time. new Date("2026-11-09") would be parsed as UTC and may shift a day.
export function formatCalendarDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}