/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.DateInputs = (function () {
  var CALENDAR_ICON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
    '<path stroke-linecap="round" d="M16 2v4M8 2v4M3 10h18"/>' +
    '</svg>';

  function openPicker(input) {
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch (err) { /* requires user gesture in some browsers */ }
    }
  }

  function semesterRange(data) {
    if (!data || !data.meta) return null;
    var year = data.meta.semesterYear || new Date().getFullYear();
    return { min: year - 1 + '-01-01', max: year + 1 + '-12-31' };
  }

  function holidayRange(data) {
    if (!data || !data.calendar) return null;
    var min = data.calendar.semesterStartDate;
    var weeks = data.calendar.weeks;
    if (!min || !weeks || !weeks.length) return min ? { min: min, max: null } : null;
    var lastStart = App.CalendarEngine.parseDate(weeks[weeks.length - 1].startDate);
    var max = lastStart ? App.CalendarEngine.toISO(App.CalendarEngine.addDays(lastStart, 6)) : null;
    return { min: min, max: max };
  }

  function applyBounds(input, data) {
    if (!data) return;
    var range = null;
    if (input.id === 'semesterStartDate') range = semesterRange(data);
    else if (input.getAttribute('data-hol') === 'date') range = holidayRange(data);
    else if (input.getAttribute('data-orient') === 'date') range = holidayRange(data);
    if (!range) return;
    if (range.min) input.min = range.min;
    if (range.max) input.max = range.max;
  }

  function bindInput(input) {
    if (input.dataset.datePickerInit) return;
    input.dataset.datePickerInit = '1';
    input.classList.add('date-input');
    input.addEventListener('click', function () { openPicker(input); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        openPicker(input);
      }
    });
  }

  function wrapWithButton(input) {
    if (input.closest('.date-input-wrap')) return;
    var wrap = document.createElement('span');
    wrap.className = 'date-input-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'date-picker-btn';
    btn.setAttribute('aria-label', 'Open calendar');
    btn.title = 'Open calendar';
    btn.innerHTML = CALENDAR_ICON;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openPicker(input);
    });
    wrap.appendChild(btn);
  }

  function init(root, data) {
    var scope = root || document;
    scope.querySelectorAll('input[type="date"]').forEach(function (input) {
      wrapWithButton(input);
      bindInput(input);
      applyBounds(input, data);
    });
  }

  return { init: init, openPicker: openPicker };
})();
