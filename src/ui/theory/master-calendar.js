/**
 * Master Calendar view (Sun–Sat grid).
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import { formatDisplayDate } from '../../core/calendar-engine.js';
import { openEventEditor } from './event-editor.js';

var WEEK_COLS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function trackClass(track) {
  return 'theory-track theory-track-' + (track || 'other');
}

export function render(data) {
  var grid = document.getElementById('theoryMasterGrid');
  if (!grid || !data.theory) return;
  var theory = data.theory;
  var byWeek = {};
  (theory.days || []).forEach(function (day) {
    var wl = day.weekLabel || 1;
    if (!byWeek[wl]) byWeek[wl] = {};
    byWeek[wl][day.weekday] = day;
  });

  var html = '<div class="theory-master-wrap"><table class="data-table theory-master-table"><thead><tr>' +
    '<th>Week</th>' + WEEK_COLS.map(function (d) { return '<th>' + d + '</th>'; }).join('') + '</tr></thead><tbody>';

  for (var w = 1; w <= 18; w++) {
    html += '<tr><td class="theory-week-label">Wk ' + w + '</td>';
    WEEK_COLS.forEach(function (wd) {
      var day = byWeek[w] && byWeek[w][wd];
      var date = (day && day.date) || TheoryData.dateForWeekdayInWeek(data, w - 1, wd) || '';
      html += '<td class="theory-day-cell" data-date="' + date + '">';
      if (date) {
        html += '<div class="theory-day-date">' + formatDisplayDate(date) + '</div>';
      }
      if (day) {
        (day.events || []).forEach(function (ev) {
          // Simulation is shown on Coordinator from the practicum scheduler only.
          if (ev.track === 'simulation') return;
          html += '<div class="' + trackClass(ev.track) + '" data-event-id="' + ev.id + '">' +
            '<strong>' + esc(ev.title || ev.track) + '</strong>';
          if (ev.timeStart) html += '<div class="theory-ev-time">' + ev.timeStart + '–' + (ev.timeEnd || '') + '</div>';
          html += '</div>';
        });
      }
      html += '</td>';
    });
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  grid.innerHTML = html;

  grid.querySelectorAll('.theory-day-cell').forEach(function (cell) {
    cell.addEventListener('click', function () {
      var date = cell.dataset.date;
      if (!date) return;
      openEventEditor(data, date);
    });
  });

  renderTopicLibraryPanel();
}

export function renderTopicLibraryPanel() {
  var prompt = document.getElementById('theoryLibraryConnectPrompt');
  var status = document.getElementById('theoryLibraryStatus');
  var ready = TheoryLibrary.isReady();
  if (prompt) prompt.classList.toggle('hidden', ready);
  if (status) {
    if (ready) {
      status.textContent = 'Connected: ' + TheoryLibrary.getConnectionLabel();
      status.classList.remove('hidden');
    } else {
      status.textContent = '';
      status.classList.add('hidden');
    }
  }
  renderTopicLibraryList();
}

function renderTopicLibraryList() {
  var list = document.getElementById('theoryTopicLibraryList');
  if (!list) return;
  var topics = TheoryLibrary.listTopics();
  if (!topics.length) {
    list.innerHTML = '<li class="text-muted">Connect theory content library to see topics.</li>';
    return;
  }
  list.innerHTML = topics.map(function (t) {
    return '<li><span class="theory-topic-ref">' + esc(t.moduleRef || '—') + '</span> ' +
      esc(t.title) + '</li>';
  }).join('');
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
