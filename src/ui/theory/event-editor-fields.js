/**
 * Theory event editor — form field HTML helpers.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import * as SkillPlacements from '../../core/skill-placements.js';
import * as UserDirectory from '../../storage/user-directory.js';
import { sessionForWeekday } from './master-setup-sessions.js';

export function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

export function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function topicOptionsHtml(selectedId, courseCode) {
  var topics = courseCode
    ? TheoryLibrary.listTopicsForCourse(courseCode)
    : TheoryLibrary.listTopics();
  var html = topics.map(function (t) {
    var sel = t.id === selectedId ? ' selected' : '';
    return '<option value="' + escAttr(t.id) + '"' + sel + '>' + esc(t.title) + '</option>';
  }).join('');
  html += '<option value="__new__">New Topic</option>';
  return html;
}

export function skillOptionsHtml(selectedId, courseCode) {
  var skills = courseCode
    ? TheoryLibrary.listSkillsForCourse(courseCode)
    : TheoryLibrary.listSkills();
  var html = skills.map(function (s) {
    var sel = s.id === selectedId ? ' selected' : '';
    return '<option value="' + escAttr(s.id) + '"' + sel + '>' + esc(s.title) + '</option>';
  }).join('');
  html += '<option value="__new__">New skill activity</option>';
  return html;
}

export function skillKindOptionsHtml(selectedKind) {
  var kind = selectedKind || '';
  var html = '<option value=""' + (kind === '' ? ' selected' : '') + '>—</option>';
  SkillPlacements.SKILL_KINDS.forEach(function (k) {
    html += '<option value="' + k + '"' + (kind === k ? ' selected' : '') + '>' +
      esc(SkillPlacements.skillKindLabel(k)) + '</option>';
  });
  return html;
}

export function rosterOptions(roster, selectedName, includeNeeded, includeAllFaculty) {
  var html = '<option value="">—</option>';
  if (includeNeeded) {
    html += '<option value="__needed__"' +
      (selectedName === TheoryData.FACULTY_NEEDED_NAME || !selectedName ? ' selected' : '') +
      '>Faculty needed</option>';
  }
  var seen = {};
  (roster || []).forEach(function (f) {
    if (!f.name || f.needed || f.name === TheoryData.FACULTY_NEEDED_NAME || seen[f.name]) return;
    seen[f.name] = true;
    html += '<option value="' + escAttr(f.name) + '"' +
      (f.name === selectedName ? ' selected' : '') + '>' + esc(f.name) + '</option>';
  });
  if (includeAllFaculty) {
    var all = [];
    (UserDirectory.getLeadCourseFaculty() || []).forEach(function (u) { all.push(u.displayName); });
    (UserDirectory.getAdjunctFaculty() || []).forEach(function (u) { all.push(u.displayName); });
    all.forEach(function (name) {
      if (!name || seen[name]) return;
      seen[name] = true;
      html += '<option value="' + escAttr(name) + '"' +
        (name === selectedName ? ' selected' : '') + '>' + esc(name) + ' (guest)</option>';
    });
  }
  return html;
}

export function timeFields(ev, settings, skills, weekday) {
  var session = sessionForWeekday(settings, skills ? 'skills' : 'lecture', weekday);
  var defStart = session.start;
  var defEnd = session.end;
  return '<div class="theory-ev-time-row">' +
    '<label>Start <input type="time" id="theoryEvStart" class="select-control" value="' +
    escAttr(ScheduleHours.hhmmToTimeInput(ev.timeStart || defStart)) +
    '" aria-label="Event start time"></label>' +
    '<label>End <input type="time" id="theoryEvEnd" class="select-control" value="' +
    escAttr(ScheduleHours.hhmmToTimeInput(ev.timeEnd || defEnd)) +
    '" aria-label="Event end time"></label>' +
    '</div>';
}

export function lecturerFields(ev, settings, guestExpanded) {
  var slot = (ev.faculty && ev.faculty[0]) || TheoryData.makeFacultySlot({ needed: true, role: 'lecturer' });
  var html = '<label>Lecturer <select id="theoryEvLecturer" class="select-control">' +
    rosterOptions(settings.theoryFaculty, slot.needed ? '' : slot.name, true, guestExpanded) +
    '</select></label> ';
  html += '<button type="button" class="btn btn-sm" id="theoryEvGuestBtn">' +
    (guestExpanded ? 'Course faculty only' : 'Guest lecturer') + '</button> ';
  html += '<button type="button" class="btn btn-sm" id="theoryEvClearFacultyBtn">Remove faculty (needed)</button>';
  return html;
}

export function skillsFacultyFields(ev, settings) {
  var required = ev.facultyRequired != null
    ? ev.facultyRequired
    : (settings.defaultSkillsFacultyRequired != null ? settings.defaultSkillsFacultyRequired : 2);
  var html = '<label>Faculty required <select id="theoryEvFacultyRequired" class="select-control">';
  for (var n = 0; n <= 10; n++) {
    html += '<option value="' + n + '"' + (n === required ? ' selected' : '') + '>' + n + '</option>';
  }
  html += '</select></label><div id="theoryEvSkillsFacultySlots" class="theory-skills-faculty-slots">';
  for (var i = 0; i < required; i++) {
    var slot = (ev.faculty && ev.faculty[i]) || TheoryData.makeFacultySlot({ needed: true, role: 'skills' });
    html += '<label>Faculty ' + (i + 1) + ' <select class="select-control theory-skills-fac-slot" data-slot="' + i + '">' +
      rosterOptions(settings.skillsFaculty, slot.needed ? '' : slot.name, true, false) +
      '</select></label> ';
  }
  html += '</div>';
  html += '<button type="button" class="btn btn-sm" id="theoryEvClearSkillsFacultyBtn">Clear assigned → needed</button>';
  return html;
}

export function renderSkillsTopics(ev) {
  var wrap = document.getElementById('theoryEvSkillsTopics');
  if (!wrap) return;
  SkillPlacements.migrateEventSkillPlacements(ev);
  var placements = (ev.skillPlacements && ev.skillPlacements.length)
    ? ev.skillPlacements.slice()
    : [{ skillId: '', kind: '' }];
  if (!placements.length) placements = [{ skillId: '', kind: '' }];
  wrap.innerHTML = placements.map(function (p, i) {
    var skillId = p && p.skillId ? p.skillId : '';
    var kind = p && p.kind ? p.kind : '';
    return '<div class="theory-skills-placement-row" data-skill-idx="' + i + '">' +
      '<label>Skill ' + (i + 1) + ' <select class="select-control theory-skills-topic" data-skill-idx="' + i + '">' +
      '<option value="">—</option>' + skillOptionsHtml(skillId) + '</select></label>' +
      '<label>Tag <select class="select-control theory-skills-kind" data-skill-idx="' + i + '" ' +
      'aria-label="Skill placement tag">' + skillKindOptionsHtml(kind) + '</select></label>' +
      '</div>';
  }).join('');
}
