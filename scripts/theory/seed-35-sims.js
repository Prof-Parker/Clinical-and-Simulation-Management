/**
 * Replace imported REGN 35P simulation events with the mock semester schedule.
 */

import { parseDate } from '../../src/core/calendar-dates.js';
import { makeFacultySlot } from '../../src/core/theory-events.js';

export var REGN35_SIM_SESSIONS = [
  { date: '2026-08-24', simNum: 1, groups: ['C1', 'C2'] },
  { date: '2026-08-31', simNum: 1, groups: ['C3', 'C4'] },
  { date: '2026-09-14', simNum: 2, groups: ['C1', 'C2'] },
  { date: '2026-09-21', simNum: 2, groups: ['C3', 'C4'] },
  { date: '2026-09-28', simNum: 3, groups: ['C1', 'C2'] },
  { date: '2026-10-05', simNum: 3, groups: ['C3', 'C4'] },
  { date: '2026-10-12', simNum: 4, groups: ['C1', 'C2'] },
  { date: '2026-10-19', simNum: 4, groups: ['C3', 'C4'] },
  { date: '2026-10-26', simNum: 5, groups: ['C1', 'C2'] },
  { date: '2026-11-02', simNum: 5, groups: ['C3', 'C4'] },
  { date: '2026-11-16', simNum: 6, groups: ['C1', 'C2'] },
  { date: '2026-11-30', simNum: 6, groups: ['C3', 'C4'] }
];

function weekIndexForDate(startDate, date) {
  var start = parseDate(startDate);
  var target = parseDate(date);
  if (!start || !target) return null;
  return Math.floor((target.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function simEvent(session) {
  return {
    id: 'mock_regn35p_sim_' + session.simNum + '_' + session.groups.join('_').toLowerCase(),
    track: 'simulation',
    title: 'Sim ' + session.simNum,
    description: '',
    moduleCode: null,
    moduleRef: null,
    moduleRefs: [],
    timeStart: '1445',
    timeEnd: '1700',
    allDay: false,
    faculty: [makeFacultySlot({ needed: true, role: 'skills' })],
    categories: ['simulation'],
    contentArea: null,
    courseCode: 'REGN35P',
    facultyRequired: null,
    facultySeriesKey: 'regn35p-sims-fall-2026',
    facultySeriesLabel: 'REGN 35P Sims 1–6',
    groups: session.groups.slice(),
    contentTags: ['MS'],
    facilityId: '',
    siteId: '',
    siteLabel: ''
  };
}

export function replaceRegn35SeededSims(theory, semesterStartDate) {
  if (!theory || !Array.isArray(theory.days)) return theory;
  var byDate = {};

  theory.days.forEach(function (day) {
    day.events = (day.events || []).filter(function (ev) {
      return ev.track !== 'simulation';
    });
    if (day.events.length && day.date) byDate[day.date] = day;
  });

  REGN35_SIM_SESSIONS.forEach(function (session) {
    var weekIndex = weekIndexForDate(semesterStartDate, session.date);
    var day = byDate[session.date] || {
      id: session.date,
      date: session.date,
      weekIndex: weekIndex,
      weekday: 'Mon',
      weekLabel: weekIndex == null ? null : weekIndex + 1,
      isHoliday: false,
      isBreak: false,
      events: []
    };
    day.events.push(simEvent(session));
    byDate[session.date] = day;
  });

  theory.days = Object.keys(byDate).sort().map(function (date) {
    return byDate[date];
  });
  return theory;
}
