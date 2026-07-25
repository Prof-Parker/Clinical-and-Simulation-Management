/**
 * Semester scheduling configuration defaults, normalization, and sync helpers.
 */

import { uid } from './students.js';
import { migrateClinicalGroupFacilities } from './facilities.js';

export var CLINICAL_GROUPS = ['C1', 'C2', 'C3', 'C4', 'C5'];
export var SIM_GROUPS = ['SG1', 'SG2', 'SG3', 'SG4'];
export var WEEKDAY_OPTIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export var ROLE_OPTIONS = ['', 'Primary', 'Secondary', 'Evaluator', 'Scribe'];

export function defaultConfig() {
  return {
    clinicalDaysRequired: 10,
    simDaysRequired: 5,
    maxStudents: 30,
    maxPerClinicalGroup: 6,
    maxPerClinicalGroupOverload: 7,
    maxStudentsPerSimSession: 8,
    maxStudentsPerSimSessionOverload: 9,
    simMakeupHeadroomReserved: 1,
    maxGuestSimsPerStudent: 1,
    numSimGroups: 4,
    numClinicalGroups: 5,
    clinicalStartWeek: 5,
    simStartWeek: 5,
    clinicalGroups: CLINICAL_GROUPS.slice(),
    clinicalGroupDays: { C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue' },
    simGroups: SIM_GROUPS.slice(),
    simGroupDays: { SG1: 'Mon', SG2: 'Tue', SG3: 'Mon', SG4: 'Tue' },
    simGroupPattern: { SG1: 'even', SG2: 'even', SG3: 'odd', SG4: 'odd' },
    simDays: ['Mon', 'Tue'],
    simDefaultStart: '0900',
    simDefaultEnd: '1500',
    simTimeOverrides: []
  };
}

export function backfillSimGroupConfig(cfg) {
  if (!cfg.simGroupDays) cfg.simGroupDays = {};
  if (!cfg.simGroupPattern) cfg.simGroupPattern = {};
  var simDays = cfg.simDays && cfg.simDays.length ? cfg.simDays : ['Mon', 'Tue'];
  var half = Math.ceil(cfg.simGroups.length / 2);
  cfg.simGroups.forEach(function (sg, idx) {
    if (!cfg.simGroupDays[sg]) {
      cfg.simGroupDays[sg] = simDays[idx % simDays.length] || 'Mon';
    }
    var pat = cfg.simGroupPattern[sg];
    if (pat !== 'even' && pat !== 'odd') {
      cfg.simGroupPattern[sg] = idx >= half ? 'odd' : 'even';
    }
  });
  Object.keys(cfg.simGroupDays).forEach(function (key) {
    if (cfg.simGroups.indexOf(key) < 0) delete cfg.simGroupDays[key];
  });
  Object.keys(cfg.simGroupPattern).forEach(function (key) {
    if (cfg.simGroups.indexOf(key) < 0) delete cfg.simGroupPattern[key];
  });
}

export function normalizeConfig(cfg) {
  if (!cfg) cfg = defaultConfig();
  if (!cfg.clinicalGroupDays) cfg.clinicalGroupDays = {};
  if (!cfg.clinicalGroups || !cfg.clinicalGroups.length) {
    cfg.clinicalGroups = Object.keys(cfg.clinicalGroupDays);
    cfg.clinicalGroups.sort(function (a, b) {
      var na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
      var nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
      return na - nb || String(a).localeCompare(String(b));
    });
  }
  if (!cfg.clinicalGroups.length) cfg.clinicalGroups = CLINICAL_GROUPS.slice();
  cfg.clinicalGroups.forEach(function (g) {
    if (!cfg.clinicalGroupDays[g]) cfg.clinicalGroupDays[g] = 'Mon';
  });
  Object.keys(cfg.clinicalGroupDays).forEach(function (key) {
    if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupDays[key];
  });
  if (!cfg.clinicalGroupFacilities) cfg.clinicalGroupFacilities = {};
  cfg.clinicalGroups.forEach(function (g) {
    if (!cfg.clinicalGroupFacilities[g]) cfg.clinicalGroupFacilities[g] = [];
  });
  Object.keys(cfg.clinicalGroupFacilities).forEach(function (key) {
    if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupFacilities[key];
  });
  if (!cfg.clinicalGroupSiteWeeks) cfg.clinicalGroupSiteWeeks = {};
  cfg.clinicalGroups.forEach(function (g) {
    if (!cfg.clinicalGroupSiteWeeks[g]) cfg.clinicalGroupSiteWeeks[g] = [];
  });
  Object.keys(cfg.clinicalGroupSiteWeeks).forEach(function (key) {
    if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupSiteWeeks[key];
  });
  if (!cfg.simDays || !cfg.simDays.length) cfg.simDays = ['Mon', 'Tue'];
  if (!cfg.simGroups || !cfg.simGroups.length) {
    cfg.simGroups = SIM_GROUPS.slice(0, cfg.numSimGroups || SIM_GROUPS.length);
  }
  backfillSimGroupConfig(cfg);
  cfg.numClinicalGroups = cfg.clinicalGroups.length;
  cfg.numSimGroups = cfg.simGroups.length;
  if (cfg.clinicalMakeupPrimaryWeek != null && cfg.clinicalMakeupPrimaryWeek !== '') {
    var cp = parseInt(cfg.clinicalMakeupPrimaryWeek, 10);
    cfg.clinicalMakeupPrimaryWeek = isNaN(cp) ? null : cp;
  } else {
    cfg.clinicalMakeupPrimaryWeek = null;
  }
  if (cfg.clinicalMakeupFallbackWeek != null && cfg.clinicalMakeupFallbackWeek !== '') {
    var cf = parseInt(cfg.clinicalMakeupFallbackWeek, 10);
    cfg.clinicalMakeupFallbackWeek = isNaN(cf) ? null : cf;
  } else {
    cfg.clinicalMakeupFallbackWeek = null;
  }
  if (cfg.simMakeupLastResortWeek != null && cfg.simMakeupLastResortWeek !== '') {
    var sl = parseInt(cfg.simMakeupLastResortWeek, 10);
    cfg.simMakeupLastResortWeek = isNaN(sl) ? null : sl;
  } else {
    cfg.simMakeupLastResortWeek = null;
  }
  var clinNormal = cfg.maxPerClinicalGroup || 6;
  if (!cfg.maxPerClinicalGroupOverload) cfg.maxPerClinicalGroupOverload = clinNormal + 1;
  var simNormal = cfg.maxStudentsPerSimSession || 8;
  var headroom = parseInt(cfg.simMakeupHeadroomReserved, 10);
  if (isNaN(headroom) || headroom < 0) headroom = 1;
  if (headroom >= simNormal) headroom = Math.max(0, simNormal - 1);
  cfg.simMakeupHeadroomReserved = headroom;
  var guestSoft = parseInt(cfg.maxGuestSimsPerStudent, 10);
  if (isNaN(guestSoft) || guestSoft < 0) guestSoft = 1;
  cfg.maxGuestSimsPerStudent = guestSoft;
  if (!cfg.simDefaultStart) cfg.simDefaultStart = '0900';
  if (!cfg.simDefaultEnd) cfg.simDefaultEnd = '1500';
  if (!Array.isArray(cfg.simTimeOverrides)) cfg.simTimeOverrides = [];
  return cfg;
}

export function getClinicalGroups(config) {
  return normalizeConfig(config).clinicalGroups.slice();
}

export function getSimGroups(config) {
  return normalizeConfig(config).simGroups.slice();
}

export function getSimDays(config) {
  return normalizeConfig(config).simDays.slice();
}

export function nextClinicalGroupName(groups) {
  var max = 0;
  (groups || []).forEach(function (g) {
    var m = String(g).match(/^C(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'C' + (max + 1);
}

export function nextSimGroupName(groups) {
  var max = 0;
  (groups || []).forEach(function (g) {
    var m = String(g).match(/^SG(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'SG' + (max + 1);
}

export function getSimGroupDay(group, config) {
  var cfg = normalizeConfig(config);
  if (cfg.simGroupDays && cfg.simGroupDays[group]) return cfg.simGroupDays[group];
  var idx = cfg.simGroups.indexOf(group);
  var simDays = cfg.simDays;
  return simDays[idx >= 0 ? idx % simDays.length : 0] || 'Mon';
}

export function getSimGroupPattern(group, config) {
  var cfg = normalizeConfig(config);
  var pat = cfg.simGroupPattern && cfg.simGroupPattern[group];
  if (pat === 'odd' || pat === 'even') return pat;
  var idx = cfg.simGroups.indexOf(group);
  var half = Math.ceil(cfg.simGroups.length / 2);
  return idx >= half ? 'odd' : 'even';
}

export function syncSemesterFaculty(semester) {
  var groups = getClinicalGroups(semester.config);
  var byGroup = {};
  (semester.faculty || []).forEach(function (f) {
    byGroup[f.clinicalGroup] = f;
  });
  semester.faculty = groups.map(function (g) {
    if (byGroup[g]) return byGroup[g];
    return { id: uid(), name: '', clinicalGroup: g };
  });
}

export function syncSemesterStudentsForConfig(semester) {
  var clinGroups = getClinicalGroups(semester.config);
  var simGroups = getSimGroups(semester.config);
  var defaultClin = clinGroups[0] || 'C1';
  var defaultSim = simGroups[0] || 'SG1';
  (semester.students || []).forEach(function (s) {
    if (clinGroups.indexOf(s.clinicalGroup) < 0) s.clinicalGroup = defaultClin;
    if (simGroups.indexOf(s.simGroup) < 0) s.simGroup = defaultSim;
  });
}

export function syncSemesterForConfig(semester) {
  normalizeConfig(semester.config);
  migrateClinicalGroupFacilities(semester);
  syncSemesterFaculty(semester);
  syncSemesterStudentsForConfig(semester);
}

export function cloneConfig(cfg) {
  return JSON.parse(JSON.stringify(cfg || defaultConfig()));
}

export function getSchedulingDefaults(fileRoot) {
  if (!fileRoot || !fileRoot.meta || !fileRoot.meta.schedulingDefaults) return defaultConfig();
  return cloneConfig(fileRoot.meta.schedulingDefaults);
}

export function setSchedulingDefaults(fileRoot, config) {
  if (!fileRoot.meta) fileRoot.meta = {};
  fileRoot.meta.schedulingDefaults = cloneConfig(config);
}

export function configsMatch(a, b) {
  return JSON.stringify(cloneConfig(a)) === JSON.stringify(cloneConfig(b));
}

export function applyConfigToSemester(semester, config, customized) {
  semester.config = cloneConfig(config);
  if (!semester.meta) semester.meta = {};
  semester.meta.configCustomized = customized !== false;
}

export function getClinicalDayForGroup(group, config) {
  return (config.clinicalGroupDays && config.clinicalGroupDays[group]) || 'Mon';
}
