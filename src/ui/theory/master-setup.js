/**
 * Theory Master Calendar setup defaults panel.
 */

import { getData, getFileRoot, notifyChange } from '../../core/state.js';
import * as TheoryData from '../../core/theory-data.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import * as UserDirectory from '../../storage/user-directory.js';
import { uid } from '../../core/data-model/students.js';
import * as Permissions from '../../auth/permissions.js';
import { showAlert } from '../dialogs.js';
import { refresh } from '../chrome.js';

var WEEKDAY_OPTS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
var bound = false;

function canEdit() {
  return Permissions.canAction('theory.edit') || Permissions.canAction('*');
}

function facultyNameOptions() {
  var names = [];
  var seen = {};
  function add(name) {
    var n = String(name || '').trim();
    if (!n || seen[n]) return;
    seen[n] = true;
    names.push(n);
  }
  (UserDirectory.getLeadCourseFaculty() || []).forEach(function (u) { add(u.displayName); });
  (UserDirectory.getAdjunctFaculty() || []).forEach(function (u) { add(u.displayName); });
  return names;
}

function datalistHtml() {
  return facultyNameOptions().map(function (n) {
    return '<option value="' + escAttr(n) + '"></option>';
  }).join('');
}

function renderRoster(containerId, list) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var listId = containerId + 'Datalist';
  el.innerHTML = '<datalist id="' + listId + '">' + datalistHtml() + '</datalist>';
  (list || []).forEach(function (f, i) {
    el.innerHTML +=
      '<div class="config-list-row">' +
      '<input type="text" class="select-control" data-roster-idx="' + i + '" list="' + listId + '" ' +
      'value="' + escAttr(f.name || '') + '" placeholder="Faculty name" aria-label="Faculty name" autocomplete="off">' +
      '<button type="button" class="btn btn-icon-remove remove-roster-row" data-roster-idx="' + i + '" ' +
      'aria-label="Remove faculty" title="Remove faculty">&times;</button></div>';
  });
  el.innerHTML +=
    '<div class="config-list-add-row">' +
    '<button type="button" class="btn btn-sm add-roster-row">Add faculty</button></div>';
}

function collectRoster(containerId, keepEmpty) {
  var el = document.getElementById(containerId);
  if (!el) return [];
  var out = [];
  el.querySelectorAll('input[data-roster-idx]').forEach(function (input) {
    var name = input.value.trim();
    if (!name && !keepEmpty) return;
    out.push({ id: uid(), name: name });
  });
  return out;
}

function clampSkillsFacultyRequired(n) {
  if (isNaN(n)) return 2;
  return Math.max(0, Math.min(10, n));
}

/** Resize skills faculty roster to match the default required count. */
function resizeSkillsFaculty(list, count) {
  var next = (list || []).slice();
  var target = clampSkillsFacultyRequired(count);
  while (next.length < target) {
    next.push({ id: uid(), name: '' });
  }
  if (next.length > target) {
    // Prefer dropping empty trailing slots, then trim from the end.
    while (next.length > target) {
      var emptyIdx = -1;
      for (var i = next.length - 1; i >= 0; i--) {
        if (!String(next[i].name || '').trim()) {
          emptyIdx = i;
          break;
        }
      }
      if (emptyIdx >= 0) next.splice(emptyIdx, 1);
      else next.pop();
    }
  }
  return next;
}

function renderWeekdayChecks(settings) {
  var el = document.getElementById('theoryLectureWeekdays');
  if (!el) return;
  var selected = settings.lectureWeekdays || ['Wed', 'Thu'];
  el.innerHTML = WEEKDAY_OPTS.map(function (d) {
    var checked = selected.indexOf(d) >= 0 ? ' checked' : '';
    return '<label class="filter-check filter-check-compact">' +
      '<input type="checkbox" data-lecture-wd="' + d + '"' + checked + '> ' + d + '</label>';
  }).join('');
}

function fillSeedSemesterSelect(data) {
  var sel = document.getElementById('theoryModuleSeedSemester');
  if (!sel) return;
  var root = getFileRoot();
  var semesters = (root && root.semesters) || [];
  sel.innerHTML = '<option value="">Select semester…</option>';
  semesters.forEach(function (sem) {
    if (!sem || sem.id === data.id || !sem.theory) return;
    var label = (sem.meta && sem.meta.semesterName) || sem.id;
    sel.innerHTML += '<option value="' + escAttr(sem.id) + '">' + esc(label) + '</option>';
  });
}

export function render(data) {
  if (!data || !data.theory) return;
  var settings = data.theory.settings || {};
  renderWeekdayChecks(settings);
  var start = document.getElementById('theoryDefaultLectureStart');
  var end = document.getElementById('theoryDefaultLectureEnd');
  var sStart = document.getElementById('theoryDefaultSkillsStart');
  var sEnd = document.getElementById('theoryDefaultSkillsEnd');
  var req = document.getElementById('theoryDefaultSkillsFacultyRequired');
  if (start) start.value = ScheduleHours.hhmmToTimeInput(settings.defaultLectureStart || '0800');
  if (end) end.value = ScheduleHours.hhmmToTimeInput(settings.defaultLectureEnd || '1050');
  if (sStart) sStart.value = ScheduleHours.hhmmToTimeInput(settings.defaultSkillsStart || '1200');
  if (sEnd) sEnd.value = ScheduleHours.hhmmToTimeInput(settings.defaultSkillsEnd || '1550');
  var required = settings.defaultSkillsFacultyRequired != null ? settings.defaultSkillsFacultyRequired : 2;
  if (req) req.value = required;
  // Keep roster length in sync with the default required count (pad only; do not shrink on render).
  var skillsList = settings.skillsFaculty || [];
  if (skillsList.length < required) {
    settings.skillsFaculty = resizeSkillsFaculty(skillsList, required);
    skillsList = settings.skillsFaculty;
  }
  renderRoster('theoryFacultyRoster', settings.theoryFaculty || []);
  renderRoster('theorySkillsFacultyRoster', skillsList);
  fillSeedSemesterSelect(data);
  var pull = document.getElementById('theoryModuleSeedPull');
  var blank = document.getElementById('theoryModuleSeedBlank');
  var seedSel = document.getElementById('theoryModuleSeedSemester');
  if (seedSel) seedSel.disabled = !(pull && pull.checked);
  var showL = document.getElementById('theoryShowLecturers');
  var showP = document.getElementById('theoryShowPracticumFaculty');
  var showS = document.getElementById('theoryShowSkillsLabContent');
  if (showL) showL.checked = settings.showLecturers !== false;
  if (showP) showP.checked = settings.showPracticumFaculty !== false;
  if (showS) showS.checked = settings.showSkillsLabContent !== false;
}

export function collectInto(data) {
  if (!data || !data.theory || !data.theory.settings) return;
  var settings = data.theory.settings;
  var wds = [];
  document.querySelectorAll('#theoryLectureWeekdays [data-lecture-wd]').forEach(function (cb) {
    if (cb.checked) wds.push(cb.getAttribute('data-lecture-wd'));
  });
  if (wds.length) settings.lectureWeekdays = wds;
  var start = document.getElementById('theoryDefaultLectureStart');
  var end = document.getElementById('theoryDefaultLectureEnd');
  var sStart = document.getElementById('theoryDefaultSkillsStart');
  var sEnd = document.getElementById('theoryDefaultSkillsEnd');
  var req = document.getElementById('theoryDefaultSkillsFacultyRequired');
  if (start) settings.defaultLectureStart = ScheduleHours.timeInputToHhmm(start.value, '0800');
  if (end) settings.defaultLectureEnd = ScheduleHours.timeInputToHhmm(end.value, '1050');
  if (sStart) settings.defaultSkillsStart = ScheduleHours.timeInputToHhmm(sStart.value, '1200');
  if (sEnd) settings.defaultSkillsEnd = ScheduleHours.timeInputToHhmm(sEnd.value, '1550');
  if (req) {
    settings.defaultSkillsFacultyRequired = clampSkillsFacultyRequired(parseInt(req.value, 10));
  }
  settings.theoryFaculty = collectRoster('theoryFacultyRoster', false);
  // Keep empty slots so roster length stays aligned with defaultSkillsFacultyRequired.
  settings.skillsFaculty = resizeSkillsFaculty(
    collectRoster('theorySkillsFacultyRoster', true),
    settings.defaultSkillsFacultyRequired
  );
  var showL = document.getElementById('theoryShowLecturers');
  var showP = document.getElementById('theoryShowPracticumFaculty');
  var showS = document.getElementById('theoryShowSkillsLabContent');
  if (showL) settings.showLecturers = !!showL.checked;
  if (showP) settings.showPracticumFaculty = !!showP.checked;
  if (showS) settings.showSkillsLabContent = !!showS.checked;
}

function persistFromUi() {
  if (!canEdit()) return;
  var data = getData();
  if (!data || !data.theory) return;
  collectInto(data);
  notifyChange();
  refresh();
}

function isAdvancedOpen() {
  var panel = document.getElementById('theoryMasterSetup');
  return panel && !panel.classList.contains('hidden');
}

function setAdvancedOpen(open) {
  var panel = document.getElementById('theoryMasterSetup');
  var btn = document.getElementById('theoryAdvancedConfigBtn');
  if (!panel || !btn) return;
  panel.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.textContent = open ? 'Hide Advanced Configuration' : 'Advanced Configuration';
}

function toggleAdvanced() {
  setAdvancedOpen(!isAdvancedOpen());
  if (isAdvancedOpen()) {
    var panel = document.getElementById('theoryMasterSetup');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function saveSetup() {
  if (!canEdit()) {
    showAlert('Save Setup', 'You do not have permission to edit theory setup.');
    return;
  }
  var data = getData();
  if (!data || !data.theory) return;
  collectInto(data);
  notifyChange();
  refresh();
  showAlert('Saved', 'Theory setup saved.');
}

function applyTopicSeed() {
  if (!canEdit()) return;
  var data = getData();
  if (!data || !data.theory) return;
  var pull = document.getElementById('theoryModuleSeedPull');
  if (!pull || !pull.checked) {
    showAlert('Module topics', 'Leave blank is selected — no topics were copied.');
    return;
  }
  var sel = document.getElementById('theoryModuleSeedSemester');
  var root = getFileRoot();
  var source = root && root.semesters
    ? root.semesters.find(function (s) { return s.id === (sel && sel.value); })
    : null;
  if (!source || !source.theory) {
    showAlert('Module topics', 'Select a source semester that has theory calendar data.');
    return;
  }
  var result = TheoryData.seedTopicsFromTheory(data.theory, source.theory);
  notifyChange();
  refresh();
  showAlert('Module topics', 'Filled ' + result.filled + ' empty lecture slot(s) from the selected semester.');
}

export function init() {
  if (bound) return;
  bound = true;
  var setup = document.getElementById('theoryMasterSetup');
  if (setup) {
    setup.addEventListener('change', function (e) {
      if (e.target && (e.target.id === 'theoryModuleSeedPull' || e.target.id === 'theoryModuleSeedBlank')) {
        var seedSel = document.getElementById('theoryModuleSeedSemester');
        var pull = document.getElementById('theoryModuleSeedPull');
        if (seedSel) seedSel.disabled = !(pull && pull.checked);
        return;
      }
      if (e.target && (
        e.target.id === 'theoryShowLecturers' ||
        e.target.id === 'theoryShowPracticumFaculty' ||
        e.target.id === 'theoryShowSkillsLabContent'
      )) {
        persistFromUi();
        return;
      }
      if (e.target && e.target.id === 'theoryDefaultSkillsFacultyRequired') {
        if (!canEdit()) return;
        var dataReq = getData();
        if (!dataReq || !dataReq.theory) return;
        var n = clampSkillsFacultyRequired(parseInt(e.target.value, 10));
        e.target.value = n;
        dataReq.theory.settings.defaultSkillsFacultyRequired = n;
        dataReq.theory.settings.skillsFaculty = resizeSkillsFaculty(
          collectRoster('theorySkillsFacultyRoster', true),
          n
        );
        notifyChange();
        render(dataReq);
        return;
      }
      if (e.target.closest('#theoryMasterSetup')) persistFromUi();
    });
    setup.addEventListener('click', function (e) {
      var addBtn = e.target.closest('.add-roster-row');
      if (addBtn) {
        if (!canEdit()) return;
        var data = getData();
        var parent = addBtn.closest('#theoryFacultyRoster, #theorySkillsFacultyRoster');
        if (!parent) return;
        if (parent.id === 'theoryFacultyRoster') {
          data.theory.settings.theoryFaculty = collectRoster('theoryFacultyRoster', true);
          data.theory.settings.theoryFaculty.push({ id: uid(), name: '' });
        } else {
          var skills = collectRoster('theorySkillsFacultyRoster', true);
          if (skills.length >= 10) return;
          skills.push({ id: uid(), name: '' });
          data.theory.settings.skillsFaculty = skills;
          data.theory.settings.defaultSkillsFacultyRequired = clampSkillsFacultyRequired(skills.length);
        }
        notifyChange();
        render(data);
        return;
      }
      var rm = e.target.closest('.remove-roster-row');
      if (rm) {
        if (!canEdit()) return;
        var data2 = getData();
        var parent2 = rm.closest('#theoryFacultyRoster, #theorySkillsFacultyRoster');
        var idx = parseInt(rm.dataset.rosterIdx, 10);
        if (!parent2 || isNaN(idx)) return;
        if (parent2.id === 'theoryFacultyRoster') {
          data2.theory.settings.theoryFaculty = collectRoster('theoryFacultyRoster', true);
          data2.theory.settings.theoryFaculty.splice(idx, 1);
        } else {
          data2.theory.settings.skillsFaculty = collectRoster('theorySkillsFacultyRoster', true);
          data2.theory.settings.skillsFaculty.splice(idx, 1);
          data2.theory.settings.defaultSkillsFacultyRequired = clampSkillsFacultyRequired(
            data2.theory.settings.skillsFaculty.length
          );
        }
        notifyChange();
        render(data2);
      }
    });
  }
  var toolbar = document.getElementById('theoryMasterToolbar');
  if (toolbar) {
    toolbar.addEventListener('change', function (e) {
      if (e.target && (
        e.target.id === 'theoryShowLecturers' ||
        e.target.id === 'theoryShowPracticumFaculty' ||
        e.target.id === 'theoryShowSkillsLabContent'
      )) {
        persistFromUi();
      }
    });
  }
  var saveBtn = document.getElementById('theorySaveSetupBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveSetup);
  var advancedBtn = document.getElementById('theoryAdvancedConfigBtn');
  if (advancedBtn) advancedBtn.addEventListener('click', toggleAdvanced);
  var applyBtn = document.getElementById('theoryModuleSeedApplyBtn');
  if (applyBtn) applyBtn.addEventListener('click', applyTopicSeed);
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
