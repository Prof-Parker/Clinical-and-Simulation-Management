/**
 * Clinical, simulation, and orientation clock times → contact hours.
 * Facility/sim/orientation times are the preferred source; theory contactHourRules
 * remain a fallback when times are absent.
 */

import { hoursFromTimes, getContactHourRules, clinicalHoursForDay, simHoursForDay } from './theory-data.js';
import { findFacilityById } from './data-model/facilities.js';
import { getGroupOrientations } from './orientation.js';

export var DEFAULT_CLINICAL_START = '0600';
export var DEFAULT_CLINICAL_END = '1830';
export var DEFAULT_SIM_START = '0900';
export var DEFAULT_SIM_END = '1500';
export var DEFAULT_ORIENT_START = '0800';
export var DEFAULT_ORIENT_END = '1200';

export function normalizeHhmm(value, fallback) {
  var raw = String(value == null ? '' : value).replace(/\D/g, '');
  if (raw.length === 3) raw = '0' + raw;
  if (raw.length !== 4) return fallback || '';
  var h = parseInt(raw.slice(0, 2), 10);
  var m = parseInt(raw.slice(2, 4), 10);
  if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return fallback || '';
  return raw;
}

export function hhmmToTimeInput(hhmm) {
  var v = normalizeHhmm(hhmm, '');
  if (!v) return '';
  return v.slice(0, 2) + ':' + v.slice(2, 4);
}

export function timeInputToHhmm(val, fallback) {
  if (!val) return fallback || '';
  return normalizeHhmm(String(val).replace(':', ''), fallback || '');
}

export function formatHhmmDisplay(hhmm) {
  var v = normalizeHhmm(hhmm, '');
  if (!v) return '';
  var h = parseInt(v.slice(0, 2), 10);
  var m = v.slice(2, 4);
  var ampm = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return h12 + ':' + m + ' ' + ampm;
}

export function formatTimeRange(start, end) {
  var a = formatHhmmDisplay(start);
  var b = formatHhmmDisplay(end);
  if (!a || !b) return '';
  return a + '–' + b;
}

export function roundHours(n) {
  return Math.round((n || 0) * 100) / 100;
}

export function ensureFacilityTimes(facility) {
  if (!facility) return facility;
  if (!facility.clinicalStart) facility.clinicalStart = DEFAULT_CLINICAL_START;
  if (!facility.clinicalEnd) facility.clinicalEnd = DEFAULT_CLINICAL_END;
  facility.clinicalStart = normalizeHhmm(facility.clinicalStart, DEFAULT_CLINICAL_START);
  facility.clinicalEnd = normalizeHhmm(facility.clinicalEnd, DEFAULT_CLINICAL_END);
  return facility;
}

export function ensureSimTimes(cfg) {
  if (!cfg) return cfg;
  if (!cfg.simDefaultStart) cfg.simDefaultStart = DEFAULT_SIM_START;
  if (!cfg.simDefaultEnd) cfg.simDefaultEnd = DEFAULT_SIM_END;
  cfg.simDefaultStart = normalizeHhmm(cfg.simDefaultStart, DEFAULT_SIM_START);
  cfg.simDefaultEnd = normalizeHhmm(cfg.simDefaultEnd, DEFAULT_SIM_END);
  if (!Array.isArray(cfg.simTimeOverrides)) cfg.simTimeOverrides = [];
  cfg.simTimeOverrides = cfg.simTimeOverrides.map(function (o) {
    if (!o || o.simNum == null) return null;
    return {
      simNum: parseInt(o.simNum, 10),
      start: normalizeHhmm(o.start, cfg.simDefaultStart),
      end: normalizeHhmm(o.end, cfg.simDefaultEnd)
    };
  }).filter(function (o) {
    return o && !isNaN(o.simNum) && o.simNum > 0;
  });
  return cfg;
}

export function ensureOrientationTimes(orient) {
  if (!orient) return orient;
  if (!orient.timeStart) orient.timeStart = DEFAULT_ORIENT_START;
  if (!orient.timeEnd) orient.timeEnd = DEFAULT_ORIENT_END;
  orient.timeStart = normalizeHhmm(orient.timeStart, DEFAULT_ORIENT_START);
  orient.timeEnd = normalizeHhmm(orient.timeEnd, DEFAULT_ORIENT_END);
  return orient;
}

export function clinicalTimesForFacility(semester, facilityId) {
  var fac = findFacilityById(semester, facilityId);
  if (fac) {
    ensureFacilityTimes(fac);
    return { start: fac.clinicalStart, end: fac.clinicalEnd };
  }
  return { start: DEFAULT_CLINICAL_START, end: DEFAULT_CLINICAL_END };
}

export function simTimesForNum(semester, simNum) {
  var cfg = ensureSimTimes((semester && semester.config) || {});
  var n = parseInt(simNum, 10);
  var override = (cfg.simTimeOverrides || []).find(function (o) {
    return o.simNum === n;
  });
  if (override) return { start: override.start, end: override.end };
  return { start: cfg.simDefaultStart, end: cfg.simDefaultEnd };
}

export function resolveClinicalDayHours(semester, facilityId) {
  var times = clinicalTimesForFacility(semester, facilityId);
  var fromTimes = hoursFromTimes(times.start, times.end);
  if (fromTimes > 0) return fromTimes;
  var codes = (semester.theory && semester.theory.courseCodes) || [];
  var practicum = codes.find(function (c) { return /P$/i.test(c); }) || codes[0];
  var rules = getContactHourRules(semester.theory, practicum);
  return clinicalHoursForDay(rules, facilityId) || hoursFromTimes(DEFAULT_CLINICAL_START, DEFAULT_CLINICAL_END);
}

export function resolveSimDayHours(semester, simNum) {
  var times = simTimesForNum(semester, simNum);
  var fromTimes = hoursFromTimes(times.start, times.end);
  if (fromTimes > 0) return fromTimes;
  var codes = (semester.theory && semester.theory.courseCodes) || [];
  var practicum = codes.find(function (c) { return /P$/i.test(c); }) || codes[0];
  var rules = getContactHourRules(semester.theory, practicum);
  return simHoursForDay(rules, simNum) || hoursFromTimes(DEFAULT_SIM_START, DEFAULT_SIM_END);
}

export function orientationSessionHours(orient) {
  ensureOrientationTimes(orient);
  return hoursFromTimes(orient.timeStart, orient.timeEnd);
}

function cellFacilityId(student, cell) {
  return (cell && cell.facilityId) || student.facilityId || null;
}

export function studentClinicalHours(student, semester) {
  var total = 0;
  (student.schedule || []).forEach(function (cell) {
    if (!cell || cell.inactive) return;
    if ((cell.clinical && !cell.clinicalMissed) || cell.makeupClinical) {
      total += resolveClinicalDayHours(semester, cellFacilityId(student, cell));
    }
  });
  return roundHours(total);
}

export function studentSimHours(student, semester) {
  var total = 0;
  (student.schedule || []).forEach(function (cell) {
    if (!cell || cell.inactive || !cell.sim) return;
    total += resolveSimDayHours(semester, cell.sim);
  });
  return roundHours(total);
}

export function studentOrientationHours(student, semester) {
  var total = 0;
  getGroupOrientations(semester, student.clinicalGroup).forEach(function (o) {
    total += orientationSessionHours(o);
  });
  return roundHours(total);
}

export function studentHoursSummary(student, semester) {
  return {
    clinicalHours: studentClinicalHours(student, semester),
    simHours: studentSimHours(student, semester),
    orientationHours: studentOrientationHours(student, semester)
  };
}
