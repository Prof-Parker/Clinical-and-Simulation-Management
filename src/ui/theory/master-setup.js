/**
 * Theory Master Calendar setup defaults panel.
 */

import { getData, notifyChange } from '../../core/state.js';
import * as TheoryData from '../../core/theory-data.js';
import * as UserDirectory from '../../storage/user-directory.js';
import { uid } from '../../core/data-model/students.js';
import * as Permissions from '../../auth/permissions.js';
import { showAlert } from '../dialogs.js';
import { refresh } from '../chrome.js';
import {
  isFacultyNeeded,
  applyFacultySlotValue
} from '../setup/faculty-slots.js';
import {
  renderSessionList,
  collectSessions,
  migrateSessionsFromLegacy,
  defaultLectureSessions,
  defaultSkillsSessions
} from './master-setup-sessions.js';
import {
  fillSeedSemesterSelect,
  syncSeedControls,
  bindSeedPanel
} from './master-setup-seed.js';

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

function rosterSlotInnerHtml(f, i, listId) {
  var needed = isFacultyNeeded(f);
  var nameVal = needed ? '' : (f.name || '');
  var mode = needed ? '__needed__' : (nameVal ? '__named__' : '');
  return '<div class="setup-faculty-slot">' +
    '<select data-roster="slot" data-roster-idx="' + i + '" class="select-control setup-faculty-slot-select" ' +
    'aria-label="Faculty assignment">' +
    '<option value=""' + (mode === '' ? ' selected' : '') + '>—</option>' +
    '<option value="__needed__"' + (mode === '__needed__' ? ' selected' : '') + '>Faculty needed</option>' +
    '<option value="__named__"' + (mode === '__named__' ? ' selected' : '') + '>Named faculty</option>' +
    '</select>' +
    '<input type="text" data-roster="name" data-roster-idx="' + i + '" list="' + listId + '" ' +
    'value="' + escAttr(nameVal) + '" placeholder="Faculty name" autocomplete="off" ' +
    'aria-label="Faculty name"' +
    (needed ? ' disabled class="setup-autofill-field"' : '') +
    '>' +
    '</div>';
}

function renderRoster(containerId, list) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var listId = containerId + 'Datalist';
  el.innerHTML = '<datalist id="' + listId + '">' + datalistHtml() + '</datalist>';
  (list || []).forEach(function (f, i) {
    el.innerHTML +=
      '<div class="config-list-row setup-faculty-row theory-setup-faculty-row">' +
      rosterSlotInnerHtml(f, i, listId) +
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
  var byIdx = {};
  el.querySelectorAll('[data-roster-idx]').forEach(function (node) {
    var idx = parseInt(node.getAttribute('data-roster-idx'), 10);
    if (isNaN(idx)) return;
    if (!byIdx[idx]) byIdx[idx] = { id: uid(), name: '', needed: false };
    var field = node.getAttribute('data-roster');
    if (field === 'slot') {
      if (node.value === '__needed__') {
        byIdx[idx].needed = true;
        byIdx[idx].name = TheoryData.FACULTY_NEEDED_NAME;
      } else if (node.value === '__named__') {
        byIdx[idx].needed = false;
      } else {
        byIdx[idx].needed = false;
        byIdx[idx].name = '';
      }
    } else if (field === 'name' && !byIdx[idx].needed) {
      byIdx[idx].name = node.value.trim();
    }
  });
  var out = [];
  Object.keys(byIdx).sort(function (a, b) {
    return parseInt(a, 10) - parseInt(b, 10);
  }).forEach(function (k) {
    var row = byIdx[k];
    if (!keepEmpty && !row.needed && !row.name) return;
    out.push(row);
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
    next.push({ id: uid(), name: TheoryData.FACULTY_NEEDED_NAME, needed: true });
  }
  if (next.length > target) {
    while (next.length > target) {
      var emptyIdx = -1;
      for (var i = next.length - 1; i >= 0; i--) {
        if (!String(next[i].name || '').trim() || next[i].needed) {
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

function syncLegacyFromSessions(settings) {
  if (settings.lectureSessions && settings.lectureSessions.length) {
    settings.lectureWeekdays = settings.lectureSessions.map(function (s) { return s.weekday; });
    settings.defaultLectureStart = settings.lectureSessions[0].start;
    settings.defaultLectureEnd = settings.lectureSessions[0].end;
  }
  if (settings.skillsSessions && settings.skillsSessions.length) {
    settings.defaultSkillsStart = settings.skillsSessions[0].start;
    settings.defaultSkillsEnd = settings.skillsSessions[0].end;
  }
}

export function render(data) {
  if (!data || !data.theory) return;
  var settings = data.theory.settings || {};
  migrateSessionsFromLegacy(settings);
  renderSessionList('theoryLectureSessions', settings.lectureSessions, 'lecture');
  renderSessionList('theorySkillsSessions', settings.skillsSessions, 'skills');
  var req = document.getElementById('theoryDefaultSkillsFacultyRequired');
  var required = settings.defaultSkillsFacultyRequired != null ? settings.defaultSkillsFacultyRequired : 2;
  if (req) req.value = required;
  var skillsList = settings.skillsFaculty || [];
  if (skillsList.length < required) {
    settings.skillsFaculty = resizeSkillsFaculty(skillsList, required);
    skillsList = settings.skillsFaculty;
  }
  renderRoster('theoryFacultyRoster', settings.theoryFaculty || []);
  renderRoster('theorySkillsFacultyRoster', skillsList);
  fillSeedSemesterSelect(data);
  syncSeedControls();
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
  settings.lectureSessions = collectSessions('theoryLectureSessions', 'lecture');
  settings.skillsSessions = collectSessions('theorySkillsSessions', 'skills');
  if (!settings.lectureSessions.length) settings.lectureSessions = defaultLectureSessions();
  if (!settings.skillsSessions.length) settings.skillsSessions = defaultSkillsSessions();
  syncLegacyFromSessions(settings);
  var req = document.getElementById('theoryDefaultSkillsFacultyRequired');
  if (req) {
    settings.defaultSkillsFacultyRequired = clampSkillsFacultyRequired(parseInt(req.value, 10));
  }
  settings.theoryFaculty = collectRoster('theoryFacultyRoster', false);
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
  showAlert('Theory setup applied', 'Changes applied to this semester. Use Sync to OneDrive when ready.');
}

function resyncPracticum() {
  if (!canEdit()) {
    showAlert('Resync', 'You do not have permission to edit theory.');
    return;
  }
  var data = getData();
  if (!data || !data.theory) return;
  TheoryData.syncHolidaysFromSemester(data);
  TheoryData.syncPracticumFromSemester(data);
  notifyChange();
  refresh();
  showAlert(
    'Resync with practicum calendar',
    'Holidays/breaks, orientation days, and clinical/simulation sessions were refreshed from the practicum schedule onto the Master Calendar.'
  );
}

export function init() {
  if (bound) return;
  bound = true;
  var setup = document.getElementById('theoryMasterSetup');
  if (setup) {
    bindSeedPanel(setup, collectInto);
    setup.addEventListener('change', function (e) {
      if (e.target && (
        e.target.id === 'theoryModuleSeedPull' ||
        e.target.id === 'theoryModuleSeedBlank' ||
        e.target.id === 'theoryModuleSeedSessions' ||
        e.target.id === 'theoryModuleSeedFullImport' ||
        e.target.id === 'theoryModuleSeedSemester'
      )) {
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
      var slotSel = e.target.closest('[data-roster="slot"]');
      if (slotSel) {
        if (!canEdit()) return;
        var dataSlot = getData();
        var parentSlot = slotSel.closest('#theoryFacultyRoster, #theorySkillsFacultyRoster');
        if (!parentSlot || !dataSlot || !dataSlot.theory) return;
        var idxSlot = parseInt(slotSel.getAttribute('data-roster-idx'), 10);
        var listKey = parentSlot.id === 'theoryFacultyRoster' ? 'theoryFaculty' : 'skillsFaculty';
        var list = collectRoster(parentSlot.id, true);
        var row = list[idxSlot] || { id: uid(), name: '', needed: false };
        if (slotSel.value === '__needed__') {
          applyFacultySlotValue(row, '__needed__');
        } else if (slotSel.value === '__named__') {
          row.needed = false;
          if (row.name === TheoryData.FACULTY_NEEDED_NAME) row.name = '';
        } else {
          row.needed = false;
          row.name = '';
        }
        list[idxSlot] = row;
        dataSlot.theory.settings[listKey] = list;
        notifyChange();
        render(dataSlot);
        return;
      }
      if (e.target.closest('#theoryMasterSetup')) persistFromUi();
    });
    setup.addEventListener('click', function (e) {
      var addSession = e.target.closest('.add-session-row');
      if (addSession) {
        if (!canEdit()) return;
        var dataS = getData();
        if (!dataS || !dataS.theory) return;
        collectInto(dataS);
        var kind = addSession.getAttribute('data-session-kind');
        var key = kind === 'skills' ? 'skillsSessions' : 'lectureSessions';
        var sessions = dataS.theory.settings[key] || [];
        sessions.push(kind === 'skills'
          ? { weekday: 'Fri', start: '1200', end: '1550' }
          : { weekday: 'Wed', start: '0800', end: '1050' });
        dataS.theory.settings[key] = sessions;
        syncLegacyFromSessions(dataS.theory.settings);
        notifyChange();
        render(dataS);
        return;
      }
      var rmSession = e.target.closest('.remove-session-row');
      if (rmSession) {
        if (!canEdit()) return;
        var dataRm = getData();
        if (!dataRm || !dataRm.theory) return;
        collectInto(dataRm);
        var kindRm = rmSession.getAttribute('data-session-kind');
        var keyRm = kindRm === 'skills' ? 'skillsSessions' : 'lectureSessions';
        var idxRm = parseInt(rmSession.getAttribute('data-session-idx'), 10);
        var listRm = dataRm.theory.settings[keyRm] || [];
        if (listRm.length <= 1 || isNaN(idxRm)) return;
        listRm.splice(idxRm, 1);
        dataRm.theory.settings[keyRm] = listRm;
        syncLegacyFromSessions(dataRm.theory.settings);
        notifyChange();
        render(dataRm);
        return;
      }
      var addBtn = e.target.closest('.add-roster-row');
      if (addBtn) {
        if (!canEdit()) return;
        var data = getData();
        var parent = addBtn.closest('#theoryFacultyRoster, #theorySkillsFacultyRoster');
        if (!parent) return;
        if (parent.id === 'theoryFacultyRoster') {
          data.theory.settings.theoryFaculty = collectRoster('theoryFacultyRoster', true);
          data.theory.settings.theoryFaculty.push({
            id: uid(),
            name: TheoryData.FACULTY_NEEDED_NAME,
            needed: true
          });
        } else {
          var skills = collectRoster('theorySkillsFacultyRoster', true);
          if (skills.length >= 10) return;
          skills.push({ id: uid(), name: TheoryData.FACULTY_NEEDED_NAME, needed: true });
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
  var resyncBtn = document.getElementById('theoryResyncPracticumBtn');
  if (resyncBtn) resyncBtn.addEventListener('click', resyncPracticum);
  var advancedBtn = document.getElementById('theoryAdvancedConfigBtn');
  if (advancedBtn) advancedBtn.addEventListener('click', toggleAdvanced);
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
