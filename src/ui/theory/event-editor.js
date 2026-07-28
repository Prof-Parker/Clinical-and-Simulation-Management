/**
 * Theory event editor — context-aware day / event modal.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import { uid } from '../../core/data-model/students.js';
import { notifyChange } from '../../core/state.js';
import { showDialog } from '../dialogs.js';
import { refresh } from '../chrome.js';
import * as Permissions from '../../auth/permissions.js';
import { requireLibraryUnlock, isLibraryUnlocked } from './content-library.js';
import {
  esc,
  escAttr,
  topicOptionsHtml,
  timeFields,
  lecturerFields,
  skillsFacultyFields,
  renderSkillsTopics
} from './event-editor-fields.js';

var editingEventId = null;
var guestExpanded = false;

export function openEventEditor(data, date, eventId) {
  if (!Permissions.canAction('theory.edit') && !Permissions.canAction('*')) return;
  var theory = data.theory;
  var day = TheoryData.findDay(theory, date) || TheoryData.ensureDay(theory, data, date);
  editingEventId = eventId || null;
  guestExpanded = false;

  var body =
    '<p class="section-sub">' + esc(date) +
    ' <span class="text-muted">Module codes auto-assign (week + order)</span></p>' +
    '<div id="theoryEventList"></div>' +
    '<button type="button" class="btn btn-sm" id="theoryAddEventBtn">Add event</button>' +
    '<hr><div id="theoryEvForm" class="theory-ev-form"></div>';

  showDialog(editingEventId ? 'Edit event — ' + date : 'Edit day — ' + date, body, function () {
    saveFormToEvent(data, day);
    TheoryData.renumberWeekModules(theory, day.weekLabel);
    TheoryData.refreshFacultyNeeded(theory);
    notifyChange();
    refresh();
  });
  var dialogContent = document.querySelector('#dialogModal .modal-content');
  if (dialogContent) dialogContent.style.maxWidth = '40rem';

  renderEventList(theory, day);
  renderForm(data, day);
  wireListClicks(data, day);
  var addBtn = document.getElementById('theoryAddEventBtn');
  if (addBtn) {
    addBtn.onclick = function () {
      saveFormToEvent(data, day);
      var settings = theory.settings || {};
      var track = 'theory';
      var trackEl = document.getElementById('theoryEvTrack');
      if (trackEl) track = trackEl.value;
      var ev = blankEvent(track, settings);
      TheoryData.insertEventOnDay(day, ev);
      editingEventId = ev.id;
      TheoryData.renumberWeekModules(theory, day.weekLabel);
      renderEventList(theory, day);
      renderForm(data, day);
      notifyChange();
    };
  }
}

function blankEvent(track, settings) {
  var isSkills = track === 'skills';
  var required = isSkills
    ? (settings.defaultSkillsFacultyRequired != null ? settings.defaultSkillsFacultyRequired : 2)
    : (track === 'theory' ? 1 : 0);
  var faculty = [];
  for (var i = 0; i < required; i++) {
    faculty.push(TheoryData.makeFacultySlot({
      needed: true,
      role: isSkills ? 'skills' : 'lecturer'
    }));
  }
  return {
    id: uid(),
    track: track,
    title: '',
    description: '',
    moduleCode: null,
    moduleRef: null,
    moduleRefs: [],
    skillRefs: [],
    timeStart: isSkills ? (settings.defaultSkillsStart || '1200') : (settings.defaultLectureStart || '0800'),
    timeEnd: isSkills ? (settings.defaultSkillsEnd || '1550') : (settings.defaultLectureEnd || '1050'),
    faculty: faculty,
    facultyRequired: isSkills ? required : null,
    contentArea: track === 'assignment' ? 'theory' : null,
    categories: categoriesForTrack(track),
    allDay: track === 'holiday'
  };
}

function categoriesForTrack(track) {
  if (track === 'skills') return ['skills_lab'];
  if (track === 'theory') return ['lecture'];
  if (track === 'exam') return ['exam', 'lecture'];
  if (track === 'assignment') return ['assignment_due'];
  if (track === 'holiday') return [];
  return [];
}

function currentEvent(day) {
  if (!editingEventId) return null;
  return (day.events || []).find(function (e) { return e.id === editingEventId; }) || null;
}

function renderEventList(theory, day) {
  var list = document.getElementById('theoryEventList');
  if (!list) return;
  list.innerHTML = (day.events || []).map(function (ev) {
    var hours = TheoryData.eventContactHours(ev);
    var timeLabel = (ev.timeStart && ev.timeEnd)
      ? ScheduleHours.formatTimeRange(ev.timeStart, ev.timeEnd)
      : (ev.allDay ? 'all day' : '');
    var hoursLabel = hours > 0 ? hours.toFixed(2) + ' h' : '';
    var fac = (ev.faculty || []).map(TheoryData.facultyDisplayName).filter(Boolean).join(', ');
    var meta = [ev.moduleCode || '', ev.track, timeLabel, hoursLabel, fac].filter(Boolean).join(' · ');
    var active = ev.id === editingEventId ? ' theory-ev-row-active' : '';
    return '<div class="theory-ev-row config-list-row' + active + '" data-edit-id="' + escAttr(ev.id) + '">' +
      '<div class="theory-ev-row-main">' + esc(TheoryData.stripModuleTitlePrefix(ev.title) || ev.title || ev.track) +
      (meta ? ' <span class="text-muted">(' + esc(meta) + ')</span>' : '') +
      '</div>' +
      '<button type="button" class="btn btn-icon-remove remove-theory-event" data-rm-id="' + escAttr(ev.id) + '" ' +
      'aria-label="Remove event" title="Remove event">&times;</button></div>';
  }).join('') || '<p class="text-muted">No events — click Add event.</p>';
}

function wireListClicks(data, day) {
  var list = document.getElementById('theoryEventList');
  if (!list || list.dataset.bound === '1') return;
  list.dataset.bound = '1';
  list.addEventListener('click', function (e) {
    var rm = e.target.closest('[data-rm-id]');
    if (rm) {
      var rid = rm.getAttribute('data-rm-id');
      day.events = (day.events || []).filter(function (ev) { return ev.id !== rid; });
      if (editingEventId === rid) editingEventId = null;
      TheoryData.renumberWeekModules(data.theory, day.weekLabel);
      TheoryData.refreshFacultyNeeded(data.theory);
      renderEventList(data.theory, day);
      renderForm(data, day);
      notifyChange();
      return;
    }
    var row = e.target.closest('[data-edit-id]');
    if (row) {
      saveFormToEvent(data, day);
      editingEventId = row.getAttribute('data-edit-id');
      guestExpanded = false;
      renderEventList(data.theory, day);
      renderForm(data, day);
    }
  });
}

function renderForm(data, day) {
  var form = document.getElementById('theoryEvForm');
  if (!form) return;
  var settings = (data.theory && data.theory.settings) || {};
  var ev = currentEvent(day);
  if (!ev) {
    form.innerHTML = '<p class="text-muted">Select an event to edit, or add a new one.</p>';
    return;
  }

  var trackOpts = TheoryData.THEORY_TRACKS.map(function (t) {
    return '<option value="' + t + '"' + (t === ev.track ? ' selected' : '') + '>' + t + '</option>';
  }).join('');

  var html = '<label>Track <select id="theoryEvTrack" class="select-control">' + trackOpts + '</select></label>';

  if (ev.track === 'assignment') {
    html += '<label>Title <input type="text" id="theoryEvTitle" class="select-control" value="' +
      escAttr(ev.title || '') + '" aria-label="Assignment title"></label>';
    html += '<label>Content area <select id="theoryEvContentArea" class="select-control">' +
      TheoryData.ASSIGNMENT_CONTENT_AREAS.map(function (a) {
        return '<option value="' + a + '"' + ((ev.contentArea || 'theory') === a ? ' selected' : '') + '>' +
          a + '</option>';
      }).join('') + '</select></label>';
  } else if (ev.track === 'exam') {
    html += '<label>Title <input type="text" id="theoryEvTitle" class="select-control" value="' +
      escAttr(ev.title || '') + '" aria-label="Exam title"></label>';
    html += '<p class="section-sub">Exams are linked to theory (lecture category).</p>';
  } else if (ev.track === 'holiday') {
    html += '<label>Title <input type="text" id="theoryEvTitle" class="select-control" value="' +
      escAttr(ev.title || '') + '" aria-label="Holiday title"></label>';
    html += '<p class="section-sub">Setup holidays sync automatically; manual holiday titles can override display.</p>';
  } else if (ev.track === 'theory') {
    html += '<div class="theory-ev-title-row">' +
      '<label>Title <input type="text" id="theoryEvTitle" class="select-control" value="' +
      escAttr(TheoryData.stripModuleTitlePrefix(ev.title) || ev.title || '') +
      '" aria-label="Topic title"></label>' +
      '<label class="filter-check filter-check-compact theory-ev-add-library">' +
      '<input type="checkbox" id="theoryEvAddToLibrary"> Add free-text title to topic library</label>' +
      '</div>';
    html += '<label>Topic library <select id="theoryEvModuleRef" class="select-control"><option value="">—</option>' +
      topicOptionsHtml(ev.moduleRef) + '</select></label>';
    html += timeFields(ev, settings, false);
    html += lecturerFields(ev, settings, guestExpanded);
  } else if (ev.track === 'skills') {
    html += '<label>Title <input type="text" id="theoryEvTitle" class="select-control" value="' +
      escAttr(ev.title || '') + '" aria-label="Skills lab title"></label>';
    html += '<div id="theoryEvSkillsTopics" class="theory-skills-topics"></div>';
    html += '<button type="button" class="btn btn-sm" id="theoryEvAddTopicBtn">Add skill</button>';
    html += timeFields(ev, settings, true);
    html += skillsFacultyFields(ev, settings);
  } else {
    html += '<label>Title <input type="text" id="theoryEvTitle" class="select-control" value="' +
      escAttr(ev.title || '') + '" aria-label="Event title"></label>';
    html += timeFields(ev, settings, false);
  }

  html += '<span id="theoryEvHoursHint" class="theory-ev-hours-hint text-muted" aria-live="polite"></span>';
  form.innerHTML = html;
  updateHoursHint();
  wireFormHandlers(data, day, ev);
  if (ev.track === 'skills') renderSkillsTopics(ev);
}

function wireFormHandlers(data, day, ev) {
  var trackEl = document.getElementById('theoryEvTrack');
  if (trackEl) {
    trackEl.addEventListener('change', function () {
      saveFormToEvent(data, day);
      ev.track = trackEl.value;
      ev.categories = categoriesForTrack(ev.track);
      if (ev.track === 'assignment' && !ev.contentArea) ev.contentArea = 'theory';
      if (ev.track === 'skills' && ev.facultyRequired == null) {
        ev.facultyRequired = (data.theory.settings && data.theory.settings.defaultSkillsFacultyRequired) || 2;
      }
      applyTrackTimeDefaults(ev, data.theory.settings || {});
      renderForm(data, day);
      renderEventList(data.theory, day);
    });
  }
  var startEl = document.getElementById('theoryEvStart');
  var endEl = document.getElementById('theoryEvEnd');
  if (startEl) startEl.addEventListener('input', updateHoursHint);
  if (endEl) endEl.addEventListener('input', updateHoursHint);
  var refEl = document.getElementById('theoryEvModuleRef');
  var titleEl = document.getElementById('theoryEvTitle');
  if (refEl && titleEl) {
    refEl.addEventListener('change', function () {
      if (!refEl.value || titleEl.value.trim()) return;
      var topic = TheoryLibrary.getTopicById(refEl.value);
      if (topic) titleEl.value = topic.title;
    });
  }
  var guestBtn = document.getElementById('theoryEvGuestBtn');
  if (guestBtn) {
    guestBtn.onclick = function () {
      saveFormToEvent(data, day);
      guestExpanded = !guestExpanded;
      renderForm(data, day);
    };
  }
  var clearBtn = document.getElementById('theoryEvClearFacultyBtn');
  if (clearBtn) {
    clearBtn.onclick = function () {
      ev.faculty = [TheoryData.makeFacultySlot({ needed: true, role: 'lecturer' })];
      renderForm(data, day);
      renderEventList(data.theory, day);
    };
  }
  var clearSkills = document.getElementById('theoryEvClearSkillsFacultyBtn');
  if (clearSkills) {
    clearSkills.onclick = function () {
      saveFormToEvent(data, day);
      (ev.faculty || []).forEach(TheoryData.clearFacultySlot);
      renderForm(data, day);
      renderEventList(data.theory, day);
    };
  }
  var reqEl = document.getElementById('theoryEvFacultyRequired');
  if (reqEl) {
    reqEl.addEventListener('change', function () {
      saveFormToEvent(data, day);
      var n = parseInt(reqEl.value, 10) || 0;
      ev.facultyRequired = n;
      while (ev.faculty.length < n) {
        ev.faculty.push(TheoryData.makeFacultySlot({ needed: true, role: 'skills' }));
      }
      ev.faculty = ev.faculty.slice(0, n);
      renderForm(data, day);
    });
  }
  var addTopicBtn = document.getElementById('theoryEvAddTopicBtn');
  if (addTopicBtn) {
    addTopicBtn.onclick = function () {
      saveFormToEvent(data, day);
      if (!ev.skillRefs) ev.skillRefs = [];
      ev.skillRefs.push('');
      renderSkillsTopics(ev);
    };
  }
  var addLibCb = document.getElementById('theoryEvAddToLibrary');
  if (addLibCb) {
    addLibCb.addEventListener('change', function () {
      if (!addLibCb.checked || isLibraryUnlocked()) return;
      addLibCb.checked = false;
      requireLibraryUnlock(function () {
        var el = document.getElementById('theoryEvAddToLibrary');
        if (el) el.checked = true;
      });
    });
  }
}

function applyTrackTimeDefaults(ev, settings) {
  if (ev.track === 'skills') {
    ev.timeStart = settings.defaultSkillsStart || '1200';
    ev.timeEnd = settings.defaultSkillsEnd || '1550';
  } else if (ev.track === 'theory' || ev.track === 'exam') {
    ev.timeStart = settings.defaultLectureStart || '0800';
    ev.timeEnd = settings.defaultLectureEnd || '1050';
  }
}

function updateHoursHint() {
  var hint = document.getElementById('theoryEvHoursHint');
  var startEl = document.getElementById('theoryEvStart');
  var endEl = document.getElementById('theoryEvEnd');
  if (!hint || !startEl || !endEl) {
    if (hint && (!startEl || !endEl)) hint.textContent = '';
    return;
  }
  var start = ScheduleHours.timeInputToHhmm(startEl.value, '');
  var end = ScheduleHours.timeInputToHhmm(endEl.value, '');
  var hours = TheoryData.hoursFromTimes(start, end);
  hint.textContent = hours > 0 ? hours.toFixed(2) + ' h' : '';
}

function saveFormToEvent(data, day) {
  var ev = currentEvent(day);
  if (!ev) return;
  var trackEl = document.getElementById('theoryEvTrack');
  if (trackEl) ev.track = trackEl.value;
  var titleEl = document.getElementById('theoryEvTitle');
  if (titleEl) ev.title = titleEl.value.trim() || ev.track;
  var areaEl = document.getElementById('theoryEvContentArea');
  if (areaEl) ev.contentArea = areaEl.value;
  var startEl = document.getElementById('theoryEvStart');
  var endEl = document.getElementById('theoryEvEnd');
  var settings = (data.theory && data.theory.settings) || {};
  if (startEl) {
    ev.timeStart = ScheduleHours.timeInputToHhmm(
      startEl.value,
      ev.track === 'skills' ? (settings.defaultSkillsStart || '1200') : (settings.defaultLectureStart || '0800')
    );
  }
  if (endEl) {
    ev.timeEnd = ScheduleHours.timeInputToHhmm(
      endEl.value,
      ev.track === 'skills' ? (settings.defaultSkillsEnd || '1550') : (settings.defaultLectureEnd || '1050')
    );
  }
  var refEl = document.getElementById('theoryEvModuleRef');
  if (refEl) {
    ev.moduleRef = refEl.value || null;
    ev.moduleRefs = ev.moduleRef ? [ev.moduleRef] : [];
  }
  var topicSelects = document.querySelectorAll('.theory-skills-topic');
  if (topicSelects.length) {
    ev.skillRefs = Array.prototype.map.call(topicSelects, function (sel) {
      return sel.value || '';
    }).filter(Boolean);
    ev.description = ev.skillRefs.map(function (id) {
      var skill = TheoryLibrary.getSkillById(id);
      return skill ? skill.title : '';
    }).filter(Boolean).join('; ');
  }
  var lect = document.getElementById('theoryEvLecturer');
  if (lect) {
    var val = lect.value;
    if (val === '__needed__' || !val) {
      ev.faculty = [TheoryData.makeFacultySlot({ needed: true, role: 'lecturer' })];
    } else {
      ev.faculty = [TheoryData.makeFacultySlot({ name: val, role: 'lecturer' })];
    }
  }
  var reqEl = document.getElementById('theoryEvFacultyRequired');
  if (reqEl) {
    ev.facultyRequired = parseInt(reqEl.value, 10) || 0;
    var slots = [];
    document.querySelectorAll('.theory-skills-fac-slot').forEach(function (sel) {
      var v = sel.value;
      if (v === '__needed__' || !v) slots.push(TheoryData.makeFacultySlot({ needed: true, role: 'skills' }));
      else slots.push(TheoryData.makeFacultySlot({ name: v, role: 'skills' }));
    });
    while (slots.length < ev.facultyRequired) {
      slots.push(TheoryData.makeFacultySlot({ needed: true, role: 'skills' }));
    }
    ev.faculty = slots.slice(0, ev.facultyRequired);
  }
  ev.categories = categoriesForTrack(ev.track);
  if (ev.track === 'holiday') ev.allDay = true;

  var addLib = document.getElementById('theoryEvAddToLibrary');
  if (addLib && addLib.checked && ev.title && TheoryLibrary.isReady()) {
    var applyTopic = function () {
      TheoryLibrary.addTopic(ev.title).then(function (topic) {
        if (topic && topic.id) {
          ev.moduleRef = topic.id;
          ev.moduleRefs = [topic.id];
        }
      });
    };
    if (isLibraryUnlocked()) applyTopic();
    else requireLibraryUnlock(applyTopic);
  }
}
