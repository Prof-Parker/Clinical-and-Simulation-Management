/**
 * Coordinator calendar projections and contact-hour validation.
 */

import { getClinicalDayForGroup } from './data-model/index.js';
import {
  resolveClinicalDayHours,
  resolveSimDayContactHours,
  rollPracticumHoursByWeek,
  rollPracticumHoursForCohort
} from './schedule-hours.js';
import { isLectureTopicEvent } from './theory-modules.js';
import {
  clockHoursFromTimes,
  instructionalHoursFromTimes
} from './contact-hours.js';

export function isTheoryCourseCode(courseCode) {
  if (!courseCode) return false;
  return /^REGN\d+$/i.test(courseCode) && !/P$/i.test(courseCode);
}

/** @deprecated Prefer instructionalHoursFromTimes for lecture/skills; clockHoursFromTimes for raw duration. */
export function hoursFromTimes(timeStart, timeEnd) {
  return clockHoursFromTimes(timeStart, timeEnd);
}

/** Lecture / skills / theory-event hours use Cont. Mult. instructional chart. */
export function eventContactHours(ev) {
  if (ev.contactHours != null && !isNaN(ev.contactHours)) return ev.contactHours;
  return instructionalHoursFromTimes(ev.timeStart, ev.timeEnd);
}

export function sumTheoryHoursForWeek(theory, weekLabel, category) {
  var lecture = 0;
  var skills = 0;
  var lectureSlots = {};
  (theory.days || []).forEach(function (day) {
    if (day.weekLabel !== weekLabel) return;
    (day.events || []).forEach(function (ev) {
      var h = eventContactHours(ev);
      if (isLectureTopicEvent(ev)) {
        // Multiple topics in one timeslot share one lecture block's hours.
        var slotKey = day.date + '|' + (ev.timeStart || '') + '|' + (ev.timeEnd || '');
        if (!lectureSlots[slotKey]) {
          lectureSlots[slotKey] = true;
          lecture += h;
        }
      }
      if (ev.track === 'skills' || (ev.categories && ev.categories.indexOf('skills_lab') >= 0)) {
        skills += h;
      }
    });
  });
  if (category === 'lecture') return Math.round(lecture * 100) / 100;
  if (category === 'skills_lab') return Math.round(skills * 100) / 100;
  return Math.round((lecture + skills) * 100) / 100;
}

export function practicumCourseCode(theory) {
  var codes = (theory && theory.courseCodes) || [];
  var match = codes.find(function (c) { return /P$/i.test(c); });
  return match || 'REGN15P';
}

var COORDINATOR_TRACK_LABELS = {
  theory: 'Lecture',
  skills: 'Skills lab',
  simulation: 'Simulation',
  clinical: 'Clinical'
};

export function coordinatorCompactLabel(track, timeStart, timeEnd) {
  var label = COORDINATOR_TRACK_LABELS[track] || track;
  if (timeStart && timeEnd) return label + ' ' + timeStart + '–' + timeEnd;
  return label;
}

/** Nth clinical day for a group through weekIndex (1-based), for coordinator labels. */
export function clinicalOrdinalForGroup(semester, clinicalGroup, throughWeekIndex) {
  var cfg = semester.config;
  var n = 0;
  for (var wi = 0; wi <= throughWeekIndex; wi++) {
    var has = (semester.students || []).some(function (s) {
      if (s.clinicalGroup !== clinicalGroup) return false;
      var cell = s.schedule && s.schedule[wi];
      return !!(cell && !cell.inactive && cell.clinical && !cell.clinicalMissed);
    });
    if (has) n++;
  }
  return n;
}

export function practicumSlotsForDay(semester, weekLabel, weekday, courseCode) {
  var wi = weekLabel - 1;
  var cfg = semester.config;
  var clinicalByGroup = {};
  var simByKey = {};
  (semester.students || []).forEach(function (student) {
    var cell = student.schedule && student.schedule[wi];
    if (!cell || cell.inactive) return;
    if (cell.clinical && !cell.clinicalMissed) {
      var clinDay = getClinicalDayForGroup(student.clinicalGroup, cfg);
      if (clinDay === weekday) {
        var cg = student.clinicalGroup || 'C?';
        if (!clinicalByGroup[cg]) {
          var facilityId = cell.facilityId || student.facilityId || null;
          clinicalByGroup[cg] = {
            group: cg,
            clinicalNum: clinicalOrdinalForGroup(semester, cg, wi),
            hours: resolveClinicalDayHours(semester, facilityId)
          };
        }
      }
    }
    if (cell.sim && cell.simDay === weekday) {
      var sg = cell.simGuestGroup || student.simGroup || 'SG?';
      var key = sg + '|' + cell.sim;
      if (!simByKey[key]) {
        simByKey[key] = {
          group: sg,
          simNum: cell.sim,
          hours: resolveSimDayContactHours(semester, cell.sim)
        };
      }
    }
  });
  return {
    clinicals: Object.keys(clinicalByGroup).sort().map(function (k) { return clinicalByGroup[k]; }),
    simulations: Object.keys(simByKey).sort().map(function (k) { return simByKey[k]; })
  };
}

export function coordinatorItemsForDay(theory, semester, weekLabel, weekday, courseCode) {
  var holidayItems = [];
  var theoryItems = [];
  var day = (theory.days || []).find(function (d) {
    return d.weekLabel === weekLabel && d.weekday === weekday;
  });
  if (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track === 'holiday') {
        holidayItems.push({
          kind: 'holiday',
          label: ev.title || 'Holiday'
        });
        return;
      }
      // Lecture / skills only — simulation comes from the practicum scheduler.
      if (['theory', 'skills'].indexOf(ev.track) < 0) return;
      theoryItems.push({
        kind: ev.track,
        label: coordinatorCompactLabel(ev.track, ev.timeStart, ev.timeEnd)
      });
    });
  }
  var items = holidayItems.concat(theoryItems);
  var practicum = practicumSlotsForDay(semester, weekLabel, weekday, courseCode);
  practicum.clinicals.forEach(function (c) {
    items.push({
      kind: 'clinical',
      label: c.group + ' Clinical ' + c.clinicalNum
    });
  });
  practicum.simulations.forEach(function (s) {
    items.push({
      kind: 'simulation',
      label: s.group + ', Sim ' + s.simNum
    });
  });
  return items;
}

export function weekSummaryForLabel(theory, semester, weekLabel, courseCode) {
  // Always live-sum from theory.days + practicum schedule. Ignore imported
  // theory.weekSummaries overrides so Coordinator totals match on-grid events.
  var lecture = sumTheoryHoursForWeek(theory, weekLabel, 'lecture');
  var skills_lab = sumTheoryHoursForWeek(theory, weekLabel, 'skills_lab');
  var sched = rollPracticumHoursByWeek(semester);
  var clinical = sched[weekLabel] ? sched[weekLabel].clinical : 0;
  var simulation = sched[weekLabel] ? sched[weekLabel].simulation : 0;
  return { lecture: lecture, skills_lab: skills_lab, clinical: clinical, simulation: simulation };
}

export function semesterHourTotals(theory, semester, courseCode) {
  var totals = { lecture: 0, skills_lab: 0, clinical: 0, simulation: 0 };
  var cohort = rollPracticumHoursForCohort(semester);
  for (var w = 1; w <= 18; w++) {
    var s = weekSummaryForLabel(theory, semester, w, courseCode);
    totals.lecture += s.lecture;
    totals.skills_lab += s.skills_lab;
    totals.clinical += cohort[w] ? cohort[w].clinical : 0;
    totals.simulation += cohort[w] ? cohort[w].simulation : 0;
  }
  totals.lecture = Math.round(totals.lecture * 100) / 100;
  totals.skills_lab = Math.round(totals.skills_lab * 100) / 100;
  totals.clinical = Math.round(totals.clinical * 100) / 100;
  totals.simulation = Math.round(totals.simulation * 100) / 100;
  totals.practicum = Math.round((totals.skills_lab + totals.clinical + totals.simulation) * 100) / 100;
  return totals;
}

export function semesterContactHourTotal(theory, semester, courseCode) {
  var t = semesterHourTotals(theory, semester, courseCode);
  // Theory courses count lecture only; practicum courses count skills + clinical + sim.
  if (isTheoryCourseCode(courseCode)) {
    return t.lecture;
  }
  return t.practicum;
}

export function contactHourTarget(theory, courseCode) {
  var targets = (theory.settings && theory.settings.courseHourTargets) || [];
  var row = targets.find(function (t) { return t.courseCode === courseCode; });
  return row ? row.contactHoursTarget : null;
}

export function contactHourValidation(theory, semester, courseCode) {
  var target = contactHourTarget(theory, courseCode);
  var scheduled = semesterContactHourTotal(theory, semester, courseCode);
  if (target == null) {
    return {
      courseCode: courseCode || null,
      scheduled: scheduled,
      target: null,
      delta: null,
      status: 'unknown'
    };
  }
  var delta = Math.round((scheduled - target) * 100) / 100;
  var tol = 0.5;
  var status = Math.abs(delta) <= tol ? 'on_target' : (delta < 0 ? 'under' : 'over');
  return {
    courseCode: courseCode || null,
    scheduled: scheduled,
    target: target,
    delta: delta,
    status: status
  };
}

/** Per-course (theory + practicum) contact-hour status for Coordinator header. */
export function contactHourValidations(theory, semester) {
  var codes = (theory && theory.courseCodes) || [];
  if (!codes.length) {
    return [contactHourValidation(theory, semester, practicumCourseCode(theory))];
  }
  return codes.map(function (code) {
    return contactHourValidation(theory, semester, code);
  });
}

export function listCourseOptions(fileRoot) {
  var options = [];
  if (!fileRoot || !fileRoot.semesters) return options;
  var sem = fileRoot.semesters.find(function (s) {
    return s.id === fileRoot.meta.activeSemesterId;
  }) || fileRoot.semesters[0];
  if (!sem || !sem.theory || !sem.theory.courseCodes) {
    if (sem && sem.meta && sem.meta.courseId) {
      options.push({ code: sem.meta.courseId, label: sem.meta.courseId, shell: 'clinical' });
    }
    return options;
  }
  sem.theory.courseCodes.forEach(function (code) {
    options.push({
      code: code,
      label: code,
      shell: isTheoryCourseCode(code) ? 'theory' : 'clinical'
    });
  });
  return options;
}

export function simCrossCheckWarnings(semester) {
  var warnings = [];
  if (!semester || !semester.theory || !semester.theory.days) return warnings;
  semester.theory.days.forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track !== 'simulation' || !ev.linkedSimNum) return;
      var wi = day.weekIndex;
      var hasSim = (semester.students || []).some(function (s) {
        return s.schedule && s.schedule[wi] && s.schedule[wi].sim === ev.linkedSimNum;
      });
      if (!hasSim) {
        warnings.push('Week ' + (day.weekLabel || wi + 1) + ': theory marks sim ' +
          ev.linkedSimNum + ' but scheduler has no matching placement.');
      }
    });
  });
  return warnings;
}
