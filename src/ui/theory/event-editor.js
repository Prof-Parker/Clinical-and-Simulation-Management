/**
 * Theory event editor — context-aware day / event modal.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import * as SkillPlacements from '../../core/skill-placements.js';
import * as CourseVisibility from '../../core/course-visibility.js';
import { uid } from '../../core/data-model/students.js';
import { notifyChange } from '../../core/state.js';
import { showDialog } from '../dialogs.js';
import { refresh } from '../chrome.js';
import * as Permissions from '../../auth/permissions.js';
import { sessionForWeekday } from './master-setup-sessions.js';
import { openNewTopicFlow, openNewSkillFlow } from './event-editor-library.js';
import {
  esc,
  escAttr,
  topicOptionsHtml,
  timeFields,
  lecturerFields,
  skillsFacultyFields,
  renderSkillsTopics
} from './event-editor-fields.js';
import {
  categoriesForTrack,
  saveFormToEvent as saveFormToEventImpl
} from './event-editor-save.js';

var editingEventId = null;
var guestExpanded = false;
var editorDefaultCourseCode = null;

export function openEventEditor(data, date, eventId, opts) {
  if (!Permissions.canAction('theory.edit') && !Permissions.canAction('*')) return;
  opts = opts || {};
  editorDefaultCourseCode = opts.defaultCourseCode || null;
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
    if (!saveFormToEvent(data, day)) return false;
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
      saveFormToEvent(data, day, { soft: true });
      var settings = theory.settings || {};
      var track = 'theory';
      var trackEl = document.getElementById('theoryEvTrack');
      if (trackEl) track = trackEl.value;
      var ev = blankEvent(track, settings, day.weekday, data);
      TheoryData.insertEventOnDay(day, ev);
      editingEventId = ev.id;
      TheoryData.renumberWeekModules(theory, day.weekLabel);
      renderEventList(theory, day);
      renderForm(data, day);
      notifyChange();
    };
  }
}

function blankEvent(track, settings, weekday, data) {
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
  var session = sessionForWeekday(settings, isSkills ? 'skills' : 'lecture', weekday);
  var courseCode = null;
  if (track !== 'holiday' && CourseVisibility.isThirdSemester(data && data.meta && data.meta.courseId)) {
    courseCode = editorDefaultCourseCode || 'REGN35';
  }
  return {
    id: uid(),
    track: track,
    title: isSkills ? 'Skills lab' : '',
    description: '',
    notes: '',
    moduleCode: null,
    moduleRef: null,
    moduleRefs: [],
    skillRefs: [],
    skillPlacements: [],
    timeStart: session.start,
    timeEnd: session.end,
    faculty: faculty,
    facultyRequired: isSkills ? required : null,
    contentArea: track === 'assignment' ? 'theory' : null,
    courseCode: courseCode,
    categories: categoriesForTrack(track),
    allDay: track === 'holiday'
  };
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
    var displayTitle = ev.track === 'skills'
      ? 'Skills lab'
      : (TheoryData.stripModuleTitlePrefix(ev.title) || ev.title || ev.track);
    var meta = [ev.moduleCode || '', ev.track, timeLabel, hoursLabel, fac].filter(Boolean).join(' · ');
    var active = ev.id === editingEventId ? ' theory-ev-row-active' : '';
    return '<div class="theory-ev-row config-list-row' + active + '" data-edit-id="' + escAttr(ev.id) + '">' +
      '<div class="theory-ev-row-main">' + esc(displayTitle) +
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
      saveFormToEvent(data, day, { soft: true });
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

  var isThird = CourseVisibility.isThirdSemester(data.meta && data.meta.courseId);
  var courseCode = ev.courseCode || editorDefaultCourseCode || (isThird ? 'REGN35' : null);

  var html = '<label>Track <select id="theoryEvTrack" class="select-control">' + trackOpts + '</select></label>';

  if (isThird && ev.track !== 'holiday') {
    var locked = !!editorDefaultCourseCode;
    if (locked) {
      html += '<input type="hidden" id="theoryEvCourseCode" value="' + escAttr(courseCode) + '">' +
        '<p class="section-sub">Course: <strong>' +
        esc(CourseVisibility.formatCourseBadge(courseCode)) + '</strong></p>';
    } else {
      html += '<label>Course <select id="theoryEvCourseCode" class="select-control">' +
        '<option value="REGN35"' + (courseCode === 'REGN35' ? ' selected' : '') + '>REGN 35</option>' +
        '<option value="REGN36"' + (courseCode === 'REGN36' ? ' selected' : '') + '>REGN 36</option>' +
        '</select></label>';
    }
  }

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
    html += '<label>Topic library <select id="theoryEvModuleRef" class="select-control"><option value="">—</option>' +
      topicOptionsHtml(ev.moduleRef, courseCode) + '</select></label>';
    html += '<p class="section-sub">Choose a topic from the content library. Use New Topic to add one.</p>';
    html += timeFields(ev, settings, false, day.weekday);
    html += lecturerFields(ev, settings, guestExpanded);
  } else if (ev.track === 'skills') {
    html += '<p class="section-sub"><strong>Skills lab</strong> — pick one or more skill activities from the library.</p>';
    html += '<div id="theoryEvSkillsTopics" class="theory-skills-topics"></div>';
    html += '<button type="button" class="btn btn-sm" id="theoryEvAddTopicBtn">Add skill</button>';
    html += timeFields(ev, settings, true, day.weekday);
    html += '<label>Skills lab note <input type="text" id="theoryEvNotes" class="select-control" value="' +
      escAttr(ev.notes || '') + '" aria-label="Skills lab note" placeholder="e.g. Bring skills kit"></label>';
    html += skillsFacultyFields(ev, settings);
  } else {
    html += '<label>Title <input type="text" id="theoryEvTitle" class="select-control" value="' +
      escAttr(ev.title || '') + '" aria-label="Event title"></label>';
    html += timeFields(ev, settings, false, day.weekday);
  }

  html += '<span id="theoryEvHoursHint" class="theory-ev-hours-hint text-muted" aria-live="polite"></span>';
  form.innerHTML = html;
  updateHoursHint();
  wireFormHandlers(data, day, ev);
  if (ev.track === 'skills') {
    renderSkillsTopics(ev, courseCode);
    wireSkillSelectHandlers(data, day);
  }
}

function openNewTopicFromForm(data, day) {
  openNewTopicFlow(data, day, editingEventId, function (d, dy) {
    saveFormToEvent(d, dy, { soft: true });
  }, openEventEditor);
}

function openNewSkillFromForm(data, day, skillIdx) {
  openNewSkillFlow(data, day, skillIdx, editingEventId, function (d, dy) {
    saveFormToEvent(d, dy, { soft: true });
  }, openEventEditor);
}

function wireSkillSelectHandlers(data, day) {
  document.querySelectorAll('.theory-skills-topic').forEach(function (sel) {
    sel.addEventListener('change', function () {
      if (sel.value === '__new__') {
        var idx = parseInt(sel.getAttribute('data-skill-idx'), 10) || 0;
        sel.value = '';
        openNewSkillFromForm(data, day, idx);
      }
    });
  });
}

function wireFormHandlers(data, day, ev) {
  var trackEl = document.getElementById('theoryEvTrack');
  if (trackEl) {
    trackEl.addEventListener('change', function () {
      saveFormToEvent(data, day, { soft: true });
      ev.track = trackEl.value;
      ev.categories = categoriesForTrack(ev.track);
      if (ev.track === 'assignment' && !ev.contentArea) ev.contentArea = 'theory';
      if (ev.track === 'skills') {
        ev.title = 'Skills lab';
        if (ev.facultyRequired == null) {
          ev.facultyRequired = (data.theory.settings && data.theory.settings.defaultSkillsFacultyRequired) || 2;
        }
      }
      applyTrackTimeDefaults(ev, data.theory.settings || {}, day.weekday);
      renderForm(data, day);
      renderEventList(data.theory, day);
    });
  }
  var startEl = document.getElementById('theoryEvStart');
  var endEl = document.getElementById('theoryEvEnd');
  if (startEl) startEl.addEventListener('input', updateHoursHint);
  if (endEl) endEl.addEventListener('input', updateHoursHint);
  var refEl = document.getElementById('theoryEvModuleRef');
  if (refEl) {
    refEl.addEventListener('change', function () {
      if (refEl.value === '__new__') {
        refEl.value = ev.moduleRef || '';
        openNewTopicFromForm(data, day);
        return;
      }
      if (!refEl.value) return;
      var topic = TheoryLibrary.getTopicById(refEl.value);
      if (topic) {
        ev.moduleRef = topic.id;
        ev.moduleRefs = [topic.id];
        ev.title = topic.title;
        renderEventList(data.theory, day);
      }
    });
  }
  var guestBtn = document.getElementById('theoryEvGuestBtn');
  if (guestBtn) {
    guestBtn.onclick = function () {
      saveFormToEvent(data, day, { soft: true });
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
      saveFormToEvent(data, day, { soft: true });
      (ev.faculty || []).forEach(TheoryData.clearFacultySlot);
      renderForm(data, day);
      renderEventList(data.theory, day);
    };
  }
  var reqEl = document.getElementById('theoryEvFacultyRequired');
  if (reqEl) {
    reqEl.addEventListener('change', function () {
      saveFormToEvent(data, day, { soft: true });
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
      saveFormToEvent(data, day, { soft: true });
      // Do not migrate here: normalizeSkillPlacement drops empty draft rows.
      if (!Array.isArray(ev.skillPlacements)) ev.skillPlacements = [];
      ev.skillPlacements.push({ skillId: '', kind: '' });
      ev.skillRefs = SkillPlacements.skillRefsFromPlacements(ev.skillPlacements);
      renderSkillsTopics(ev);
      wireSkillSelectHandlers(data, day);
    };
  }
}

function applyTrackTimeDefaults(ev, settings, weekday) {
  var session = sessionForWeekday(
    settings,
    ev.track === 'skills' ? 'skills' : 'lecture',
    weekday
  );
  if (ev.track === 'skills' || ev.track === 'theory' || ev.track === 'exam') {
    ev.timeStart = session.start;
    ev.timeEnd = session.end;
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
  var hours = TheoryData.instructionalHoursFromTimes(start, end);
  hint.textContent = hours > 0 ? hours.toFixed(2) + ' h' : '';
}

function saveFormToEvent(data, day, options) {
  return saveFormToEventImpl(data, day, currentEvent(day), {
    soft: options && options.soft,
    defaultCourseCode: editorDefaultCourseCode
  });
}
