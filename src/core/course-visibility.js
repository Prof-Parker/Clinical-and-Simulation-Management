/**
 * 3rd-semester course visibility (Theory Master) and practicum specialty mapping.
 */

import { normalizeSpecialties } from './faculty-schedule/specialties.js';
import { isPracticumTrackEvent } from './theory-events.js';

var CONTENT_TAGS = ['MS', 'OB', 'PEDS', 'MH'];

var THIRD_THEORY = ['REGN35', 'REGN36'];
var THIRD_ALL = ['REGN35', 'REGN36', 'REGN35P', 'REGN36P'];

export function isThirdSemester(courseId) {
  var id = String(courseId || '').toUpperCase().replace(/\s+/g, '');
  return id === 'REGN35P-36P' ||
    id === 'REGN35P' ||
    id === 'REGN36P' ||
    id === 'REGN35' ||
    id === 'REGN36';
}

export function thirdSemesterTheoryCodes() {
  return THIRD_THEORY.slice();
}

export function thirdSemesterCourseCodes() {
  return THIRD_ALL.slice();
}

/**
 * Theory Master visibility for the signed-in user on a 3rd-semester file.
 * Admin / program engineer → both; OB or PED → REGN36; else REGN35.
 */
export function theoryCodesForSession(session, semester) {
  var courseId = semester && semester.meta && semester.meta.courseId;
  if (!isThirdSemester(courseId)) {
    var codes = (semester && semester.theory && semester.theory.courseCodes) || [];
    var theoryOnly = codes.filter(function (c) {
      return /^REGN\d+$/i.test(c) && !/P$/i.test(c);
    });
    return theoryOnly.length ? theoryOnly : codes.slice(0, 1);
  }
  var role = session && session.role;
  if (role === 'admin_staff' || role === 'program_engineer') {
    return THIRD_THEORY.slice();
  }
  var specs = normalizeSpecialties((session && session.specialties) || []);
  if (specs.indexOf('OB') >= 0 || specs.indexOf('PED') >= 0) {
    return ['REGN36'];
  }
  return ['REGN35'];
}

export function normalizeContentTags(tags) {
  if (!Array.isArray(tags)) tags = [];
  var seen = {};
  var out = [];
  tags.forEach(function (t) {
    var tag = String(t || '').trim().toUpperCase();
    if (tag === 'PED') tag = 'PEDS';
    if (CONTENT_TAGS.indexOf(tag) < 0 || seen[tag]) return;
    seen[tag] = true;
    out.push(tag);
  });
  out.sort(function (a, b) {
    return CONTENT_TAGS.indexOf(a) - CONTENT_TAGS.indexOf(b);
  });
  return out;
}

/** OB or PEDS → REGN36P; otherwise REGN35P. */
export function practicumCourseForContentTags(tags) {
  var cleaned = normalizeContentTags(tags);
  if (cleaned.indexOf('OB') >= 0 || cleaned.indexOf('PEDS') >= 0) {
    return 'REGN36P';
  }
  return 'REGN35P';
}

export function defaultSimContentTags(simDaysRequired) {
  var n = parseInt(simDaysRequired, 10);
  if (isNaN(n) || n < 1) n = 5;
  var map = {};
  var splitAt = Math.ceil(n * 0.6);
  for (var i = 1; i <= n; i++) {
    map[String(i)] = i <= splitAt ? ['MS'] : ['OB', 'PEDS'];
  }
  return map;
}

export function normalizeSimContentTags(raw, simDaysRequired) {
  var n = parseInt(simDaysRequired, 10);
  if (isNaN(n) || n < 1) n = 5;
  var src = raw && typeof raw === 'object' ? raw : {};
  var out = {};
  for (var i = 1; i <= n; i++) {
    var key = String(i);
    var tags = normalizeContentTags(src[key] || src[i]);
    out[key] = tags.length ? tags : ['MS'];
  }
  return out;
}

export function simContentTags(semester, simNum) {
  var cfg = (semester && semester.config) || {};
  var map = normalizeSimContentTags(cfg.simContentTags, cfg.simDaysRequired);
  var key = String(simNum);
  return (map[key] || ['MS']).slice();
}

export function simPracticumCourse(semester, simNum) {
  return practicumCourseForContentTags(simContentTags(semester, simNum));
}

/**
 * Display badge for a theory/practicum calendar event on 3rd-semester files.
 */
export function eventCourseBadge(ev, semester) {
  if (!ev) return '';
  if (ev.track === 'holiday' || (ev.categories && ev.categories.indexOf('synced_holiday') >= 0)) {
    return '';
  }
  if (ev.courseCode) {
    return formatCourseBadge(ev.courseCode);
  }
  if (ev.track === 'simulation' || (ev.linkedSimNum != null)) {
    var simNum = ev.linkedSimNum != null ? ev.linkedSimNum : null;
    if (simNum != null) return formatCourseBadge(simPracticumCourse(semester, simNum));
  }
  if (isPracticumTrackEvent(ev)) {
    return '';
  }
  return '';
}

export function formatCourseBadge(code) {
  var c = String(code || '').toUpperCase().replace(/\s+/g, '');
  if (c === 'REGN35') return 'REGN 35';
  if (c === 'REGN36') return 'REGN 36';
  if (c === 'REGN35P') return 'REGN 35P';
  if (c === 'REGN36P') return 'REGN 36P';
  if (c === 'REGN35P-36P') return 'REGN 35P/36P';
  return code || '';
}

/**
 * Filter day events for a Theory Master section.
 * Holidays always included; theory-band events match courseCode;
 * practicum-band simulation events match via sim specialty → 35P/36P pairing.
 */
export function filterEventsForCourse(events, courseCode, semester) {
  var code = String(courseCode || '').toUpperCase();
  var theoryPair = code === 'REGN35' ? 'REGN35P' : (code === 'REGN36' ? 'REGN36P' : null);
  return (events || []).filter(function (ev) {
    if (!ev) return false;
    if (ev.track === 'holiday' || (ev.categories && ev.categories.indexOf('synced_holiday') >= 0)) {
      return true;
    }
    if (ev.courseCode) {
      var ec = String(ev.courseCode).toUpperCase();
      return ec === code || (theoryPair && ec === theoryPair);
    }
    if (isPracticumTrackEvent(ev)) {
      if (ev.track === 'simulation' && ev.linkedSimNum != null && theoryPair) {
        return simPracticumCourse(semester, ev.linkedSimNum) === theoryPair;
      }
      // Untagged practicum overlays (clinical from coordinator sync) appear in both.
      return true;
    }
    // Untagged theory events: show only on REGN35 section (legacy / default).
    return code === 'REGN35';
  });
}

export function CONTENT_TAG_OPTIONS() {
  return CONTENT_TAGS.slice();
}
