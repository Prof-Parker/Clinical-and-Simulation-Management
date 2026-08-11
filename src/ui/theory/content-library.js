/**
 * Theory content library panel — topics + skills CRUD behind COR unlock.
 */

import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import * as Permissions from '../../auth/permissions.js';
import { showAlert, showConfirm, showDialog } from '../dialogs.js';
import {
  openSkillEditor as openSkillEditorImpl,
  renderSkillsLibraryList as renderSkillsLibraryListImpl
} from './content-library-skills.js';
import { renderSkillCoveragePanel } from './skill-coverage-panel.js';
import { getData } from '../../core/state.js';

var libraryUnlocked = false;
var bound = false;

var UNLOCK_MESSAGE =
  'Course content in this library should align with the Course Outline of Record (COR) ' +
  'on file with the curriculum committee.\n\n' +
  'Unlock editing only when you intend to update approved course content. Changes save to ' +
  'the connected theory content library file.';

export function isLibraryUnlocked() {
  return libraryUnlocked;
}

export function lockLibrary() {
  libraryUnlocked = false;
  render();
}

function canEditLibrary() {
  return Permissions.canAction('theory.edit') || Permissions.canAction('*');
}

function requestUnlock(onUnlocked) {
  if (!canEditLibrary()) {
    showAlert('Content library', 'You do not have permission to edit the theory content library.');
    return;
  }
  if (libraryUnlocked) {
    if (onUnlocked) onUnlocked();
    return;
  }
  showConfirm(
    'Unlock content library editing',
    UNLOCK_MESSAGE,
    function () {
      libraryUnlocked = true;
      render();
      if (onUnlocked) onUnlocked();
    },
    { confirmLabel: 'Unlock editing' }
  );
}

export function requireLibraryUnlock(onUnlocked) {
  requestUnlock(onUnlocked);
}

function linesToList(text) {
  return String(text || '')
    .split(/\r?\n|;/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

function listToLines(arr) {
  return (arr || []).join('\n');
}

function learningObjectivesHtml(objectives) {
  if (!objectives || !objectives.length) return '';
  return '<ol class="theory-learning-objectives">' +
    objectives.map(function (line) {
      return '<li>' + esc(line) + '</li>';
    }).join('') +
    '</ol>';
}

export function openTopicEditor(topic, opts) {
  opts = opts || {};
  var isNew = !topic;
  var t = topic || {
    title: '',
    shortLabel: '',
    description: '',
    defaultLectureHours: '',
    defaultTopics: [],
    tags: [],
    learningObjectives: [],
    curriculumMeta: TheoryLibrary.emptyCurriculumMeta()
  };
  var meta = t.curriculumMeta || TheoryLibrary.emptyCurriculumMeta();
  var body =
    '<div class="theory-lib-form">' +
    '<label>Title <input type="text" id="libTopicTitle" class="select-control" value="' +
    escAttr(t.title) + '" aria-label="Topic title"></label>' +
    '<label>Short label <input type="text" id="libTopicShort" class="select-control" value="' +
    escAttr(t.shortLabel || '') + '" aria-label="Topic short label"></label>' +
    '<label>Default lecture hours <input type="number" id="libTopicHours" class="select-control" ' +
    'step="0.01" min="0" value="' + escAttr(t.defaultLectureHours != null ? t.defaultLectureHours : '') +
    '" aria-label="Default lecture hours"></label>' +
    '<label>Brief description <textarea id="libTopicDescription" class="select-control" rows="3" ' +
    'aria-label="Topic description" placeholder="Optional content-area summary">' +
    esc(t.description || '') + '</textarea></label>' +
    '<label>Learning objectives (one per line)<textarea id="libTopicObjectives" class="select-control" rows="4" ' +
    'aria-label="Learning objectives" placeholder="One objective per line">' +
    esc(listToLines(t.learningObjectives)) + '</textarea></label>' +
    '<label>Default topics (one per line)<textarea id="libTopicDefaults" class="select-control" rows="3" ' +
    'aria-label="Default topics">' + esc(listToLines(t.defaultTopics)) + '</textarea></label>' +
    '<label>Tags (comma-separated)<input type="text" id="libTopicTags" class="select-control" value="' +
    escAttr((t.tags || []).join(', ')) + '" aria-label="Topic tags"></label>' +
    '<details class="theory-lib-meta-stub">' +
    '<summary>Curriculum metadata (stub)</summary>' +
    '<p class="section-sub">Reserved for COR alignment, ACEN standards, and curriculum mapping.</p>' +
    '<label>Notes <textarea id="libTopicMetaNotes" class="select-control" rows="2" ' +
    'aria-label="Curriculum metadata notes">' + esc(meta.notes || '') + '</textarea></label>' +
    '</details>' +
    '</div>';

  var dialogContent = document.querySelector('#dialogModal .modal-content');
  if (dialogContent) dialogContent.style.maxWidth = '36rem';

  showDialog(isNew ? 'Add topic' : 'Edit topic', body, function () {
    var titleEl = document.getElementById('libTopicTitle');
    var title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      showAlert('Topic', 'Title is required.');
      return false;
    }
    var curriculumMeta = Object.assign({}, meta, {
      notes: ((document.getElementById('libTopicMetaNotes') || {}).value || '').trim()
    });
    var patch = {
      title: title,
      shortLabel: (document.getElementById('libTopicShort') || {}).value || '',
      description: (document.getElementById('libTopicDescription') || {}).value || '',
      defaultLectureHours: (document.getElementById('libTopicHours') || {}).value,
      defaultTopics: linesToList((document.getElementById('libTopicDefaults') || {}).value),
      learningObjectives: linesToList((document.getElementById('libTopicObjectives') || {}).value),
      tags: String((document.getElementById('libTopicTags') || {}).value || '')
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean),
      curriculumMeta: curriculumMeta
    };
    var done = function (item) {
      render();
      if (opts.onSaved) opts.onSaved(item);
    };
    if (isNew) {
      var created = TheoryLibrary.addTopic(title, patch);
      if (created && created.then) created.then(done);
      else done(created);
    } else {
      TheoryLibrary.updateTopic(topic.id, patch).then(done);
    }
  });
}

export function openSkillEditor(skill, opts) {
  return openSkillEditorImpl(skill, opts, render);
}

function confirmRemoveTopic(topic) {
  showConfirm(
    'Remove topic',
    'Remove “' + topic.title + '” from the content library?\n\nThis does not delete events already placed on the master calendar.',
    function () {
      TheoryLibrary.removeTopic(topic.id).then(function () { render(); });
    },
    { confirmLabel: 'Remove topic' }
  );
}

function confirmRemoveSkill(skill) {
  showConfirm(
    'Remove skill',
    'Remove “' + skill.title + '” from the skills bank?\n\nEvents that already reference this skill keep their saved text until edited.',
    function () {
      TheoryLibrary.removeSkill(skill.id).then(function () { render(); });
    },
    { confirmLabel: 'Remove skill' }
  );
}

export function render() {
  var prompt = document.getElementById('theoryLibraryConnectPrompt');
  var status = document.getElementById('theoryLibraryStatus');
  var sections = document.getElementById('theoryLibrarySections');
  var unlockBtn = document.getElementById('theoryLibraryUnlockBtn');
  var lockBtn = document.getElementById('theoryLibraryLockBtn');
  var unlockedBanner = document.getElementById('theoryLibraryUnlockedBanner');
  var ready = TheoryLibrary.isReady();
  if (prompt) prompt.classList.toggle('hidden', ready);
  if (sections) sections.classList.toggle('hidden', !ready);
  if (status) {
    if (ready) {
      status.textContent = 'Connected: ' + TheoryLibrary.getConnectionLabel();
      status.classList.remove('hidden');
    } else {
      status.textContent = '';
      status.classList.add('hidden');
    }
  }
  if (!ready) libraryUnlocked = false;
  if (unlockBtn) {
    unlockBtn.classList.toggle('hidden', !ready || libraryUnlocked || !canEditLibrary());
  }
  if (lockBtn) {
    lockBtn.classList.toggle('hidden', !ready || !libraryUnlocked);
  }
  if (unlockedBanner) {
    unlockedBanner.classList.toggle('hidden', !ready || !libraryUnlocked);
  }
  renderTopicLibraryList();
  renderSkillsLibraryListImpl(libraryUnlocked, ensureAddRow);
  var data = getData();
  renderSkillCoveragePanel(data && data.theory);
}

function renderTopicLibraryList() {
  var list = document.getElementById('theoryTopicLibraryList');
  if (!list) return;
  var topics = TheoryLibrary.listTopics();
  var addRow = libraryUnlocked
    ? '<div class="config-list-add-row"><button type="button" class="btn btn-sm add-lib-topic">Add topic</button></div>'
    : '';
  if (!topics.length) {
    list.innerHTML = '<li class="text-muted">No topics in this library yet.</li>' +
      (libraryUnlocked ? '</ul>' : '');
    // list is a UL — put add row after as sibling via parent
    ensureAddRow(list, 'topic', addRow);
    return;
  }
  list.innerHTML = topics.map(function (t) {
    var actions = '';
    if (libraryUnlocked) {
      actions =
        '<span class="theory-lib-row-actions">' +
        '<button type="button" class="btn btn-sm edit-lib-topic" data-topic-id="' + escAttr(t.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-icon-remove remove-lib-topic" data-topic-id="' + escAttr(t.id) + '" ' +
        'aria-label="Remove topic" title="Remove topic">&times;</button></span>';
    }
    var descHint = t.description
      ? '<div class="theory-lib-row-meta text-muted">' + esc(t.description) + '</div>'
      : '';
    var objHint = learningObjectivesHtml(t.learningObjectives);
    return '<li class="theory-lib-topic-row" data-topic-id="' + escAttr(t.id) + '">' +
      '<div class="theory-lib-row-main">' +
      '<span class="theory-lib-topic-title">' + esc(t.title) + '</span>' +
      descHint + objHint +
      '</div>' + actions + '</li>';
  }).join('');
  ensureAddRow(list, 'topic', addRow);
}

function ensureAddRow(listEl, kind, addRowHtml) {
  var parent = listEl.parentElement;
  if (!parent) return;
  var existing = parent.querySelector('.config-list-add-row.add-lib-' + kind + '-row');
  if (existing) existing.remove();
  if (!addRowHtml) return;
  var wrap = document.createElement('div');
  wrap.innerHTML = addRowHtml;
  var row = wrap.firstChild;
  if (!row) return;
  row.classList.add('add-lib-' + kind + '-row');
  parent.appendChild(row);
}

export function init() {
  if (bound) return;
  bound = true;
  var panel = document.getElementById('theoryTopicLibraryPanel');
  if (!panel) return;

  var unlockBtn = document.getElementById('theoryLibraryUnlockBtn');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', function () { requestUnlock(); });
  }
  var lockBtn = document.getElementById('theoryLibraryLockBtn');
  if (lockBtn) {
    lockBtn.addEventListener('click', function () { lockLibrary(); });
  }

  panel.addEventListener('click', function (e) {
    if (e.target.closest('.add-lib-topic')) {
      if (!libraryUnlocked) return requestUnlock(function () { openTopicEditor(null); });
      openTopicEditor(null);
      return;
    }
    if (e.target.closest('.add-lib-skill')) {
      if (!libraryUnlocked) return requestUnlock(function () { openSkillEditor(null); });
      openSkillEditor(null);
      return;
    }
    var editTopic = e.target.closest('.edit-lib-topic');
    if (editTopic) {
      var topic = TheoryLibrary.getTopicById(editTopic.getAttribute('data-topic-id'));
      if (topic) openTopicEditor(topic);
      return;
    }
    var rmTopic = e.target.closest('.remove-lib-topic');
    if (rmTopic) {
      var topicRm = TheoryLibrary.getTopicById(rmTopic.getAttribute('data-topic-id'));
      if (topicRm) confirmRemoveTopic(topicRm);
      return;
    }
    var editSkill = e.target.closest('.edit-lib-skill');
    if (editSkill) {
      var skill = TheoryLibrary.getSkillById(editSkill.getAttribute('data-skill-id'));
      if (skill) openSkillEditor(skill);
      return;
    }
    var rmSkill = e.target.closest('.remove-lib-skill');
    if (rmSkill) {
      var skillRm = TheoryLibrary.getSkillById(rmSkill.getAttribute('data-skill-id'));
      if (skillRm) confirmRemoveSkill(skillRm);
    }
  });

  render();
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
