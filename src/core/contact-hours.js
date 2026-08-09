/**
 * Instructional contact-hour math (Cont. Mult. chart) and credit→target formulas.
 */

/** Clock duration in minutes between HHMM strings. */
export function minutesBetween(timeStart, timeEnd) {
  if (!timeStart || !timeEnd) return 0;
  var sh = parseInt(String(timeStart).slice(0, 2), 10);
  var sm = parseInt(String(timeStart).slice(2, 4) || '0', 10);
  var eh = parseInt(String(timeEnd).slice(0, 2), 10);
  var em = parseInt(String(timeEnd).slice(2, 4) || '0', 10);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  return (eh * 60 + em) - (sh * 60 + sm);
}

/** Raw clock hours (end − start) / 60 — for clinical facility badges, not Cont. Mult. */
export function clockHoursFromTimes(timeStart, timeEnd) {
  var mins = minutesBetween(timeStart, timeEnd);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

/**
 * Cont. Mult. instructional hours from Audra's class calculation chart.
 * Plateaus: N*50–N*60 → N.0; between plateaus → N.5; under 50 min → mins/60.
 */
export function instructionalHoursFromMinutes(mins) {
  if (!mins || mins <= 0 || isNaN(mins)) return 0;
  if (mins < 50) return Math.round((mins / 60) * 100) / 100;
  for (var n = 1; n <= 10; n++) {
    if (mins >= n * 50 && mins <= n * 60) return n;
    if (mins > n * 60 && mins < (n + 1) * 50) return n + 0.5;
  }
  return Math.round((mins / 50) * 100) / 100;
}

/** Cont. Mult. hours from HHMM start/end. */
export function instructionalHoursFromTimes(timeStart, timeEnd) {
  return instructionalHoursFromMinutes(minutesBetween(timeStart, timeEnd));
}

export var DEFAULT_SEMESTER_WEEKS = 18;
export var PRACTICUM_CONTACT_MULTIPLIER = 3;

export function semesterWeekCount(data) {
  var n = data && data.calendar && Array.isArray(data.calendar.weeks)
    ? data.calendar.weeks.length
    : 0;
  return n >= 1 ? n : DEFAULT_SEMESTER_WEEKS;
}

/**
 * Contact hours target from credit hours.
 * Theory: credits × weeks. Practicum: credits × 3 × weeks.
 */
export function contactTargetFromCredits(creditHours, weeks, isPracticum) {
  var credits = parseFloat(creditHours);
  var w = parseInt(weeks, 10);
  if (isNaN(credits) || credits < 0) credits = 0;
  if (isNaN(w) || w < 1) w = DEFAULT_SEMESTER_WEEKS;
  var raw = isPracticum
    ? credits * PRACTICUM_CONTACT_MULTIPLIER * w
    : credits * w;
  return Math.round(raw * 100) / 100;
}

export function contactFormulaNote(creditHours, weeks, isPracticum) {
  var credits = parseFloat(creditHours);
  var w = parseInt(weeks, 10);
  if (isNaN(credits)) credits = 0;
  if (isNaN(w) || w < 1) w = DEFAULT_SEMESTER_WEEKS;
  if (isPracticum) {
    return credits + ' credits × ' + PRACTICUM_CONTACT_MULTIPLIER + ' × ' + w + ' weeks';
  }
  return credits + ' credits × ' + w + ' weeks';
}
