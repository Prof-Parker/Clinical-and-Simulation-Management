/**
 * Merge hardcoded REGN 36/36P faculty-scheduling events into theory days.
 * Does not replace REGN 35/35P events.
 */

import { parseDate, toISO, addDays } from '../../src/core/calendar-dates.js';
import { buildWeekList, weekdayNameForDate } from '../../src/core/calendar-weeks.js';
import { makeFacultySlot } from '../../src/core/theory-events.js';

export var SITE_MMCR_OBPED = {
  id: 'fac_mmcr_obped',
  name: 'Mercy Medical Center Redding OB/PED',
  shortName: 'MMCR OB/PED',
  contentTags: ['OB', 'PEDS']
};

export var OP_PEDS_SIM_SERIES_KEY = 'regn36p-op-peds-sims-fall-2026';
export var OP_PEDS_SIM_SERIES_LABEL = 'OP Peds Sims';

export var REGN36_CLINICAL_ROTATIONS = [
  { group: 'C3', weekday: 'Wed', weeks: [2, 3, 4, 5, 6, 7, 8], orientWeek: 2 },
  { group: 'C4', weekday: 'Thu', weeks: [2, 3, 4, 5, 6, 7, 8], orientWeek: 2 },
  { group: 'C1', weekday: 'Wed', weeks: [9, 10, 11, 12, 13, 14, 16], orientWeek: 9 },
  { group: 'C2', weekday: 'Thu', weeks: [9, 10, 11, 12, 13, 14, 16], orientWeek: 9 }
];

export var REGN36_CLINICAL_MAKEUP = {
  week: 17,
  weekday: 'Wed',
  title: 'MERCY OB/PEDS Clinical Make up Day'
};

export var REGN36_OP_PEDS_SIM_SESSIONS = [
  { week: 2, simNum: 1, groups: ['C3'] },
  { week: 3, simNum: 1, groups: ['C4'] },
  { week: 4, simNum: 2, groups: ['C3'] },
  { week: 5, simNum: 2, groups: ['C4'] },
  { week: 6, simNum: 3, groups: ['C3'] },
  { week: 7, simNum: 3, groups: ['C4'] },
  { week: 10, simNum: 1, groups: ['C1'] },
  { week: 11, simNum: 1, groups: ['C2'] },
  { week: 12, simNum: 2, groups: ['C1'] },
  { week: 13, simNum: 2, groups: ['C2'] },
  { week: 14, simNum: 3, groups: ['C1'] },
  { week: 16, simNum: null, groups: ['C2'], title: 'OP Peds Simulation' }
];

export var REGN36_LECTURES = [
  { week: 1, title: 'Maternal-Child 36 Welcome and Introduction', contentTags: ['OB'] },
  { week: 2, title: 'Pediatric Nursing 36 Lecture', contentTags: ['PED'] },
  { week: 3, title: 'Maternal-Child 36 Lecture', contentTags: ['OB'] },
  { week: 4, title: 'Pediatric Nursing 36 Lecture', contentTags: ['PED'] },
  { week: 5, title: 'Maternal-Child 36 Lecture', contentTags: ['OB'] },
  { week: 6, title: 'Pediatric Nursing 36 Lecture', contentTags: ['PED'] },
  { week: 7, title: 'Maternal-Child 36 Lecture', contentTags: ['OB'] },
  { week: 8, title: 'Pediatric Nursing 36 Lecture', contentTags: ['PED'] },
  { week: 9, title: 'Maternal-Child 36 Lecture', contentTags: ['OB'] },
  { week: 10, title: 'Pediatric Nursing 36 Lecture', contentTags: ['PED'] },
  { week: 11, title: 'Maternal-Child 36 Lecture', contentTags: ['OB'] },
  { week: 12, title: 'Pediatric Nursing 36 Lecture', contentTags: ['PED'] },
  { week: 13, title: 'Maternal-Child 36 Lecture', contentTags: ['OB'] },
  { week: 14, title: 'Pediatric Nursing 36 Lecture', contentTags: ['PED'] },
  { week: 16, title: 'Maternal-Child 36 Lecture', contentTags: ['OB'] },
  { week: 17, title: 'Pediatric Nursing 36 Lecture', contentTags: ['PED'] }
];

function dateForWeekWeekday(startDate, weekLabel, weekday) {
  var weeks = buildWeekList(startDate);
  var week = weeks[weekLabel - 1];
  if (!week) return '';
  var start = parseDate(week.startDate);
  var end = parseDate(week.endDate);
  if (!start || !end) return '';
  var d = new Date(start.getTime());
  while (d <= end) {
    if (weekdayNameForDate(d) === weekday) return toISO(d);
    d = addDays(d, 1);
  }
  return '';
}

function weekIndexForDate(startDate, date) {
  var start = parseDate(startDate);
  var target = parseDate(date);
  if (!start || !target) return null;
  return Math.floor((target.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function baseEvent(partial) {
  return Object.assign({
    description: '',
    moduleCode: null,
    moduleRef: null,
    moduleRefs: [],
    allDay: false,
    contentArea: null,
    facultyRequired: null,
    facilityId: '',
    siteId: '',
    siteLabel: ''
  }, partial);
}

function clinicalEvent(opts) {
  return baseEvent({
    id: opts.id,
    track: 'clinical',
    title: opts.title,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    faculty: [makeFacultySlot({ needed: true, role: 'skills' })],
    categories: ['clinical'],
    courseCode: 'REGN36P',
    groups: opts.groups ? opts.groups.slice() : [],
    contentTags: ['OB', 'PED'],
    facilityId: SITE_MMCR_OBPED.id,
    siteId: SITE_MMCR_OBPED.id,
    siteLabel: SITE_MMCR_OBPED.shortName
  });
}

function simEvent(session) {
  var title = session.title || ('OP Peds Sim-' + session.simNum);
  return baseEvent({
    id: 'mock_regn36p_op_peds_sim_w' + session.week,
    track: 'simulation',
    title: title,
    timeStart: '0800',
    timeEnd: '1630',
    faculty: [makeFacultySlot({ needed: true, role: 'skills' })],
    categories: ['simulation'],
    courseCode: 'REGN36P',
    facultySeriesKey: OP_PEDS_SIM_SERIES_KEY,
    facultySeriesLabel: OP_PEDS_SIM_SERIES_LABEL,
    groups: session.groups.slice(),
    contentTags: ['PED']
  });
}

function lectureEvent(row) {
  return baseEvent({
    id: 'mock_regn36_lec_w' + row.week,
    track: 'theory',
    title: row.title,
    timeStart: '0800',
    timeEnd: '1115',
    faculty: [makeFacultySlot({ needed: true, role: 'lecturer' })],
    categories: ['lecture'],
    courseCode: 'REGN36',
    groups: [],
    contentTags: row.contentTags.slice()
  });
}

function pushEvent(byDate, startDate, date, weekday, event) {
  if (!date) return;
  var weekIndex = weekIndexForDate(startDate, date);
  var day = byDate[date] || {
    id: date,
    date: date,
    weekIndex: weekIndex,
    weekday: weekday,
    weekLabel: weekIndex == null ? null : weekIndex + 1,
    isHoliday: false,
    isBreak: false,
    events: []
  };
  day.events.push(event);
  byDate[date] = day;
}

export function buildRegn36Events(semesterStartDate) {
  var startDate = semesterStartDate || '2026-08-16';
  var events = [];

  REGN36_CLINICAL_ROTATIONS.forEach(function (rot) {
    rot.weeks.forEach(function (week) {
      var isOrient = week === rot.orientWeek;
      var date = dateForWeekWeekday(startDate, week, rot.weekday);
      events.push({
        date: date,
        weekday: rot.weekday,
        event: clinicalEvent({
          id: 'mock_regn36p_clin_' + rot.group.toLowerCase() + '_' + date,
          title: isOrient ? 'MERCY OB/PEDS Clinical Orientation' : 'MERCY OB/PEDS Clinical',
          timeStart: isOrient ? '0600' : '0630',
          timeEnd: isOrient ? '1600' : '1630',
          groups: [rot.group]
        })
      });
    });
  });

  var makeupDate = dateForWeekWeekday(startDate, REGN36_CLINICAL_MAKEUP.week, REGN36_CLINICAL_MAKEUP.weekday);
  events.push({
    date: makeupDate,
    weekday: REGN36_CLINICAL_MAKEUP.weekday,
    event: clinicalEvent({
      id: 'mock_regn36p_clin_makeup_' + makeupDate,
      title: REGN36_CLINICAL_MAKEUP.title,
      timeStart: '0630',
      timeEnd: '1630',
      groups: []
    })
  });

  REGN36_OP_PEDS_SIM_SESSIONS.forEach(function (session) {
    events.push({
      date: dateForWeekWeekday(startDate, session.week, 'Fri'),
      weekday: 'Fri',
      event: simEvent(session)
    });
  });

  REGN36_LECTURES.forEach(function (row) {
    events.push({
      date: dateForWeekWeekday(startDate, row.week, 'Tue'),
      weekday: 'Tue',
      event: lectureEvent(row)
    });
  });

  return events;
}

export function mergeRegn36SeededEvents(theory, semesterStartDate) {
  if (!theory || !Array.isArray(theory.days)) return theory;
  var byDate = {};

  theory.days.forEach(function (day) {
    if (day && day.date) byDate[day.date] = day;
  });

  buildRegn36Events(semesterStartDate).forEach(function (row) {
    pushEvent(byDate, semesterStartDate, row.date, row.weekday, row.event);
  });

  theory.days = Object.keys(byDate).sort().map(function (date) {
    return byDate[date];
  });
  return theory;
}
