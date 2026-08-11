/**
 * Faculty schedule slot chip HTML (reuses coordinator color classes).
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

function kindLabel(kind) {
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

/**
 * Compact chip for calendar cells / browse lists.
 */
function slotChipHtml(slot, opts) {
  opts = opts || {};
  var selected = !!opts.selected;
  var openCount = slot.openCount != null ? slot.openCount : (slot.open ? 1 : 0);
  var title = (slot.courseLabel || slot.courseId || '') + ' ' + kindLabel(slot.kind);
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

export {
  kindClass,
  kindLabel,
  timeRange,
  slotChipHtml
};
