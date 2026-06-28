/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.MakeupFinder = (function () {
  function toggleSimSelect() {
    var isSim = document.getElementById('makeupTypeSelect').value === 'sim';
    document.getElementById('makeupSimSelect').classList.toggle('hidden', !isSim);
  }

  function render(data) {
    toggleSimSelect();

    var select = document.getElementById('makeupStudentSelect');
    var prev = select.value;
    select.innerHTML = '<option value="">Select student...</option>';
    data.students.forEach(function (s) {
      select.innerHTML += '<option value="' + s.id + '">' + s.name + '</option>';
    });
    if (prev) select.value = prev;

    var results = document.getElementById('makeupResults');
    var sid = select.value;
    var type = document.getElementById('makeupTypeSelect').value;
    if (!sid) {
      results.innerHTML = '<p class="section-sub">Select a student and missed type to find makeup slots.</p>';
      return;
    }

    var simNum = document.getElementById('makeupSimSelect').value;
    var slots = App.Scheduler.findMakeupSlots(data, sid, type, simNum);
    if (!slots.length) {
      var hint = type === 'sim'
        ? 'No open sim sessions found for this simulation number. Try another Sim 1–5 or check session capacity (8 max, 9 via overload).'
        : 'No valid makeup clinical weeks found.';
      results.innerHTML = '<p class="section-sub">' + hint + '</p>';
      return;
    }

    var html = '<ul class="sim-day-list">';
    slots.forEach(function (slot, idx) {
      var btnLabel = slot.overload ? 'Apply Overload' : 'Apply';
      var btnClass = slot.overload ? 'btn btn-sm apply-makeup apply-overload' : 'btn btn-sm btn-primary apply-makeup';
      if (slot.clinicalConflict) btnClass = 'btn btn-sm apply-makeup apply-clinical-conflict';
      html += '<li><span>Week ' + slot.week + ' — ' + slot.reason + '</span>' +
        '<button class="' + btnClass + '" data-idx="' + idx + '" data-student="' + sid + '" data-type="' + type + '">' + btnLabel + '</button></li>';
    });
    html += '</ul>';
    results.innerHTML = html;
    results._slots = slots;
  }

  function init() {
    document.getElementById('makeupStudentSelect').addEventListener('change', function () { App.UI.refresh(); });
    document.getElementById('makeupTypeSelect').addEventListener('change', function () { App.UI.refresh(); });
    document.getElementById('makeupSimSelect').addEventListener('change', function () { App.UI.refresh(); });
    document.getElementById('makeupResults').addEventListener('click', function (e) {
      var btn = e.target.closest('.apply-makeup');
      if (!btn) return;
      var results = document.getElementById('makeupResults');
      var slot = results._slots[parseInt(btn.dataset.idx, 10)];
      App.Scheduler.applyMakeupSlot(App.getData(), btn.dataset.student, slot, btn.dataset.type);
      App.UI.refresh();
    });
  }

  return { render: render, init: init };
})();
