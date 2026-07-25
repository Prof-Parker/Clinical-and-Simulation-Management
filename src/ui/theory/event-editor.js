/**
 * Theory event editor modal.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import { uid } from '../../core/data-model/students.js';
import { notifyChange } from '../../core/state.js';
import { showDialog } from '../dialogs.js';
import { refresh } from '../chrome.js';
import * as Permissions from '../../auth/permissions.js';

export function openEventEditor(data, date) {
  if (!Permissions.canAction('theory.edit') && !Permissions.canAction('*')) return;
  var theory = data.theory;
  var day = TheoryData.findDay(theory, date) || TheoryData.ensureDay(theory, data, date);
  var settings = (theory && theory.settings) || {};
  var topicOptions = TheoryLibrary.listTopics().map(function (t) {
    return '<option value="' + t.id + '">' + esc(t.title) + '</option>';
  }).join('');

  var body = '<p class="section-sub">' + date +
    ' <span class="text-muted">Module codes auto-assign (week + order)</span></p>' +
    '<div id="theoryEventList"></div>' +
    '<button type="button" class="btn btn-sm" id="theoryAddEventBtn">Add event</button>' +
    '<hr><div class="theory-ev-form">' +
    '<label>Track <select id="theoryEvTrack" class="select-control">' +
    TheoryData.THEORY_TRACKS.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') +
    '</select></label> ' +
    '<label>Title <input type="text" id="theoryEvTitle" class="select-control" ' +
    'placeholder="Topic title" aria-label="Event title"></label> ' +
    '<label>Topic <select id="theoryEvModuleRef" class="select-control"><option value="">—</option>' +
    topicOptions + '</select></label> ' +
    '<label>Start <input type="time" id="theoryEvStart" class="select-control" ' +
    'value="' + escAttr(ScheduleHours.hhmmToTimeInput(settings.defaultLectureStart || '0800')) + '" ' +
    'aria-label="Event start time"></label> ' +
    '<label>End <input type="time" id="theoryEvEnd" class="select-control" ' +
    'value="' + escAttr(ScheduleHours.hhmmToTimeInput(settings.defaultLectureEnd || '1050')) + '" ' +
    'aria-label="Event end time"></label> ' +
    '<span id="theoryEvHoursHint" class="theory-ev-hours-hint text-muted" aria-live="polite"></span>' +
    '</div>';

  showDialog('Edit day — ' + date, body, function () {
    TheoryData.renumberWeekModules(theory, day.weekLabel);
    notifyChange();
    refresh();
  });

  renderEventList(theory, day);
  wireTimeDefaults(settings);
  updateHoursHint();
  wireTopicSelect();
  var addBtn = document.getElementById('theoryAddEventBtn');
  if (addBtn) {
    addBtn.onclick = function () {
      var track = document.getElementById('theoryEvTrack').value;
      var title = document.getElementById('theoryEvTitle').value.trim();
      var moduleRef = document.getElementById('theoryEvModuleRef').value || null;
      if (!title && moduleRef) {
        var topic = TheoryLibrary.listTopics().find(function (t) { return t.id === moduleRef; });
        if (topic) title = topic.title;
      }
      if (!title) title = track;
      var timeStart = ScheduleHours.timeInputToHhmm(
        document.getElementById('theoryEvStart').value,
        settings.defaultLectureStart || '0800'
      );
      var timeEnd = ScheduleHours.timeInputToHhmm(
        document.getElementById('theoryEvEnd').value,
        settings.defaultLectureEnd || '1050'
      );
      day.events.push({
        id: uid(),
        track: track,
        title: title,
        description: '',
        moduleCode: null,
        moduleRef: moduleRef,
        timeStart: timeStart,
        timeEnd: timeEnd,
        faculty: [],
        categories: [track === 'skills' ? 'skills_lab' : 'lecture']
      });
      TheoryData.renumberWeekModules(theory, day.weekLabel);
      document.getElementById('theoryEvTitle').value = '';
      document.getElementById('theoryEvModuleRef').value = '';
      renderEventList(theory, day);
      notifyChange();
    };
  }
}

function wireTopicSelect() {
  var refEl = document.getElementById('theoryEvModuleRef');
  var titleEl = document.getElementById('theoryEvTitle');
  if (!refEl || !titleEl) return;
  refEl.addEventListener('change', function () {
    if (!refEl.value || titleEl.value.trim()) return;
    var topic = TheoryLibrary.listTopics().find(function (t) { return t.id === refEl.value; });
    if (topic) titleEl.value = topic.title;
  });
}

function wireTimeDefaults(settings) {
  var trackEl = document.getElementById('theoryEvTrack');
  var startEl = document.getElementById('theoryEvStart');
  var endEl = document.getElementById('theoryEvEnd');
  if (!trackEl || !startEl || !endEl) return;

  function applyTrackDefaults() {
    var track = trackEl.value;
    if (track === 'skills') {
      startEl.value = ScheduleHours.hhmmToTimeInput(settings.defaultSkillsStart || '1200');
      endEl.value = ScheduleHours.hhmmToTimeInput(settings.defaultSkillsEnd || '1550');
    } else if (track === 'theory') {
      startEl.value = ScheduleHours.hhmmToTimeInput(settings.defaultLectureStart || '0800');
      endEl.value = ScheduleHours.hhmmToTimeInput(settings.defaultLectureEnd || '1050');
    }
    updateHoursHint();
  }

  trackEl.addEventListener('change', applyTrackDefaults);
  startEl.addEventListener('change', updateHoursHint);
  endEl.addEventListener('change', updateHoursHint);
  startEl.addEventListener('input', updateHoursHint);
  endEl.addEventListener('input', updateHoursHint);
}

function updateHoursHint() {
  var hint = document.getElementById('theoryEvHoursHint');
  var startEl = document.getElementById('theoryEvStart');
  var endEl = document.getElementById('theoryEvEnd');
  if (!hint || !startEl || !endEl) return;
  var start = ScheduleHours.timeInputToHhmm(startEl.value, '');
  var end = ScheduleHours.timeInputToHhmm(endEl.value, '');
  var hours = TheoryData.hoursFromTimes(start, end);
  hint.textContent = hours > 0 ? hours.toFixed(2) + ' h' : '';
}

function renderEventList(theory, day) {
  var list = document.getElementById('theoryEventList');
  if (!list) return;
  list.innerHTML = (day.events || []).map(function (ev, idx) {
    var hours = TheoryData.eventContactHours(ev);
    var timeLabel = (ev.timeStart && ev.timeEnd)
      ? ScheduleHours.formatTimeRange(ev.timeStart, ev.timeEnd)
      : '';
    var hoursLabel = hours > 0 ? hours.toFixed(2) + ' h' : '';
    var moduleLabel = ev.moduleCode || '';
    var meta = [moduleLabel, ev.track, timeLabel, hoursLabel].filter(Boolean).join(' · ');
    return '<div class="theory-ev-row config-list-row">' +
      '<div class="theory-ev-row-main">' + esc(TheoryData.stripModuleTitlePrefix(ev.title) || ev.title) +
      (meta ? ' <span class="text-muted">(' + esc(meta) + ')</span>' : '') +
      '</div>' +
      '<button type="button" class="btn btn-icon-remove remove-theory-event" data-rm="' + idx + '" ' +
      'aria-label="Remove event" title="Remove event">&times;</button></div>';
  }).join('');
  list.querySelectorAll('[data-rm]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      day.events.splice(parseInt(btn.dataset.rm, 10), 1);
      TheoryData.renumberWeekModules(theory, day.weekLabel);
      renderEventList(theory, day);
      notifyChange();
    });
  });
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
