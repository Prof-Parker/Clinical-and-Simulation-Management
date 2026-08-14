/**
 * Classify skills-lab events as a recurring series vs a one-off named lab.
 * Recurring "Skills" / "Skills lab" share one faculty signup across dates.
 * Unique titles (Skills Fair, IV Lab, Sign Offs, Skims Final) stay separate.
 */

function normalizeEventTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim();
}

function stripCoursePrefix(title) {
  return normalizeEventTitle(title)
    .replace(/^(?:regn\s+)?\d+p?\s+/i, '')
    .trim();
}

function titleSlug(title) {
  return stripCoursePrefix(title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

/**
 * Generic repeating skills lab (e.g. "Skills lab", "35P Skills", "REGN 15P Skills Lab").
 */
function isGenericSkillsLabTitle(title) {
  var t = stripCoursePrefix(title);
  if (!t) return false;
  return /^(?:skills(?:\s+lab)?)$/i.test(t);
}

/**
 * Named one-off / nonstandard skills events that keep their own faculty signup.
 */
function isUniqueSkillsEventTitle(title) {
  var t = normalizeEventTitle(title);
  if (!t) return false;
  if (/skills\s+fair/i.test(t)) return true;
  if (/sign[\s-]*offs?/i.test(t)) return true;
  if (/\biv\s*lab\b/i.test(t)) return true;
  if (/\bskims\b/i.test(t)) return true;
  if (/open\s+practice/i.test(t)) return true;
  if (isGenericSkillsLabTitle(t)) return false;
  return true;
}

function skillsSeriesLabel(title, unique) {
  if (unique) {
    var label = stripCoursePrefix(title);
    return label || normalizeEventTitle(title);
  }
  return 'Skills Lab';
}

/**
 * Inventory grouping key for a skills event.
 * Recurring labs omit student groups and date so C1/C2 and C3/C4 Mondays share a series.
 * Unique labs include date + title so Fair / Skims / IV Lab stay separate chips.
 */
function skillsSeriesKey(opts) {
  opts = opts || {};
  var title = normalizeEventTitle(opts.title);
  var unique = isUniqueSkillsEventTitle(title);
  var start = opts.start || '';
  var end = opts.end || '';
  var course = opts.courseCode || '';
  var site = opts.siteKey || '';
  if (unique) {
    return ['skills', 'once', opts.date || '', titleSlug(title), start, end, course, site].join('|');
  }
  var wd = opts.weekday || '';
  return ['skills', 'recurring', wd, start, end, course, site].join('|');
}

export {
  normalizeEventTitle,
  stripCoursePrefix,
  titleSlug,
  isGenericSkillsLabTitle,
  isUniqueSkillsEventTitle,
  skillsSeriesLabel,
  skillsSeriesKey
};
