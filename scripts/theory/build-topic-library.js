/**
 * Build TheoryTopic[] from lecture rows and events.
 * Skills lab strings from source rows belong in the skills bank (with
 * skillPlacements on events), not on topics.
 */

import {
  normalizeSkill,
  isUsableSkillTitle
} from '../../src/storage/theory-library-model.js';
import {
  formatSkillPlacementsDescription,
  skillRefsFromPlacements
} from '../../src/core/skill-placements.js';
import { makeFacultySlot } from '../../src/core/theory-events.js';

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

/** Split a skills-lab free-text blob into fragments. */
export function splitSkillsLabText(text) {
  return String(text || '')
    .split(/[;,|]/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

/**
 * Parse one skills-lab fragment into a library title + placement kind.
 * Strips leading Testout / introduce / Intro / practice markers when present.
 */
export function parseSkillLabFragment(raw) {
  var t = String(raw || '').trim();
  if (!t || !isUsableSkillTitle(t)) return null;
  var kind = '';
  var m;
  if ((m = t.match(/^test[\s-]*outs?\b[:\s-]*(.+)$/i))) {
    kind = 'testout';
    t = m[1].trim();
  } else if ((m = t.match(/^introduce\b[:\s-]*(.+)$/i))) {
    kind = 'introduction';
    t = m[1].trim();
  } else if ((m = t.match(/^intro\b[:\s-]*(.+)$/i))) {
    kind = 'introduction';
    t = m[1].trim();
  } else if ((m = t.match(/^practice\b[:\s-]*(.+)$/i))) {
    kind = 'practice';
    t = m[1].trim();
  }
  if (!isUsableSkillTitle(t)) return null;
  return { title: t, kind: kind };
}

function upsertSkill(byKey, title, kind, courseId) {
  var key = String(title || '').toLowerCase();
  if (!key) return null;
  if (!byKey[key]) {
    var skill = normalizeSkill({
      title: title,
      description: '',
      kinds: kind ? [kind] : [],
      courseId: courseId || 'REGN15',
      courseIds: [courseId || 'REGN15']
    });
    if (!skill) return null;
    byKey[key] = skill;
    return skill;
  }
  if (kind && byKey[key].kinds.indexOf(kind) < 0) {
    byKey[key].kinds.push(kind);
  }
  return byKey[key];
}

export function buildTopicLibrary(lectureRows, eventsByDate) {
  var topics = [];
  var seenTopic = {};
  var skillsByKey = {};
  lectureRows.forEach(function (row) {
    var title = (row.topic || '').split(';')[0].trim();
    if (title && !seenTopic[title]) {
      seenTopic[title] = true;
      var id = 'topic_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
      topics.push({
        id: id,
        title: title,
        shortLabel: title.length > 32 ? title.slice(0, 32) + '…' : title,
        description: '',
        defaultLectureHours: 2.83,
        defaultTopics: title.split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean),
        tags: ['MS'],
        curriculumMeta: emptyCurriculumMeta(),
        courseId: 'REGN15',
        courseIds: ['REGN15']
      });
    }
    splitSkillsLabText(row.skillsLab).forEach(function (fragment) {
      var parsed = parseSkillLabFragment(fragment);
      if (!parsed) return;
      upsertSkill(skillsByKey, parsed.title, parsed.kind, 'REGN15');
    });
  });
  var skills = Object.keys(skillsByKey).sort().map(function (k) { return skillsByKey[k]; });
  return {
    topics: topics,
    skills: skills,
    /** @deprecated use skills[].title */
    skillTitles: skills.map(function (s) { return s.title; })
  };
}

export function attachModuleRefs(theoryDays, topics) {
  theoryDays.forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track !== 'theory' || !ev.title) return;
      var base = ev.title.replace(/^Module \d+[A-D] — /, '').split(';')[0].trim();
      var topic = topics.find(function (t) {
        return t.title === base || t.title.indexOf(base) === 0 || base.indexOf(t.title) === 0;
      });
      if (topic) ev.moduleRef = topic.id;
    });
  });
}

/**
 * Convert skills-lab description text into skillPlacements linked to the bank.
 */
export function attachSkillPlacementsToEvents(theoryDays, skills) {
  var byTitle = {};
  (skills || []).forEach(function (s) {
    if (!s || !s.id || !s.title) return;
    byTitle[String(s.title).toLowerCase()] = s;
  });
  var titleOf = function (id) {
    for (var i = 0; i < (skills || []).length; i++) {
      if (skills[i].id === id) return skills[i].title;
    }
    return '';
  };

  (theoryDays || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (!ev || ev.track !== 'skills') return;
      var placements = [];
      splitSkillsLabText(ev.description).forEach(function (fragment) {
        var parsed = parseSkillLabFragment(fragment);
        if (!parsed) return;
        var skill = byTitle[parsed.title.toLowerCase()] ||
          byTitle[String(fragment).trim().toLowerCase()];
        if (!skill) return;
        placements.push({ skillId: skill.id, kind: parsed.kind || '' });
      });
      if (!placements.length) return;
      ev.skillPlacements = placements;
      ev.skillRefs = skillRefsFromPlacements(placements);
      ev.description = formatSkillPlacementsDescription(placements, titleOf);
    });
  });
}

function isPlaceholderSkillsEvent(ev) {
  var text = String((ev && (ev.description || ev.title)) || '').trim();
  return !text || /^n\/?a$/i.test(text) || /^no class$/i.test(text);
}

/**
 * Seed Faculty Needed slots on every skills-lab event (for Faculty Schedule).
 */
export function applySkillsFacultyNeeded(theoryDays, required) {
  var n = required != null ? required : 2;
  if (!isFinite(n) || n < 1) n = 2;
  n = Math.min(6, Math.floor(n));
  (theoryDays || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (!ev || ev.track !== 'skills') return;
      if (isPlaceholderSkillsEvent(ev)) {
        ev.facultyRequired = 0;
        ev.faculty = [];
        return;
      }
      ev.facultyRequired = n;
      var slots = [];
      for (var i = 0; i < n; i++) {
        slots.push(makeFacultySlot({ needed: true, role: 'skills' }));
      }
      ev.faculty = slots;
    });
  });
}
