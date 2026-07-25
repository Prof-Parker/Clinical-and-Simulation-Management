/**
 * HTML builders for student Clinical & Sim Summary and Detailed Weekly calendars.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as DataModel from '../core/data-model/index.js';
import * as Orientation from '../core/orientation.js';
import * as ScheduleHours from '../core/schedule-hours.js';
import * as Validator from '../core/validator.js';

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
  if (!theory || !theory.days) return [];
  var day = theory.days.find(function (d) { return d.date === date; });
  if (!day) return [];
  return (day.events || []).filter(function (ev) {
    return ['theory', 'skills', 'assignment', 'shared', 'exam', 'other'].indexOf(ev.track) >= 0;
  });
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

function buildDetailedHtml(data, student, opts) {
  opts = opts || {};
  var showMarkup = !!opts.showMarkup;
  var theory = data.theory || {};
  var instructional = theory.instructionalWeekdays || ['Wed', 'Thu', 'Fri'];
  var clinDay = DataModel.getClinicalDayForGroup(student.clinicalGroup, data.config);
  var daySet = {};
  instructional.forEach(function (d) { daySet[d] = true; });
  daySet[clinDay] = true;
  DataModel.getSimDays(data.config).forEach(function (d) { daySet[d] = true; });
  daySet.Sat = true;
  daySet.Sun = true;
  var orderedDays = WEEKDAYS.filter(function (d) { return daySet[d]; });

  var html = '<div class="print-student-calendar student-calendar-page print-student-calendar-detailed">' +
    introHtml(data, student, { title: 'Detailed Weekly Calendar' });

  for (var wi = 0; wi < 18; wi++) {
    var week = data.calendar.weeks[wi];
    var act = activityPartsForWeek(data, student, wi, showMarkup);
    var hol = holidayLabelForWeek(week);
    html += '<section class="student-cal-week">' +
      '<h3>Week ' + (wi + 1) +
      (week ? ' · ' + esc(CalendarEngine.formatDisplayDate(week.startDate)) : '') +
      (hol ? ' · ' + esc(hol) : '') + '</h3>' +
      '<p class="section-sub student-cal-week-summary">' + esc(act.activity) + '</p>' +
      '<table class="data-table student-cal-day-table"><thead><tr>' +
      '<th>Day</th><th>Date</th><th>Schedule</th></tr></thead><tbody>';

    orderedDays.forEach(function (wd) {
      var dateIso = week ? dateForWeekday(week.startDate, wd) : '';
      var items = [];
      var cell = student.schedule[wi];
      var orient = Orientation.getOrientationForWeek(data, student, wi);
      if (orient && orient.date === dateIso) {
        ScheduleHours.ensureOrientationTimes(orient);
        items.push(
          Orientation.getOrientationLabel(data, student, wi) + ' ' +
          ScheduleHours.formatTimeRange(orient.timeStart, orient.timeEnd)
        );
      }
      if (cell && !cell.inactive) {
        if ((cell.clinical || cell.clinicalMissed || cell.makeupClinical) && wd === clinDay) {
          var facId = cell.facilityId || student.facilityId;
          var cTimes = ScheduleHours.clinicalTimesForFacility(data, facId);
          items.push(
            (cell.makeupClinical ? 'Makeup Clinical' : 'Clinical') +
            (facilityLabel(data, facId) ? ' @ ' + facilityLabel(data, facId) : '') +
            ' ' + ScheduleHours.formatTimeRange(cTimes.start, cTimes.end) +
            (cell.clinicalMissed ? ' [MISSED]' : '')
          );
        }
        if (cell.sim && (cell.simDay || 'Mon') === wd) {
          var sTimes = ScheduleHours.simTimesForNum(data, cell.sim);
          items.push(
            'Simulation ' + cell.sim + ' ' +
            ScheduleHours.formatTimeRange(sTimes.start, sTimes.end)
          );
        }
      } else if (cell && cell.inactive && hol) {
        items.push(hol);
      }
      theoryEventsForDate(theory, dateIso).forEach(function (ev) {
        var track = ev.track === 'skills' ? 'Skills lab' :
          (ev.track === 'assignment' ? 'Assignment' :
            (ev.track === 'theory' ? 'Lecture' : ev.track));
        var t = (ev.timeStart && ev.timeEnd)
          ? ' ' + ScheduleHours.formatTimeRange(ev.timeStart, ev.timeEnd)
          : '';
        items.push(track + ': ' + (ev.title || '') + t);
      });
      if (!items.length) return;
      html += '<tr><td>' + esc(wd) + '</td><td>' +
        esc(dateIso ? CalendarEngine.formatDisplayDate(dateIso) : '') +
        '</td><td>' + esc(items.join(' · ')) + '</td></tr>';
    });
    html += '</tbody></table></section>';
  }
  html += '</div>';
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
