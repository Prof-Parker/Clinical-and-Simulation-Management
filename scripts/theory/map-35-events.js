/**
 * Pure REGN 35 prototype-cell mapping (no ExcelJS / no app UI imports).
 * Title classify, times, groups, faculty tokens, site ids, sim-group inherit.
 */

var FACULTY_NEEDED_NAME = 'Faculty Needed';
var FULL_TIME_NAME = 'Full Time Faculty';

function makeFacultySlot(opts) {
  opts = opts || {};
  var needed = !!opts.needed || !opts.name || opts.name === FACULTY_NEEDED_NAME;
  return {
    name: needed ? FACULTY_NEEDED_NAME : String(opts.name || '').trim(),
    role: opts.role || 'lecturer',
    needed: needed
  };
}

export var ALL_CLINICAL_GROUPS = ['C1', 'C2', 'C3', 'C4', 'C5'];

export var SITES = {
  mmcr: {
    id: 'fac_mmcr',
    name: 'Mercy Medical Center Redding',
    shortName: 'MMCR',
    contentTags: ['MS']
  },
  srmc: {
    id: 'fac_srmc',
    name: 'Shasta Regional Medical Center',
    shortName: 'SRMC',
    contentTags: ['MS']
  }
};

var MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

var WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function normalizeHhmm(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 3) digits = '0' + digits;
  if (digits.length !== 4) return '';
  return digits;
}

export function parseTimeRange(text) {
  var m = String(text || '').match(/(\d{3,4})\s*-\s*(\d{3,4})/);
  if (!m) return null;
  var start = normalizeHhmm(m[1]);
  var end = normalizeHhmm(m[2]);
  if (!start || !end) return null;
  return { start: start, end: end };
}

export function stripTime(text) {
  return String(text || '').replace(/(\d{3,4})\s*-\s*(\d{3,4})/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseGroups(text, allGroups) {
  var t = String(text || '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/all groups/i.test(t) && !/\d/.test(t.replace(/all groups/ig, ''))) {
    return (allGroups || ALL_CLINICAL_GROUPS).slice();
  }
  if (!/^groups?\b/i.test(t)) return null;
  var nums = t.match(/\d+/g);
  if (!nums || !nums.length) return null;
  return nums.map(function (n) { return 'C' + n; });
}

export function parseFacultyTokens(text, role) {
  var s = String(text || '');
  if (!/faculty/i.test(s) && !/professor/i.test(s)) return [];
  var kinds = [];
  s = s.replace(/Professor Full Time Faculty|\(Full Time Faculty\)|Full Time Faculty/gi, function () {
    kinds.push('assigned');
    return ' ';
  });
  s = s.replace(/Professor Faculty Needed|Faculty Needed/gi, function () {
    kinds.push('needed');
    return ' ';
  });
  var slotRole = role || 'skills';
  return kinds.map(function (kind) {
    if (kind === 'needed') return makeFacultySlot({ needed: true, role: slotRole });
    return makeFacultySlot({ name: FULL_TIME_NAME, role: slotRole });
  });
}

export function classifyEventTitle(text) {
  var t = stripTime(String(text || '').replace(/\s+/g, ' ')).trim();
  if (!t) return null;
  if (/^holiday$/i.test(t) || /no classes/i.test(t)) return { skip: true };
  if (/simulation/i.test(t)) {
    return { track: 'simulation', courseCode: 'REGN35P', category: 'simulation' };
  }
  if (/clinical/i.test(t)) {
    return { track: 'clinical', courseCode: 'REGN35P', category: 'clinical' };
  }
  if (/lecture/i.test(t)) {
    return { track: 'theory', courseCode: 'REGN35', category: 'lecture' };
  }
  if (/orientation/i.test(t) || /^mandatory\b/i.test(t)) {
    return { track: 'orientation', courseCode: 'REGN35P', category: 'orientation' };
  }
  if (/skills open practice/i.test(t)) {
    return { track: 'skills', courseCode: 'REGN35P', category: 'skills_lab' };
  }
  if (/skills|skims|iv lab|sign\s*offs?/i.test(t)) {
    return { track: 'skills', courseCode: 'REGN35P', category: 'skills_lab' };
  }
  return null;
}

export function siteFromTitle(title) {
  var t = String(title || '');
  if (!/clinical/i.test(t)) return null;
  if (/mercy/i.test(t)) return SITES.mmcr;
  if (/srmc|\brmc\b/i.test(t)) return SITES.srmc;
  return null;
}

function roleForTrack(track) {
  return track === 'theory' ? 'lecturer' : 'skills';
}

function appendText(base, extra) {
  extra = String(extra || '').trim();
  if (!extra) return base || '';
  if (!base) return extra;
  return base + ' ' + extra;
}

function looksLikeHoursLabel(text) {
  return /^(REGN\s|Regn\s|Theory:|Clinical:|Orientation:|Weekly Hours)/i.test(String(text || '').trim());
}

function isHeaderish(text) {
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(t)) return true;
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Segment stacked day-column lines into event drafts.
 */
export function linesToEvents(lines, options) {
  options = options || {};
  var allGroups = options.allGroups || ALL_CLINICAL_GROUPS;
  var events = [];
  var cur = null;

  function flush() {
    if (cur && cur.title && !cur.skip) events.push(cur);
    cur = null;
  }

  function startEvent(info, title, time) {
    flush();
    var site = info.track === 'clinical' ? siteFromTitle(title) : null;
    cur = {
      title: title,
      track: info.track,
      courseCode: info.courseCode,
      categories: [info.category],
      description: '',
      groups: /all groups/i.test(title) ? allGroups.slice() : [],
      faculty: [],
      timeStart: time ? time.start : null,
      timeEnd: time ? time.end : null,
      contentTags: ['MS'],
      facilityId: site ? site.id : '',
      siteId: site ? site.id : '',
      siteLabel: site ? site.shortName : ''
    };
  }

  (lines || []).forEach(function (rawLine) {
    var raw = String(rawLine || '').replace(/\s+/g, ' ').trim();
    if (!raw || looksLikeHoursLabel(raw) || isHeaderish(raw)) return;
    var time = parseTimeRange(raw);
    var groups = parseGroups(raw, allGroups);
    var titleInfo = classifyEventTitle(raw);
    var role = cur ? roleForTrack(cur.track) : 'skills';
    var faculty = parseFacultyTokens(raw, role);

    if (titleInfo && titleInfo.skip) return;

    if (titleInfo && cur && /^mandatory\b/i.test(cur.title) && /orientation/i.test(raw) &&
        !/mandatory/i.test(raw)) {
      cur.title = appendText(cur.title, stripTime(raw));
      if (time) {
        cur.timeStart = time.start;
        cur.timeEnd = time.end;
      }
      return;
    }

    var isNewTitle = !!(titleInfo && !groups && faculty.length === 0);
    if (isNewTitle) {
      startEvent(titleInfo, stripTime(raw), time);
      return;
    }

    if (!cur) return;

    if (groups && groups.length) {
      cur.groups = groups;
    }
    if (time) {
      cur.timeStart = time.start;
      cur.timeEnd = time.end;
    }
    if (faculty.length) {
      var slotted = parseFacultyTokens(raw, roleForTrack(cur.track));
      cur.faculty = cur.faculty.concat(slotted);
      return;
    }
    if (!titleInfo && !groups && !time) {
      cur.description = appendText(cur.description, raw);
    } else if (time) {
      var rest = stripTime(raw);
      if (rest && !groups) cur.description = appendText(cur.description, rest);
    }
  });
  flush();
  inheritSimGroups(events, allGroups);
  return events;
}

export function inheritSimGroups(events, allGroups) {
  void allGroups;
  var skillGroups = [];
  (events || []).forEach(function (ev) {
    if (ev.track !== 'skills' || !ev.groups || !ev.groups.length) return;
    ev.groups.forEach(function (g) {
      if (skillGroups.indexOf(g) < 0) skillGroups.push(g);
    });
  });
  (events || []).forEach(function (ev) {
    if (ev.track !== 'simulation') return;
    if (ev.groups && ev.groups.length) return;
    if (skillGroups.length) ev.groups = skillGroups.slice();
  });
  return events;
}

export function parseHeaderCell(text, monthCtx) {
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  var monthHit = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  if (monthHit) monthCtx.month = MONTHS[monthHit[1].toLowerCase()];
  var wdHit = t.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*(\d{1,2})\b/i);
  if (!wdHit) {
    if (monthHit && t.replace(monthHit[0], '').trim() === '') {
      return { monthOnly: true, month: monthCtx.month };
    }
    return monthHit ? { monthOnly: true, month: monthCtx.month } : null;
  }
  var full = wdHit[1].charAt(0).toUpperCase() + wdHit[1].slice(1).toLowerCase();
  var idx = WEEKDAYS_FULL.indexOf(full);
  return {
    weekday: full.slice(0, 3),
    weekdayIndex: idx,
    day: parseInt(wdHit[2], 10),
    month: monthCtx.month
  };
}

export function isoFromParts(year, month, day) {
  if (!year || !month || !day) return '';
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

export function buildTopicsAndSkills(events) {
  var topics = [];
  var skills = [];
  var seenTopic = {};
  var seenSkill = {};
  (events || []).forEach(function (ev) {
    if (ev.track === 'theory') {
      var title = String(ev.description || ev.title || '').trim();
      if (!title || seenTopic[title.toLowerCase()]) return;
      seenTopic[title.toLowerCase()] = true;
      var id = 'topic_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
      topics.push({
        id: id,
        title: title,
        shortLabel: title.length > 32 ? title.slice(0, 32) + '…' : title,
        description: '',
        defaultLectureHours: 4.1,
        defaultTopics: [title],
        tags: ['MS'],
        courseId: 'REGN35',
        courseIds: ['REGN35']
      });
      return;
    }
    if (ev.track !== 'skills' && ev.track !== 'orientation') return;
    var skillTitle = String(ev.title || '').trim();
    if (!skillTitle || seenSkill[skillTitle.toLowerCase()]) return;
    seenSkill[skillTitle.toLowerCase()] = true;
    skills.push({
      title: skillTitle,
      description: ev.description || '',
      kinds: [],
      courseId: 'REGN35',
      courseIds: ['REGN35', 'REGN35P']
    });
  });
  return { topics: topics, skills: skills };
}
