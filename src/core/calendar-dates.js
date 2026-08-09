/**
 * Shared date parse / format helpers for the calendar stack.
 */

export function parseDate(iso) {
  if (!iso) return null;
  var p = String(iso).split('-');
  if (p.length < 3) return null;
  var y = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  var day = parseInt(p[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(day)) return null;
  var d = new Date(y, m - 1, day);
  if (isNaN(d.getTime())) return null;
  // Reject overflow dates like 2026-02-31 that Date quietly rolls forward.
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
  return d;
}

export function toISO(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export function addDays(d, n) {
  var r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}
