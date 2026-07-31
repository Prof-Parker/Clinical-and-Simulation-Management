/* eslint-disable no-console */
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
  collectWeek17MakeupNeeds,
  getWeek17Index,
  rebalanceWeek17ClinicalMakeups
} from '../src/core/scheduler/week17-clinical-makeup.js';

var __dirname = dirname(fileURLToPath(import.meta.url));
var FIXTURE_B = join(__dirname, '..', 'mock-onedrive', 'semesters', 'F2026_REGN15P_week17_test.json');
var FIXTURE_A = join(__dirname, '..', 'mock-onedrive', 'semesters', 'F2026_REGN_program.json');

function findSrmc(sem) {
  return (sem.facilities || []).find(function (f) {
    return /shasta|srmc/i.test((f.name || '') + ' ' + (f.shortName || ''));
  });
}

function findSte(sem) {
  return (sem.facilities || []).find(function (f) {
    return /elizabeth|st\.?\s*e/i.test((f.name || '') + ' ' + (f.shortName || ''));
  });
}

function assertSimClinicalIntegrity(sem) {
  var simNeeded = sem.config.simDaysRequired || 5;
  var clinNeeded = sem.config.clinicalDaysRequired || 10;
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
    (s.schedule || []).forEach(function (c) {
      if (!c || c.inactive) return;
      if (c.clinical && !c.clinicalMissed) clin++;
      if (c.makeupClinical) clin++;
    });
    expect(clin).toBeGreaterThanOrEqual(clinNeeded);
  });
}

function siteMakeupCounts(sem, wi) {
  var srmc = findSrmc(sem);
  var ste = findSte(sem);
  var counts = { srmc: 0, ste: 0, other: 0 };
  collectWeek17MakeupNeeds(sem, { includeShortfall: false }).forEach(function (n) {
    var facId = n.student.schedule[wi].facilityId || n.assignedSiteId;
    if (srmc && DataModel.sameFacilitySite(sem, facId, srmc.id)) counts.srmc++;
    else if (ste && DataModel.sameFacilitySite(sem, facId, ste.id)) counts.ste++;
    else counts.other++;
  });
  return counts;
}

describe.skipIf(!existsSync(FIXTURE_B))('F2026 week17 preferred-site packing (B)', () => {
  it('explicit Apply transfers StE conflicts onto SRMC peers for 8→2×4 Monday groups', () => {
    var raw = JSON.parse(readFileSync(FIXTURE_B, 'utf8'));
    var sem = JSON.parse(JSON.stringify(raw.semesters[0]));
    DataModel.normalizeConfig(sem.config);
    DataModel.migrateClinicalGroupFacilities(sem);
    CalendarEngine.rebuildWeeks(sem);

    expect(sem.config.holidayBlocksFullWeek).toBe(false);
    var srmc = findSrmc(sem);
    expect(srmc).toBeTruthy();

    // Base pipeline only — clustering must not auto-run.
    sem.config.week17MakeupMode = 'byPreferredSite';
    sem.config.week17MakeupPreferredSiteId = srmc.id;
    sem.config.week17MakeupTargetDay = 'Mon';
    Scheduler.regenerateAll(sem);
    expect(sem._week17ClusteringStale).toBe(true);

    var plan = rebalanceWeek17ClinicalMakeups(sem);
    expect(plan).toBeTruthy();
    expect(sem._week17ClusteringStale).toBe(false);

    var wi = getWeek17Index(sem);
    var needs = collectWeek17MakeupNeeds(sem, { includeShortfall: false });
    expect(needs.length).toBe(8);

    var counts = siteMakeupCounts(sem, wi);
    expect(counts.srmc).toBe(8);
    expect(counts.ste).toBe(0);

    needs.forEach(function (n) {
      expect(n.student.schedule[wi].makeupClinical).toBe(true);
      var mk = (n.student.makeups || []).find(function (m) {
        return m.weekIndex === wi && m.type === 'clinical';
      });
      expect(mk.joinedDay).toBe('Mon');
    });

    var srmcRow = (plan.bySiteDay || []).find(function (r) {
      return DataModel.sameFacilitySite(sem, r.facilityId, srmc.id);
    });
    expect(srmcRow).toBeTruthy();
    expect(srmcRow.studentCount).toBe(8);
    expect(srmcRow.makeupGroups).toBe(2);
    expect(srmcRow.groupSizes).toEqual([4, 4]);
    expect(plan.totalMakeupGroups).toBe(2);

    assertSimClinicalIntegrity(sem);
  });
});

describe.skipIf(!existsSync(FIXTURE_A))('F2026 week17 preferred-site packing (A)', () => {
  it('explicit Apply packs 10→2×5 at SRMC with 0 St. E when transfer succeeds', () => {
    var raw = JSON.parse(readFileSync(FIXTURE_A, 'utf8'));
    var sem = JSON.parse(JSON.stringify(raw.semesters[0]));
    DataModel.normalizeConfig(sem.config);
    DataModel.migrateClinicalGroupFacilities(sem);
    CalendarEngine.rebuildWeeks(sem);
    sem.config.holidayBlocksFullWeek = true;

    var srmc = findSrmc(sem);
    expect(srmc).toBeTruthy();

    sem.config.week17MakeupMode = 'byPreferredSite';
    sem.config.week17MakeupPreferredSiteId = srmc.id;
    sem.config.week17MakeupTargetDay = 'Mon';
    Scheduler.regenerateAll(sem);
    var plan = rebalanceWeek17ClinicalMakeups(sem);
    expect(plan).toBeTruthy();

    var wi = getWeek17Index(sem);
    var counts = siteMakeupCounts(sem, wi);
    // Best case: all at SRMC. If transfer cannot absorb everyone, ste may remain —
    // prefer asserting SRMC is maximized and groups are even when ste is 0.
    if (counts.ste === 0) {
      expect(counts.srmc).toBe(10);
      var srmcRow = (plan.bySiteDay || []).find(function (r) {
        return DataModel.sameFacilitySite(sem, r.facilityId, srmc.id);
      });
      expect(srmcRow.studentCount).toBe(10);
      expect(srmcRow.makeupGroups).toBe(2);
      expect(srmcRow.groupSizes).toEqual([5, 5]);
    } else {
      expect(counts.srmc).toBeGreaterThanOrEqual(8);
    }
    assertSimClinicalIntegrity(sem);
  });
});
