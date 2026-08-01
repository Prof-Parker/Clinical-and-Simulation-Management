/**
 * Makeup slot finder tab.
 */

import * as MakeupDisplay from '../core/makeup-display.js';
import * as Scheduler from '../core/scheduler/index.js';
import { getStudentClinicalDay } from '../core/scheduler/helpers.js';
import { getData, state } from '../core/state.js';
import { guardEditable } from '../auth/permissions.js';
import { showAlert } from './dialogs.js';
import { refresh, switchTab } from './chrome.js';

var pendingClinicalHint = null;
var requiredClinicalMakeup = null;
/** Set after a successful clinical apply; cleared when student/type changes. */
var lastClinicalApplyMessage = null;

function requestClinicalMakeup(studentId) {
  requiredClinicalMakeup = { studentId: studentId };
  lastClinicalApplyMessage = null;
  var studentSelect = document.getElementById('makeupStudentSelect');
  var typeSelect = document.getElementById('makeupTypeSelect');
  if (studentSelect) studentSelect.value = studentId;
  if (typeSelect) typeSelect.value = 'clinical';
  switchTab('makeup');
}

function toggleTypeSelects() {
  var type = document.getElementById('makeupTypeSelect').value;
  var isSim = type === 'sim';
  var sid = document.getElementById('makeupStudentSelect').value;
  var needMissedPick = type === 'clinical' &&
    !(requiredClinicalMakeup && requiredClinicalMakeup.studentId === sid);
  document.getElementById('makeupSimSelect').classList.toggle('hidden', !isSim);
  var missedEl = document.getElementById('makeupMissedClinicalSelect');
  if (missedEl) missedEl.classList.toggle('hidden', !needMissedPick);
}

function slotBadges(slot, type) {
  var badges = [];
  if (slot.facilityJoin && type !== 'clinical') {
    badges.push('<span class="makeup-badge makeup-badge-join">Join ' + (slot.day || '') + '</span>');
  }
  if (slot.overload) {
    badges.push('<span class="makeup-badge makeup-badge-overload">Overload</span>');
  }
  if (slot.clinicalConflict) {
    badges.push('<span class="makeup-badge makeup-badge-conflict">Clinical conflict — sim prioritized</span>');
  }
  if (slot.week18Fallback) {
    badges.push('<span class="makeup-badge makeup-badge-fallback">Week 18 — last resort / not preferred</span>');
  }
  return badges.length ? ' ' + badges.join(' ') : '';
}

function renderApplyButton(slot, sid, type, idx) {
  var btnClass = MakeupDisplay.applyButtonClass(slot);
  var btnLabel = slot.week18Fallback && type === 'sim'
    ? MakeupDisplay.week18ApplyLabel(slot, type)
    : MakeupDisplay.applyButtonLabel(slot);
  return '<button class="' + btnClass + '" data-idx="' + idx + '" data-student="' + sid +
    '" data-type="' + type + '">' + btnLabel + '</button>';
}

function slotRowLabel(data, slot, type) {
  var day = slot.day || '';
  var weekLabel = MakeupDisplay.formatWeekDayLabel(data, slot.weekIndex, day);
  return weekLabel + ' — ' + slot.reason + slotBadges(slot, type);
}

function populateMissedClinicalSelect(data, student) {
  var el = document.getElementById('makeupMissedClinicalSelect');
  if (!el) return;
  var prev = el.value;
  el.innerHTML = '<option value="">Select missed clinical…</option>';
  if (!student) return;
  var clinDay = getStudentClinicalDay(student, data.config);
  for (var wi = 0; wi < 18; wi++) {
    var cell = student.schedule[wi];
    if (!cell || !cell.clinical || cell.clinicalMissed) continue;
    var opt = document.createElement('option');
    opt.value = String(wi);
    opt.textContent = MakeupDisplay.formatWeekDayLabel(data, wi, clinDay);
    el.appendChild(opt);
  }
  if (prev && el.querySelector('option[value="' + prev + '"]')) el.value = prev;
}

function render(data) {
  toggleTypeSelects();

  var select = document.getElementById('makeupStudentSelect');
  var prev = select.value;
  select.innerHTML = '<option value="">Select student...</option>';
  data.students.forEach(function (s) {
    select.innerHTML += '<option value="' + s.id + '">' + s.name + '</option>';
  });

  if (requiredClinicalMakeup && requiredClinicalMakeup.studentId) {
    select.value = requiredClinicalMakeup.studentId;
    document.getElementById('makeupTypeSelect').value = 'clinical';
  } else if (prev) {
    select.value = prev;
  }

  var results = document.getElementById('makeupResults');
  var sid = select.value;
  var type = document.getElementById('makeupTypeSelect').value;
  var hintHtml = '';
  var student = sid ? data.students.find(function (s) { return s.id === sid; }) : null;

  populateMissedClinicalSelect(data, student);
  toggleTypeSelects();

  if (lastClinicalApplyMessage) {
    results.innerHTML = '<p class="makeup-hint makeup-hint-required">' + lastClinicalApplyMessage + '</p>';
    results._slots = [];
    return;
  }

  if (requiredClinicalMakeup && requiredClinicalMakeup.studentId === sid) {
    hintHtml = '<p class="makeup-hint makeup-hint-required">Clinical was marked missed due to simulation makeup. ' +
      'Schedule a makeup clinical now (facility join preferred; Week 18 last resort).</p>';
    type = 'clinical';
    document.getElementById('makeupTypeSelect').value = 'clinical';
  } else if (pendingClinicalHint && pendingClinicalHint.studentId === sid) {
    hintHtml = '<p class="makeup-hint makeup-hint-conflict">' + pendingClinicalHint.message + '</p>';
    document.getElementById('makeupTypeSelect').value = 'clinical';
    type = 'clinical';
    pendingClinicalHint = null;
  }

  if (!sid) {
    results.innerHTML = hintHtml || '<p class="section-sub">Select a student and missed type to find makeup slots.</p>';
    return;
  }

  var skipMissedPick = type === 'clinical' &&
    requiredClinicalMakeup && requiredClinicalMakeup.studentId === sid;
  var missedSelect = document.getElementById('makeupMissedClinicalSelect');
  var missedSelected = missedSelect && missedSelect.value !== '';
  if (type === 'clinical' && !skipMissedPick && !missedSelected) {
    results.innerHTML = hintHtml +
      '<p class="section-sub">Select the missed clinical week to see available makeup slots.</p>';
    results._slots = [];
    return;
  }

  var simNum = document.getElementById('makeupSimSelect').value;
  var slots = Scheduler.findMakeupSlots(data, sid, type, simNum);

  if (!slots.length) {
    if (type === 'sim') {
      var simNumInt = parseInt(simNum, 10) || 1;
      var existingSessions = Scheduler.getExistingSimSessions(data, simNumInt);
      var w18Slot = Scheduler.getWeek18SimMakeupSlot(data, sid, simNumInt);
      if (existingSessions.length === 0 && w18Slot) {
        results.innerHTML = hintHtml +
          '<p class="section-sub">No existing Sim ' + simNumInt + ' sessions in weeks 1–17. Week 18 mixed sim makeup is available as a last resort.</p>' +
          '<ul class="sim-day-list">' +
          '<li><span>' + slotRowLabel(data, w18Slot, 'sim') + '</span>' +
          renderApplyButton(w18Slot, sid, 'sim', 0) + '</li>' +
          '</ul>';
        results._slots = [w18Slot];
        return;
      }
      var emptyHint = existingSessions.length === 0
        ? (w18Slot
          ? 'No existing Sim sessions found for this simulation number (weeks 1–17).'
          : 'No existing Sim ' + simNumInt + ' sessions in weeks 1–17, and Week 18 is not available (week may be inactive or already scheduled).')
        : 'Existing Sim ' + simNumInt + ' sessions are at capacity (weeks 1–17). Week 18 is not available for this student.';
      results.innerHTML = hintHtml + '<p class="section-sub">' + emptyHint + '</p>';
      return;
    }
    var clinEmptyHint = requiredClinicalMakeup && requiredClinicalMakeup.studentId === sid
      ? 'No facility join slots are available at this student\'s oriented site (weeks 1–17). Week 18 makeup clinical will appear here only if no join slots exist.'
      : 'No facility join slots found at this student\'s oriented site (weeks 1–17). Week 18 makeup clinical is only offered when no join slots exist.';
    results.innerHTML = hintHtml + '<p class="section-sub">' + clinEmptyHint + '</p>';
    return;
  }

  var html = hintHtml;
  if (type === 'clinical') {
    html += '<p class="section-sub">Preferred: join an existing clinical at the student\'s facility. Week 18 appears only if no join slots are available. Purple = no conflict; orange = schedule conflict; red = last resort.</p>';
  } else {
    html += '<p class="section-sub">Sim makeup joins existing Sim sessions only (weeks 1–17). Purple = no conflict; orange = misses clinical; red = Week 18 last resort.</p>';
  }
  html += '<ul class="sim-day-list">';
  slots.forEach(function (slot, idx) {
    html += '<li><span>' + slotRowLabel(data, slot, type) + '</span>' +
      renderApplyButton(slot, sid, type, idx) + '</li>';
  });
  html += '</ul>';
  results.innerHTML = html;
  results._slots = slots;
}

function getAppliedByName() {
  var session = state.userSession;
  if (!session) return '';
  return String(session.name || '').trim();
}

function clearClinicalApplyMessage() {
  lastClinicalApplyMessage = null;
}

function init() {
  document.getElementById('makeupStudentSelect').addEventListener('change', function () {
    if (requiredClinicalMakeup) requiredClinicalMakeup = null;
    clearClinicalApplyMessage();
    refresh();
  });
  document.getElementById('makeupTypeSelect').addEventListener('change', function () {
    if (requiredClinicalMakeup) requiredClinicalMakeup = null;
    clearClinicalApplyMessage();
    refresh();
  });
  document.getElementById('makeupSimSelect').addEventListener('change', function () {
    clearClinicalApplyMessage();
    refresh();
  });
  var missedEl = document.getElementById('makeupMissedClinicalSelect');
  if (missedEl) {
    missedEl.addEventListener('change', function () {
      clearClinicalApplyMessage();
      refresh();
    });
  }
  document.getElementById('makeupResults').addEventListener('click', function (e) {
    var btn = e.target.closest('.apply-makeup');
    if (!btn) return;
    if (!guardEditable('makeup')) return;
    var results = document.getElementById('makeupResults');
    var slot = results._slots[parseInt(btn.dataset.idx, 10)];
    if (!slot) return;
    var applyType = btn.dataset.type;
    var studentId = btn.dataset.student;
    var data = getData();
    var missedWeekIndex = null;

    if (applyType === 'clinical') {
      var skipMissedPick = requiredClinicalMakeup && requiredClinicalMakeup.studentId === studentId;
      if (!skipMissedPick) {
        var missedSelect = document.getElementById('makeupMissedClinicalSelect');
        var raw = missedSelect ? missedSelect.value : '';
        if (raw === '' || raw == null) {
          showAlert('Select missed clinical', 'Choose which clinical week was missed before applying a makeup.');
          return;
        }
        missedWeekIndex = parseInt(raw, 10);
      }
    }

    var applyResult = Scheduler.applyMakeupSlot(
      data, studentId, slot, applyType, getAppliedByName(), missedWeekIndex
    );

    if (applyType === 'clinical' && !applyResult.applied) {
      showAlert('Could not apply', 'That makeup slot is no longer available (session may be at capacity).');
      return;
    }

    if (applyResult.clinicalConflictApplied) {
      requestClinicalMakeup(studentId);
      return;
    }

    if (applyType === 'clinical' && requiredClinicalMakeup &&
        requiredClinicalMakeup.studentId === studentId) {
      requiredClinicalMakeup = null;
    }

    if (applyType === 'clinical' && applyResult.applied) {
      var student = data.students.find(function (s) { return s.id === studentId; });
      var clinDay = student ? getStudentClinicalDay(student, data.config) : '';
      var missedLabel = applyResult.missedWeekIndex != null
        ? MakeupDisplay.formatWeekDayLabel(data, applyResult.missedWeekIndex, clinDay)
        : 'the selected clinical';
      var makeupDay = applyResult.makeupDay || slot.day || clinDay;
      var makeupLabel = MakeupDisplay.formatWeekDayLabel(
        data, applyResult.makeupWeekIndex, makeupDay
      );
      var msg = missedLabel + ' has been marked as missed and makeup day ' +
        makeupLabel + ' has been applied.';
      lastClinicalApplyMessage = msg;
      showAlert('Makeup applied', msg);
      refresh();
      return;
    }

    refresh();
  });
}

export {
  render,
  init,
  requestClinicalMakeup
};
