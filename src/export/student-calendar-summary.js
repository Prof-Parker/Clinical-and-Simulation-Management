/**
 * Clinical and Sim Summary event rows (one row per dated activity).
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as DataModel from '../core/data-model/index.js';
import * as Orientation from '../core/orientation.js';
import * as ScheduleHours from '../core/schedule-hours.js';

var WEEKDAY_FULL = {
  Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday'
};

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

function weekdayFullName(abbrev) {
  return WEEKDAY_FULL[abbrev] || abbrev || '';
}

function weekdayFromIso(iso, fallbackAbbrev) {
  if (iso) {
    var d = CalendarEngine.parseDate(iso);
    if (d) return weekdayFullName(CalendarEngine.weekdayNameForDate(d));
  }
  return weekdayFullName(fallbackAbbrev);
}

function formatSummaryDate(iso) {
  var d = CalendarEngine.parseDate(iso);
  if (!d) return '';
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function isoForWeekday(week, weekday) {
  return (week && CalendarEngine.dateForWeekdayInWeekRange(week, weekday)) || '';
}

function clinicalWeekdayForCell(data, student, weekIndex, cell) {
  if (cell && cell.makeupClinical) {
    var makeups = student.makeups || [];
    for (var i = makeups.length - 1; i >= 0; i--) {
      var m = makeups[i];
      if (m.weekIndex === weekIndex && m.type === 'clinical' && m.joinedDay) {
        return m.joinedDay;
      }
    }
  }
  return DataModel.getClinicalDayForGroup(student.clinicalGroup, data.config);
}

function formatSimGroupName(group) {
  var g = String(group || '').trim();
  if (!g) return '';
  var m = /^SG\s*(\d+)$/i.exec(g) || /^(\d+)$/.exec(g);
  if (m) return 'Sim group ' + m[1];
  var prefix = /^sim\s*group\s+/i.exec(g);
  if (prefix) return 'Sim group ' + g.slice(prefix[0].length).trim();
  return 'Sim group ' + g;
}

function simActivityLabel(student, cell) {
  var guestGroup = cell.simGuestGroup;
  var group = guestGroup || (student && student.simGroup) || '';
  var groupText = formatSimGroupName(group);
  var inner = groupText;
  if (guestGroup) inner = groupText ? groupText + ', guest' : 'guest';
  var label = 'Simulation ' + cell.sim;
  if (inner) label += ' (' + inner + ')';
  return label;
}

function makeSummaryEvent(opts) {
  var dateIso = opts.dateIso || '';
  return {
    dateIso: dateIso,
    weekday: opts.weekday || weekdayFromIso(dateIso, opts.weekdayAbbrev),
    activity: opts.activity || '',
    times: opts.times || '',
    rowCls: opts.rowCls || '',
    sort: opts.sort || 0
  };
}

function holidayEventsForWeek(data, weekIndex) {
  var week = data.calendar && data.calendar.weeks ? data.calendar.weeks[weekIndex] : null;
  var events = [];
  (data.holidays || []).forEach(function (h) {
    var type = h.type === 'mondayHoliday' ? 'holiday' : (h.type || 'holiday');
    var wi = -1;
    if (type === 'break' && h.weekIndex != null && h.weekIndex >= 0) {
      wi = parseInt(h.weekIndex, 10);
    } else {
      wi = CalendarEngine.getWeekIndexForDate(data, h.date);
    }
    if (wi !== weekIndex) return;
    var dateIso = h.date || (week && week.startDate) || '';
    events.push(makeSummaryEvent({
      dateIso: dateIso,
      activity: h.label || holidayLabelForWeek(week) || 'Holiday / Break',
      rowCls: 'holiday-row',
      sort: 0
    }));
  });
  if (!events.length && week && (week.inactive || week.break || week.holiday)) {
    events.push(makeSummaryEvent({
      dateIso: week.startDate || '',
      activity: holidayLabelForWeek(week) || 'Holiday / Break',
      rowCls: 'holiday-row',
      sort: 0
    }));
  }
  return events;
}

function sortSummaryEvents(events) {
  return events.slice().sort(function (a, b) {
    if (a.dateIso !== b.dateIso) return String(a.dateIso || '').localeCompare(String(b.dateIso || ''));
    return (a.sort || 0) - (b.sort || 0);
  });
}

function summaryEventsForWeek(data, student, weekIndex, showMarkup) {
  var cell = student.schedule && student.schedule[weekIndex];
  var week = data.calendar && data.calendar.weeks ? data.calendar.weeks[weekIndex] : null;
  var events = [];

  var orient = Orientation.getOrientationForWeek(data, student, weekIndex);
  if (orient) {
    ScheduleHours.ensureOrientationTimes(orient);
    events.push(makeSummaryEvent({
      dateIso: orient.date || (week && week.startDate) || '',
      activity: Orientation.getOrientationLabel(data, student, weekIndex),
      times: ScheduleHours.formatTimeRange(orient.timeStart, orient.timeEnd),
      sort: 1
    }));
  }

  var holEvents = holidayEventsForWeek(data, weekIndex);
  if (cell && cell.inactive) {
    events = events.concat(holEvents);
    if (!events.length) {
      events.push(makeSummaryEvent({
        dateIso: week ? week.startDate : '',
        activity: 'Holiday / Break',
        rowCls: 'holiday-row',
        sort: 0
      }));
    }
    return sortSummaryEvents(events);
  }

  events = events.concat(holEvents);
  if (!cell) {
    return sortSummaryEvents(events);
  }

  if (cell.makeupClinical || cell.clinical || cell.clinicalMissed) {
    var clinDay = clinicalWeekdayForCell(data, student, weekIndex, cell);
    var facId = cell.facilityId || student.facilityId;
    var site = facilityLabel(data, facId);
    var cTimes = ScheduleHours.clinicalTimesForFacility(data, facId);
    var clinCls = '';
    if (showMarkup && cell.makeupClinical) clinCls = 'markup-makeup';
    else if (showMarkup && cell.clinicalMissed) clinCls = 'markup-missed';
    events.push(makeSummaryEvent({
      dateIso: isoForWeekday(week, clinDay),
      weekdayAbbrev: clinDay,
      activity: (cell.makeupClinical ? 'Makeup Clinical' : 'Clinical') +
        (site ? ' (' + site + ')' : '') +
        (cell.clinicalMissed ? ' [MISSED]' : ''),
      times: ScheduleHours.formatTimeRange(cTimes.start, cTimes.end),
      rowCls: clinCls,
      sort: 2
    }));
  }

  if (cell.sim) {
    var simDay = cell.simDay || 'Mon';
    var sTimes = ScheduleHours.simTimesForNum(data, cell.sim);
    events.push(makeSummaryEvent({
      dateIso: isoForWeekday(week, simDay),
      weekdayAbbrev: simDay,
      activity: simActivityLabel(student, cell),
      times: ScheduleHours.formatTimeRange(sTimes.start, sTimes.end),
      sort: 3
    }));
  }

  return sortSummaryEvents(events);
}

function activityPartsForWeek(data, student, weekIndex, showMarkup) {
  var events = summaryEventsForWeek(data, student, weekIndex, showMarkup);
  var cls = '';
  events.forEach(function (ev) {
    if (ev.rowCls) cls = ev.rowCls;
  });
  return {
    activity: events.map(function (ev) { return ev.activity; }).join(' · ') || '—',
    rowCls: cls
  };
}

export {
  holidayLabelForWeek,
  formatSummaryDate,
  formatSimGroupName,
  summaryEventsForWeek,
  activityPartsForWeek
};
