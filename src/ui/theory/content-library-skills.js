/**
 * Skills bank list + editor UI for the theory content library panel.
 */

import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import { showAlert, showDialog, escapeHtml } from '../dialogs.js';

function linesToList(text) {
  return String(text || '')
    .split(/\r?\n|;/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

function listToLines(arr) {
  return (arr || []).join('\n');
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function learningObjectivesHtml(objectives) {
  if (!objectives || !objectives.length) return '';
  return '<ol class="theory-learning-objectives">' +
    objectives.map(function (line) {
      return '<li>' + esc(line) + '</li>';
    }).join('') +
    '</ol>';
}

function skillTestoutFieldsHtml(s) {
  var requires = !!s.requiresTestout;
  var testoutN = s.recommendedTestoutCount != null ? s.recommendedTestoutCount : 1;
  var practiceN = s.recommendedPracticeCount != null ? s.recommendedPracticeCount : 0;
  return '<div class="theory-lib-testout-group">' +
    '<label class="filter-check filter-check-compact">' +
    '<input type="checkbox" id="libSkillRequiresTestout"' + (requires ? ' checked' : '') + '> ' +
    'Requires testout</label>' +
    '<p class="section-sub">When checked, recommend at least one Intro and one Testout placement on the master calendar. Tag Intro / Practice / Testout on each skills-lab event.</p>' +
    '<div id="libSkillTestoutRecs" class="theory-lib-testout-recs' + (requires ? '' : ' hidden') + '">' +
    '<label>Recommended testout days <input type="number" id="libSkillRecTestout" class="select-control" ' +
    'min="1" max="30" step="1" value="' + escAttr(testoutN) + '" aria-label="Recommended testout days"></label>' +
    '<label>Recommended practice days <input type="number" id="libSkillRecPractice" class="select-control" ' +
    'min="0" max="30" step="1" value="' + escAttr(practiceN) + '" aria-label="Recommended practice days"></label>' +
    '</div></div>';
}

function readSkillTestoutFromForm() {
  var requiresEl = document.getElementById('libSkillRequiresTestout');
  var requires = !!(requiresEl && requiresEl.checked);
  var testoutEl = document.getElementById('libSkillRecTestout');
  var practiceEl = document.getElementById('libSkillRecPractice');
  var testoutN = testoutEl ? parseInt(testoutEl.value, 10) : 1;
  var practiceN = practiceEl ? parseInt(practiceEl.value, 10) : 0;
  if (!isFinite(testoutN) || testoutN < 1) testoutN = 1;
  if (!isFinite(practiceN) || practiceN < 0) practiceN = 0;
  return {
    requiresTestout: requires,
    recommendedTestoutCount: requires ? testoutN : 0,
    recommendedPracticeCount: requires ? practiceN : 0
  };
}

function wireSkillTestoutToggle() {
  var requiresEl = document.getElementById('libSkillRequiresTestout');
  var recs = document.getElementById('libSkillTestoutRecs');
  if (!requiresEl || !recs) return;
  requiresEl.addEventListener('change', function () {
    recs.classList.toggle('hidden', !requiresEl.checked);
  });
}

/**
 * @param {object|null} skill
 * @param {{ onSaved?: function }} opts
 * @param {function} onRender — parent panel re-render
 */
export function openSkillEditor(skill, opts, onRender) {
  opts = opts || {};
  var isNew = !skill;
  var s = skill || {
    title: '',
    description: '',
    kinds: [],
    requiresTestout: false,
    recommendedTestoutCount: 1,
    recommendedPracticeCount: 0,
    learningObjectives: [],
    curriculumMeta: TheoryLibrary.emptyCurriculumMeta()
  };
  var meta = s.curriculumMeta || TheoryLibrary.emptyCurriculumMeta();
  var body =
    '<div class="theory-lib-form">' +
    '<label>Title <input type="text" id="libSkillTitle" class="select-control" value="' +
    escAttr(s.title) + '" aria-label="Skill title"></label>' +
    '<label>Brief description <textarea id="libSkillDescription" class="select-control" rows="3" ' +
    'aria-label="Skill description" placeholder="Optional skills-lab content summary">' +
    esc(s.description || '') + '</textarea></label>' +
    '<label>Learning objectives (one per line)<textarea id="libSkillObjectives" class="select-control" rows="4" ' +
    'aria-label="Learning objectives" placeholder="One objective per line">' +
    esc(listToLines(s.learningObjectives)) + '</textarea></label>' +
    skillTestoutFieldsHtml(s) +
    '<details class="theory-lib-meta-stub">' +
    '<summary>Curriculum metadata (stub)</summary>' +
    '<p class="section-sub">Reserved for COR alignment, ACEN standards, and curriculum mapping.</p>' +
    '<label>Notes <textarea id="libSkillMetaNotes" class="select-control" rows="2" ' +
    'aria-label="Curriculum metadata notes">' + esc(meta.notes || '') + '</textarea></label>' +
    '</details>' +
    '</div>';

  var dialogContent = document.querySelector('#dialogModal .modal-content');
  if (dialogContent) dialogContent.style.maxWidth = '36rem';

  showDialog(isNew ? 'Add skill' : 'Edit skill', body, function () {
    var titleEl = document.getElementById('libSkillTitle');
    var title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      showAlert('Skill', 'Title is required.');
      return false;
    }
    var curriculumMeta = Object.assign({}, meta, {
      notes: ((document.getElementById('libSkillMetaNotes') || {}).value || '').trim()
    });
    var testout = readSkillTestoutFromForm();
    var patch = {
      title: title,
      description: (document.getElementById('libSkillDescription') || {}).value || '',
      learningObjectives: linesToList((document.getElementById('libSkillObjectives') || {}).value),
      requiresTestout: testout.requiresTestout,
      recommendedTestoutCount: testout.recommendedTestoutCount,
      recommendedPracticeCount: testout.recommendedPracticeCount,
      curriculumMeta: curriculumMeta
    };
    var done = function (item) {
      if (onRender) onRender();
      if (opts.onSaved) opts.onSaved(item);
    };
    if (isNew) {
      var created = TheoryLibrary.addSkill(title, patch);
      if (created && created.then) created.then(done);
      else done(created);
    } else {
      TheoryLibrary.updateSkill(skill.id, patch).then(done);
    }
  });
  wireSkillTestoutToggle();
}

function skillMetaBadge(s) {
  if (!s.requiresTestout) {
    return '<span class="theory-skill-badge text-muted">Optional testout</span>';
  }
  var testoutN = s.recommendedTestoutCount != null ? s.recommendedTestoutCount : 1;
  var practiceN = s.recommendedPracticeCount != null ? s.recommendedPracticeCount : 0;
  return '<span class="theory-skill-badge">Requires testout · ' +
    escapeHtml(String(testoutN)) + ' testout' + (testoutN === 1 ? '' : 's') +
    (practiceN > 0
      ? ' · ' + escapeHtml(String(practiceN)) + ' practice'
      : '') +
    '</span>';
}

/**
 * @param {boolean} libraryUnlocked
 * @param {function(HTMLElement, string, string): void} ensureAddRow
 */
export function renderSkillsLibraryList(libraryUnlocked, ensureAddRow) {
  var list = document.getElementById('theorySkillsLibraryList');
  if (!list) return;
  var skills = TheoryLibrary.listSkills();
  var addRow = libraryUnlocked
    ? '<div class="config-list-add-row"><button type="button" class="btn btn-sm add-lib-skill">Add skill</button></div>'
    : '';
  if (!skills.length) {
    list.innerHTML = '<li class="text-muted">No skills in this library yet.</li>';
    ensureAddRow(list, 'skill', addRow);
    return;
  }
  list.innerHTML = skills.map(function (s) {
    var actions = '';
    if (libraryUnlocked) {
      actions =
        '<span class="theory-lib-row-actions">' +
        '<button type="button" class="btn btn-sm edit-lib-skill" data-skill-id="' + escAttr(s.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-icon-remove remove-lib-skill" data-skill-id="' + escAttr(s.id) + '" ' +
        'aria-label="Remove skill" title="Remove skill">&times;</button></span>';
    }
    return '<li class="theory-skill-row" data-skill-id="' + escAttr(s.id) + '">' +
      '<div class="theory-lib-row-main">' +
      '<span class="theory-skill-title">' + esc(s.title) + '</span>' +
      (s.description
        ? '<div class="theory-lib-row-meta text-muted">' + esc(s.description) + '</div>'
        : '') +
      learningObjectivesHtml(s.learningObjectives) +
      '<div class="theory-skill-flags">' + skillMetaBadge(s) + '</div>' +
      '</div>' + actions + '</li>';
  }).join('');
  ensureAddRow(list, 'skill', addRow);
}
