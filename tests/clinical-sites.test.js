/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  ClinicalSites,
  Orientation
} from './_harness.js';

describe('clinical-sites.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(condition, message) {
      if (!condition) {
        failed++;
        console.error('FAIL: ' + message);
        return;
      }
    }

    function makeSemester() {
      var fileRoot = DataModel.createDefaultFile();
      var sem = fileRoot.semesters[0];
      DataModel.migrateClinicalGroupFacilities(sem);
      CalendarEngine.rebuildWeeks(sem);
      return sem;
    }

    var sem = makeSemester();
    var srmc = sem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
    var se = sem.facilities.find(function (f) { return f.name.indexOf('Elizabeth') >= 0; });

    assert(srmc && se, 'default facilities exist');
    assert(sem.config.clinicalGroupFacilities.C1.length === 1, 'migrated C1 has one site');
    assert(
      DataModel.sameFacilitySite(sem, sem.config.clinicalGroupFacilities.C1[0], srmc.id),
      'C1 primary is SRMC'
    );

    var calVet = { id: DataModel.uid(), name: 'Cal Vet' };
    sem.facilities.push(calVet);
    sem.config.clinicalGroupFacilities.C2 = [srmc.id, calVet.id];
    ClinicalSites.applyPrimarySitesToStudents(sem);

    var c2Student = sem.students.find(function (s) { return s.clinicalGroup === 'C2'; });
    assert(c2Student, 'C2 student exists');
    assert(
      DataModel.sameFacilitySite(sem, c2Student.facilityId, srmc.id),
      'C2 student primary site is first in list'
    );

    Scheduler.regenerateAll(sem);

    var facSequence = [];
    c2Student.schedule.forEach(function (cell, wi) {
      if (!cell || cell.inactive) return;
      if (cell.clinical) {
        facSequence.push({
          week: wi + 1,
          fac: ClinicalSites.getStudentFacilityAtWeek(sem, c2Student, wi)
        });
      }
    });

    assert(facSequence.length >= 4, 'C2 has scheduled clinical weeks');
    for (var i = 0; i < facSequence.length; i++) {
      var expected = i % 2 === 0 ? srmc.id : calVet.id;
      assert(
        DataModel.sameFacilitySite(sem, facSequence[i].fac, expected),
        'C2 week ' + facSequence[i].week + ' alternates sites (index ' + i + ')'
      );
    }

    var sessions = Scheduler.getExistingClinicalAtFacility(sem, calVet.id, 'none');
    assert(sessions.length > 0, 'finds Cal Vet clinical sessions');

    var singleSem = DataModel.createDefaultSemester();
    Object.keys(singleSem.config.clinicalGroupFacilities).forEach(function (g) {
      var facId = DataModel.getDefaultFacilityIdForClinicalGroup(g, singleSem.facilities);
      singleSem.config.clinicalGroupFacilities[g] = facId ? [facId] : [];
    });
    var srmcSingle = singleSem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
    Scheduler.regenerateAll(singleSem);
    var c1 = singleSem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
    var allSrmc = c1.schedule.every(function (cell, wi) {
      if (!cell || !cell.clinical) return true;
      return DataModel.sameFacilitySite(
        singleSem,
        ClinicalSites.getStudentFacilityAtWeek(singleSem, c1, wi),
        srmcSingle.id
      );
    });
    assert(allSrmc, 'single-site group uses one facility on all clinical weeks');

    assert(!ClinicalSites.groupUsesWeekRanges(sem, 'C1'), 'C1 has no week ranges by default');

    var rangeSem = DataModel.createDefaultSemester();
    DataModel.migrateClinicalGroupFacilities(rangeSem);
    CalendarEngine.rebuildWeeks(rangeSem);
    var srmcR = rangeSem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
    var calVetR = { id: DataModel.uid(), name: 'Cal Vet' };
    rangeSem.facilities.push(calVetR);
    rangeSem.config.clinicalGroupFacilities.C2 = [calVetR.id, srmcR.id];
    rangeSem.config.clinicalGroupSiteWeeks.C2 = [
      { facilityId: calVetR.id, startWeekIndex: 3, endWeekIndex: 5 },
      { facilityId: srmcR.id, startWeekIndex: 6, endWeekIndex: 14 }
    ];
    ClinicalSites.normalizeGroupSiteWeeks(rangeSem);
    assert(ClinicalSites.groupUsesWeekRanges(rangeSem, 'C2'), 'C2 week ranges enabled');
    assert(
      DataModel.sameFacilitySite(rangeSem, ClinicalSites.resolveFacilityForWeek(rangeSem, 'C2', 4, 0), calVetR.id),
      'week 5 resolves to Cal Vet'
    );
    assert(
      DataModel.sameFacilitySite(rangeSem, ClinicalSites.resolveFacilityForWeek(rangeSem, 'C2', 9, 0), srmcR.id),
      'week 10 resolves to SRMC'
    );
    assert(
      DataModel.sameFacilitySite(rangeSem, ClinicalSites.resolveFacilityForWeek(rangeSem, 'C2', 2, 0), calVetR.id),
      'gap week uses primary site (Cal Vet first in list)'
    );
    var gapWarnings = ClinicalSites.findGroupSiteWeekGaps(rangeSem, 'C2');
    assert(gapWarnings.indexOf(2) >= 0 || gapWarnings.indexOf(15) >= 0, 'reports gap weeks outside ranges');

    Scheduler.regenerateAll(rangeSem);
    var c2r = rangeSem.students.find(function (s) { return s.clinicalGroup === 'C2'; });
    var w5cell = c2r.schedule[4];
    if (w5cell && w5cell.clinical) {
      assert(
        DataModel.sameFacilitySite(rangeSem, w5cell.facilityId, calVetR.id),
        'regenerated week 5 clinical at Cal Vet'
      );
    }
    var w10cell = c2r.schedule[9];
    if (w10cell && w10cell.clinical) {
      assert(
        DataModel.sameFacilitySite(rangeSem, w10cell.facilityId, srmcR.id),
        'regenerated week 10 clinical at SRMC'
      );
    }

    rangeSem.config.clinicalGroupSiteWeeks.C2 = [
      { facilityId: calVetR.id, startWeekIndex: 3, endWeekIndex: 8 },
      { facilityId: srmcR.id, startWeekIndex: 7, endWeekIndex: 14 }
    ];
    var overlapWarn = ClinicalSites.validateGroupSiteWeeks(rangeSem, 'C2').warnings;
    assert(overlapWarn.length > 0, 'overlapping ranges produce warning');

    var planNotes = ClinicalSites.getSiteWeekPlanNotes(rangeSem);
    assert(planNotes.length > 0, 'site week plan notes include overlap/gap info');

    expect(failed).toBe(0);
  });
});
