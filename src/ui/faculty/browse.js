/**
 * Faculty schedule browse calendar + filters.
 */

import { escapeHtml } from '../dialogs.js';
import { listOpenSlots, filterSlots, listAllSlots } from '../../core/faculty-schedule/slot-inventory.js';
import { userCanSeeSlot } from '../../core/faculty-schedule/slot-rules.js';
import { slotChipHtml } from './chips.js';
import {
  FULL_WEEKDAYS,
  indexSlotsByDate,
  weekGridHtml
} from './week-grid.js';

function esc(s) {
  return escapeHtml(s == null ? '' : String(s));
}

function collectSites(slots) {
  var map = {};
  (slots || []).forEach(function (s) {
    if (!s.siteId && !s.facilityId) return;
    var id = s.siteId || s.facilityId;
    map[id] = s.siteLabel || id;
  });
  return Object.keys(map).map(function (id) {
    return { id: id, label: map[id] };
  }).sort(function (a, b) {
    return a.label < b.label ? -1 : 1;
  });
}

function readFilters(root) {
  if (!root) {
    return { courseId: '', kind: '', siteId: '', weekday: '', showAll: false, openOnly: true };
  }
  var course = root.querySelector('#facultyFilterCourse');
  var kind = root.querySelector('#facultyFilterKind');
  var site = root.querySelector('#facultyFilterSite');
  var weekday = root.querySelector('#facultyFilterWeekday');
  var showAll = root.querySelector('#facultyFilterShowAll');
  return {
    courseId: course ? course.value : '',
    kind: kind ? kind.value : '',
    siteId: site ? site.value : '',
    weekday: weekday ? weekday.value : '',
    showAll: !!(showAll && showAll.checked),
    openOnly: true
  };
}

function filtersHtml(slots, filters) {
  filters = filters || {};
  var sites = collectSites(slots);
  var courses = {};
  (slots || []).forEach(function (s) {
    if (s.courseId) courses[s.courseId] = s.courseLabel || s.courseId;
  });
  var courseOpts = Object.keys(courses).map(function (id) {
    return '<option value="' + esc(id) + '"' +
      (filters.courseId === id ? ' selected' : '') + '>' + esc(courses[id]) + '</option>';
  }).join('');
  var siteOpts = sites.map(function (s) {
    return '<option value="' + esc(s.id) + '"' +
      (filters.siteId === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>';
  }).join('');
  var dayOpts = FULL_WEEKDAYS.map(function (d) {
    return '<option value="' + esc(d) + '"' +
      (filters.weekday === d ? ' selected' : '') + '>' + esc(d) + '</option>';
  }).join('');
  return '<div class="filters faculty-schedule-filters" id="facultyFilters">' +
    '<select id="facultyFilterCourse" class="select-control" aria-label="Filter by course">' +
    '<option value="">All courses</option>' + courseOpts + '</select>' +
    '<select id="facultyFilterKind" class="select-control" aria-label="Filter by type">' +
    '<option value="">All types</option>' +
    '<option value="skills"' + (filters.kind === 'skills' ? ' selected' : '') + '>Skills lab</option>' +
    '<option value="clinical"' + (filters.kind === 'clinical' ? ' selected' : '') + '>Clinical</option>' +
    '<option value="sim"' + (filters.kind === 'sim' ? ' selected' : '') + '>Sim</option>' +
    '<option value="lecture"' + (filters.kind === 'lecture' ? ' selected' : '') + '>Lecture</option>' +
    '</select>' +
    '<select id="facultyFilterSite" class="select-control" aria-label="Filter by site">' +
    '<option value="">All sites</option>' + siteOpts + '</select>' +
    '<select id="facultyFilterWeekday" class="select-control" aria-label="Filter by day">' +
    '<option value="">All days</option>' + dayOpts + '</select>' +
    '<label class="filter-check filter-check-compact">' +
    '<input type="checkbox" id="facultyFilterShowAll"' +
    (filters.showAll ? ' checked' : '') + '> Show slots outside my specialties</label>' +
    '</div>';
}

/**
 * 18-week Sun–Sat signup grid (Master Calendar layout). Chips land on instance dates.
 */
function calendarHtml(semester, slots, cartIds) {
  cartIds = cartIds || {};
  var list = slots || [];
  var byDate = indexSlotsByDate(list);
  var emptyNote = !list.length
    ? '<p class="section-sub faculty-browse-empty">No open slots match the current filters.</p>'
    : '';

  var grid = weekGridHtml(semester, byDate, function (ctx) {
    var inner = '';
    (ctx.slots || []).forEach(function (slot) {
      inner += slotChipHtml(slot, { selected: !!cartIds[slot.slotId] });
    });
    return inner;
  });

  return '<section class="card faculty-browse-card" style="padding:1.25rem">' +
    '<p class="section-sub" style="margin-top:0">Sun–Sat week grid — open faculty slots by instructional week.</p>' +
    emptyNote +
    grid +
    '</section>';
}

function visibleSlots(semester, session, filters) {
  filters = filters || {};
  var all = filters.openOnly === false ? listAllSlots(semester) : listOpenSlots(semester);
  var filtered = filterSlots(all, filters);
  var specs = (session && session.specialties) || [];
  // No specialties configured → show all open slots (signup still validates tags).
  var showAll = !!filters.showAll || !specs.length;
  return filtered.filter(function (slot) {
    return userCanSeeSlot(slot, specs, showAll);
  });
}

export {
  FULL_WEEKDAYS as WEEKDAYS,
  readFilters,
  filtersHtml,
  calendarHtml,
  visibleSlots,
  collectSites
};
