/**
 * Theory content library file storage (topic + skills banks).
 */

import * as Storage from './semester-storage.js';
import * as FileKind from '../core/file-kind.js';
import { assertKindOrThrow, guardedWrite } from './guarded-write.js';
import { state } from '../core/state.js';

var CACHE_KEY = 'theoryLibraryData';
var HANDLE_KEY = 'theoryLibraryFileHandle';
var KIND = FileKind.FILE_KINDS.THEORY_CONTENT_LIBRARY;

export var SKILL_KINDS = ['introduction', 'practice', 'testout'];

/** Stub shape for future COR / ACEN / curriculum-mapping features. */
export function emptyCurriculumMeta() {
  return {
    version: 1,
    corRefs: [],
    acenStandards: [],
    programOutcomes: [],
    courseOutcomes: [],
    notes: ''
  };
}

function normalizeCurriculumMeta(raw) {
  var base = emptyCurriculumMeta();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: raw.version != null ? raw.version : 1,
    corRefs: Array.isArray(raw.corRefs) ? raw.corRefs.slice() : [],
    acenStandards: Array.isArray(raw.acenStandards) ? raw.acenStandards.slice() : [],
    programOutcomes: Array.isArray(raw.programOutcomes) ? raw.programOutcomes.slice() : [],
    courseOutcomes: Array.isArray(raw.courseOutcomes) ? raw.courseOutcomes.slice() : [],
    notes: raw.notes != null ? String(raw.notes) : ''
  };
}

function idbGet(key) { return Storage._idbGet(key); }
function idbSet(key, val) { return Storage._idbSet(key, val); }
function supportsFS() { return Storage && Storage.supportsFS(); }

function skillIdFromTitle(title) {
  var slug = String(title || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  return 'skill_' + (slug || Date.now().toString(36));
}

/** Infer introduction / practice / testout tags from a free-text skill title. */
export function inferSkillKinds(title) {
  var t = String(title || '');
  var kinds = [];
  if (/\bintro(?:duction)?\b/i.test(t)) kinds.push('introduction');
  if (/\bpractice\b|\bpracti[sc]e\b/i.test(t)) kinds.push('practice');
  if (/\btest[\s-]*outs?\b|\btestouts?\b/i.test(t)) kinds.push('testout');
  return kinds;
}

function normalizeSkillKinds(kinds) {
  var seen = {};
  var out = [];
  (kinds || []).forEach(function (k) {
    var key = String(k || '').toLowerCase();
    if (SKILL_KINDS.indexOf(key) < 0 || seen[key]) return;
    seen[key] = true;
    out.push(key);
  });
  return out;
}

function isUsableSkillTitle(title) {
  var t = String(title || '').trim();
  if (t.length < 2) return false;
  if (/^[\/\\|.,;:_-]+$/.test(t)) return false;
  if (/^(r|\/)$/i.test(t)) return false;
  // Holidays/breaks come from semester Setup, not the skills bank.
  if (/\bbreak\b/i.test(t) || /\bholiday\b/i.test(t) || /^no class$/i.test(t)) return false;
  return true;
}

function normalizeSkill(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    var title = raw.trim();
    if (!isUsableSkillTitle(title)) return null;
    return {
      id: skillIdFromTitle(title),
      title: title,
      description: '',
      kinds: inferSkillKinds(title),
      curriculumMeta: emptyCurriculumMeta(),
      courseId: null
    };
  }
  var skillTitle = String(raw.title || '').trim();
  if (!isUsableSkillTitle(skillTitle)) return null;
  return {
    id: raw.id || skillIdFromTitle(skillTitle),
    title: skillTitle,
    description: raw.description != null ? String(raw.description) : '',
    kinds: Array.isArray(raw.kinds)
      ? normalizeSkillKinds(raw.kinds)
      : inferSkillKinds(skillTitle),
    curriculumMeta: normalizeCurriculumMeta(raw.curriculumMeta),
    courseId: raw.courseId || null
  };
}

function normalizeTopic(raw, courseId) {
  if (!raw) return null;
  var title = String(raw.title || '').trim();
  if (!title) return null;
  return {
    id: raw.id || ('topic_' + Date.now().toString(36)),
    title: title,
    shortLabel: raw.shortLabel != null ? String(raw.shortLabel) : '',
    moduleRef: raw.moduleRef != null ? String(raw.moduleRef) : '',
    description: raw.description != null ? String(raw.description) : '',
    defaultLectureHours: raw.defaultLectureHours != null ? raw.defaultLectureHours : null,
    defaultTopics: Array.isArray(raw.defaultTopics) ? raw.defaultTopics.slice() : [],
    tags: Array.isArray(raw.tags) ? raw.tags.slice() : [],
    curriculumMeta: normalizeCurriculumMeta(raw.curriculumMeta),
    courseId: raw.courseId || courseId || null
  };
}

function buildSkillsFromTopics(topics, courseId) {
  var byKey = {};
  (topics || []).forEach(function (topic) {
    (topic.defaultSkills || []).forEach(function (entry) {
      var skill = normalizeSkill(typeof entry === 'string' ? entry : entry);
      if (!skill) return;
      var key = skill.title.toLowerCase();
      if (!byKey[key]) {
        skill.courseId = courseId || skill.courseId;
        byKey[key] = skill;
        return;
      }
      var existing = byKey[key];
      skill.kinds.forEach(function (k) {
        if (existing.kinds.indexOf(k) < 0) existing.kinds.push(k);
      });
    });
  });
  return Object.keys(byKey).sort().map(function (k) { return byKey[k]; });
}

export function createEmptyLibrary(courseId) {
  return {
    meta: {
      version: 2,
      courseId: courseId || 'REGN15',
      fileKind: KIND,
      lastModified: new Date().toISOString(),
      curriculumMeta: emptyCurriculumMeta()
    },
    topics: [],
    skills: []
  };
}

export function migrateLibrary(raw) {
  if (!raw || !raw.topics) return createEmptyLibrary();
  if (!raw.meta) raw.meta = { version: 2 };
  if (!raw.meta.courseId) raw.meta.courseId = 'REGN15';
  if (raw.meta.version == null || raw.meta.version < 2) raw.meta.version = 2;
  raw.meta.curriculumMeta = normalizeCurriculumMeta(raw.meta.curriculumMeta);

  // One-time extract: legacy topic.defaultSkills → skills bank, then detach from topics.
  var extracted = buildSkillsFromTopics(raw.topics, raw.meta.courseId);
  if (!Array.isArray(raw.skills) || !raw.skills.length) {
    raw.skills = extracted;
  } else {
    raw.skills = raw.skills.map(normalizeSkill).filter(Boolean);
    var have = {};
    raw.skills.forEach(function (s) { have[s.title.toLowerCase()] = true; });
    extracted.forEach(function (s) {
      if (!have[s.title.toLowerCase()]) raw.skills.push(s);
    });
  }
  raw.skills = raw.skills.map(normalizeSkill).filter(Boolean);
  raw.topics = raw.topics.map(function (t) {
    return normalizeTopic(t, raw.meta.courseId);
  }).filter(Boolean);
  return raw;
}

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
    return handle.createWritable().then(function (w) {
      return w.write(serialize(root)).then(function () { return w.close(); });
    });
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
  if (!root || !state.theoryLibraryFileHandle) return Promise.resolve();
  return writeToHandle(state.theoryLibraryFileHandle, root).then(function () {
    return idbSet(CACHE_KEY, root);
  });
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
  if (!supportsFS()) return Promise.reject(new Error('FS unavailable'));
  return window.showSaveFilePicker({
    suggestedName: 'theory-content-library_' + (courseId || 'REGN15') + '.json',
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
  }).then(function (handle) {
    state.theoryLibraryFileHandle = handle;
    setRoot(root);
    return idbSet(HANDLE_KEY, handle).then(function () {
      return writeToHandle(handle, root).then(function () {
        return idbSet(CACHE_KEY, root).then(function () { return root; });
      });
    });
  });
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

export function skillKindLabel(kind) {
  if (kind === 'introduction') return 'Intro';
  if (kind === 'practice') return 'Practice';
  if (kind === 'testout') return 'Testout';
  return kind || '';
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
