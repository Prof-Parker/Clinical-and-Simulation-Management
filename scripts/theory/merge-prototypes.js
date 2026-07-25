/**
 * Merge three prototype parses into canonical semester.theory.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { loadDocxText } from './parse-docx.js';
import { parseLectureAssignmentCells, lectureRowsToEvents } from './import-lecture-assignments.js';
import { parseCoordinatorWeekSummaries } from './import-coordinator.js';
import { parseDetailedMarkers, markersToEvents } from './import-detailed-calendar.js';
import { buildTopicLibrary, attachModuleRefs } from './build-topic-library.js';
import { createEmptyTheory } from '../../src/core/theory-data.js';
import { rebuildWeeks, getWeekIndexForDate } from '../../src/core/calendar-engine.js';
import { uid } from '../../src/core/data-model/students.js';

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var PROTOTYPES = path.join(__dirname, '..', '..', 'docs', 'Design Docs', 'protypes');

var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayFromIso(iso) {
  var p = iso.split('-');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  return WEEKDAYS[d.getDay()];
}

export async function importTheoryFromPrototypes(options) {
  options = options || {};
  var lecturePath = options.lecturePath || path.join(PROTOTYPES, 'Lecture Assignments Fall 2026.docx');
  var coordPath = options.coordPath || path.join(PROTOTYPES, 'REGN 15-15P F26 Calendar_v1.docx');
  var detailedPath = options.detailedPath || path.join(PROTOTYPES, 'Detailed REGN15 15P Calendar Fall 2026 R4-27-26.docx');

  var lectureCells = await loadDocxText(lecturePath);
  var coordCells = await loadDocxText(coordPath);
  var detailedCells = await loadDocxText(detailedPath);

  var lectureRows = parseLectureAssignmentCells(lectureCells);
  var theory = createEmptyTheory(['REGN15', 'REGN15P']);
  var lectureWeekdays = theory.settings.lectureWeekdays;
  var eventsByDate = lectureRowsToEvents(lectureRows, lectureWeekdays);
  var weekSummaries = parseCoordinatorWeekSummaries(coordCells);
  var detailedMarkers = parseDetailedMarkers(detailedCells);

  var semesterStub = {
    calendar: { semesterStartDate: options.semesterStartDate || '2026-08-16', weeks: [] },
    holidays: [
      { date: '2026-09-07', label: 'Labor Day', type: 'holiday' },
      { date: '2026-11-26', label: 'Thanksgiving break', type: 'break', weekIndex: 14 }
    ]
  };
  rebuildWeeks(semesterStub);

  var daysMap = {};
  Object.keys(eventsByDate).forEach(function (date) {
    var weekIndex = getWeekIndexForDate(semesterStub, date);
    var weekLabel = weekIndex >= 0 ? weekIndex + 1 : 1;
    daysMap[date] = {
      date: date,
      weekIndex: weekIndex >= 0 ? weekIndex : 0,
      weekday: weekdayFromIso(date),
      weekLabel: weekLabel,
      isHoliday: false,
      isBreak: false,
      events: eventsByDate[date].map(function (ev) {
        ev.id = uid();
        ev.sourcePrototype = 'lecture_table';
        return ev;
      })
    };
  });

  detailedMarkers.slice(0, 40).forEach(function (m, idx) {
    var wi = m.type === 'holiday' && /Labor Day/i.test(m.title) ? 2
      : m.type === 'holiday' && /Thanksgiving/i.test(m.title) ? 15
      : Math.min(1 + Math.floor(idx / 3), 18);
    var week = semesterStub.calendar.weeks[wi - 1];
    if (!week) return;
    var date = week.startDate;
    if (!daysMap[date]) {
      daysMap[date] = {
        date: date,
        weekIndex: wi - 1,
        weekday: weekdayFromIso(date),
        weekLabel: wi,
        isHoliday: false,
        isBreak: false,
        events: []
      };
    }
    // Skip theory simulation markers — Coordinator pulls sims from the practicum scheduler.
    if (m.type === 'simulation') return;
    markersToEvents([m], date, wi).forEach(function (ev) {
      ev.id = uid();
      ev.sourcePrototype = 'detailed';
      var dup = daysMap[date].events.some(function (e) { return e.title === ev.title; });
      if (!dup) daysMap[date].events.push(ev);
    });
  });

  theory.days = Object.keys(daysMap).sort().map(function (d) { return daysMap[d]; });
  theory.weekSummaries = {};
  Object.keys(weekSummaries).forEach(function (wl) {
    theory.weekSummaries[wl] = weekSummaries[wl];
  });
  for (var w = 1; w <= 18; w++) {
    if (theory.weekSummaries[String(w)]) continue;
    var lec = 0;
    var skills = 0;
    theory.days.forEach(function (day) {
      if (day.weekLabel !== w) return;
      (day.events || []).forEach(function (ev) {
        var h = ((parseInt(ev.timeEnd || '0', 10) - parseInt(ev.timeStart || '0', 10)) / 100) || 0;
        if (ev.track === 'theory') lec += h > 0 ? h : 2.83;
        if (ev.track === 'skills') skills += h > 0 ? h : 3.5;
      });
    });
    if (lec || skills) {
      theory.weekSummaries[String(w)] = {
        lecture: Math.round(lec * 100) / 100,
        skills_lab: Math.round(skills * 100) / 100
      };
    }
  }

  var topics = buildTopicLibrary(lectureRows, eventsByDate);
  attachModuleRefs(theory.days, topics);

  var validation = {
    lectureRowCount: lectureRows.length,
    dayCount: theory.days.length,
    eventCount: theory.days.reduce(function (n, d) { return n + d.events.length; }, 0),
    weekSummaryCount: Object.keys(theory.weekSummaries).length,
    firstClass: lectureRows.find(function (r) { return r.week === 1 && r.weekday === 'Wed'; })
  };

  if (validation.lectureRowCount < 30) {
    throw new Error('Lecture import too few rows: ' + validation.lectureRowCount);
  }
  if (validation.eventCount < 50) {
    throw new Error('Theory event count too low: ' + validation.eventCount);
  }
  if (!validation.firstClass || validation.firstClass.date !== '2026-08-19') {
    throw new Error('Week 1 Wednesday should be 2026-08-19, got ' +
      (validation.firstClass ? validation.firstClass.date : 'none'));
  }

  return {
    theory: theory,
    library: {
      meta: { version: 1, courseId: 'REGN15', lastModified: new Date().toISOString() },
      topics: topics
    },
    validation: validation,
    lectureRows: lectureRows
  };
}
