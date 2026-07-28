/**
 * Master Calendar view (Sun–Sat grid).
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import { formatDisplayDate } from '../../core/calendar-engine.js';
import { notifyChange } from '../../core/state.js';
import * as Permissions from '../../auth/permissions.js';
import { openEventEditor } from './event-editor.js';
import { render as renderSetup } from './master-setup.js';
import { render as renderContentLibrary } from './content-library.js';
import { refresh } from '../chrome.js';

var WEEK_COLS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var dragEventId = null;
var suppressClick = false;

function clinicalFacultyName(data, group) {
  var f = (data.faculty || []).find(function (x) { return x.clinicalGroup === group; });
  return f && f.name ? f.name : '';
}

function eventFacultyNames(data, ev, settings) {
  var showLecturers = settings.showLecturers !== false;
  var showPracticum = settings.showPracticumFaculty !== false;
  var parts = [];
  if (ev.track === 'theory' || ev.track === 'exam') {
    if (showLecturers) {
      (ev.faculty || []).forEach(function (slot) {
        parts.push(TheoryData.facultyDisplayName(slot));
      });
    }
  } else if (ev.track === 'skills' || ev.track === 'simulation' || ev.track === 'clinical' || ev.track === 'orientation') {
    if (showPracticum) {
      (ev.faculty || []).forEach(function (slot) {
        parts.push(TheoryData.facultyDisplayName(slot));
      });
      if (ev.track === 'simulation' && (!ev.faculty || !ev.faculty.length)) {
        (data.simInstructors || []).forEach(function (s) {
          if (s.name) parts.push(s.name);
        });
      }
      if (ev.track === 'clinical' && (!ev.faculty || !ev.faculty.length) && ev.groups && ev.groups[0]) {
        var cn = clinicalFacultyName(data, ev.groups[0]);
        if (cn) parts.push(cn);
      }
    }
  }
  return parts.filter(Boolean);
}

function renderFacultyBlock(data, ev, settings) {
  var names = eventFacultyNames(data, ev, settings);
  if (!names.length) return '';
  if (TheoryData.isPracticumTrackEvent(ev)) {
    return '<ol class="theory-ev-faculty theory-ev-faculty-list">' +
      names.map(function (name) {
        return '<li>' + esc(name) + '</li>';
      }).join('') +
      '</ol>';
  }
  return '<div class="theory-ev-faculty">' + esc(names.join(', ')) + '</div>';
}

function eventSkillsLabTopics(ev) {
  var titles = [];
  var seen = {};
  function add(title) {
    var t = String(title || '').trim();
    if (!t || seen[t.toLowerCase()]) return;
    seen[t.toLowerCase()] = true;
    titles.push(t);
  }
  (ev.skillRefs || []).forEach(function (id) {
    var skill = TheoryLibrary.getSkillById(id);
    if (skill) add(skill.title);
  });
  if (!titles.length && ev.description) {
    String(ev.description).split(/[;|]/).forEach(function (part) { add(part); });
  }
  return titles;
}

function renderSkillsLabContent(ev, settings) {
  if (ev.track !== 'skills' || settings.showSkillsLabContent === false) return '';
  var topics = eventSkillsLabTopics(ev);
  if (!topics.length) return '';
  return '<ul class="theory-ev-skills-content">' +
    topics.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
    '</ul>';
}

function renderEventChip(data, ev, settings) {
  var html = '<div class="' + TheoryData.trackCssClass(ev) + '" data-event-id="' + ev.id + '" draggable="true">' +
    '<strong>' + esc(ev.title || ev.track) + '</strong>';
  if (ev.timeStart) {
    html += '<div class="theory-ev-time">' + ev.timeStart + '–' + (ev.timeEnd || '') + '</div>';
  }
  html += renderSkillsLabContent(ev, settings);
  html += renderFacultyBlock(data, ev, settings);
  html += '</div>';
  return html;
}

export function render(data) {
  renderSetup(data);
  var grid = document.getElementById('theoryMasterGrid');
  if (!grid || !data.theory) return;
  var theory = data.theory;
  var settings = theory.settings || {};
  var byWeek = {};
  (theory.days || []).forEach(function (day) {
    var wl = day.weekLabel || 1;
    if (!byWeek[wl]) byWeek[wl] = {};
    byWeek[wl][day.weekday] = day;
  });

  var html = '<div class="theory-master-wrap"><table class="data-table theory-master-table"><thead><tr>' +
    '<th>Week</th>' + WEEK_COLS.map(function (d) { return '<th>' + d + '</th>'; }).join('') + '</tr></thead><tbody>';

  for (var w = 1; w <= 18; w++) {
    var dayMeta = WEEK_COLS.map(function (wd) {
      var day = byWeek[w] && byWeek[w][wd];
      var date = (day && day.date) || TheoryData.dateForWeekdayInWeek(data, w - 1, wd) || '';
      var theoryHtml = '';
      var practicumHtml = '';
      if (day) {
        (day.events || []).forEach(function (ev) {
          var chip = renderEventChip(data, ev, settings);
          if (TheoryData.isPracticumTrackEvent(ev)) practicumHtml += chip;
          else theoryHtml += chip;
        });
      }
      return { wd: wd, day: day, date: date, theoryHtml: theoryHtml, practicumHtml: practicumHtml };
    });

    // Theory band row — height shared across the week so the divider aligns.
    html += '<tr class="theory-week-theory-row">';
    html += '<td class="theory-week-label" rowspan="3">Wk ' + w + '</td>';
    dayMeta.forEach(function (meta) {
      html += '<td class="theory-day-cell theory-day-theory-cell" data-date="' + meta.date + '">';
      if (meta.date) {
        html += '<div class="theory-day-date">' + formatDisplayDate(meta.date) + '</div>';
      }
      html += '<div class="theory-day-theory-band">' + meta.theoryHtml + '</div></td>';
    });
    html += '</tr>';

    // Continuous week divider (one cell spanning all day columns).
    html += '<tr class="theory-week-divider-row" aria-hidden="true">' +
      '<td colspan="' + WEEK_COLS.length + '" class="theory-week-divider-cell">' +
      '<div class="theory-week-divider"></div></td></tr>';

    // Practicum band row.
    html += '<tr class="theory-week-practicum-row">';
    dayMeta.forEach(function (meta) {
      html += '<td class="theory-day-cell theory-day-practicum-cell" data-date="' + meta.date + '">' +
        '<div class="theory-day-practicum-band">' + meta.practicumHtml + '</div></td>';
    });
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  grid.innerHTML = html;

  grid.querySelectorAll('.theory-day-cell').forEach(function (cell) {
    cell.addEventListener('click', function (e) {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      var date = cell.dataset.date;
      if (!date) return;
      var chip = e.target.closest('[data-event-id]');
      if (chip) {
        openEventEditor(data, date, chip.getAttribute('data-event-id'));
        return;
      }
      openEventEditor(data, date);
    });
    cell.addEventListener('dragover', function (e) {
      e.preventDefault();
      cell.classList.add('theory-day-drop-target');
    });
    cell.addEventListener('dragleave', function () {
      cell.classList.remove('theory-day-drop-target');
    });
    cell.addEventListener('drop', function (e) {
      e.preventDefault();
      cell.classList.remove('theory-day-drop-target');
      if (!Permissions.canAction('theory.edit') && !Permissions.canAction('*')) return;
      var toDate = cell.dataset.date;
      var eventId = dragEventId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (!toDate || !eventId) return;
      if (TheoryData.moveEventToDate(theory, data, eventId, toDate)) {
        suppressClick = true;
        notifyChange();
        refresh();
      }
      dragEventId = null;
    });
  });

  grid.querySelectorAll('[data-event-id]').forEach(function (chip) {
    chip.addEventListener('dragstart', function (e) {
      dragEventId = chip.getAttribute('data-event-id');
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', dragEventId);
        e.dataTransfer.effectAllowed = 'move';
      }
      chip.classList.add('theory-track-dragging');
    });
    chip.addEventListener('dragend', function () {
      chip.classList.remove('theory-track-dragging');
      dragEventId = null;
    });
  });

  renderTopicLibraryPanel();
}

export function renderTopicLibraryPanel() {
  renderContentLibrary();
}
