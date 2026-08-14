/**
 * Mirror practicum clinical / simulation sessions onto the Theory Master Calendar.
 * Replaces only events tagged categories includes 'synced_practicum'.
 */

import { uid } from './data-model/students.js';
import { findFacilityById } from './data-model/facilities.js';
import {
  clinicalTimesForFacility,
  simTimesForNum
} from './schedule-hours.js';
import { WEEKDAYS, dateForWeekdayInWeek } from './theory-modules.js';
import {
  ensureDay,
  insertEventOnDay,
  makeFacultySlot
} from './theory-events.js';
import {
  practicumCourseCode,
  practicumSlotsForDay
} from './theory-coordinator.js';
import * as CourseVisibility from './course-visibility.js';

export var SYNCED_PRACTICUM_CATEGORY = 'synced_practicum';

function facilityLabel(semester, facilityId) {
  var f = findFacilityById(semester, facilityId);
  if (!f) return '';
  return f.shortName || f.name || '';
}

function clinicalFacultySlots(semester, group) {
  var f = (semester.faculty || []).find(function (x) {
    return x.clinicalGroup === group;
  });
  if (!f || !f.name) return [];
  return [makeFacultySlot({ name: f.name, role: 'clinical' })];
}

function baseSyncedEvent(track, title, opts) {
  opts = opts || {};
  return {
    id: uid(),
    track: track,
    title: title,
    description: opts.description || '',
    moduleCode: null,
    moduleRef: null,
    moduleRefs: [],
    timeStart: opts.timeStart || null,
    timeEnd: opts.timeEnd || null,
    allDay: false,
    faculty: opts.faculty || [],
    categories: [SYNCED_PRACTICUM_CATEGORY],
    contentArea: track,
    courseCode: opts.courseCode || null,
    groups: opts.groups || [],
    linkedSimNum: opts.linkedSimNum != null ? opts.linkedSimNum : null,
    facultyRequired: null
  };
}

function clearSyncedPracticum(theory) {
  (theory.days || []).forEach(function (day) {
    day.events = (day.events || []).filter(function (ev) {
      return !(ev.categories && ev.categories.indexOf(SYNCED_PRACTICUM_CATEGORY) >= 0);
    });
  });
}

/**
 * Write clinical + simulation chips from student schedules onto theory.days.
 * Skills labs and manual practicum events are left alone.
 */
export function syncPracticumFromSemester(semester) {
  if (!semester || !semester.theory) return semester;
  var theory = semester.theory;
  clearSyncedPracticum(theory);

  if (!semester.students || !semester.students.length) return semester;

  var courseCode = practicumCourseCode(theory);
  var isThird = CourseVisibility.isThirdSemester(semester.meta && semester.meta.courseId);

  for (var weekLabel = 1; weekLabel <= 18; weekLabel++) {
    WEEKDAYS.forEach(function (weekday) {
      var date = dateForWeekdayInWeek(semester, weekLabel - 1, weekday);
      if (!date) return;
      var slots = practicumSlotsForDay(semester, weekLabel, weekday, courseCode);
      if (!slots.clinicals.length && !slots.simulations.length) return;

      var day = ensureDay(theory, semester, date);

      slots.clinicals.forEach(function (c) {
        var times = clinicalTimesForFacility(semester, c.facilityId);
        var site = facilityLabel(semester, c.facilityId);
        var title = c.group + ' Clinical ' + c.clinicalNum;
        if (site) title += ' @ ' + site;
        insertEventOnDay(day, baseSyncedEvent('clinical', title, {
          timeStart: times.start,
          timeEnd: times.end,
          faculty: clinicalFacultySlots(semester, c.group),
          courseCode: courseCode,
          groups: [c.group],
          description: site || ''
        }));
      });

      slots.simulations.forEach(function (s) {
        var times = simTimesForNum(semester, s.simNum);
        var simCourse = isThird
          ? CourseVisibility.simPracticumCourse(semester, s.simNum)
          : courseCode;
        var title = s.group + ', Sim ' + s.simNum;
        insertEventOnDay(day, baseSyncedEvent('simulation', title, {
          timeStart: times.start,
          timeEnd: times.end,
          courseCode: simCourse,
          groups: [s.group],
          linkedSimNum: s.simNum
        }));
      });
    });
  }

  return semester;
}
