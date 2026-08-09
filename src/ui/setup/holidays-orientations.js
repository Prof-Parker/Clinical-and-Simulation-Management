/** Holidays and orientation day editors on setup. */

import { getData, notifyChange } from '../../core/state.js';
import * as DataModel from '../../core/data-model/index.js';
import * as CalendarEngine from '../../core/calendar-engine.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import { escAttr, escHtml, configListAddRow } from './dom-utils.js';
import {
  markSetupDraft, resolveRenderData, guardSetupEdit, resolveSetupData, setupAfterChange, collectFromForm,
  getCohortFacilityIdForGroup
} from './index.js';
import { setupEl, setupQueryAll } from './scope.js';

function syncBreakHolidayDate(h, data) {
    if (h.type !== 'break') return;
    var wi = h.weekIndex != null ? parseInt(h.weekIndex, 10) : 0;
    if (isNaN(wi) || wi < 0) wi = 0;
    if (wi > 17) wi = 17;
    h.weekIndex = wi;
    if (data.calendar.weeks && data.calendar.weeks[wi]) {
      h.date = data.calendar.weeks[wi].startDate;
    }
  }

function weekSelectHtml(data, selectedWeek) {
    var html = '';
    for (var i = 0; i < 18; i++) {
      html += '<option value="' + i + '"' + (String(selectedWeek) === String(i) ? ' selected' : '') + '>' +
        escAttr(CalendarEngine.getWeekDisplay(data, i, true)) + '</option>';
    }
    return html;
  }

function semesterWeekHintText(data, dateStr) {
    if (!dateStr) return 'Select a date to see week';
    var wi = CalendarEngine.getWeekIndexForDate(data, dateStr);
    if (wi < 0) return 'Outside semester weeks';
    return semesterWeekHintForIndex(data, wi);
  }

function semesterWeekHintForIndex(data, weekIndex) {
    var wi = parseInt(weekIndex, 10);
    if (isNaN(wi) || wi < 0 || wi > 17) return 'Select a week';
    var label = CalendarEngine.getWeekDisplay(data, wi, true);
    if (CalendarEngine.isSchedulingBlockedWeek(data, wi)) label += ' — break / inactive';
    else if (CalendarEngine.weekHasHoliday(data, wi)) {
      label += CalendarEngine.holidayBlocksFullWeek(data)
        ? ' — holiday (week blocked for algo)'
        : ' — holiday (day-only for algo)';
    }
    return label;
  }

function updateHolidayWeekHint(data, el) {
    var row = el.closest('.setup-holiday-when-row');
    var hint = row && row.querySelector('[data-hol-week-hint]');
    if (!hint) return;
    if (el.getAttribute('data-hol') === 'date') {
      hint.textContent = semesterWeekHintText(data, el.value);
    } else if (el.getAttribute('data-hol') === 'week') {
      hint.textContent = semesterWeekHintForIndex(data, el.value);
    }
  }

function updateAllHolidayWeekHints(data, containerId) {
    var container = containerId ? document.getElementById(containerId) : setupEl('setupHolidays');
    if (!container) return;
    container.querySelectorAll('[data-hol="date"], [data-hol="week"]').forEach(function (el) {
      updateHolidayWeekHint(data, el);
    });
  }

function renderHolidays(data, containerId) {
    var container = containerId ? document.getElementById(containerId) : setupEl('setupHolidays');
    if (!container) return;
    container.innerHTML = '';
    if (!data.calendar.weeks || !data.calendar.weeks.length) {
      CalendarEngine.rebuildWeeks(data);
    }
    var holidays = data.holidays || [];
    if (holidays.length) {
      container.innerHTML =
        '<div class="setup-holidays-head" aria-hidden="true">' +
        '<span>Type</span><span>Date / week off</span><span>Label</span><span></span>' +
        '</div>';
    }
    holidays.forEach(function (h, i) {
      var type = h.type || 'holiday';
      if (type === 'mondayHoliday') type = 'holiday';
      if (type === 'break') syncBreakHolidayDate(h, data);
      else if (!h.date && h.weekIndex != null && data.calendar.weeks[h.weekIndex]) {
        h.date = data.calendar.weeks[h.weekIndex].startDate;
      }
      var isBreak = type === 'break';
      var whenHtml = isBreak
        ? '<label class="setup-holiday-field setup-holiday-when">' +
          '<span class="setup-holiday-field-label">Week off</span>' +
          '<div class="setup-holiday-when-row">' +
          '<select data-hol="week" data-idx="' + i + '">' + weekSelectHtml(data, h.weekIndex != null ? h.weekIndex : 0) + '</select>' +
          '<span class="setup-holiday-week-hint" data-hol-week-hint data-idx="' + i + '">' +
          escHtml(semesterWeekHintForIndex(data, h.weekIndex != null ? h.weekIndex : 0)) + '</span></div></label>'
        : '<label class="setup-holiday-field setup-holiday-when">' +
          '<span class="setup-holiday-field-label">Date</span>' +
          '<div class="setup-holiday-when-row">' +
          '<input type="date" class="date-input" data-hol="date" data-idx="' + i + '" value="' + (h.date || '') + '">' +
          '<span class="setup-holiday-week-hint" data-hol-week-hint data-idx="' + i + '">' +
          escHtml(semesterWeekHintText(data, h.date || '')) + '</span></div></label>';
      container.innerHTML +=
        '<div class="setup-holiday-row" data-hol-idx="' + i + '">' +
        '<label class="setup-holiday-field setup-holiday-type">' +
        '<span class="setup-holiday-field-label">Type</span>' +
        '<select data-hol="type" data-idx="' + i + '">' +
        [
          { v: 'holiday', l: 'Holiday' },
          { v: 'break', l: 'Break (full week off)' }
        ].map(function (opt) {
          return '<option value="' + opt.v + '"' + (type === opt.v ? ' selected' : '') + '>' + opt.l + '</option>';
        }).join('') +
        '</select></label>' +
        whenHtml +
        '<label class="setup-holiday-field setup-holiday-label">' +
        '<span class="setup-holiday-field-label">Label</span>' +
        '<input type="text" data-hol="label" data-idx="' + i + '" value="' + escAttr(h.label || '') + '" placeholder="e.g. Spring break">' +
        '</label>' +
        '<button class="btn btn-icon-remove remove-holiday" type="button" data-idx="' + i + '" aria-label="Remove holiday" title="Remove holiday">&times;</button>' +
        '</div>';
    });
    if (!holidays.length) {
      container.innerHTML = '<p class="section-sub setup-list-empty-hint">No holidays or breaks defined.</p>';
    }
    container.innerHTML += configListAddRow('add-holiday', 'Add');
  }

function collectHolidaysFromDom(data, containerId) {
    if (!data.holidays) data.holidays = [];
    var container = document.getElementById(containerId || 'setupHolidays');
    if (!container) return;
    container.querySelectorAll('[data-hol]').forEach(function (el) {
      var h = data.holidays[parseInt(el.dataset.idx, 10)];
      if (!h) return;
      if (el.dataset.hol === 'date') h.date = el.value;
      if (el.dataset.hol === 'label') h.label = el.value;
      if (el.dataset.hol === 'type') h.type = el.value;
      if (el.dataset.hol === 'week') h.weekIndex = parseInt(el.value, 10);
    });
    (data.holidays || []).forEach(function (h) {
      if (h.type === 'break') syncBreakHolidayDate(h, data);
    });
  }

function bindHolidayEditor(containerId, options) {
    var id = containerId || 'setupHolidays';
    var el = document.getElementById(id);
    if (!el || el.dataset.holidayEditorBound) return;
    el.dataset.holidayEditorBound = '1';
    options = options || {};

    function getData() {
      return options.getData ? options.getData() : getData();
    }

    function refresh(data) {
      if (options.onChange) options.onChange(data);
      else {
        markSetupDraft(data);
        notifyChange();
        render(data);
      }
    }

    el.addEventListener('click', function (e) {
      if (e.target.closest('.add-holiday')) {
        if (options.guard && !options.guard()) return;
        var data = getData();
        collectHolidaysFromDom(data, id);
        if (!data.holidays) data.holidays = [];
        data.holidays.push({ id: DataModel.uid(), date: '', label: '', type: 'holiday' });
        refresh(data);
        return;
      }
      var btn = e.target.closest('.remove-holiday');
      if (!btn) return;
      if (options.guard && !options.guard()) return;
      var data = getData();
      collectHolidaysFromDom(data, id);
      data.holidays.splice(parseInt(btn.dataset.idx, 10), 1);
      refresh(data);
    });

    el.addEventListener('change', function (e) {
      var hol = e.target.getAttribute('data-hol');
      if (hol === 'date' || hol === 'week') {
        updateHolidayWeekHint(getData(), e.target);
        return;
      }
      if (hol !== 'type') return;
      var data = getData();
      collectHolidaysFromDom(data, id);
      var idx = parseInt(e.target.dataset.idx, 10);
      var h = data.holidays[idx];
      if (!h) return;
      h.type = e.target.value;
      if (h.type === 'break') {
        if (h.weekIndex == null) {
          h.weekIndex = h.date ? CalendarEngine.getWeekIndexForDate(data, h.date) : 0;
          if (h.weekIndex < 0) h.weekIndex = 0;
        }
        syncBreakHolidayDate(h, data);
      }
      refresh(data);
    });

    el.addEventListener('input', function (e) {
      if (e.target.getAttribute('data-hol') !== 'date') return;
      updateHolidayWeekHint(getData(), e.target);
    });
  }

function orientationFacilitySelectHtml(data, selectedId) {
    selectedId = DataModel.getCanonicalFacilityId(data, selectedId);
    var facilities = DataModel.getUniqueFacilitiesForSelect(data);
    var html = facilities.map(function (f) {
      return '<option value="' + escAttr(f.id) + '"' +
        (selectedId === f.id ? ' selected' : '') + '>' + escAttr(f.name) + '</option>';
    }).join('');
    if (selectedId && !facilities.some(function (f) { return f.id === selectedId; })) {
      html = '<option value="' + escAttr(selectedId) + '" selected>' +
        escAttr(selectedId) + ' (missing)</option>' + html;
    }
    if (!html) {
      html = '<option value="">No sites available</option>';
    }
    return html;
  }

function orientationWeekHintText(data, dateStr) {
    return semesterWeekHintText(data, dateStr);
  }

function updateOrientationWeekHint(data, dateInput) {
    var row = dateInput.closest('.setup-orientation-date-row');
    var hint = row && row.querySelector('[data-orient-week-hint]');
    if (hint) hint.textContent = orientationWeekHintText(data, dateInput.value);
  }

function updateAllOrientationWeekHints(data) {
    var container = setupEl('setupOrientations');
    if (!container) return;
    container.querySelectorAll('[data-orient="date"]').forEach(function (el) {
      updateOrientationWeekHint(data, el);
    });
  }

function nextOrientationDefault(data) {
    var groups = DataModel.getClinicalGroups(data.config);
    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];
      var facIds = ClinicalSites
        ? ClinicalSites.getGroupFacilities(data, group)
        : [getCohortFacilityIdForGroup(data, group)];
      for (var fi = 0; fi < facIds.length; fi++) {
        var facId = facIds[fi];
        var exists = (data.orientations || []).some(function (o) {
          if (!o || o.clinicalGroup !== group) return false;
          if (!facId) return true;
          return DataModel.sameFacilitySite(data, o.facilityId, facId);
        });
        if (!exists) {
          return {
            clinicalGroup: group,
            facilityId: facId,
            timeStart: ScheduleHours.DEFAULT_ORIENT_START,
            timeEnd: ScheduleHours.DEFAULT_ORIENT_END
          };
        }
      }
    }
    var fallbackGroup = groups[0] || 'C1';
    return {
      clinicalGroup: fallbackGroup,
      facilityId: getCohortFacilityIdForGroup(data, fallbackGroup),
      timeStart: ScheduleHours.DEFAULT_ORIENT_START,
      timeEnd: ScheduleHours.DEFAULT_ORIENT_END
    };
  }

function renderOrientations(data) {
    var container = setupEl('setupOrientations');
    if (!container) return;
    container.innerHTML = '';
    if (!data.calendar.weeks || !data.calendar.weeks.length) {
      CalendarEngine.rebuildWeeks(data);
    }
    var orientations = data.orientations || [];
    if (orientations.length) {
      container.innerHTML =
        '<div class="setup-orientations-head" aria-hidden="true">' +
        '<span>Clinical group</span><span>Orientation date</span><span>Facility</span>' +
        '<span>Start</span><span>End</span><span></span>' +
        '</div>';
    }
    var clinicalGroups = DataModel.getClinicalGroups(data.config);
    orientations.forEach(function (o, i) {
      ScheduleHours.ensureOrientationTimes(o);
      var groupOptions = clinicalGroups.map(function (g) {
        return '<option value="' + g + '"' + (o.clinicalGroup === g ? ' selected' : '') + '>' + g + '</option>';
      }).join('');
      var defaultFacId = DataModel.getDefaultFacilityIdForClinicalGroup(o.clinicalGroup, data.facilities || []);
      var facId = o.facilityId || defaultFacId;
      container.innerHTML +=
        '<div class="setup-orientation-row" data-orient-idx="' + i + '">' +
        '<label class="setup-orientation-field setup-orientation-group">' +
        '<span class="setup-orientation-field-label">Clinical group</span>' +
        '<select data-orient="group" data-idx="' + i + '">' + groupOptions + '</select></label>' +
        '<label class="setup-orientation-field setup-orientation-date">' +
        '<span class="setup-orientation-field-label">Orientation date</span>' +
        '<div class="setup-orientation-date-row">' +
        '<input type="date" class="date-input" data-orient="date" data-idx="' + i + '" value="' + (o.date || '') + '">' +
        '<span class="setup-orientation-week-hint" data-orient-week-hint data-idx="' + i + '">' +
        escHtml(orientationWeekHintText(data, o.date || '')) + '</span></div></label>' +
        '<label class="setup-orientation-field setup-orientation-facility">' +
        '<span class="setup-orientation-field-label">Facility</span>' +
        '<select data-orient="facility" data-idx="' + i + '">' + orientationFacilitySelectHtml(data, facId) + '</select></label>' +
        '<label class="setup-orientation-field setup-orientation-start">' +
        '<span class="setup-orientation-field-label">Start</span>' +
        '<input type="time" data-orient="start" data-idx="' + i + '" value="' +
        escAttr(ScheduleHours.hhmmToTimeInput(o.timeStart)) + '" aria-label="Orientation start time"></label>' +
        '<label class="setup-orientation-field setup-orientation-end">' +
        '<span class="setup-orientation-field-label">End</span>' +
        '<input type="time" data-orient="end" data-idx="' + i + '" value="' +
        escAttr(ScheduleHours.hhmmToTimeInput(o.timeEnd)) + '" aria-label="Orientation end time"></label>' +
        '<button class="btn btn-icon-remove remove-orientation" type="button" data-idx="' + i + '" aria-label="Remove orientation" title="Remove orientation">&times;</button>' +
        '</div>';
    });
    if (!orientations.length) {
      container.innerHTML = '<p class="section-sub setup-list-empty-hint">No orientation days defined.</p>';
    }
    container.innerHTML += configListAddRow('add-orientation', 'Add');
  }

export {
  weekSelectHtml,
  semesterWeekHintForIndex,
  renderHolidays,
  collectHolidaysFromDom,
  bindHolidayEditor,
  renderOrientations,
  updateAllHolidayWeekHints,
  updateAllOrientationWeekHints,
  updateOrientationWeekHint,
  nextOrientationDefault
};
