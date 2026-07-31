/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  ClinicalSites
} from './_harness.js';
import {
  evenSplitSizes,
  makeupGroupsNeeded,
  compareOutcomeRank
} from '../src/core/scheduler/week17-makeup-split.js';
import {
  rebalanceWeek17ClinicalMakeups,
  collectWeek17MakeupNeeds,
  getWeek17Index
} from '../src/core/scheduler/week17-clinical-makeup.js';
import { previewWeek17MakeupOutcomes } from '../src/core/scheduler/week17-makeup-preview.js';

describe('week17-clinical-makeup', () => {
  it('even-splits and ranks fewest groups first', () => {
    expect(makeupGroupsNeeded(10, 6)).toBe(2);
    expect(evenSplitSizes(10, 6)).toEqual([5, 5]);
    expect(evenSplitSizes(8, 6)).toEqual([4, 4]);
    expect(evenSplitSizes(6, 6)).toEqual([6]);
    expect(evenSplitSizes(7, 6)).toEqual([4, 3]);

    var ranked = [
      { totalMakeupGroups: 3, unscheduledCount: 0, conflictNotesCount: 0, preferredSiteMatch: false, id: 'b' },
      { totalMakeupGroups: 2, unscheduledCount: 0, conflictNotesCount: 0, preferredSiteMatch: false, id: 'a' }
    ].sort(compareOutcomeRank);
    expect(ranked[0].id).toBe('a');
  });

  it('normalizes missing week17 config to current', () => {
    var cfg = DataModel.normalizeConfig({});
    expect(cfg.week17MakeupMode).toBe('current');
    expect(cfg.week17MakeupTargetDay).toBe('Mon');
    expect(cfg.week17MakeupPreferredSiteId).toBe(null);
  });

  it('current mode is a no-op and regenerateAll does not auto-cluster', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    DataModel.migrateClinicalGroupFacilities(sem);
    CalendarEngine.rebuildWeeks(sem);
    sem.config.week17MakeupMode = 'byPreferredSite';
    Scheduler.regenerateAll(sem);
    expect(sem._week17ClusteringStale).toBe(true);

    sem.config.week17MakeupMode = 'current';
    expect(rebalanceWeek17ClinicalMakeups(sem)).toBe(null);
  });

  it('consolidates site-locked makeups without moving clinical groups or sites', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    DataModel.migrateClinicalGroupFacilities(sem);
    CalendarEngine.rebuildWeeks(sem);

    var srmc = sem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
    var ste = sem.facilities.find(function (f) { return f.name.indexOf('Elizabeth') >= 0; });
    expect(srmc && ste).toBeTruthy();

    sem.config.clinicalGroupFacilities.C2 = [srmc.id];
    sem.config.clinicalGroupFacilities.C3 = [srmc.id];
    sem.config.clinicalGroupFacilities.C4 = [ste.id];
    sem.config.clinicalGroupFacilities.C5 = [ste.id];
    sem.config.maxPerClinicalGroup = 6;
    ClinicalSites.applyPrimarySitesToStudents(sem);

    Scheduler.regenerateAll(sem);
    var wi = getWeek17Index(sem);

    sem.students.forEach(function (s) {
      s.schedule.forEach(function (cell) {
        if (!cell) return;
        if (cell.clinicalMissed) cell.clinicalMissed = false;
        if (cell.makeupClinical) {
          cell.makeupClinical = false;
          if (!cell.clinical) cell.facilityId = null;
        }
      });
      s.makeups = (s.makeups || []).filter(function (m) { return m.type !== 'clinical'; });
    });

    var srmcStudents = sem.students.filter(function (s) {
      return DataModel.sameFacilitySite(sem, s.facilityId, srmc.id) &&
        (s.clinicalGroup === 'C2' || s.clinicalGroup === 'C3');
    }).slice(0, 8);
    var steStudents = sem.students.filter(function (s) {
      return DataModel.sameFacilitySite(sem, s.facilityId, ste.id) && s.clinicalGroup === 'C4';
    }).slice(0, 2);
    expect(srmcStudents.length).toBe(8);
    expect(steStudents.length).toBe(2);

    srmcStudents.concat(steStudents).forEach(function (s) {
      for (var w = 0; w < wi; w++) {
        var earlier = s.schedule[w];
        if (earlier && earlier.clinical && !earlier.clinicalMissed) {
          earlier.clinicalMissed = true;
          break;
        }
      }
      var cell = s.schedule[wi];
      cell.sim = null;
      cell.simDay = null;
      cell.clinical = false;
      cell.clinicalMissed = false;
      cell.makeupClinical = true;
      cell.facilityId = s.facilityId;
      cell.inactive = false;
    });

    var groupsBefore = {};
    srmcStudents.concat(steStudents).forEach(function (s) {
      groupsBefore[s.id] = s.clinicalGroup;
    });

    sem.config.week17MakeupMode = 'byTargetDay';
    sem.config.week17MakeupTargetDay = 'Mon';

    var plan = rebalanceWeek17ClinicalMakeups(sem);
    expect(plan).toBeTruthy();
    expect(plan.totalMakeupGroups).toBe(3);
    expect(sem._week17ClusteringStale).toBe(false);

    srmcStudents.forEach(function (s) {
      expect(s.clinicalGroup).toBe(groupsBefore[s.id]);
      expect(DataModel.sameFacilitySite(sem, s.schedule[wi].facilityId, srmc.id)).toBe(true);
      expect(s.schedule[wi].makeupClinical).toBe(true);
    });
    steStudents.forEach(function (s) {
      expect(s.clinicalGroup).toBe(groupsBefore[s.id]);
      expect(DataModel.sameFacilitySite(sem, s.schedule[wi].facilityId, ste.id)).toBe(true);
      expect(s.schedule[wi].makeupClinical).toBe(true);
    });
  });

  it('target-day mode keeps assigned site when weekday changes', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    DataModel.migrateClinicalGroupFacilities(sem);
    CalendarEngine.rebuildWeeks(sem);
    var ste = sem.facilities.find(function (f) { return f.name.indexOf('Elizabeth') >= 0; });
    var srmc = sem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
    sem.config.clinicalGroupFacilities.C4 = [ste.id];
    sem.config.clinicalGroupDays.C4 = 'Mon';
    ClinicalSites.applyPrimarySitesToStudents(sem);
    Scheduler.regenerateAll(sem);

    var student = sem.students.find(function (s) { return s.clinicalGroup === 'C4'; });
    expect(student).toBeTruthy();
    var wi = getWeek17Index(sem);
    for (var w = 0; w < wi; w++) {
      var earlier = student.schedule[w];
      if (earlier && earlier.clinical && !earlier.clinicalMissed) {
        earlier.clinicalMissed = true;
        break;
      }
    }
    var cell = student.schedule[wi];
    cell.sim = null;
    cell.simDay = null;
    cell.clinical = false;
    cell.makeupClinical = true;
    cell.facilityId = ste.id;
    cell.inactive = false;

    sem.students.forEach(function (s) {
      if (s.id === student.id) return;
      s.schedule.forEach(function (c) {
        if (!c) return;
        if (c.clinicalMissed) c.clinicalMissed = false;
        if (c.makeupClinical) {
          c.makeupClinical = false;
          if (!c.clinical) c.facilityId = null;
        }
      });
      s.makeups = (s.makeups || []).filter(function (m) { return m.type !== 'clinical'; });
    });

    sem.config.week17MakeupMode = 'byTargetDay';
    sem.config.week17MakeupTargetDay = 'Tue';
    rebalanceWeek17ClinicalMakeups(sem);

    expect(student.schedule[wi].makeupClinical).toBe(true);
    expect(DataModel.sameFacilitySite(sem, student.schedule[wi].facilityId, ste.id)).toBe(true);
    expect(DataModel.sameFacilitySite(sem, student.schedule[wi].facilityId, srmc.id)).toBe(false);
    var mk = (student.makeups || []).find(function (m) {
      return m.type === 'clinical' && m.weekIndex === wi;
    });
    expect(mk.joinedDay).toBe('Tue');
    expect(student.clinicalGroup).toBe('C4');
  });

  it('preview ranks fewest makeup groups first', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    DataModel.migrateClinicalGroupFacilities(sem);
    CalendarEngine.rebuildWeeks(sem);
    Scheduler.regenerateAll(sem);
    var outcomes = previewWeek17MakeupOutcomes(sem);
    expect(outcomes.length).toBeGreaterThan(0);
    for (var i = 1; i < outcomes.length; i++) {
      expect(outcomes[i].totalMakeupGroups).toBeGreaterThanOrEqual(outcomes[i - 1].totalMakeupGroups);
    }
  });
});

var __dirname = dirname(fileURLToPath(import.meta.url));
var F2026_A = join(__dirname, '..', 'mock-onedrive', 'semesters', 'F2026_REGN_program.json');

describe.skipIf(!existsSync(F2026_A))('week17 F2026 program (A) preferred-site', () => {
  it('Apply packs toward preferred site without cross-site facility moves', () => {
    var raw = JSON.parse(readFileSync(F2026_A, 'utf8'));
    var sem = JSON.parse(JSON.stringify(raw.semesters[0]));
    DataModel.normalizeConfig(sem.config);
    DataModel.migrateClinicalGroupFacilities(sem);
    CalendarEngine.rebuildWeeks(sem);

    var srmc = sem.facilities.find(function (f) {
      return /shasta|srmc/i.test(f.name + ' ' + (f.shortName || ''));
    });
    expect(srmc).toBeTruthy();

    sem.config.week17MakeupMode = 'current';
    Scheduler.regenerateAll(sem);
    expect(sem._week17ClusteringStale).toBe(false);

    var before = collectWeek17MakeupNeeds(sem, { includeShortfall: false });
    expect(before.length).toBeGreaterThan(0);

    sem.config.week17MakeupMode = 'byPreferredSite';
    sem.config.week17MakeupPreferredSiteId = srmc.id;
    sem.config.week17MakeupTargetDay = 'Mon';
    var plan = rebalanceWeek17ClinicalMakeups(sem);
    expect(plan).toBeTruthy();
    expect(sem._week17ClusteringStale).toBe(false);

    var maxPer = sem.config.maxPerClinicalGroup || 6;
    plan.bySiteDay.forEach(function (row) {
      expect(row.makeupGroups).toBe(makeupGroupsNeeded(row.studentCount, maxPer));
      row.groupSizes.forEach(function (sz) {
        expect(sz).toBeLessThanOrEqual(maxPer);
      });
    });

    var wi = getWeek17Index(sem);
    before.forEach(function (n) {
      var s = sem.students.find(function (x) { return x.id === n.studentId; });
      if (!s || !s.schedule[wi].makeupClinical) return;
      expect(DataModel.sameFacilitySite(sem, s.schedule[wi].facilityId, n.assignedSiteId)).toBe(true);
      expect(s.clinicalGroup).toBe(n.clinicalGroup);
    });
  });
});
