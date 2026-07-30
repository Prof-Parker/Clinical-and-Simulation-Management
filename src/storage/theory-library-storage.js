/**
 * Theory content library file storage (topic + skills banks).
 */

import * as Storage from './semester-storage.js';
import * as FileKind from '../core/file-kind.js';
import { assertKindOrThrow, guardedWrite, writeTextToHandle } from './guarded-write.js';
import { hybridSave } from './hybrid-save.js';
import * as ProgramData from './program-data.js';
import { state } from '../core/state.js';
import {
  SKILL_KINDS,
  emptyCurriculumMeta,
  normalizeCurriculumMeta,
  inferSkillKinds,
  normalizeSkillKinds,
  isUsableSkillTitle,
  normalizeSkill,
  normalizeTopic,
  createEmptyLibrary,
  migrateLibrary,
  skillKindLabel
} from './theory-library-model.js';

var CACHE_KEY = 'theoryLibraryData';
var HANDLE_KEY = 'theoryLibraryFileHandle';
var DIR_HANDLE_KEY = 'theoryLibraryDirHandle';
var KIND = FileKind.FILE_KINDS.THEORY_CONTENT_LIBRARY;

function idbGet(key) { return Storage._idbGet(key); }
function idbSet(key, val) { return Storage._idbSet(key, val); }
function supportsFS() { return Storage && Storage.supportsFS(); }

export function getLibrary() {
  return state.theoryLibraryRoot;
}

function setRoot(root) {
  state.theoryLibraryRoot = migrateLibrary(root);
}

export function isReady() {
  return !!state.theoryLibraryRoot;
}

function serialize(root) {
  root.meta.lastModified = new Date().toISOString();
  FileKind.stampFileKind(root, KIND);
  return JSON.stringify(root, null, 2);
}

function writeToHandle(handle, root) {
  return guardedWrite(handle, KIND, function () {
    return writeTextToHandle(handle, serialize(root));
  });
}

function readFromHandle(handle) {
  return handle.getFile().then(function (f) { return f.text(); }).then(function (t) {
    return assertKindOrThrow(migrateLibrary(JSON.parse(t)), KIND, {
      fileName: handle.name,
      suggestedName: 'theory-content-library_REGN15.json'
    });
  });
}

export function saveCurrent() {
  var root = getLibrary();
  if (!root) return Promise.resolve();
  if (state.theoryLibraryFileHandle) {
    return writeToHandle(state.theoryLibraryFileHandle, root).then(function () {
      return idbSet(CACHE_KEY, root);
    });
  }
  if (ProgramData.isProgramDataConnected()) {
    var courseId = (root.meta && root.meta.courseId) || 'REGN15';
    return ProgramData.writeRelative(
      ProgramData.theoryLibraryPath(courseId),
      KIND,
      function () { return serialize(root); }
    ).then(function (result) {
      state.theoryLibraryFileHandle = result.handle;
      return idbSet(HANDLE_KEY, result.handle).then(function () {
        return idbSet(CACHE_KEY, root);
      });
    });
  }
  return Promise.resolve();
}

export function openFilePicker() {
  if (!supportsFS()) return importViaInput();
  return window.showOpenFilePicker({
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
  }).then(function (handles) {
    var handle = handles[0];
    return readFromHandle(handle).then(function (root) {
      state.theoryLibraryFileHandle = handle;
      setRoot(root);
      return idbSet(HANDLE_KEY, handle).then(function () {
        return idbSet(CACHE_KEY, root).then(function () { return root; });
      });
    });
  });
}

function importViaInput() {
  return new Promise(function (resolve, reject) {
    var input = document.getElementById('importTheoryLibraryInput');
    if (!input) return reject(new Error('No import input'));
    input.onchange = function (e) {
      var file = e.target.files[0];
      input.value = '';
      if (!file) return reject(new Error('No file'));
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var root = migrateLibrary(JSON.parse(reader.result));
          assertKindOrThrow(root, KIND, {
            fileName: file.name,
            suggestedName: 'theory-content-library_REGN15.json'
          });
          state.theoryLibraryFileHandle = null;
          setRoot(root);
          idbSet(CACHE_KEY, root).then(function () { resolve(root); }).catch(reject);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    };
    input.click();
  });
}

export function createFilePicker(courseId) {
  var root = createEmptyLibrary(courseId);
  var suggested = 'theory-content-library_' + (courseId || 'REGN15') + '.json';
  if (!supportsFS()) {
    var blob = new Blob([serialize(root)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggested;
    a.click();
    URL.revokeObjectURL(a.href);
    setRoot(root);
    return Promise.resolve(root);
  }
  return hybridSave({
    kind: KIND,
    suggestedName: suggested,
    fileHandleKey: HANDLE_KEY,
    dirHandleKey: DIR_HANDLE_KEY,
    idbGet: idbGet,
    idbSet: idbSet,
    getFileHandle: function () { return state.theoryLibraryFileHandle; },
    getDirHandle: function () { return state.theoryLibraryDirHandle; },
    allowDownload: true,
    write: function (handle) {
      return writeToHandle(handle, root);
    },
    download: function () {
      var b = new Blob([serialize(root)], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(b);
      link.download = suggested;
      link.click();
      URL.revokeObjectURL(link.href);
      setRoot(root);
    },
    onPersisted: function (handle, dirHandle) {
      if (!handle) return Promise.resolve(root);
      state.theoryLibraryFileHandle = handle;
      if (dirHandle) state.theoryLibraryDirHandle = dirHandle;
      setRoot(root);
      return idbSet(CACHE_KEY, root).then(function () { return root; });
    }
  }, {
    forceChooser: true,
    title: 'Theory content library',
    message: 'Create, overwrite (validated before write), save to a folder, or download.'
  }).then(function () { return root; });
}

export function getTopicById(topicId) {
  var root = getLibrary();
  if (!root || !root.topics) return null;
  return root.topics.find(function (t) { return t.id === topicId; }) || null;
}

export function listTopics() {
  var root = getLibrary();
  return root && root.topics ? root.topics.slice() : [];
}

export function getSkillById(skillId) {
  var root = getLibrary();
  if (!root || !root.skills) return null;
  return root.skills.find(function (s) { return s.id === skillId; }) || null;
}

export function listSkills() {
  var root = getLibrary();
  return root && root.skills ? root.skills.slice() : [];
}

export function setSkillKinds(skillId, kinds) {
  var skill = getSkillById(skillId);
  if (!skill) return Promise.resolve(null);
  skill.kinds = normalizeSkillKinds(kinds);
  return saveCurrent().then(function () { return skill; }).catch(function () { return skill; });
}

export function addSkill(title, opts) {
  opts = opts || {};
  var root = getLibrary();
  if (!root) return null;
  if (!root.skills) root.skills = [];
  var skill = normalizeSkill({
    title: title,
    description: opts.description || '',
    kinds: opts.kinds,
    curriculumMeta: opts.curriculumMeta,
    courseId: (root.meta && root.meta.courseId) || 'REGN15'
  });
  if (!skill) return null;
  var existing = root.skills.find(function (s) {
    return s.title.toLowerCase() === skill.title.toLowerCase();
  });
  if (existing) {
    skill.kinds.forEach(function (k) {
      if (existing.kinds.indexOf(k) < 0) existing.kinds.push(k);
    });
    if (opts.description != null && opts.description !== '') {
      existing.description = String(opts.description);
    }
    if (opts.curriculumMeta) {
      existing.curriculumMeta = normalizeCurriculumMeta(opts.curriculumMeta);
    }
    return saveCurrent().then(function () { return existing; }).catch(function () { return existing; });
  }
  root.skills.push(skill);
  root.skills.sort(function (a, b) {
    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  });
  return saveCurrent().then(function () { return skill; }).catch(function () { return skill; });
}

export function updateSkill(skillId, patch) {
  patch = patch || {};
  var skill = getSkillById(skillId);
  if (!skill) return Promise.resolve(null);
  if (patch.title != null) {
    var nextTitle = String(patch.title || '').trim();
    if (!isUsableSkillTitle(nextTitle)) return Promise.resolve(null);
    skill.title = nextTitle;
  }
  if (patch.description !== undefined) skill.description = String(patch.description || '');
  if (patch.kinds !== undefined) skill.kinds = normalizeSkillKinds(patch.kinds);
  if (patch.curriculumMeta !== undefined) {
    skill.curriculumMeta = normalizeCurriculumMeta(patch.curriculumMeta);
  }
  var root = getLibrary();
  if (root && root.skills) {
    root.skills.sort(function (a, b) {
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    });
  }
  return saveCurrent().then(function () { return skill; }).catch(function () { return skill; });
}

export function removeSkill(skillId) {
  var root = getLibrary();
  if (!root || !root.skills) return Promise.resolve(false);
  var before = root.skills.length;
  root.skills = root.skills.filter(function (s) { return s.id !== skillId; });
  if (root.skills.length === before) return Promise.resolve(false);
  return saveCurrent().then(function () { return true; }).catch(function () { return true; });
}

export function addTopic(title, opts) {
  opts = opts || {};
  var root = getLibrary();
  if (!root) return null;
  if (!root.topics) root.topics = [];
  var topic = normalizeTopic({
    id: 'topic_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    title: title,
    shortLabel: opts.shortLabel || '',
    moduleRef: opts.moduleRef || '',
    description: opts.description || '',
    defaultLectureHours: opts.defaultLectureHours != null ? opts.defaultLectureHours : null,
    defaultTopics: opts.defaultTopics || [],
    tags: opts.tags || [],
    curriculumMeta: opts.curriculumMeta,
    courseId: (root.meta && root.meta.courseId) || 'REGN15'
  }, root.meta.courseId);
  if (!topic) return null;
  root.topics.push(topic);
  return saveCurrent().then(function () { return topic; }).catch(function () { return topic; });
}

export function updateTopic(topicId, patch) {
  patch = patch || {};
  var topic = getTopicById(topicId);
  if (!topic) return Promise.resolve(null);
  if (patch.title != null) {
    var nextTitle = String(patch.title || '').trim();
    if (!nextTitle) return Promise.resolve(null);
    topic.title = nextTitle;
  }
  if (patch.shortLabel !== undefined) topic.shortLabel = String(patch.shortLabel || '').trim();
  if (patch.moduleRef !== undefined) topic.moduleRef = String(patch.moduleRef || '').trim();
  if (patch.description !== undefined) topic.description = String(patch.description || '');
  if (patch.defaultLectureHours !== undefined) {
    var hours = patch.defaultLectureHours;
    topic.defaultLectureHours = hours === '' || hours == null ? null : Number(hours);
    if (topic.defaultLectureHours != null && isNaN(topic.defaultLectureHours)) {
      topic.defaultLectureHours = null;
    }
  }
  if (patch.defaultTopics !== undefined) {
    topic.defaultTopics = Array.isArray(patch.defaultTopics)
      ? patch.defaultTopics.map(function (t) { return String(t || '').trim(); }).filter(Boolean)
      : [];
  }
  if (patch.tags !== undefined) {
    topic.tags = Array.isArray(patch.tags)
      ? patch.tags.map(function (t) { return String(t || '').trim(); }).filter(Boolean)
      : [];
  }
  if (patch.curriculumMeta !== undefined) {
    topic.curriculumMeta = normalizeCurriculumMeta(patch.curriculumMeta);
  }
  // Skills belong in the skills bank — never reattach to topics.
  if (topic.defaultSkills) delete topic.defaultSkills;
  return saveCurrent().then(function () { return topic; }).catch(function () { return topic; });
}

export function removeTopic(topicId) {
  var root = getLibrary();
  if (!root || !root.topics) return Promise.resolve(false);
  var before = root.topics.length;
  root.topics = root.topics.filter(function (t) { return t.id !== topicId; });
  if (root.topics.length === before) return Promise.resolve(false);
  return saveCurrent().then(function () { return true; }).catch(function () { return true; });
}

export function getConnectionLabel() {
  if (!isReady()) return '';
  if (state.theoryLibraryFileHandle && state.theoryLibraryFileHandle.name) {
    return state.theoryLibraryFileHandle.name;
  }
  return 'Theory content library (on this device)';
}

export function init() {
  return idbGet(HANDLE_KEY).then(function (handle) {
    if (!handle || !supportsFS()) return idbGet(CACHE_KEY);
    return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm !== 'granted') return idbGet(CACHE_KEY);
      state.theoryLibraryFileHandle = handle;
      return readFromHandle(handle);
    });
  }).then(function (raw) {
    if (raw) setRoot(raw);
    return raw;
  }).catch(function () { return null; });
}

export {
  SKILL_KINDS,
  emptyCurriculumMeta,
  inferSkillKinds,
  createEmptyLibrary,
  migrateLibrary,
  skillKindLabel
};
