/**
 * One-off / maintenance: rebuild skills bank from legacy topic.defaultSkills
 * (if present), then strip defaultSkills from topics and ensure description +
 * curriculumMeta stubs exist on topics, skills, and library meta.
 */
var fs = require('fs');
var path = require('path');
var file = path.join(__dirname, '../../mock-onedrive/theory-content-library_REGN15.json');
var raw = JSON.parse(fs.readFileSync(file, 'utf8'));

function emptyMeta() {
  return {
    version: 1,
    corRefs: [],
    acenStandards: [],
    programOutcomes: [],
    courseOutcomes: [],
    notes: ''
  };
}

function infer(t) {
  var kinds = [];
  if (/\bintro(?:duction)?\b/i.test(t)) kinds.push('introduction');
  if (/\bpractice\b|\bpracti[sc]e\b/i.test(t)) kinds.push('practice');
  if (/\btest[\s-]*outs?\b|\btestouts?\b/i.test(t)) kinds.push('testout');
  return kinds;
}

function usable(t) {
  t = String(t || '').trim();
  if (t.length < 2) return false;
  if (/^[\/\\|.,;:_-]+$/.test(t)) return false;
  if (t === '/' || /^r$/i.test(t)) return false;
  if (/\bbreak\b/i.test(t) || /\bholiday\b/i.test(t) || /^no class$/i.test(t)) return false;
  return true;
}

function idFrom(t) {
  var slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
  return 'skill_' + (slug || 'x');
}

var by = {};
(raw.skills || []).forEach(function (s) {
  if (!s || !usable(s.title)) return;
  var key = String(s.title).toLowerCase();
  by[key] = {
    id: s.id || idFrom(s.title),
    title: s.title,
    description: s.description != null ? String(s.description) : '',
    kinds: Array.isArray(s.kinds) ? s.kinds.slice() : infer(s.title),
    curriculumMeta: s.curriculumMeta || emptyMeta(),
    courseId: s.courseId || (raw.meta && raw.meta.courseId) || 'REGN15'
  };
});

(raw.topics || []).forEach(function (topic) {
  (topic.defaultSkills || []).forEach(function (title) {
    if (!usable(title)) return;
    var key = title.toLowerCase();
    if (!by[key]) {
      by[key] = {
        id: idFrom(title),
        title: title,
        description: '',
        kinds: infer(title),
        curriculumMeta: emptyMeta(),
        courseId: (raw.meta && raw.meta.courseId) || 'REGN15'
      };
      return;
    }
    infer(title).forEach(function (k) {
      if (by[key].kinds.indexOf(k) < 0) by[key].kinds.push(k);
    });
  });
});

raw.skills = Object.keys(by).sort().map(function (k) { return by[k]; });
raw.topics = (raw.topics || []).map(function (t) {
  return {
    id: t.id,
    title: t.title,
    shortLabel: t.shortLabel || '',
    moduleRef: t.moduleRef || '',
    description: t.description != null ? String(t.description) : '',
    defaultLectureHours: t.defaultLectureHours != null ? t.defaultLectureHours : null,
    defaultTopics: Array.isArray(t.defaultTopics) ? t.defaultTopics : [],
    tags: Array.isArray(t.tags) ? t.tags : [],
    curriculumMeta: t.curriculumMeta || emptyMeta(),
    courseId: t.courseId || (raw.meta && raw.meta.courseId) || 'REGN15'
  };
});

if (!raw.meta) raw.meta = {};
raw.meta.version = 2;
raw.meta.curriculumMeta = raw.meta.curriculumMeta || emptyMeta();
raw.meta.lastModified = new Date().toISOString();

fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
console.log('Wrote', raw.skills.length, 'skills;', raw.topics.length, 'topics (no defaultSkills)');
