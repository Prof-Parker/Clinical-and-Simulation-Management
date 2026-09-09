/**
 * EXAMPLE-style stacked day lines for Coordinator ADN calendar Excel export.
 * Pure builders — no ExcelJS / DOM.
 */

import { facilityInitials } from '../core/orientation.js';
import { findFacilityById } from '../core/data-model/facilities.js';
import {
  clinicalTimesForFacility,
  simTimesForNum,
  normalizeHhmm
} from '../core/schedule-hours.js';
import {
  orientationSlotsForDay,
  practicumSlotsForDay,
  practicumCourseCode
} from '../core/theory-coordinator.js';
import { listAllSlots } from '../core/faculty-schedule/slot-inventory.js';
import { formatCourseBadge } from '../core/course-visibility.js';
import { courseBand } from '../core/faculty-schedule/program-bands.js';
import { WEEKDAYS } from '../core/theory-modules.js';

export { WEEKDAYS };

/** Compact HHMM range matching ADN template (e.g. 0800-1050). */
export function formatClockRange(start, end) {
  var a = normalizeHhmm(start, '');
  var b = normalizeHhmm(end, '');
  if (!a || !b) return '';
  return a + '-' + b;
}

/** Clinical-style range with spaces (e.g. 0600 - 1830). */
export function formatClinicalClockRange(start, end) {
  var a = normalizeHhmm(start, '');
  var b = normalizeHhmm(end, '');
  if (!a || !b) return '';
  return a + ' - ' + b;
}

/** C1 → G1, SG3 → G3 for EXAMPLE-style group labels. */
export function displayGroupLabel(group) {
  var g = String(group || '').trim();
  var m = g.match(/^(?:C|SG|G)?(\d+)$/i);
  if (m) return 'G' + m[1];
  return g || 'G?';
}

export function coordinatorSheetName(theory) {
  var codes = (theory && theory.courseCodes) || [];
  if (!codes.length) return 'Coordinator Calendar';
  var first = formatCourseBadge(codes[0]) || String(codes[0]);
  var rest = codes.slice(1).map(function (c) {
    return (formatCourseBadge(c) || String(c)).replace(/^REGN\s+/i, '');
  });
  return [first].concat(rest).join(' ');
}

export function semesterBandLabel(semester) {
  var codes = (semester && semester.theory && semester.theory.courseCodes) || [];
  var code = codes[0] || (semester && semester.meta && semester.meta.courseId) || '';
  var band = courseBand(code);
  if (band.id === 1) return '1st';
  if (band.id === 2) return '2nd';
  if (band.id === 3) {
    var upper = String(code).toUpperCase().replace(/\s+/g, '');
    if (upper.indexOf('36') >= 0) return '3rd - 36P';
    return '3rd- 35P';
  }
  if (band.id === 4) return '4th';
  return band.label || '';
}

function siteLabel(semester, facilityId) {
  if (!facilityId) return '';
  var fac = findFacilityById(semester, facilityId);
  if (fac && fac.shortName) return String(fac.shortName).trim();
  return facilityInitials(semester, facilityId);
}

function resolveSlotName(slot, overlay) {
  if (!slot) return '';
  var overlayName = overlay && overlay[slot.slotId];
  if (overlayName != null && String(overlayName).trim()) {
    return String(overlayName).trim();
  }
  if (!slot.open && slot.assignedName) return String(slot.assignedName).trim();
  return '';
}

var SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var FULL_WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

/** Normalize Mon/Monday → Mon for faculty inventory matching. */
function shortWeekday(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  var lower = s.toLowerCase();
  for (var i = 0; i < FULL_WEEKDAYS.length; i++) {
    if (FULL_WEEKDAYS[i].toLowerCase() === lower || SHORT_WEEKDAYS[i].toLowerCase() === lower) {
      return SHORT_WEEKDAYS[i];
    }
  }
  return '';
}

function slotMatchesWeekday(slot, weekday) {
  var wd = shortWeekday(weekday);
  if (!wd) return false;
  if (shortWeekday(slot.weekday) === wd) return true;
  return (slot.instances || []).some(function (inst) {
    return shortWeekday(inst.weekday) === wd;
  });
}

function slotOnWeekLabel(slot, weekLabel) {
  var wi = weekLabel - 1;
  return (slot.instances || []).some(function (inst) {
    return inst.weekIndex === wi;
  });
}

/**
 * Open + assigned inventory slots relevant to a week/weekday, grouped for naming.
 * @returns {{ clinicalByGroup: Object, skills: Array, lecture: Array, sim: Array }}
 */
export function facultySlotsForDay(semester, weekLabel, weekday) {
  var clinicalByGroup = {};
  var skills = [];
  var lecture = [];
  var sim = [];
  listAllSlots(semester).forEach(function (slot) {
    if (!slotMatchesWeekday(slot, weekday)) return;
    if ((slot.instances || []).length && !slotOnWeekLabel(slot, weekLabel)) return;
    if (slot.kind === 'clinical') {
      var cg = slot.clinicalGroup || '';
      if (cg && !clinicalByGroup[cg]) clinicalByGroup[cg] = slot;
      return;
    }
    if (slot.kind === 'skills') {
      skills.push(slot);
      return;
    }
    if (slot.kind === 'lecture') {
      lecture.push(slot);
      return;
    }
    if (slot.kind === 'sim') {
      sim.push(slot);
    }
  });
  skills.sort(function (a, b) {
    return String(a.slotId).localeCompare(String(b.slotId));
  });
  lecture.sort(function (a, b) {
    return String(a.slotId).localeCompare(String(b.slotId));
  });
  return { clinicalByGroup: clinicalByGroup, skills: skills, lecture: lecture, sim: sim };
}

function lectureNames(facultyMap, overlay) {
  var names = [];
  (facultyMap.lecture || []).forEach(function (slot) {
    var n = resolveSlotName(slot, overlay);
    if (n) names.push(n);
  });
  return names;
}

function skillsNumberedNames(facultyMap, overlay) {
  var lines = [];
  (facultyMap.skills || []).forEach(function (slot, i) {
    var n = resolveSlotName(slot, overlay);
    if (n) lines.push((i + 1) + '. ' + n);
  });
  return lines;
}

function clinicalFacultyName(facultyMap, group, overlay) {
  var slot = facultyMap.clinicalByGroup && facultyMap.clinicalByGroup[group];
  return resolveSlotName(slot, overlay);
}

function simFacultyName(facultyMap, overlay) {
  var names = [];
  (facultyMap.sim || []).forEach(function (slot) {
    var n = resolveSlotName(slot, overlay);
    if (n) names.push(n);
  });
  return names[0] || '';
}

function pushStack(out, lines) {
  var cleaned = (lines || []).filter(function (l) {
    return l != null && String(l).trim() !== '';
  });
  if (!cleaned.length) return;
  if (out.length) out.push('');
  cleaned.forEach(function (l) {
    out.push(String(l));
  });
}

/**
 * Build EXAMPLE-style text lines for one coordinator day.
 * @param {object} overlay map of slotId → display name (export-only)
 * @returns {string[]}
 */
export function buildDayLines(theory, semester, weekLabel, weekday, overlay) {
  overlay = overlay || {};
  var lines = [];
  var courseCode = practicumCourseCode(theory);
  var facultyMap = facultySlotsForDay(semester, weekLabel, weekday);

  var day = (theory.days || []).find(function (d) {
    return d.weekLabel === weekLabel && d.weekday === weekday;
  });

  if (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track === 'holiday') {
        pushStack(lines, [ev.title || 'HOLIDAY']);
        return;
      }
      if (ev.track === 'theory') {
        var lecStack = ['Lecture'];
        var lecRange = formatClockRange(ev.timeStart, ev.timeEnd);
        if (lecRange) lecStack.push(lecRange);
        var lecNames = lectureNames(facultyMap, overlay);
        if (lecNames.length) lecStack.push(lecNames.join('/'));
        pushStack(lines, lecStack);
        return;
      }
      if (ev.track === 'skills') {
        var skStack = ['Clinical Classroom'];
        var skRange = formatClockRange(ev.timeStart, ev.timeEnd);
        if (skRange) skStack.push(skRange);
        skillsNumberedNames(facultyMap, overlay).forEach(function (row) {
          skStack.push(row);
        });
        pushStack(lines, skStack);
      }
    });
  }

  orientationSlotsForDay(semester, weekLabel, weekday).forEach(function (o) {
    var site = siteLabel(semester, o.facilityId) || 'Orientation';
    var stack = [site + ' Orientation'];
    var range = formatClockRange(o.timeStart, o.timeEnd);
    if (range) stack.push(range);
    stack.push(displayGroupLabel(o.group));
    pushStack(lines, stack);
  });

  var practicum = practicumSlotsForDay(semester, weekLabel, weekday, courseCode);
  practicum.clinicals.forEach(function (c) {
    var site = siteLabel(semester, c.facilityId) || 'Clinical';
    var times = clinicalTimesForFacility(semester, c.facilityId);
    var stack = [site + ' Clinical'];
    var range = formatClinicalClockRange(times.start, times.end);
    if (range) stack.push(range);
    var facName = clinicalFacultyName(facultyMap, c.group, overlay);
    var groupLine = displayGroupLabel(c.group);
    if (facName) groupLine += ' ' + facName;
    stack.push(groupLine);
    pushStack(lines, stack);
  });

  practicum.simulations.forEach(function (s) {
    var times = simTimesForNum(semester, s.simNum);
    var range = formatClockRange(times.start, times.end);
    var stack = ['Sim' + (range ? ' ' + range : '')];
    var facName = simFacultyName(facultyMap, overlay);
    var groupLine = displayGroupLabel(s.group);
    if (facName) groupLine += ' ' + facName;
    stack.push(groupLine);
    pushStack(lines, stack);
  });

  return lines;
}

function seatNumberFromSlotId(slotId) {
  var m = String(slotId || '').match(/:seat:(\d+)/);
  return m ? parseInt(m[1], 10) + 1 : null;
}

/**
 * Dialog-friendly descriptors for open Faculty Needed slots.
 * @returns {{ slotId: string, label: string, kind: string }[]}
 */
export function listExportFacultyFields(semester) {
  var byKey = {};
  listAllSlots(semester).forEach(function (slot) {
    if (!(slot.open && slot.openCount > 0)) return;
    var label;
    if (slot.kind === 'clinical') {
      label = (slot.clinicalGroup || 'Clinical') + ' faculty';
    } else if (slot.kind === 'skills') {
      var base = slot.seriesLabel || 'Skills lab';
      var seatNum = seatNumberFromSlotId(slot.slotId);
      label = seatNum != null ? base + ' ' + seatNum + ' faculty' : base + ' faculty';
    } else if (slot.kind === 'lecture') {
      label = 'Lecture faculty';
    } else if (slot.kind === 'sim') {
      label = 'Sim faculty';
    } else {
      label = (slot.seriesLabel || slot.kind || 'Faculty') + ' faculty';
    }
    byKey[slot.slotId] = {
      slotId: slot.slotId,
      label: label,
      kind: slot.kind || ''
    };
  });
  return Object.keys(byKey).map(function (k) {
    return byKey[k];
  }).sort(function (a, b) {
    var order = { clinical: 0, skills: 1, lecture: 2, sim: 3 };
    var d = (order[a.kind] != null ? order[a.kind] : 9) - (order[b.kind] != null ? order[b.kind] : 9);
    if (d !== 0) return d;
    return a.label.localeCompare(b.label);
  });
}
