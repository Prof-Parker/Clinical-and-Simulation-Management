/**
 * Faculty schedule slot chip HTML (reuses coordinator color classes).
 * Day cells show compressed course/kind/hours chips; expand to detail chips.
 */

import { escapeHtml } from '../dialogs.js';
import { formatHhmmDisplay } from '../../core/schedule-hours.js';

function esc(s) {
  return escapeHtml(s == null ? '' : String(s));
}

function kindClass(kind) {
  if (kind === 'clinical') return 'theory-coord-item-clinical';
  if (kind === 'sim') return 'theory-coord-item-simulation';
  if (kind === 'skills') return 'theory-coord-item-skills';
  if (kind === 'lecture') return 'theory-coord-item-theory';
  return 'theory-coord-item-theory';
}

function kindLabel(kind, slot) {
  if (slot && slot.seriesLabel && (slot.seriesOnce || kind === 'clinical')) {
    return slot.seriesLabel;
  }
  if (kind === 'skills') return 'Skills Lab';
  if (kind === 'sim') return 'Sim';
  if (kind === 'clinical') return 'Clinical';
  if (kind === 'lecture') return 'Lecture';
  return kind || '';
}

function timeRange(slot) {
  var a = formatHhmmDisplay(slot.timeStart);
  var b = formatHhmmDisplay(slot.timeEnd);
  if (!a || !b) return '';
  return a.replace(' ', '') + '-' + b.replace(' ', '');
}

function formatHoursLabel(hours) {
  var h = Number(hours) || 0;
  if (h <= 0) return '';
  var rounded = Math.round(h * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
    return String(Math.round(rounded)) + 'hr';
  }
  return String(rounded) + 'hr';
}

function slotOpenCount(slot) {
  if (slot.openCount != null) return slot.openCount;
  return slot.open ? 1 : 0;
}

function groupKeyForSlot(slot) {
  var hrs = Math.round((Number(slot.hoursPerInstance) || 0) * 10) / 10;
  return [slot.courseId || '', slot.kind || '', hrs, slot.seriesKey || ''].join('|');
}

/**
 * Group slots in one day cell by course + kind + hours + skills series.
 */
function groupSlots(slots) {
  var map = {};
  var order = [];
  (slots || []).forEach(function (slot) {
    if (!slot) return;
    var key = groupKeyForSlot(slot);
    if (!map[key]) {
      map[key] = {
        key: key,
        courseId: slot.courseId || '',
        courseLabel: slot.courseLabel || slot.courseId || 'Course',
        kind: slot.kind || '',
        hours: Math.round((Number(slot.hoursPerInstance) || 0) * 10) / 10,
        seriesKey: slot.seriesKey || '',
        seriesLabel: slot.seriesLabel || '',
        seriesOnce: !!slot.seriesOnce,
        facultyPerInstance: 0,
        slots: [],
        openTotal: 0
      };
      order.push(key);
    }
    map[key].slots.push(slot);
    map[key].openTotal += slotOpenCount(slot);
    var staff = Number(slot.facultyPerInstance) || 0;
    if (staff > map[key].facultyPerInstance) map[key].facultyPerInstance = staff;
  });
  return order.map(function (k) { return map[k]; });
}

/**
 * Compact chip for calendar cells / browse lists (detail layout).
 */
function slotChipHtml(slot, opts) {
  opts = opts || {};
  var selected = !!opts.selected;
  var openCount = slotOpenCount(slot);
  var title = (slot.courseLabel || slot.courseId || '') + ' ' + kindLabel(slot.kind, slot);
  var lines = [];
  lines.push('<div class="faculty-chip-title">' + esc(title) + '</div>');
  if (slot.kind === 'clinical') {
    lines.push('<div class="faculty-chip-line">' + esc(slot.siteLabel || slot.clinicalGroup || '') + '</div>');
  }
  var time = timeRange(slot);
  if (time) {
    lines.push('<div class="faculty-chip-line">' + esc(time) +
      (openCount > 0 ? ' (' + openCount + ')' : '') + '</div>');
  } else if (openCount > 0) {
    lines.push('<div class="faculty-chip-line">(' + openCount + ')</div>');
  }
  if (!slot.open && slot.assignedName) {
    lines.push('<div class="faculty-chip-line">' + esc(slot.assignedName) + '</div>');
  }
  var attrs = 'class="faculty-slot-chip theory-coord-item ' + kindClass(slot.kind) +
    (selected ? ' faculty-slot-chip-selected' : '') +
    (slot.open ? '' : ' faculty-slot-chip-filled') + '"';
  attrs += ' data-slot-id="' + esc(slot.slotId) + '"';
  attrs += ' role="button" tabindex="0"';
  attrs += ' aria-pressed="' + (selected ? 'true' : 'false') + '"';
  attrs += ' aria-label="' + esc(title + (time ? ' ' + time : '')) + '"';
  return '<div ' + attrs + '>' + lines.join('') + '</div>';
}

/**
 * Compressed summary: course on line 1, "Clinical 12hr (3)" on line 2.
 */
function compressedChipHtml(group, opts) {
  opts = opts || {};
  var date = opts.date || '';
  var selected = !!opts.selected;
  var expanded = !!opts.expanded;
  var hrs = formatHoursLabel(group.hours);
  var count = group.facultyPerInstance > 0
    ? group.facultyPerInstance
    : (group.openTotal > 0 ? group.openTotal : (group.slots || []).length);
  var line2 = kindLabel(group.kind, group) + (hrs ? ' ' + hrs : '') +
    (count > 0 ? ' (' + count + ')' : '');
  var aria = (group.courseLabel || '') + ' ' + line2;
  var attrs = 'class="faculty-slot-chip faculty-slot-chip-compressed theory-coord-item ' +
    kindClass(group.kind) +
    (selected ? ' faculty-slot-chip-selected' : '') +
    (expanded ? ' faculty-slot-chip-expanded-toggle' : '') + '"';
  attrs += ' data-faculty-group="' + esc(group.key) + '"';
  attrs += ' data-date="' + esc(date) + '"';
  attrs += ' role="button" tabindex="0"';
  attrs += ' aria-expanded="' + (expanded ? 'true' : 'false') + '"';
  attrs += ' aria-label="' + esc(aria + (expanded ? ' — collapse' : ' — expand details')) + '"';
  return '<div ' + attrs + '>' +
    '<div class="faculty-chip-title">' + esc(group.courseLabel) + '</div>' +
    '<div class="faculty-chip-line">' + esc(line2) + '</div>' +
    '</div>';
}

/**
 * Day-cell HTML: compressed groups, or expanded detail chips when opened.
 * @param {object} expandedMap keys are "date|groupKey"
 */
function dayCellChipsHtml(slots, cartIds, expandedMap, date) {
  cartIds = cartIds || {};
  expandedMap = expandedMap || {};
  date = date || '';
  var groups = groupSlots(slots);
  var html = '';
  groups.forEach(function (group) {
    var expandKey = date + '|' + group.key;
    var expanded = !!expandedMap[expandKey];
    var anySelected = group.slots.some(function (s) { return !!cartIds[s.slotId]; });
    if (!expanded) {
      html += compressedChipHtml(group, {
        date: date,
        selected: anySelected,
        expanded: false
      });
      return;
    }
    html += '<div class="faculty-chip-group-expanded" data-faculty-group="' + esc(group.key) +
      '" data-date="' + esc(date) + '">';
    group.slots.forEach(function (slot) {
      html += slotChipHtml(slot, { selected: !!cartIds[slot.slotId] });
    });
    html += '</div>';
  });
  return html;
}

export {
  kindClass,
  kindLabel,
  timeRange,
  formatHoursLabel,
  groupKeyForSlot,
  groupSlots,
  slotChipHtml,
  compressedChipHtml,
  dayCellChipsHtml
};
