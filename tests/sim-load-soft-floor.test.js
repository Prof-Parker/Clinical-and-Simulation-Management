import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DataModel,
  CalendarEngine,
  Scheduler
} from './_harness.js';
import {
  candidateLoadScore,
  candidateLoadScoreRaw,
  candidateLoadScoreSoftFloor,
  getSimPracticalMinLoad,
  getSimIdealMinLoad
} from '../src/core/scheduler/helpers.js';
import {
  consolidateThinSimSessions,
  runFillIdealPass,
  runEvacuateThinPass,
  scoreThinOutcome
} from '../src/core/scheduler/sim-thin-consolidate.js';
import {
  dayHasForeignSimScenario,
  collectMixedDayMismatchEntries,
  tryMoveStudent,
  ensureSimCalendar
} from '../src/core/scheduler/sim-thin-shared.js';
import { getDaySimAttendanceCount } from '../src/core/scheduler/helpers.js';

var __dirname = dirname(fileURLToPath(import.meta.url));
var FIXTURE_B = join(__dirname, '..', 'mock-onedrive', 'semesters', 'F2026_REGN15P_week17_test.json');

function assertSimClinicalIntegrity(sem) {
  var simNeeded = sem.config.simDaysRequired || 5;
  var clinNeeded = sem.config.clinicalDaysRequired || 10;
  var soft = sem.config.maxGuestSimsPerStudent != null ? sem.config.maxGuestSimsPerStudent : 1;
  sem.students.forEach(function (s) {
    var sims = [];
    (s.schedule || []).forEach(function (c) {
      if (c && c.sim) sims.push(c.sim);
    });
    expect(sims.length).toBe(simNeeded);
    expect(new Set(sims).size).toBe(sims.length);
    for (var i = 1; i < sims.length; i++) {
      expect(sims[i]).toBeGreaterThan(sims[i - 1]);
    }
    var clin = 0;
    var guests = 0;
    (s.schedule || []).forEach(function (c) {
      if (!c || c.inactive) return;
      if (c.clinical && !c.clinicalMissed) clin++;
      if (c.makeupClinical) clin++;
      if (c.sim && c.simGuestGroup) guests++;
    });
    expect(clin).toBeGreaterThanOrEqual(clinNeeded);
    expect(guests).toBeLessThanOrEqual(soft);
  });
}

function countThinOpenSessions(sem) {
  var half = getSimPracticalMinLoad(sem.config);
  var days = DataModel.getSimDays(sem.config);
  var thin = 0;
  var open = 0;
  var byKey = {};
  sem.students.forEach(function (s) {
    (s.schedule || []).forEach(function (c, wi) {
      if (!c || !c.sim || !c.simDay) return;
      var key = wi + '|' + c.simDay;
      byKey[key] = (byKey[key] || 0) + 1;
    });
  });
  Object.keys(byKey).forEach(function (k) {
    open++;
    if (byKey[k] < half) thin++;
  });
  return { thin: thin, open: open, half: half };
}

function emptyCell() {
  return {
    clinical: false,
    clinicalMissed: false,
    inactive: false,
    sim: null,
    simDay: null,
    simGuestGroup: null,
    simOverload: false,
    simMakeup: false
  };
}

function simCell(simNum, day) {
  var c = emptyCell();
  c.sim = simNum;
  c.simDay = day;
  return c;
}

function makeWeeks(n) {
  var weeks = [];
  for (var i = 0; i < n; i++) weeks.push({ weekIndex: i });
  return weeks;
}

function makeCalendarWeeks(n) {
  var weeks = [];
  for (var i = 0; i < n; i++) {
    weeks.push({ inactive: false, break: false, holiday: false });
  }
  return weeks;
}

/** Thin Mon W0 (2) + dense Mon W2 (7); donors can move into W0. */
function buildFillFixture() {
  var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
  cfg.maxStudentsPerSimSession = 8;
  cfg.maxGuestSimsPerStudent = 1;
  cfg.simDaysRequired = 1;
  var students = [];
  var i;
  for (i = 0; i < 2; i++) {
    students.push({
      id: 'thin' + i,
      name: 'Thin ' + i,
      simGroup: 'A',
      clinicalGroup: 'C2',
      schedule: [simCell(1, 'Mon'), emptyCell(), emptyCell()]
    });
  }
  for (i = 0; i < 7; i++) {
    students.push({
      id: 'dense' + i,
      name: 'Dense ' + i,
      simGroup: 'A',
      clinicalGroup: 'C2',
      schedule: [emptyCell(), emptyCell(), simCell(1, 'Mon')]
    });
  }
  return {
    config: cfg,
    students: students,
    weeks: makeWeeks(3),
    holidays: [],
    facilities: [],
    calendar: {
      semesterStartDate: '2026-08-17',
      weeks: makeCalendarWeeks(3)
    }
  };
}

describe('sim load soft floor', () => {
  it('prefers packing thin open sessions over empty ones', () => {
    var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
    cfg.maxStudentsPerSimSession = 8;
    expect(getSimPracticalMinLoad(cfg)).toBe(4);

    var data = {
      students: [
        { id: 'a', schedule: [{ sim: 1, simDay: 'Mon' }, null, null] },
        { id: 'b', schedule: [{ sim: 1, simDay: 'Mon' }, null, null] }
      ]
    };
    var thin = candidateLoadScoreSoftFloor(data, 0, 'Mon', cfg);
    var empty = candidateLoadScoreSoftFloor(data, 0, 'Tue', cfg);
    expect(thin).toBeLessThan(empty);
  });

  it('among thin sessions still prefers lower load (spread)', () => {
    var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
    cfg.maxStudentsPerSimSession = 8;
    var data = { students: [] };
    for (var i = 0; i < 3; i++) {
      data.students.push({ id: 'm' + i, schedule: [{ sim: 1, simDay: 'Mon' }] });
    }
    data.students.push({ id: 't0', schedule: [{ sim: 1, simDay: 'Tue' }] });
    var mon = candidateLoadScoreSoftFloor(data, 0, 'Mon', cfg);
    var tue = candidateLoadScoreSoftFloor(data, 0, 'Tue', cfg);
    expect(tue).toBeLessThan(mon);
  });

  it('empty scores below healthy under soft floor', () => {
    var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
    cfg.maxStudentsPerSimSession = 8;
    var data = {
      students: []
    };
    for (var i = 0; i < 4; i++) {
      data.students.push({ id: 'h' + i, schedule: [{ sim: 1, simDay: 'Mon' }] });
    }
    var empty = candidateLoadScoreSoftFloor(data, 0, 'Tue', cfg);
    var healthy = candidateLoadScoreSoftFloor(data, 0, 'Mon', cfg);
    expect(empty).toBeLessThan(healthy);
    expect(candidateLoadScoreRaw(data, 0, 'Tue', cfg)).toBeLessThan(
      candidateLoadScoreRaw(data, 0, 'Mon', cfg)
    );
  });

  it('candidateLoadScore respects applySoftFloor flag', () => {
    var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
    cfg.maxStudentsPerSimSession = 8;
    var data = {
      students: [
        { id: 'a', schedule: [{ sim: 1, simDay: 'Mon' }] }
      ]
    };
    expect(candidateLoadScore(data, 0, 'Tue', cfg, { applySoftFloor: true }))
      .toBe(candidateLoadScoreSoftFloor(data, 0, 'Tue', cfg));
    expect(candidateLoadScore(data, 0, 'Tue', cfg))
      .toBe(candidateLoadScoreRaw(data, 0, 'Tue', cfg));
  });

  it('getSimIdealMinLoad is three-quarters of max, at least absolute', () => {
    var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
    cfg.maxStudentsPerSimSession = 8;
    expect(getSimIdealMinLoad(cfg)).toBe(6);
    cfg.maxStudentsPerSimSession = 9;
    expect(getSimIdealMinLoad(cfg)).toBe(7);
  });
});

describe('thin sim fill and multi-pass', () => {
  it('fill pass raises thin Mon without dropping donor below absolute', () => {
    var data = buildFillFixture();
    expect(getDaySimAttendanceCount(data, 0, 'Mon')).toBe(2);
    expect(getDaySimAttendanceCount(data, 2, 'Mon')).toBe(7);
    var before = scoreThinOutcome(data);
    expect(before.nAbs).toBe(1);

    var fill = runFillIdealPass(data);
    expect(fill.moved).toBeGreaterThan(0);
    expect(getDaySimAttendanceCount(data, 0, 'Mon')).toBeGreaterThanOrEqual(4);
    expect(getDaySimAttendanceCount(data, 2, 'Mon')).toBeGreaterThanOrEqual(4);
    expect(scoreThinOutcome(data).nAbs).toBe(0);

    data.students.forEach(function (s) {
      var sims = (s.schedule || []).filter(function (c) { return c && c.sim; });
      expect(sims.length).toBe(1);
      expect(sims[0].sim).toBe(1);
    });
  });

  it('multi-pass prefers fill when evacuate leaves higher nAbs', () => {
    var data = buildFillFixture();
    var before = scoreThinOutcome(data);
    expect(before.nAbs).toBe(1);

    var result = consolidateThinSimSessions(data);
    expect(result.thinAfter).toBeLessThanOrEqual(result.thinBefore);
    expect(result.thinAfter).toBe(0);
    expect(['fill', 'evacuateThenFill', 'fillThenEvacuate']).toContain(result.winner);
    expect(result.candidates.length).toBe(5);
    expect(getDaySimAttendanceCount(data, 0, 'Mon')).toBeGreaterThanOrEqual(4);
    expect(getDaySimAttendanceCount(data, 2, 'Mon')).toBeGreaterThanOrEqual(4);
  });

  it('rejects placing a different sim scenario onto an occupied day', () => {
    var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
    cfg.maxStudentsPerSimSession = 8;
    cfg.maxGuestSimsPerStudent = 1;
    var data = {
      config: cfg,
      students: [
        {
          id: 'host5',
          simGroup: 'A',
          clinicalGroup: 'C2',
          schedule: [simCell(5, 'Mon'), emptyCell(), emptyCell()]
        },
        {
          id: 'mover4',
          simGroup: 'A',
          clinicalGroup: 'C2',
          schedule: [emptyCell(), emptyCell(), simCell(4, 'Mon')]
        }
      ],
      weeks: makeWeeks(3),
      holidays: [],
      facilities: [],
      calendar: { semesterStartDate: '2026-08-17', weeks: makeCalendarWeeks(3) }
    };
    expect(dayHasForeignSimScenario(data, 0, 'Mon', 4, 'mover4')).toBe(true);
    var ctx = ensureSimCalendar(data);
    var ok = tryMoveStudent(
      data,
      { student: data.students[1], fromWi: 2, fromDay: 'Mon', simNum: 4 },
      { weekIndex: 0, day: 'Mon' },
      ctx.cfg,
      ctx.calendar,
      ctx.simGroups,
      ctx.soft
    );
    expect(ok).toBe(false);
    expect(data.students[1].schedule[2].sim).toBe(4);
    expect(data.students[1].schedule[0].sim).toBeFalsy();
  });

  it('evacuates minority sim off mixed day onto same-sim open day', () => {
    var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
    cfg.maxStudentsPerSimSession = 8;
    cfg.maxGuestSimsPerStudent = 1;
    var students = [];
    var i;
    for (i = 0; i < 6; i++) {
      students.push({
        id: 's5_' + i,
        name: 'S5 ' + i,
        simGroup: 'A',
        clinicalGroup: 'C2',
        schedule: [simCell(5, 'Mon'), emptyCell(), emptyCell()]
      });
    }
    students.push({
      id: 's4_minority',
      name: 'Student 26',
      simGroup: 'A',
      clinicalGroup: 'C2',
      schedule: [simCell(4, 'Mon'), emptyCell(), emptyCell()]
    });
    for (i = 0; i < 4; i++) {
      students.push({
        id: 's4_host_' + i,
        name: 'S4 host ' + i,
        simGroup: 'A',
        clinicalGroup: 'C2',
        schedule: [emptyCell(), emptyCell(), simCell(4, 'Mon')]
      });
    }
    var data = {
      config: cfg,
      students: students,
      weeks: makeWeeks(3),
      holidays: [],
      facilities: [],
      calendar: { semesterStartDate: '2026-08-17', weeks: makeCalendarWeeks(3) }
    };
    expect(collectMixedDayMismatchEntries(data).length).toBe(1);
    expect(dayHasForeignSimScenario(data, 0, 'Mon', 5, null)).toBe(true);

    var result = runEvacuateThinPass(data);
    expect(result.moved).toBeGreaterThanOrEqual(1);
    var minority = data.students.find(function (s) { return s.id === 's4_minority'; });
    expect(minority.schedule[0].sim).toBeFalsy();
    expect(minority.schedule[2].sim).toBe(4);
    expect(minority.schedule[2].simDay).toBe('Mon');
    expect(dayHasForeignSimScenario(data, 0, 'Mon', 5, null)).toBe(false);
    expect(collectMixedDayMismatchEntries(data).length).toBe(0);
  });
});

describe.skipIf(!existsSync(FIXTURE_B))('sim load soft floor F2026 fixture', () => {
  it('regen with soft floor keeps integrity and limits thin remnants', () => {
    var raw = JSON.parse(readFileSync(FIXTURE_B, 'utf8'));
    var sem = JSON.parse(JSON.stringify(raw.semesters[0]));
    DataModel.normalizeConfig(sem.config);
    DataModel.migrateClinicalGroupFacilities(sem);
    CalendarEngine.rebuildWeeks(sem);
    sem.config.week17MakeupMode = 'current';
    Scheduler.regenerateAll(sem);

    assertSimClinicalIntegrity(sem);
    var counts = countThinOpenSessions(sem);
    expect(counts.open).toBeGreaterThan(0);
    expect(counts.thin).toBeLessThanOrEqual(Math.max(2, Math.floor(counts.open / 4)));
  });

  it('thin consolidate post-pass preserves integrity and does not increase thin count', () => {
    var raw = JSON.parse(readFileSync(FIXTURE_B, 'utf8'));
    var sem = JSON.parse(JSON.stringify(raw.semesters[0]));
    DataModel.normalizeConfig(sem.config);
    DataModel.migrateClinicalGroupFacilities(sem);
    CalendarEngine.rebuildWeeks(sem);
    sem.config.week17MakeupMode = 'current';
    Scheduler.regenerateAll(sem);

    var before = countThinOpenSessions(sem);
    var result = consolidateThinSimSessions(sem);
    expect(result.thinAfter).toBeLessThanOrEqual(result.thinBefore);
    expect(result.thinAfter).toBeLessThanOrEqual(before.thin);
    expect(result.winner).toBeTruthy();
    expect(result.candidates && result.candidates.length).toBe(5);
    assertSimClinicalIntegrity(sem);
  });
});
