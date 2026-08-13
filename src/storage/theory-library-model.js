/**
 * Pure theory content library shapes, normalization, and migration.
 */

import * as FileKind from '../core/file-kind.js';

var KIND = FileKind.FILE_KINDS.THEORY_CONTENT_LIBRARY;
var SKILL_KINDS = ['introduction', 'practice', 'testout'];

/** Stub shape for future COR / ACEN / curriculum-mapping features. */
function emptyCurriculumMeta() {
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

function skillIdFromTitle(title) {
  var slug = String(title || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  return 'skill_' + (slug || Date.now().toString(36));
}

/** Infer introduction / practice / testout tags from a free-text skill title. */
function inferSkillKinds(title) {
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

function normalizeLearningObjectives(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(function (line) { return String(line || '').trim(); }).filter(Boolean);
}

function toNonNegInt(raw, fallback) {
  var n = Number(raw);
  if (!isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/**
 * Normalize requires-testout settings on a skill.
 * When requiresTestout is off, recommended counts still normalize but UI ignores them.
 */
function normalizeSkillTestoutSettings(raw) {
  var requires = !!(raw && raw.requiresTestout);
  var testoutCount = toNonNegInt(raw && raw.recommendedTestoutCount, requires ? 1 : 0);
  var practiceCount = toNonNegInt(raw && raw.recommendedPracticeCount, 0);
  if (requires && testoutCount < 1) testoutCount = 1;
  return {
    requiresTestout: requires,
    recommendedTestoutCount: testoutCount,
    recommendedPracticeCount: practiceCount
  };
}

function normalizeCourseIds(raw, fallbackCourseId) {
  var out = [];
  var seen = {};
  function push(code) {
    var c = String(code || '').toUpperCase().replace(/\s+/g, '');
    if (!c || seen[c]) return;
    seen[c] = true;
    out.push(c);
  }
  if (Array.isArray(raw)) {
    raw.forEach(push);
  } else if (raw) {
    push(raw);
  }
  if (!out.length && fallbackCourseId) push(fallbackCourseId);
  return out;
}

function itemBelongsToCourse(item, courseCode) {
  if (!courseCode) return true;
  var code = String(courseCode).toUpperCase().replace(/\s+/g, '');
  var ids = normalizeCourseIds(
    (item && item.courseIds) || (item && item.courseId),
    null
  );
  if (!ids.length) return true;
  return ids.indexOf(code) >= 0;
}

function itemsForCourse(list, courseCode) {
  return (list || []).filter(function (item) {
    return itemBelongsToCourse(item, courseCode);
  });
}

function filterLibraryForCourse(root, courseCode) {
  if (!root) return null;
  return {
    meta: root.meta,
    topics: itemsForCourse(root.topics, courseCode),
    skills: itemsForCourse(root.skills, courseCode)
  };
}

function normalizeSkill(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    var title = raw.trim();
    if (!isUsableSkillTitle(title)) return null;
    var inferred = normalizeSkillTestoutSettings(null);
    return {
      id: skillIdFromTitle(title),
      title: title,
      description: '',
      kinds: inferSkillKinds(title),
      requiresTestout: inferred.requiresTestout,
      recommendedTestoutCount: inferred.recommendedTestoutCount,
      recommendedPracticeCount: inferred.recommendedPracticeCount,
      learningObjectives: [],
      curriculumMeta: emptyCurriculumMeta(),
      courseId: null,
      courseIds: []
    };
  }
  var skillTitle = String(raw.title || '').trim();
  if (!isUsableSkillTitle(skillTitle)) return null;
  var settings = normalizeSkillTestoutSettings(raw);
  var courseIds = normalizeCourseIds(raw.courseIds || raw.courseId, null);
  return {
    id: raw.id || skillIdFromTitle(skillTitle),
    title: skillTitle,
    description: raw.description != null ? String(raw.description) : '',
    kinds: Array.isArray(raw.kinds)
      ? normalizeSkillKinds(raw.kinds)
      : inferSkillKinds(skillTitle),
    requiresTestout: settings.requiresTestout,
    recommendedTestoutCount: settings.recommendedTestoutCount,
    recommendedPracticeCount: settings.recommendedPracticeCount,
    learningObjectives: normalizeLearningObjectives(raw.learningObjectives),
    curriculumMeta: normalizeCurriculumMeta(raw.curriculumMeta),
    courseId: courseIds[0] || raw.courseId || null,
    courseIds: courseIds
  };
}

function normalizeTopic(raw, courseId) {
  if (!raw) return null;
  var title = String(raw.title || '').trim();
  if (!title) return null;
  var courseIds = normalizeCourseIds(raw.courseIds || raw.courseId || courseId, courseId);
  return {
    id: raw.id || ('topic_' + Date.now().toString(36)),
    title: title,
    shortLabel: raw.shortLabel != null ? String(raw.shortLabel) : '',
    // Legacy field retained for older library files; no longer edited in UI.
    moduleRef: raw.moduleRef != null ? String(raw.moduleRef) : '',
    description: raw.description != null ? String(raw.description) : '',
    defaultLectureHours: raw.defaultLectureHours != null ? raw.defaultLectureHours : null,
    defaultTopics: Array.isArray(raw.defaultTopics) ? raw.defaultTopics.slice() : [],
    tags: Array.isArray(raw.tags) ? raw.tags.slice() : [],
    learningObjectives: normalizeLearningObjectives(raw.learningObjectives),
    curriculumMeta: normalizeCurriculumMeta(raw.curriculumMeta),
    courseId: courseIds[0] || courseId || null,
    courseIds: courseIds
  };
}

function buildSkillsFromTopics(topics, courseId) {
  var byKey = {};
  (topics || []).forEach(function (topic) {
    (topic.defaultSkills || []).forEach(function (entry) {
      var skill = normalizeSkill(entry);
      if (!skill) return;
      var key = skill.title.toLowerCase();
      if (!byKey[key]) {
        var ids = normalizeCourseIds(
          skill.courseIds.length ? skill.courseIds : (courseId || skill.courseId),
          courseId
        );
        skill.courseIds = ids;
        skill.courseId = ids[0] || courseId || skill.courseId;
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

function createEmptyLibrary(courseId) {
  return {
    meta: {
      version: 3,
      scope: 'program',
      courseId: courseId || null,
      fileKind: KIND,
      lastModified: new Date().toISOString(),
      curriculumMeta: emptyCurriculumMeta()
    },
    topics: [],
    skills: []
  };
}

function migrateLibrary(raw) {
  if (!raw || !Array.isArray(raw.topics)) return createEmptyLibrary();
  if (!raw.meta || typeof raw.meta !== 'object') raw.meta = { version: 3 };
  var legacyCourse = raw.meta.courseId || 'REGN15';
  if (!raw.meta.scope) raw.meta.scope = 'program';
  if (raw.meta.version == null || raw.meta.version < 3) raw.meta.version = 3;
  raw.meta.curriculumMeta = normalizeCurriculumMeta(raw.meta.curriculumMeta);
  raw.topics = raw.topics.filter(function (t) { return t && typeof t === 'object'; });

  // One-time extract: legacy topic.defaultSkills → skills bank, then detach from topics.
  var extracted = buildSkillsFromTopics(raw.topics, legacyCourse);
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
  raw.skills = raw.skills.map(function (s) {
    var skill = normalizeSkill(s);
    if (!skill) return null;
    if (!skill.courseIds.length) {
      skill.courseIds = normalizeCourseIds(null, legacyCourse);
      skill.courseId = skill.courseIds[0] || legacyCourse;
    }
    return skill;
  }).filter(Boolean);
  raw.topics = raw.topics.map(function (t) {
    var topic = normalizeTopic(t, legacyCourse);
    if (!topic) return null;
    if (!topic.courseIds.length) {
      topic.courseIds = normalizeCourseIds(null, legacyCourse);
      topic.courseId = topic.courseIds[0] || legacyCourse;
    }
    return topic;
  }).filter(Boolean);
  return raw;
}

function skillKindLabel(kind) {
  if (kind === 'introduction') return 'Intro';
  if (kind === 'practice') return 'Practice';
  if (kind === 'testout') return 'Testout';
  return kind || '';
}

export {
  SKILL_KINDS,
  emptyCurriculumMeta,
  normalizeCurriculumMeta,
  inferSkillKinds,
  normalizeSkillKinds,
  normalizeSkillTestoutSettings,
  isUsableSkillTitle,
  normalizeSkill,
  normalizeTopic,
  normalizeCourseIds,
  itemsForCourse,
  filterLibraryForCourse,
  itemBelongsToCourse,
  createEmptyLibrary,
  migrateLibrary,
  skillKindLabel
};
