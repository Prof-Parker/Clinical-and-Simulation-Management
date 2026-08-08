/**
 * Practicum clinical/sim faculty slot helpers (including Faculty Needed stub).
 * Future faculty-scheduling page can call listFacultyNeededSlots(data).
 */

import { FACULTY_NEEDED_NAME } from '../../core/theory-events.js';
import { escAttr } from './dom-utils.js';

export { FACULTY_NEEDED_NAME };

export function isFacultyNeeded(slot) {
  if (!slot) return false;
  return !!slot.needed || slot.name === FACULTY_NEEDED_NAME;
}

export function applyFacultySlotValue(slot, value) {
  if (!slot) return slot;
  var v = String(value || '').trim();
  if (v === '__needed__' || v === FACULTY_NEEDED_NAME) {
    slot.needed = true;
    slot.name = FACULTY_NEEDED_NAME;
  } else {
    slot.needed = false;
    slot.name = v;
  }
  return slot;
}

/** Stub for a future faculty-scheduling page. */
export function listFacultyNeededSlots(data) {
  var out = [];
  (data.faculty || []).forEach(function (f) {
    if (isFacultyNeeded(f)) {
      out.push({
        kind: 'clinical',
        id: f.id,
        clinicalGroup: f.clinicalGroup,
        name: FACULTY_NEEDED_NAME,
        needed: true
      });
    }
  });
  (data.simInstructors || []).forEach(function (f) {
    if (isFacultyNeeded(f)) {
      out.push({
        kind: 'sim',
        id: f.id,
        name: FACULTY_NEEDED_NAME,
        needed: true
      });
    }
  });
  return out;
}

function facultySlotInnerHtml(opts) {
  var needed = opts.needed;
  var nameVal = opts.nameVal;
  var listId = opts.listId;
  var slotAttr = opts.slotAttr;
  var nameAttr = opts.nameAttr;
  var idx = opts.idx;
  var ariaSelect = opts.ariaSelect;
  var ariaName = opts.ariaName;
  var placeholder = opts.placeholder;
  var mode = needed ? '__needed__' : (nameVal ? '__named__' : '');
  return '<div class="setup-faculty-slot">' +
    '<select ' + slotAttr + ' data-idx="' + idx + '" class="select-control setup-faculty-slot-select" ' +
    'aria-label="' + escAttr(ariaSelect) + '">' +
    '<option value=""' + (mode === '' ? ' selected' : '') + '>—</option>' +
    '<option value="__needed__"' + (mode === '__needed__' ? ' selected' : '') + '>Faculty needed</option>' +
    '<option value="__named__"' + (mode === '__named__' ? ' selected' : '') + '>Named faculty</option>' +
    '</select>' +
    '<input type="text" ' + nameAttr + ' data-idx="' + idx + '" list="' + listId + '" ' +
    'value="' + escAttr(nameVal) + '" placeholder="' + escAttr(placeholder) + '" autocomplete="off" ' +
    'aria-label="' + escAttr(ariaName) + '"' +
    (needed ? ' disabled class="setup-autofill-field"' : '') +
    '>' +
    '</div>';
}

export function clinicalFacultyRowHtml(f, i, listId) {
  var needed = isFacultyNeeded(f);
  var nameVal = needed ? '' : (f.name || '');
  return '<div class="setup-faculty-row">' +
    '<span class="setup-faculty-group">' + escAttr(f.clinicalGroup) + '</span>' +
    facultySlotInnerHtml({
      needed: needed,
      nameVal: nameVal,
      listId: listId,
      slotAttr: 'data-faculty="slot"',
      nameAttr: 'data-faculty="name"',
      idx: i,
      ariaSelect: 'Clinical faculty for ' + f.clinicalGroup,
      ariaName: 'Clinical faculty name for ' + f.clinicalGroup,
      placeholder: 'Search adjunct faculty name'
    }) +
    '</div>';
}

export function simInstructorRowHtml(f, i, listId) {
  var needed = isFacultyNeeded(f);
  var nameVal = needed ? '' : (f.name || '');
  return '<div class="config-list-row setup-faculty-row setup-sim-faculty-row">' +
    facultySlotInnerHtml({
      needed: needed,
      nameVal: nameVal,
      listId: listId,
      slotAttr: 'data-sim-instructor="slot"',
      nameAttr: 'data-sim-instructor="name"',
      idx: i,
      ariaSelect: 'Simulation instructor assignment',
      ariaName: 'Simulation instructor name',
      placeholder: 'Simulation instructor name'
    }) +
    '<button type="button" class="btn btn-icon-remove remove-sim-instructor" data-idx="' + i + '" ' +
    'aria-label="Remove simulation instructor" title="Remove simulation instructor">&times;</button>' +
    '</div>';
}
