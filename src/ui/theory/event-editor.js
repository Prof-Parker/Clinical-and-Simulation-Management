/**
 * Theory event editor modal.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import { uid } from '../../core/data-model/students.js';
import { getData, notifyChange } from '../../core/state.js';
import { showDialog } from '../dialogs.js';
import { refresh } from '../chrome.js';
import * as Permissions from '../../auth/permissions.js';

export function openEventEditor(data, date) {
  if (!Permissions.canAction('theory.edit') && !Permissions.canAction('*')) return;
  var theory = data.theory;
  var day = TheoryData.findDay(theory, date) || TheoryData.ensureDay(theory, data, date);
  var topicOptions = TheoryLibrary.listTopics().map(function (t) {
    return '<option value="' + t.id + '">' + esc(t.title) + '</option>';
  }).join('');

  var body = '<p class="section-sub">' + date + '</p><div id="theoryEventList"></div>' +
    '<button type="button" class="btn btn-sm" id="theoryAddEventBtn">Add event</button>' +
    '<hr><label>Track <select id="theoryEvTrack" class="select-control">' +
    TheoryData.THEORY_TRACKS.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') +
    '</select></label> ' +
    '<label>Title <input type="text" id="theoryEvTitle" class="select-control"></label> ' +
    '<label>Module <input type="text" id="theoryEvModule" placeholder="1A" size="4"></label> ' +
    '<label>Topic <select id="theoryEvModuleRef" class="select-control"><option value="">—</option>' +
    topicOptions + '</select></label>';

  showDialog('Edit day — ' + date, body, function () {
    notifyChange();
    refresh();
  });

  renderEventList(day);
  var addBtn = document.getElementById('theoryAddEventBtn');
  if (addBtn) {
    addBtn.onclick = function () {
      var track = document.getElementById('theoryEvTrack').value;
      var title = document.getElementById('theoryEvTitle').value.trim();
      if (!title) title = track;
      day.events.push({
        id: uid(),
        track: track,
        title: title,
        description: '',
        moduleCode: document.getElementById('theoryEvModule').value.trim() || null,
        moduleRef: document.getElementById('theoryEvModuleRef').value || null,
        timeStart: '0800',
        timeEnd: '1050',
        faculty: [],
        categories: [track === 'skills' ? 'skills_lab' : 'lecture']
      });
      renderEventList(day);
      notifyChange();
    };
  }
}

function renderEventList(day) {
  var list = document.getElementById('theoryEventList');
  if (!list) return;
  list.innerHTML = (day.events || []).map(function (ev, idx) {
    return '<div class="theory-ev-row">' + esc(ev.title) + ' (' + ev.track + ')' +
      ' <button type="button" class="btn btn-sm btn-danger" data-rm="' + idx + '">Remove</button></div>';
  }).join('');
  list.querySelectorAll('[data-rm]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      day.events.splice(parseInt(btn.dataset.rm, 10), 1);
      renderEventList(day);
      notifyChange();
    });
  });
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
