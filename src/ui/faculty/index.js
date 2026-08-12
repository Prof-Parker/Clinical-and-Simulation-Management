/**
 * Faculty Schedule tab — browse, cart, requests, admin review, glance.
 */

import * as Permissions from '../../auth/permissions.js';
import * as UserSession from '../../auth/user-session.js';
import { showAlert } from '../dialogs.js';
import * as Browse from './browse.js';
import * as Cart from './cart.js';
import * as AdminReview from './admin-review.js';
import * as MyRequests from './my-requests.js';
import * as Glance from './glance.js';
import { downloadFacultyIcs } from '../../export/faculty-calendar-ics.js';
import { downloadFacultyPdf } from '../../export/faculty-calendar-pdf.js';

var panelState = {
  subtab: 'browse',
  /** @type {Object.<string, boolean>} keys: "ISO-date|course|kind|hours" */
  expandedGroups: {}
};

var outsideCollapseListener = null;

function clearOutsideCollapseListener() {
  if (!outsideCollapseListener) return;
  document.removeEventListener('click', outsideCollapseListener, true);
  outsideCollapseListener = null;
}

/**
 * Collapse expanded chip groups when clicking outside their day cell.
 */
function wireOutsideCollapse(refreshFn) {
  clearOutsideCollapseListener();
  if (!Object.keys(panelState.expandedGroups).length) return;
  outsideCollapseListener = function (e) {
    var body = document.getElementById('facultyScheduleBody');
    if (!body) {
      clearOutsideCollapseListener();
      return;
    }
    var expanded = body.querySelectorAll('.faculty-chip-group-expanded');
    if (!expanded.length) {
      clearOutsideCollapseListener();
      return;
    }
    for (var i = 0; i < expanded.length; i++) {
      var cell = expanded[i].closest('td.faculty-week-day');
      if (cell && cell.contains(e.target)) return;
    }
    panelState.expandedGroups = {};
    clearOutsideCollapseListener();
    refreshFn();
  };
  setTimeout(function () {
    document.addEventListener('click', outsideCollapseListener, true);
  }, 0);
}

function setSubtab(id) {
  panelState.subtab = id;
}

function subnavHtml() {
  var tabs = [
    { id: 'browse', label: 'Browse / Sign up' },
    { id: 'requests', label: 'My requests' },
    { id: 'glance', label: 'Semester at a glance' }
  ];
  if (Permissions.canAction('faculty.reviewSchedule')) {
    tabs.push({ id: 'admin', label: 'Admin review' });
  }
  return '<div class="faculty-subnav" role="tablist">' +
    tabs.map(function (t) {
      return '<button type="button" class="btn btn-sm faculty-subtab' +
        (panelState.subtab === t.id ? ' btn-primary' : '') +
        '" data-faculty-subtab="' + t.id + '">' + t.label + '</button>';
    }).join(' ') +
    '</div>';
}

function render(data) {
  var root = document.getElementById('facultyScheduleRoot');
  if (!root) return;
  if (!data) {
    root.innerHTML = '<p class="section-sub">Open a semester to use Faculty Schedule.</p>';
    return;
  }
  var session = UserSession.getSession();
  var html = '<div class="faculty-schedule-shell">' +
    '<header class="faculty-schedule-header">' +
    '<h2 class="section-title" style="margin-top:0">Faculty Schedule</h2>' +
    subnavHtml() +
    '</header>' +
    '<div id="facultyScheduleBody"></div></div>';
  root.innerHTML = html;
  renderBody(data, session);
  wireShell(data);
}

function renderBody(data, session) {
  clearOutsideCollapseListener();
  var body = document.getElementById('facultyScheduleBody');
  if (!body) return;
  if (panelState.subtab === 'admin') {
    body.innerHTML = AdminReview.panelHtml(data);
    AdminReview.wire(body, data, function () { render(data); });
    return;
  }
  if (panelState.subtab === 'requests') {
    body.innerHTML = MyRequests.myRequestsHtml(data);
    MyRequests.wire(body, data, function () { render(data); });
    return;
  }
  if (panelState.subtab === 'glance') {
    body.innerHTML = Glance.glanceHtml(data, session, panelState.expandedGroups);
    wireGlance(data, session);
    return;
  }
  // browse default
  var filters = Browse.readFilters(document.getElementById('facultyFilters'));
  // first paint: filters not in DOM yet — use defaults with showAll false
  if (!document.getElementById('facultyFilters')) {
    filters = { courseId: '', kind: '', siteId: '', weekday: '', showAll: false, openOnly: true };
  }
  var slots = Browse.visibleSlots(data, session, filters);
  var allForFilters = Browse.visibleSlots(data, session, {
    courseId: '', kind: '', siteId: '', weekday: '', showAll: true, openOnly: true
  });
  body.innerHTML =
    Browse.filtersHtml(allForFilters, filters) +
    '<div class="faculty-browse-layout">' +
    Browse.calendarHtml(data, slots, Cart.getCartIds(), panelState.expandedGroups) +
    Cart.cartPanelHtml(data) +
    '</div>';
  wireBrowse(data, session);
}

function wireShell(data) {
  var root = document.getElementById('facultyScheduleRoot');
  if (!root) return;
  root.querySelectorAll('[data-faculty-subtab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setSubtab(btn.getAttribute('data-faculty-subtab'));
      render(data);
    });
  });
}

function wireBrowse(data, session) {
  var body = document.getElementById('facultyScheduleBody');
  if (!body) return;
  function refreshBrowse() {
    panelState.subtab = 'browse';
    renderBody(data, session);
  }
  ['facultyFilterCourse', 'facultyFilterKind', 'facultyFilterSite',
    'facultyFilterWeekday', 'facultyFilterShowAll'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', refreshBrowse);
  });
  body.querySelectorAll('.faculty-slot-chip-compressed[data-faculty-group]').forEach(function (chip) {
    function onExpandGroup(e) {
      e.preventDefault();
      e.stopPropagation();
      var key = (chip.getAttribute('data-date') || '') + '|' +
        (chip.getAttribute('data-faculty-group') || '');
      panelState.expandedGroups[key] = true;
      refreshBrowse();
    }
    chip.addEventListener('click', onExpandGroup);
    chip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onExpandGroup(e);
      }
    });
  });
  body.querySelectorAll('.faculty-slot-chip[data-slot-id]').forEach(function (chip) {
    function onToggle() {
      if (!Permissions.canAction('faculty.selfSchedule') &&
          !Permissions.canAction('faculty.reviewSchedule')) {
        showAlert('Not permitted', 'Your role cannot self-schedule.');
        return;
      }
      Cart.toggleCart(chip.getAttribute('data-slot-id'));
      refreshBrowse();
    }
    chip.addEventListener('click', onToggle);
    chip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle();
      }
    });
  });
  body.querySelectorAll('[data-cart-remove]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      Cart.toggleCart(btn.getAttribute('data-cart-remove'));
      refreshBrowse();
    });
  });
  var submitBtn = document.getElementById('facultyCartSubmitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      Cart.submitCart(data, function () { render(data); });
    });
  }
  wireOutsideCollapse(refreshBrowse);
}

function wireGlance(data, session) {
  var body = document.getElementById('facultyScheduleBody');
  function refreshGlance() {
    panelState.subtab = 'glance';
    renderBody(data, session);
  }
  if (body) {
    body.querySelectorAll('.faculty-slot-chip-compressed[data-faculty-group]').forEach(function (chip) {
      function onExpandGroup(e) {
        e.preventDefault();
        e.stopPropagation();
        var key = (chip.getAttribute('data-date') || '') + '|' +
          (chip.getAttribute('data-faculty-group') || '');
        panelState.expandedGroups[key] = true;
        refreshGlance();
      }
      chip.addEventListener('click', onExpandGroup);
      chip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpandGroup(e);
        }
      });
    });
  }
  wireOutsideCollapse(refreshGlance);
  var icsBtn = document.getElementById('facultyExportIcsBtn');
  var pdfBtn = document.getElementById('facultyExportPdfBtn');
  if (icsBtn) {
    icsBtn.addEventListener('click', function () {
      if (!Permissions.canAction('faculty.export')) {
        showAlert('Not permitted', 'Your role cannot export faculty calendars.');
        return;
      }
      downloadFacultyIcs(data, session);
    });
  }
  if (pdfBtn) {
    pdfBtn.addEventListener('click', function () {
      if (!Permissions.canAction('faculty.export')) {
        showAlert('Not permitted', 'Your role cannot export faculty calendars.');
        return;
      }
      downloadFacultyPdf(data, session).catch(function (err) {
        showAlert('Export PDF', (err && err.message) || 'Could not export PDF');
      });
    });
  }
}

function init() {
  /* rendered on tab switch via chrome.refresh */
}

export {
  init,
  render,
  setSubtab
};
