/**
 * Faculty schedule browse calendar + filters.
 */

import { escapeHtml } from '../dialogs.js';
import { listOpenSlots, filterSlots, listAllSlots } from '../../core/faculty-schedule/slot-inventory.js';
import { userCanSeeSlot } from '../../core/faculty-schedule/slot-rules.js';
import { listBands } from '../../core/faculty-schedule/program-bands.js';
import { slotChipHtml } from './chips.js';

var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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
  var dayOpts = WEEKDAYS.map(function (d) {
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

function slotsForWeekday(slots, weekday) {
  var wd = String(weekday).toLowerCase();
  return (slots || []).filter(function (slot) {
    if (String(slot.weekday || '').toLowerCase() === wd) return true;
    return (slot.instances || []).some(function (inst) {
      return String(inst.weekday || '').toLowerCase() === wd;
    });
  });
}

function calendarHtml(slots, cartIds) {
  cartIds = cartIds || {};
  var bands = listBands();
  var byBand = {};
  bands.forEach(function (b) { byBand[b.id] = []; });
  byBand[0] = [];
  (slots || []).forEach(function (s) {
    var id = s.bandId || 0;
    if (!byBand[id]) byBand[id] = [];
    byBand[id].push(s);
  });

  var html = '<div class="faculty-browse-calendar custom-scrollbar">' +
    '<table class="data-table faculty-browse-table">' +
    '<thead><tr><th>Band</th>' +
    WEEKDAYS.map(function (d) { return '<th>' + esc(d) + '</th>'; }).join('') +
    '</tr></thead><tbody>';

  bands.concat([{ id: 0, label: 'Other' }]).forEach(function (band) {
    var bandSlots = byBand[band.id] || [];
    if (!bandSlots.length && band.id === 0) return;
    if (!bandSlots.length) {
      // still show empty band row when course matches that band elsewhere? skip empty
      return;
    }
    html += '<tr><td class="faculty-band-label">' + esc(band.label) + '</td>';
    WEEKDAYS.forEach(function (wd) {
      html += '<td class="faculty-browse-day">';
      slotsForWeekday(bandSlots, wd).forEach(function (slot) {
        html += slotChipHtml(slot, { selected: !!cartIds[slot.slotId] });
      });
      html += '</td>';
    });
    html += '</tr>';
  });

  if (html.indexOf('<tr>') < 0) {
    html += '<tr><td colspan="6" class="text-muted">No open slots match the current filters.</td></tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

function visibleSlots(semester, session, filters) {
  filters = filters || {};
  var all = filters.openOnly === false ? listAllSlots(semester) : listOpenSlots(semester);
  var filtered = filterSlots(all, filters);
  var specs = (session && session.specialties) || [];
  return filtered.filter(function (slot) {
    return userCanSeeSlot(slot, specs, !!filters.showAll);
  });
}

export {
  WEEKDAYS,
  readFilters,
  filtersHtml,
  calendarHtml,
  visibleSlots,
  collectSites
};
