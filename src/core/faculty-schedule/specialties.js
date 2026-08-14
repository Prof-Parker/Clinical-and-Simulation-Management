/**
 * Faculty specialty tags for self-scheduling eligibility.
 */

var SPECIALTIES = [
  { code: 'MS', fullName: 'Medical-Surgical' },
  { code: 'ICU', fullName: 'Critical Care' },
  { code: 'OB', fullName: 'Obstetrics' },
  { code: 'PED', fullName: 'Pediatrics' },
  { code: 'MH', fullName: 'Mental Health' },
  { code: 'ER', fullName: 'Emergency' },
  { code: 'Lec', fullName: 'Lecture' }
];

var CODE_SET = {};
SPECIALTIES.forEach(function (s) {
  CODE_SET[s.code.toUpperCase()] = s.code;
});
// Accept site-library PEDS as synonym input → PED
CODE_SET.PEDS = 'PED';

function listSpecialties() {
  return SPECIALTIES.slice();
}

function specialtyFullName(code) {
  var normalized = normalizeSpecialty(code);
  if (!normalized) return '';
  for (var i = 0; i < SPECIALTIES.length; i++) {
    if (SPECIALTIES[i].code === normalized) return SPECIALTIES[i].fullName;
  }
  return normalized;
}

/**
 * Normalize one specialty code. Returns canonical code or '' if invalid.
 */
function normalizeSpecialty(raw) {
  var key = String(raw || '').trim().toUpperCase();
  if (!key) return '';
  // Lecture is stored as Lec (mixed case in design)
  if (key === 'LEC') return 'Lec';
  return CODE_SET[key] || '';
}

/**
 * Normalize an array of specialty tags; drop invalids and duplicates; stable order.
 */
function normalizeSpecialties(tags) {
  var seen = {};
  var out = [];
  (Array.isArray(tags) ? tags : []).forEach(function (t) {
    var code = normalizeSpecialty(t);
    if (!code || seen[code]) return;
    seen[code] = true;
    out.push(code);
  });
  out.sort(function (a, b) {
    var ia = SPECIALTIES.findIndex(function (s) { return s.code === a; });
    var ib = SPECIALTIES.findIndex(function (s) { return s.code === b; });
    return ia - ib;
  });
  return out;
}

/**
 * Site library uses PEDS; user specialties use PED.
 */
function matchesSiteTag(specialty, siteTag) {
  var spec = normalizeSpecialty(specialty);
  var site = String(siteTag || '').trim().toUpperCase();
  if (!spec || !site) return false;
  if (spec === 'PED' && (site === 'PED' || site === 'PEDS')) return true;
  return spec.toUpperCase() === site;
}

function userHasSpecialty(userSpecialties, required) {
  var need = normalizeSpecialty(required);
  if (!need) return true;
  var have = normalizeSpecialties(userSpecialties);
  return have.indexOf(need) >= 0;
}

function userMatchesAnySpecialty(userSpecialties, requiredList) {
  var required = normalizeSpecialties(requiredList);
  if (!required.length) return true;
  var have = normalizeSpecialties(userSpecialties);
  for (var i = 0; i < required.length; i++) {
    if (have.indexOf(required[i]) >= 0) return true;
  }
  return false;
}

/**
 * True when the user has every required specialty (empty required list matches).
 */
function userMatchesAllSpecialties(userSpecialties, requiredList) {
  var required = normalizeSpecialties(requiredList);
  if (!required.length) return true;
  var have = normalizeSpecialties(userSpecialties);
  for (var i = 0; i < required.length; i++) {
    if (have.indexOf(required[i]) < 0) return false;
  }
  return true;
}

/**
 * Full time faculty always receive the Lecture tag.
 */
function ensureLeadLectureTag(role, specialties) {
  var tags = normalizeSpecialties(specialties);
  if (role === 'lead_course_faculty' && tags.indexOf('Lec') < 0) {
    tags = normalizeSpecialties(tags.concat(['Lec']));
  }
  return tags;
}

export {
  SPECIALTIES,
  listSpecialties,
  specialtyFullName,
  normalizeSpecialty,
  normalizeSpecialties,
  matchesSiteTag,
  userHasSpecialty,
  userMatchesAnySpecialty,
  userMatchesAllSpecialties,
  ensureLeadLectureTag
};
