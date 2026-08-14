/**
 * Faculty inventory from theory-calendar Faculty Needed markers.
 */

import * as ScheduleHours from '../schedule-hours.js';
import { normalizeSpecialties } from './specialties.js';
import {
  isUniqueSkillsEventTitle,
  skillsSeriesKey,
  skillsSeriesLabel
} from './skills-series.js';
import {
  primaryClinicalGroup,
  clinicalSeriesKey,
  clinicalSeriesLabel
} from './clinical-series.js';

function eventSlotKind(ev) {
  if (!ev) return '';
  var type = String(ev.type || '').toLowerCase();
  var track = String(ev.track || '').toLowerCase();
  var cats = Array.isArray(ev.categories) ? ev.categories : [];
  var has = function (name) {
    return type === name || track === name || cats.indexOf(name) >= 0;
  };
  if (has('orientation')) return 'skills';
  if (has('simulation') || has('sim')) return 'sim';
  if (has('clinical')) return 'clinical';
  if (has('skills_lab') || has('skills')) return 'skills';
  if (has('lecture') || has('guest_lecture') || track === 'theory') return 'lecture';
  return '';
}

function neededIndexes(ev, isNeeded) {
  var out = [];
  (ev.faculty || []).forEach(function (slot, fi) {
    if (isNeeded(slot)) out.push(fi);
  });
  return out;
}

function instanceFromDay(day, wd, start, end) {
  return {
    date: day.date,
    weekIndex: day.weekIndex != null ? day.weekIndex : null,
    weekday: wd,
    timeStart: start,
    timeEnd: end
  };
}

function specsForGroup(semester, g, defaultSpecialties) {
  if (g.kind === 'lecture') return ['Lec'];
  if (g.specialties && g.specialties.length) return g.specialties;
  return defaultSpecialties(semester, g.kind === 'clinical' || g.kind === 'sim' ? g.kind : 'skills');
}

function emitLegacyGroup(semester, key, g, helpers) {
  var slot = helpers.makeBase(semester, {
    slotId: 'theory:' + key,
    kind: g.kind,
    sourcePath: 'theory',
    sourceId: key,
    specialties: specsForGroup(semester, g, helpers.defaultSpecialties),
    timeStart: g.timeStart,
    timeEnd: g.timeEnd,
    weekday: g.weekday,
    facilityId: g.facilityId || '',
    siteId: g.siteId || '',
    siteLabel: g.siteLabel || '',
    clinicalGroup: g.clinicalGroup || '',
    open: g.capacity > 0,
    capacity: g.capacity,
    openCount: g.capacity,
    theoryRefs: g.refs,
    instances: Object.keys(g.instances).sort().map(function (d) { return g.instances[d]; })
  });
  return helpers.finalizeSlot(slot);
}

function emitSeriesSeat(semester, series, seat, helpers) {
  var unique = !!series.unique;
  var slot = helpers.makeBase(semester, {
    slotId: 'theory:' + series.key + ':seat:' + seat,
    kind: series.kind,
    sourcePath: 'theory',
    sourceId: series.key + ':seat:' + seat,
    specialties: specsForGroup(semester, series, helpers.defaultSpecialties),
    timeStart: series.timeStart,
    timeEnd: series.timeEnd,
    weekday: series.weekday,
    facilityId: series.facilityId || '',
    siteId: series.siteId || '',
    siteLabel: series.siteLabel || '',
    clinicalGroup: series.clinicalGroup || '',
    open: true,
    capacity: 1,
    openCount: 1,
    facultyPerInstance: series.facultyPerInstance,
    seriesKey: series.key,
    seriesLabel: series.seriesLabel,
    seriesOnce: unique,
    coversAllInstances: !unique,
    theoryRefs: series.seats[seat],
    instances: Object.keys(series.instances).sort().map(function (d) {
      return series.instances[d];
    })
  });
  return helpers.finalizeSlot(slot);
}

function ensureSeries(map, key, seed) {
  if (!map[key]) map[key] = seed;
  return map[key];
}

function pushNeededSeats(series, day, ev, helpers) {
  var staff = (ev.faculty || []).length;
  if (staff > series.facultyPerInstance) series.facultyPerInstance = staff;
  neededIndexes(ev, helpers.isNeeded).forEach(function (fi, seat) {
    if (!series.seats[seat]) series.seats[seat] = [];
    series.seats[seat].push({
      dayId: day.id,
      eventId: ev.id,
      facultyIndex: fi,
      facultyId: (ev.faculty[fi] && ev.faculty[fi].id) || ''
    });
  });
}

/**
 * @param {object} helpers { isNeeded, makeBase, finalizeSlot, fullWeekday, weekdayFromDate, defaultSpecialties }
 */
function buildTheorySlots(semester, helpers) {
  var theory = semester.theory;
  if (!theory || !Array.isArray(theory.days)) return [];
  var legacy = {};
  var seriesMap = {};

  theory.days.forEach(function (day) {
    if (!day || !Array.isArray(day.events)) return;
    day.events.forEach(function (ev) {
      if (!ev || !Array.isArray(ev.faculty)) return;
      var kind = eventSlotKind(ev);
      if (!kind) return;
      var start = ScheduleHours.normalizeHhmm(ev.timeStart || day.timeStart, '0800');
      var end = ScheduleHours.normalizeHhmm(ev.timeEnd || day.timeEnd, '1200');
      var wd = helpers.fullWeekday(day.weekday) || helpers.weekdayFromDate(day.date);
      var siteKey = ev.facilityId || ev.siteId || '';
      var groupKey = Array.isArray(ev.groups) ? ev.groups.join(',') : '';
      var tags = normalizeSpecialties(ev.contentTags);

      if (kind === 'skills') {
        var unique = isUniqueSkillsEventTitle(ev.title);
        var sKey = skillsSeriesKey({
          title: ev.title,
          date: day.date,
          weekday: wd,
          start: start,
          end: end,
          courseCode: ev.courseCode || '',
          siteKey: siteKey
        });
        var skills = ensureSeries(seriesMap, sKey, {
          key: sKey,
          kind: kind,
          unique: unique,
          seriesLabel: skillsSeriesLabel(ev.title, unique),
          weekday: wd,
          timeStart: start,
          timeEnd: end,
          courseCode: ev.courseCode || '',
          facilityId: siteKey,
          siteId: siteKey,
          siteLabel: ev.siteLabel || '',
          clinicalGroup: (ev.groups && ev.groups[0]) || '',
          specialties: tags,
          facultyPerInstance: 0,
          seats: [],
          instances: {}
        });
        if (tags.length && !skills.specialties.length) skills.specialties = tags;
        pushNeededSeats(skills, day, ev, helpers);
        if (day.date) skills.instances[day.date] = instanceFromDay(day, wd, start, end);
        return;
      }

      if (kind === 'clinical') {
        var clinGroup = primaryClinicalGroup(ev);
        var cKey = clinicalSeriesKey({
          clinicalGroup: clinGroup,
          courseCode: ev.courseCode || ''
        });
        var clin = ensureSeries(seriesMap, cKey, {
          key: cKey,
          kind: kind,
          unique: false,
          seriesLabel: clinicalSeriesLabel(clinGroup, ev.siteLabel || ''),
          weekday: wd,
          timeStart: start,
          timeEnd: end,
          courseCode: ev.courseCode || '',
          facilityId: siteKey,
          siteId: siteKey,
          siteLabel: ev.siteLabel || '',
          clinicalGroup: clinGroup,
          specialties: tags,
          facultyPerInstance: 0,
          seats: [],
          instances: {}
        });
        if (tags.length) clin.specialties = tags;
        if (ev.siteLabel) clin.siteLabel = ev.siteLabel;
        if (siteKey) {
          clin.facilityId = siteKey;
          clin.siteId = siteKey;
        }
        // Prefer the majority session length (ignore one-off makeup hour tweaks for chip hours).
        if (!clin._timeCounts) clin._timeCounts = {};
        var tKey = start + '-' + end;
        clin._timeCounts[tKey] = (clin._timeCounts[tKey] || 0) + 1;
        var best = 0;
        Object.keys(clin._timeCounts).forEach(function (k) {
          if (clin._timeCounts[k] > best) {
            best = clin._timeCounts[k];
            var parts = k.split('-');
            clin.timeStart = parts[0];
            clin.timeEnd = parts[1];
          }
        });
        clin.seriesLabel = clinicalSeriesLabel(clinGroup, clin.siteLabel);
        pushNeededSeats(clin, day, ev, helpers);
        if (day.date) clin.instances[day.date] = instanceFromDay(day, wd, start, end);
        return;
      }

      ev.faculty.forEach(function (slot, fi) {
        if (!helpers.isNeeded(slot)) return;
        var key = [kind, wd, start, end, ev.courseCode || '', siteKey, groupKey].join('|');
        if (!legacy[key]) {
          legacy[key] = {
            kind: kind,
            weekday: wd,
            timeStart: start,
            timeEnd: end,
            courseCode: ev.courseCode || '',
            facilityId: siteKey,
            siteId: siteKey,
            siteLabel: ev.siteLabel || '',
            clinicalGroup: (ev.groups && ev.groups[0]) || '',
            specialties: tags,
            capacity: 0,
            refs: [],
            instances: {}
          };
        }
        legacy[key].capacity += 1;
        legacy[key].refs.push({
          dayId: day.id,
          eventId: ev.id,
          facultyIndex: fi,
          facultyId: slot.id || ''
        });
        if (day.date) {
          legacy[key].instances[day.date] = instanceFromDay(day, wd, start, end);
        }
      });
    });
  });

  var out = Object.keys(legacy).map(function (key) {
    return emitLegacyGroup(semester, key, legacy[key], helpers);
  });
  Object.keys(seriesMap).forEach(function (key) {
    var series = seriesMap[key];
    delete series._timeCounts;
    (series.seats || []).forEach(function (refs, seat) {
      if (!refs || !refs.length) return;
      out.push(emitSeriesSeat(semester, series, seat, helpers));
    });
  });
  return out;
}

export {
  eventSlotKind,
  buildTheorySlots
};
