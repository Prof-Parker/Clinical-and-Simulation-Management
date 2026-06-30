/* global App */
var App = App || {};

App.CalendarEngine = (function () {
  function parseDate(iso) {
    if (!iso) return null;
    var p = iso.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function toISO(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function addDays(d, n) {
    var r = new Date(d.getTime());
    r.setDate(r.getDate() + n);
    return r;
  }

  function getWeekIndexForDate(data, dateStr) {
    var d = parseDate(dateStr);
    if (!d || !data.calendar.weeks.length) return -1;
    for (var i = 0; i < data.calendar.weeks.length; i++) {
      var ws = parseDate(data.calendar.weeks[i].startDate);
      var we = addDays(ws, 7);
      if (d >= ws && d < we) return i;
    }
    return -1;
  }

  function rebuildWeeks(data) {
    var start = parseDate(data.calendar.semesterStartDate);
    if (!start) start = new Date();
    var weeks = [];
    for (var i = 0; i < 18; i++) {
      weeks.push({
        weekNum: i + 1,
        startDate: toISO(addDays(start, i * 7)),
        inactive: false,
        break: false,
        holiday: false,
        mondayHoliday: false,
        labels: []
      });
    }
    data.calendar.weeks = weeks;
    applyHolidays(data);
    return weeks;
  }

  function applyHolidays(data) {
    data.calendar.weeks.forEach(function (w) {
      w.inactive = false;
      w.break = false;
      w.holiday = false;
      w.mondayHoliday = false;
      w.labels = [];
    });

    (data.holidays || []).forEach(function (h) {
      var wi = -1;
      if (h.type === 'break' && h.weekIndex != null && h.weekIndex >= 0) {
        wi = parseInt(h.weekIndex, 10);
      } else {
        wi = getWeekIndexForDate(data, h.date);
      }
      if (wi < 0) return;
      var week = data.calendar.weeks[wi];
      week.labels.push(h.label || h.type);
      if (h.type === 'break') {
        week.break = true;
        week.inactive = true;
      } else if (h.type === 'mondayHoliday') {
        week.mondayHoliday = true;
        week.inactive = true;
      } else {
        week.holiday = true;
      }
    });
  }

  function isWeekInactive(data, weekIndex) {
    var w = data.calendar.weeks[weekIndex];
    return !w || w.inactive;
  }

  function getWeekDisplay(data, weekIndex, short) {
    var w = data.calendar.weeks[weekIndex];
    if (!w) return 'Wk ' + (weekIndex + 1);
    var label = 'Wk ' + w.weekNum;
    if (w.startDate) {
      var d = parseDate(w.startDate);
      var fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return short ? label + ' (' + fmt + ')' : label + '<br><span class="week-date">' + fmt + '</span>';
    }
    return label;
  }

  function formatDisplayDate(iso) {
    var d = parseDate(iso);
    if (!d) return iso || '';
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  }

  function getActiveSchedulingWeeks(data) {
    var cfg = data.config;
    var start = (cfg.simStartWeek || 5) - 1;
    var weeks = [];
    for (var i = start; i < 18; i++) {
      if (!isWeekInactive(data, i)) weeks.push(i);
    }
    return weeks;
  }

  function getClinicalEligibleWeeks(data, fromWeek) {
    var cfg = data.config;
    var start = Math.max((cfg.clinicalStartWeek || 5) - 1, fromWeek || 0);
    var weeks = [];
    for (var i = start; i < 18; i++) {
      if (!isWeekInactive(data, i)) weeks.push(i);
    }
    return weeks;
  }

  return {
    parseDate: parseDate,
    toISO: toISO,
    addDays: addDays,
    rebuildWeeks: rebuildWeeks,
    applyHolidays: applyHolidays,
    getWeekIndexForDate: getWeekIndexForDate,
    isWeekInactive: isWeekInactive,
    getWeekDisplay: getWeekDisplay,
    formatDisplayDate: formatDisplayDate,
    getActiveSchedulingWeeks: getActiveSchedulingWeeks,
    getClinicalEligibleWeeks: getClinicalEligibleWeeks
  };
})();
