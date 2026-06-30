/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.MakeupFinder = (function () {
  var pendingClinicalHint = null;
  var requiredClinicalMakeup = null;

  function requestClinicalMakeup(studentId) {
    requiredClinicalMakeup = { studentId: studentId };
    var studentSelect = document.getElementById('makeupStudentSelect');
    var typeSelect = document.getElementById('makeupTypeSelect');
    if (studentSelect) studentSelect.value = studentId;
    if (typeSelect) typeSelect.value = 'clinical';
    App.UI.switchTab('makeup');
  }

  function toggleSimSelect() {
    var isSim = document.getElementById('makeupTypeSelect').value === 'sim';
    document.getElementById('makeupSimSelect').classList.toggle('hidden', !isSim);
  }

  function slotBadges(slot) {
    var badges = [];
    if (slot.facilityJoin) {
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
    var btnClass = App.MakeupDisplay.applyButtonClass(slot);
    var btnLabel = slot.week18Fallback && type === 'sim'
      ? App.MakeupDisplay.week18ApplyLabel(slot, type)
      : App.MakeupDisplay.applyButtonLabel(slot);
    return '<button class="' + btnClass + '" data-idx="' + idx + '" data-student="' + sid + '" data-type="' + type + '">' + btnLabel + '</button>';
  }

  function render(data) {
    toggleSimSelect();

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

    var simNum = document.getElementById('makeupSimSelect').value;
    var slots = App.Scheduler.findMakeupSlots(data, sid, type, simNum);

    if (!slots.length) {
      if (type === 'sim') {
        var simNumInt = parseInt(simNum, 10) || 1;
        var existingSessions = App.Scheduler.getExistingSimSessions(data, simNumInt);
        var w18Slot = App.Scheduler.getWeek18SimMakeupSlot(data, sid, simNumInt);
        if (existingSessions.length === 0 && w18Slot) {
          results.innerHTML = hintHtml +
            '<p class="section-sub">No existing Sim ' + simNumInt + ' sessions in weeks 1–17. Week 18 mixed sim makeup is available as a last resort.</p>' +
            '<ul class="sim-day-list">' +
            '<li><span>Week 18 — ' + w18Slot.reason + slotBadges(w18Slot) + '</span>' +
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
      html += '<li><span>Week ' + slot.week + ' — ' + slot.reason + slotBadges(slot) + '</span>' +
        renderApplyButton(slot, sid, type, idx) + '</li>';
    });
    html += '</ul>';
    results.innerHTML = html;
    results._slots = slots;
  }

  function init() {
    document.getElementById('makeupStudentSelect').addEventListener('change', function () {
      if (requiredClinicalMakeup) requiredClinicalMakeup = null;
      App.UI.refresh();
    });
    document.getElementById('makeupTypeSelect').addEventListener('change', function () {
      if (requiredClinicalMakeup) requiredClinicalMakeup = null;
      App.UI.refresh();
    });
    document.getElementById('makeupSimSelect').addEventListener('change', function () { App.UI.refresh(); });
    document.getElementById('makeupResults').addEventListener('click', function (e) {
      var btn = e.target.closest('.apply-makeup');
      if (!btn) return;
      var results = document.getElementById('makeupResults');
      var slot = results._slots[parseInt(btn.dataset.idx, 10)];
      var applyType = btn.dataset.type;
      var applyResult = App.Scheduler.applyMakeupSlot(App.getData(), btn.dataset.student, slot, applyType);
      if (applyResult && applyResult.clinicalConflictApplied) {
        requestClinicalMakeup(btn.dataset.student);
        return;
      }
      if (applyType === 'clinical' && requiredClinicalMakeup && requiredClinicalMakeup.studentId === btn.dataset.student) {
        requiredClinicalMakeup = null;
      }
      App.UI.refresh();
    });
  }

  return { render: render, init: init, requestClinicalMakeup: requestClinicalMakeup };
})();
