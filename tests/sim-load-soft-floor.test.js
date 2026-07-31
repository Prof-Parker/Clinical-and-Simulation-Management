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
  getSimPracticalMinLoad
} from '../src/core/scheduler/helpers.js';
import { consolidateThinSimSessions } from '../src/core/scheduler/sim-thin-consolidate.js';

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
    // Raw score still prefers empty (0) over healthy (4)
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
    assertSimClinicalIntegrity(sem);
  });
});
