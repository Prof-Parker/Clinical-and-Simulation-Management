/**
 * HTML builders for student Clinical & Sim Summary and Detailed Weekly calendars.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as DataModel from '../core/data-model/index.js';
import * as Orientation from '../core/orientation.js';
import * as ScheduleHours from '../core/schedule-hours.js';
import * as Validator from '../core/validator.js';
import * as TheoryData from '../core/theory-data.js';

var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function holidayLabelForWeek(week) {
  if (!week) return '';
  if (week.labels && week.labels.length) return week.labels.join(' / ');
  if (week.break) return 'Break';
  if (week.mondayHoliday || week.holiday || week.inactive) return 'Holiday / Break';
  return '';
}

function facilityLabel(data, facilityId) {
  var f = DataModel.findFacilityById(data, facilityId);
  if (!f) return '';
  return f.shortName || f.name || '';
}

function clinicalTimesLabel(data, student) {
  var times = ScheduleHours.clinicalTimesForFacility(data, student.facilityId);
  var site = facilityLabel(data, student.facilityId);
  var range = ScheduleHours.formatTimeRange(times.start, times.end);
  var hours = ScheduleHours.resolveClinicalDayHours(data, student.facilityId);
  return (site ? site + ' · ' : '') + range + ' (' + hours + ' h)';
}

function simTimesLabel(data) {
  ScheduleHours.ensureSimTimes(data.config);
  var range = ScheduleHours.formatTimeRange(data.config.simDefaultStart, data.config.simDefaultEnd);
  var hours = ScheduleHours.resolveSimDayHours(data, 1);
  var note = '';
  if ((data.config.simTimeOverrides || []).length) {
    note = ' · overrides for Sim ' +
      data.config.simTimeOverrides.map(function (o) { return o.simNum; }).join(', ');
  }
  return range + ' (' + hours + ' h default)' + note;
}

function introHtml(data, student, opts) {
  opts = opts || {};
  var vr = Validator.validateStudent(student, data);
  var cfg = data.config;
  var hours = ScheduleHours.studentHoursSummary(student, data);
  var title = opts.title || 'Clinical and Sim Summary';
  return '<div class="student-cal-intro">' +
    '<h2 class="student-cal-title">' + esc(student.name) + '</h2>' +
    '<p class="student-cal-subtitle">' + esc(title) + ' · ' +
    esc(data.meta && data.meta.semesterName ? data.meta.semesterName : '') + '</p>' +
    '<p class="section-sub">' +
    esc(student.clinicalGroup || '') + ' · ' + esc(student.section || 'No section') +
    ' · Sim ' + esc(student.simGroup || '') + '</p>' +
    '<ul class="student-cal-meta">' +
    '<li><strong>Clinical times:</strong> ' + esc(clinicalTimesLabel(data, student)) + '</li>' +
    '<li><strong>Simulation times:</strong> ' + esc(simTimesLabel(data)) + '</li>' +
    '<li><strong>Clinical:</strong> ' + vr.stats.clinicals + '/' + cfg.clinicalDaysRequired +
    ' days · ' + hours.clinicalHours + ' h</li>' +
    '<li><strong>Simulation:</strong> ' + vr.stats.sims + '/' + cfg.simDaysRequired +
    ' days · ' + hours.simHours + ' h</li>' +
    '<li><strong>Orientation:</strong> ' + hours.orientationHours + ' h</li>' +
    '</ul></div>';
}

function activityPartsForWeek(data, student, weekIndex, showMarkup) {
  var cell = student.schedule[weekIndex];
  var week = data.calendar.weeks[weekIndex];
  var parts = [];
  var rowCls = '';
  var orient = Orientation.getOrientationForWeek(data, student, weekIndex);
  if (orient) {
    ScheduleHours.ensureOrientationTimes(orient);
    var oLabel = Orientation.getOrientationLabel(data, student, weekIndex);
    var oRange = ScheduleHours.formatTimeRange(orient.timeStart, orient.timeEnd);
    parts.push(oLabel + (oRange ? ' ' + oRange : ''));
  }
  var hol = holidayLabelForWeek(week);
  if (cell && cell.inactive) {
    parts.push(hol || 'Holiday / Break');
    return { activity: parts.join(' · ') || 'Holiday / Break', rowCls: 'holiday-row' };
  }
  if (hol && !cell.inactive) {
    parts.push(hol);
  }
  if (!cell) return { activity: parts.join(' · ') || '—', rowCls: '' };
  if (cell.makeupClinical) {
    parts.push('Makeup Clinical');
    if (showMarkup) rowCls = 'markup-makeup';
  } else {
    if (cell.clinicalMissed && showMarkup) rowCls = 'markup-missed';
    if (cell.clinical || cell.clinicalMissed) {
      var facId = cell.facilityId || student.facilityId;
      var site = facilityLabel(data, facId);
      var cTimes = ScheduleHours.clinicalTimesForFacility(data, facId);
      parts.push(
        'Clinical (' + DataModel.getClinicalDayForGroup(student.clinicalGroup, data.config) + ')' +
        (site ? ' @ ' + site : '') +
        ' ' + ScheduleHours.formatTimeRange(cTimes.start, cTimes.end) +
        (cell.clinicalMissed ? ' [MISSED]' : '')
      );
    }
    if (cell.sim) {
      var sTimes = ScheduleHours.simTimesForNum(data, cell.sim);
      parts.push(
        'Simulation ' + cell.sim +
        (cell.simGuestGroup ? ' (guest ' + cell.simGuestGroup + ')' : '') +
        ' (' + (cell.simDay || 'Mon') + ') ' +
        ScheduleHours.formatTimeRange(sTimes.start, sTimes.end)
      );
    }
  }
  return { activity: parts.join(' · ') || '—', rowCls: rowCls };
}

function buildSummaryHtml(data, student, opts) {
  opts = opts || {};
  var showMarkup = !!opts.showMarkup;
  var html = '<div class="print-student-calendar student-calendar-page print-student-calendar-summary">' +
    introHtml(data, student, { title: 'Clinical and Sim Summary' }) +
    '<table class="data-table"><thead><tr><th>Week</th><th>Date</th><th>Activity</th></tr></thead><tbody>';
  for (var i = 0; i < 18; i++) {
    var week = data.calendar.weeks[i];
    var act = activityPartsForWeek(data, student, i, showMarkup);
    html += '<tr class="' + act.rowCls + '"><td>Week ' + (i + 1) + '</td><td>' +
      esc(week ? CalendarEngine.formatDisplayDate(week.startDate) : '') +
      '</td><td>' + esc(act.activity) + '</td></tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

function theoryEventsForDate(theory, date) {
  if (!theory || !theory.days || !date) return [];
  var day = theory.days.find(function (d) { return d.date === date; });
  return day && day.events ? day.events.slice() : [];
}

function dateForWeekday(weekStartIso, weekday) {
  var start = CalendarEngine.parseDate(weekStartIso);
  if (!start) return '';
  var target = WEEKDAYS.indexOf(weekday);
  if (target < 0) return '';
  var startDow = start.getDay();
  var delta = target - startDow;
  if (delta < 0) delta += 7;
  return CalendarEngine.toISO(CalendarEngine.addDays(start, delta));
}

/** Lecturers only — omit skills lab / sim / clinical faculty on student calendars. */
function lecturerNames(ev) {
  if (!ev || (ev.track !== 'theory' && ev.track !== 'exam')) return [];
  return (ev.faculty || []).map(TheoryData.facultyDisplayName).filter(Boolean);
}

function skillsTopicTitles(ev) {
  if (!ev || ev.track !== 'skills') return [];
  var titles = [];
  var seen = {};
  function add(title) {
    var t = String(title || '').trim();
    if (!t || seen[t.toLowerCase()]) return;
    seen[t.toLowerCase()] = true;
    titles.push(t);
  }
  if (ev.description) {
    String(ev.description).split(/[;|]/).forEach(function (part) { add(part); });
  }
  return titles;
}

function trackLabel(ev) {
  if (!ev) return '';
  if (ev.track === 'skills') return 'Skills lab';
  if (ev.track === 'assignment') return 'Assignment';
  if (ev.track === 'theory') return 'Lecture';
  if (ev.track === 'exam') return 'Exam';
  if (ev.track === 'simulation') return 'Simulation';
  if (ev.track === 'clinical') return 'Clinical';
  if (ev.track === 'orientation') return 'Orientation';
  if (ev.track === 'holiday') return 'Holiday';
  return ev.track || 'Event';
}

function renderStudentEventChip(ev) {
  var html = '<div class="student-cal-chip student-cal-chip-' + esc(ev.track || 'other') + '">' +
    '<strong>' + esc(ev.title || trackLabel(ev)) + '</strong>';
  if (ev.timeStart && ev.timeEnd) {
    html += '<div class="student-cal-chip-time">' +
      esc(ScheduleHours.formatTimeRange(ev.timeStart, ev.timeEnd)) + '</div>';
  } else if (ev.allDay) {
    html += '<div class="student-cal-chip-time">All day</div>';
  }
  var topics = skillsTopicTitles(ev);
  if (topics.length) {
    html += '<ul class="student-cal-chip-skill-list">' +
      topics.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
      '</ul>';
  }
  var lecturers = lecturerNames(ev);
  if (lecturers.length) {
    html += '<div class="student-cal-chip-faculty">' + esc(lecturers.join(', ')) + '</div>';
  }
  html += '</div>';
  return html;
}

function renderPracticumLine(text, extraClass) {
  return '<div class="student-cal-chip student-cal-chip-practicum' +
    (extraClass ? ' ' + extraClass : '') + '">' + esc(text) + '</div>';
}

function studentDayBands(data, student, weekIndex, weekday, dateIso, showMarkup) {
  var theoryHtml = '';
  var practicumHtml = '';
  var cell = student.schedule[weekIndex];
  var week = data.calendar.weeks[weekIndex];
  var hol = holidayLabelForWeek(week);
  var clinDay = DataModel.getClinicalDayForGroup(student.clinicalGroup, data.config);

  theoryEventsForDate(data.theory, dateIso).forEach(function (ev) {
    var chip = renderStudentEventChip(ev);
    if (TheoryData.isPracticumTrackEvent(ev) || ev.track === 'clinical' ||
        ev.track === 'simulation' || ev.track === 'orientation') {
      practicumHtml += chip;
    } else {
      theoryHtml += chip;
    }
  });

  var orient = Orientation.getOrientationForWeek(data, student, weekIndex);
  if (orient && orient.date === dateIso) {
    ScheduleHours.ensureOrientationTimes(orient);
    practicumHtml += renderPracticumLine(
      Orientation.getOrientationLabel(data, student, weekIndex) + ' ' +
      ScheduleHours.formatTimeRange(orient.timeStart, orient.timeEnd),
      'student-cal-chip-orientation'
    );
  }

  if (cell && cell.inactive) {
    practicumHtml += renderPracticumLine(hol || 'Holiday / Break', 'student-cal-chip-holiday');
  } else if (cell) {
    if ((cell.clinical || cell.clinicalMissed || cell.makeupClinical) && weekday === clinDay) {
      var facId = cell.facilityId || student.facilityId;
      var cTimes = ScheduleHours.clinicalTimesForFacility(data, facId);
      var clinicalText =
        (cell.makeupClinical ? 'Makeup Clinical' : 'Clinical') +
        (facilityLabel(data, facId) ? ' @ ' + facilityLabel(data, facId) : '') +
        ' ' + ScheduleHours.formatTimeRange(cTimes.start, cTimes.end) +
        (cell.clinicalMissed ? ' [MISSED]' : '');
      var clinicalCls = '';
      if (showMarkup && cell.clinicalMissed) clinicalCls = 'markup-missed';
      if (showMarkup && cell.makeupClinical) clinicalCls = 'markup-makeup';
      practicumHtml += renderPracticumLine(clinicalText, clinicalCls);
    }
    if (cell.sim && (cell.simDay || 'Mon') === weekday) {
      var sTimes = ScheduleHours.simTimesForNum(data, cell.sim);
      practicumHtml += renderPracticumLine(
        'Simulation ' + cell.sim +
        (cell.simGuestGroup ? ' (guest ' + cell.simGuestGroup + ')' : '') +
        ' ' + ScheduleHours.formatTimeRange(sTimes.start, sTimes.end),
        'student-cal-chip-simulation'
      );
    }
  }

  return { theoryHtml: theoryHtml, practicumHtml: practicumHtml };
}

function buildDetailedHtml(data, student, opts) {
  opts = opts || {};
  var showMarkup = !!opts.showMarkup;

  var html = '<div class="print-student-calendar student-calendar-page print-student-calendar-detailed">' +
    introHtml(data, student, { title: 'Detailed Weekly Calendar' }) +
    '<div class="student-cal-master-wrap">' +
    '<table class="data-table student-cal-master-table"><thead><tr>' +
    '<th>Week</th>' + WEEKDAYS.map(function (d) { return '<th>' + d + '</th>'; }).join('') +
    '</tr></thead><tbody>';

  for (var wi = 0; wi < 18; wi++) {
    var week = data.calendar.weeks[wi];
    var hol = holidayLabelForWeek(week);
    var dayMeta = WEEKDAYS.map(function (wd) {
      var dateIso = week ? dateForWeekday(week.startDate, wd) : '';
      var bands = studentDayBands(data, student, wi, wd, dateIso, showMarkup);
      return {
        wd: wd,
        dateIso: dateIso,
        theoryHtml: bands.theoryHtml,
        practicumHtml: bands.practicumHtml
      };
    });

    html += '<tr class="student-cal-theory-row">';
    html += '<td class="student-cal-week-label" rowspan="3">Wk ' + (wi + 1) +
      (hol ? '<div class="student-cal-week-hol">' + esc(hol) + '</div>' : '') +
      '</td>';
    dayMeta.forEach(function (meta) {
      html += '<td class="student-cal-day-cell student-cal-theory-cell">';
      if (meta.dateIso) {
        html += '<div class="student-cal-day-date">' +
          esc(CalendarEngine.formatDisplayDate(meta.dateIso)) + '</div>';
      }
      html += '<div class="student-cal-theory-band">' + meta.theoryHtml + '</div></td>';
    });
    html += '</tr>';

    html += '<tr class="student-cal-divider-row" aria-hidden="true">' +
      '<td colspan="' + WEEKDAYS.length + '" class="student-cal-divider-cell">' +
      '<div class="student-cal-week-divider"></div></td></tr>';

    html += '<tr class="student-cal-practicum-row">';
    dayMeta.forEach(function (meta) {
      html += '<td class="student-cal-day-cell student-cal-practicum-cell">' +
        '<div class="student-cal-practicum-band">' + meta.practicumHtml + '</div></td>';
    });
    html += '</tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
}

function buildCalendarHtml(data, student, calendarType, opts) {
  if (calendarType === 'detailed') return buildDetailedHtml(data, student, opts);
  return buildSummaryHtml(data, student, opts);
}

export {
  esc,
  holidayLabelForWeek,
  buildSummaryHtml,
  buildDetailedHtml,
  buildCalendarHtml,
  introHtml,
  activityPartsForWeek
};
