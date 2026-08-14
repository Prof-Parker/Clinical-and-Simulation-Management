/**
 * Theory event editor — persist form DOM into the event object.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import * as SkillPlacements from '../../core/skill-placements.js';
import { showAlert } from '../dialogs.js';
import { sessionForWeekday } from './master-setup-sessions.js';

export function categoriesForTrack(track) {
  if (track === 'skills') return ['skills_lab'];
  if (track === 'theory') return ['lecture'];
  if (track === 'exam') return ['exam', 'lecture'];
  if (track === 'assignment') return ['assignment_due'];
  if (track === 'holiday') return [];
  return [];
}

/**
 * @param {{ soft?: boolean, defaultCourseCode?: string|null }} options
 *   soft=true skips required-field alerts (used when switching rows)
 * @returns {boolean} false when strict validation fails
 */
export function saveFormToEvent(data, day, ev, options) {
  options = options || {};
  if (!ev) return true;
  var trackEl = document.getElementById('theoryEvTrack');
  if (trackEl) ev.track = trackEl.value;
  var courseEl = document.getElementById('theoryEvCourseCode');
  if (courseEl) {
    ev.courseCode = courseEl.value || null;
  } else if (ev.track === 'holiday') {
    ev.courseCode = null;
  } else if (!ev.courseCode && options.defaultCourseCode) {
    ev.courseCode = options.defaultCourseCode;
  }
  var titleEl = document.getElementById('theoryEvTitle');
  if (titleEl) ev.title = titleEl.value.trim() || ev.track;
  var areaEl = document.getElementById('theoryEvContentArea');
  if (areaEl) ev.contentArea = areaEl.value;
  var notesEl = document.getElementById('theoryEvNotes');
  if (notesEl) ev.notes = notesEl.value.trim();
  var startEl = document.getElementById('theoryEvStart');
  var endEl = document.getElementById('theoryEvEnd');
  var settings = (data.theory && data.theory.settings) || {};
  var session = sessionForWeekday(
    settings,
    ev.track === 'skills' ? 'skills' : 'lecture',
    day.weekday
  );
  if (startEl) {
    ev.timeStart = ScheduleHours.timeInputToHhmm(startEl.value, session.start);
  }
  if (endEl) {
    ev.timeEnd = ScheduleHours.timeInputToHhmm(endEl.value, session.end);
  }
  var refEl = document.getElementById('theoryEvModuleRef');
  if (refEl && refEl.value !== '__new__') {
    ev.moduleRef = refEl.value || null;
    ev.moduleRefs = ev.moduleRef ? [ev.moduleRef] : [];
    if (ev.moduleRef) {
      var topic = TheoryLibrary.getTopicById(ev.moduleRef);
      if (topic) ev.title = topic.title;
    }
  }
  var topicSelects = document.querySelectorAll('.theory-skills-topic');
  if (topicSelects.length) {
    var placements = [];
    Array.prototype.forEach.call(topicSelects, function (sel) {
      var idx = parseInt(sel.getAttribute('data-skill-idx'), 10);
      if (isNaN(idx)) idx = placements.length;
      var skillId = sel.value === '__new__' ? '' : (sel.value || '');
      var kindSel = document.querySelector('.theory-skills-kind[data-skill-idx="' + idx + '"]');
      var kind = kindSel ? kindSel.value : '';
      if (!skillId) {
        // Soft saves keep empty draft rows so Add skill / track switches do not collapse UI.
        if (options.soft) placements.push({ skillId: '', kind: kind || '' });
        return;
      }
      var normalized = SkillPlacements.normalizeSkillPlacement({ skillId: skillId, kind: kind });
      if (normalized) placements.push(normalized);
    });
    ev.skillPlacements = placements;
    ev.skillRefs = SkillPlacements.skillRefsFromPlacements(placements);
    ev.description = SkillPlacements.formatSkillPlacementsDescription(placements, function (id) {
      var skill = TheoryLibrary.getSkillById(id);
      return skill ? skill.title : '';
    });
  }
  if (ev.track === 'skills') {
    ev.title = 'Skills lab';
  }
  if (!options.soft) {
    if (ev.track === 'theory' && !ev.moduleRef) {
      showAlert('Topic required', 'Select a topic from the content library, or choose New Topic.');
      return false;
    }
    if (ev.track === 'skills' && !(ev.skillRefs && ev.skillRefs.length)) {
      showAlert('Skill required', 'Select at least one skill activity from the library.');
      return false;
    }
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
  return true;
}
