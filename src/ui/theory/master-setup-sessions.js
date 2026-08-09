/**
 * Lecture / skills lab session rows for Theory Master advanced setup.
 */

import * as ScheduleHours from '../../core/schedule-hours.js';
import { instructionalHoursFromTimes } from '../../core/contact-hours.js';

var WEEKDAY_OPTS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function weekdaySelectHtml(selected, idx, kind) {
  var opts = WEEKDAY_OPTS.map(function (d) {
    return '<option value="' + d + '"' + (d === selected ? ' selected' : '') + '>' + d + '</option>';
  }).join('');
  return '<select class="select-control" data-session-kind="' + kind + '" data-session-field="weekday" ' +
    'data-session-idx="' + idx + '" aria-label="' + (kind === 'skills' ? 'Skills lab' : 'Lecture') +
    ' weekday">' + opts + '</select>';
}

function normalizeSessions(list, fallbackStart, fallbackEnd) {
  var out = [];
  (list || []).forEach(function (s) {
    if (!s) return;
    var weekday = WEEKDAY_OPTS.indexOf(s.weekday) >= 0 ? s.weekday : 'Wed';
    out.push({
      weekday: weekday,
      start: ScheduleHours.normalizeHhmm(s.start, fallbackStart) || fallbackStart,
      end: ScheduleHours.normalizeHhmm(s.end, fallbackEnd) || fallbackEnd
    });
  });
  return out;
}

export function defaultLectureSessions() {
  return [
    { weekday: 'Wed', start: '0800', end: '1050' },
    { weekday: 'Thu', start: '0800', end: '1050' }
  ];
}

export function defaultSkillsSessions() {
  return [{ weekday: 'Fri', start: '1200', end: '1550' }];
}

/** Build lectureSessions / skillsSessions from legacy flat settings fields. */
export function migrateSessionsFromLegacy(settings) {
  settings = settings || {};
  if (!Array.isArray(settings.lectureSessions) || !settings.lectureSessions.length) {
    var wds = settings.lectureWeekdays && settings.lectureWeekdays.length
      ? settings.lectureWeekdays
      : ['Wed', 'Thu'];
    var ls = settings.defaultLectureStart || '0800';
    var le = settings.defaultLectureEnd || '1050';
    settings.lectureSessions = wds.map(function (wd) {
      return { weekday: wd, start: ls, end: le };
    });
  } else {
    settings.lectureSessions = normalizeSessions(
      settings.lectureSessions,
      settings.defaultLectureStart || '0800',
      settings.defaultLectureEnd || '1050'
    );
  }
  if (!Array.isArray(settings.skillsSessions) || !settings.skillsSessions.length) {
    settings.skillsSessions = [{
      weekday: 'Fri',
      start: settings.defaultSkillsStart || '1200',
      end: settings.defaultSkillsEnd || '1550'
    }];
  } else {
    settings.skillsSessions = normalizeSessions(
      settings.skillsSessions,
      settings.defaultSkillsStart || '1200',
      settings.defaultSkillsEnd || '1550'
    );
  }
  // Keep legacy fields in sync for older export paths.
  if (settings.lectureSessions.length) {
    settings.lectureWeekdays = settings.lectureSessions.map(function (s) { return s.weekday; });
    settings.defaultLectureStart = settings.lectureSessions[0].start;
    settings.defaultLectureEnd = settings.lectureSessions[0].end;
  }
  if (settings.skillsSessions.length) {
    settings.defaultSkillsStart = settings.skillsSessions[0].start;
    settings.defaultSkillsEnd = settings.skillsSessions[0].end;
  }
  return settings;
}

export function renderSessionList(containerId, sessions, kind) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var list = sessions && sessions.length
    ? sessions
    : (kind === 'skills' ? defaultSkillsSessions() : defaultLectureSessions());
  var fbStart = kind === 'skills' ? '1200' : '0800';
  var fbEnd = kind === 'skills' ? '1550' : '1050';
  var rows = list.map(function (s, i) {
    var start = s.start || fbStart;
    var end = s.end || fbEnd;
    var hours = instructionalHoursFromTimes(start, end);
    var hoursLabel = hours > 0 ? hours.toFixed(hours % 1 === 0 ? 1 : 2) + ' h' : '';
    var remove = list.length <= 1
      ? '<span class="text-muted section-sub">Min. 1</span>'
      : '<button type="button" class="btn btn-icon-remove remove-session-row" data-session-kind="' +
        kind + '" data-session-idx="' + i + '" aria-label="Remove ' +
        (kind === 'skills' ? 'skills lab' : 'lecture') + ' day" title="Remove">&times;</button>';
    return '<div class="config-list-row setup-facility-row setup-facility-row-times theory-session-row" ' +
      'data-session-kind="' + kind + '" data-session-idx="' + i + '">' +
      weekdaySelectHtml(s.weekday || 'Wed', i, kind) +
      '<label class="setup-facility-time">' +
      '<span class="setup-facility-time-label">Start</span>' +
      '<input type="time" data-session-kind="' + kind + '" data-session-field="start" ' +
      'data-session-idx="' + i + '" value="' + escAttr(ScheduleHours.hhmmToTimeInput(start)) + '" ' +
      'aria-label="' + (kind === 'skills' ? 'Skills' : 'Lecture') + ' start"></label>' +
      '<label class="setup-facility-time">' +
      '<span class="setup-facility-time-label">End</span>' +
      '<input type="time" data-session-kind="' + kind + '" data-session-field="end" ' +
      'data-session-idx="' + i + '" value="' + escAttr(ScheduleHours.hhmmToTimeInput(end)) + '" ' +
      'aria-label="' + (kind === 'skills' ? 'Skills' : 'Lecture') + ' end"></label>' +
      '<span class="section-sub setup-facility-hours">' + hoursLabel + '</span>' +
      remove +
      '</div>';
  }).join('');
  el.innerHTML = rows +
    '<div class="config-list-add-row">' +
    '<button type="button" class="btn btn-sm add-session-row" data-session-kind="' + kind + '">' +
    (kind === 'skills' ? 'Add skills lab day' : 'Add lecture day') +
    '</button></div>';
}

export function collectSessions(containerId, kind) {
  var el = document.getElementById(containerId);
  if (!el) return [];
  var fbStart = kind === 'skills' ? '1200' : '0800';
  var fbEnd = kind === 'skills' ? '1550' : '1050';
  var byIdx = {};
  el.querySelectorAll('[data-session-idx]').forEach(function (node) {
    if (node.getAttribute('data-session-kind') !== kind) return;
    var idx = parseInt(node.getAttribute('data-session-idx'), 10);
    if (isNaN(idx)) return;
    if (!byIdx[idx]) byIdx[idx] = { weekday: 'Wed', start: fbStart, end: fbEnd };
    var field = node.getAttribute('data-session-field');
    if (field === 'weekday') byIdx[idx].weekday = node.value || 'Wed';
    if (field === 'start') byIdx[idx].start = ScheduleHours.timeInputToHhmm(node.value, fbStart);
    if (field === 'end') byIdx[idx].end = ScheduleHours.timeInputToHhmm(node.value, fbEnd);
  });
  return Object.keys(byIdx).sort(function (a, b) {
    return parseInt(a, 10) - parseInt(b, 10);
  }).map(function (k) { return byIdx[k]; });
}

export function sessionForWeekday(settings, kind, weekday) {
  settings = settings || {};
  var list = kind === 'skills' ? settings.skillsSessions : settings.lectureSessions;
  var fbStart = kind === 'skills'
    ? (settings.defaultSkillsStart || '1200')
    : (settings.defaultLectureStart || '0800');
  var fbEnd = kind === 'skills'
    ? (settings.defaultSkillsEnd || '1550')
    : (settings.defaultLectureEnd || '1050');
  if (!list || !list.length) {
    return { start: fbStart, end: fbEnd };
  }
  var match = list.find(function (s) { return s.weekday === weekday; });
  if (match) return { start: match.start || fbStart, end: match.end || fbEnd };
  return { start: list[0].start || fbStart, end: list[0].end || fbEnd };
}
