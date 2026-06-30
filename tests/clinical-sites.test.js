/* eslint-disable no-console */
'use strict';

var harness = require('./_harness');
harness.loadCore();
harness.load('js/orientation.js');
harness.load('js/clinical-sites.js');

var App = harness.App;
var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error('FAIL: ' + message);
    return;
  }
  passed++;
}

function makeSemester() {
  var fileRoot = App.DataModel.createDefaultFile();
  var sem = fileRoot.semesters[0];
  App.DataModel.migrateClinicalGroupFacilities(sem);
  App.CalendarEngine.rebuildWeeks(sem);
  return sem;
}

var sem = makeSemester();
var srmc = sem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
var se = sem.facilities.find(function (f) { return f.name.indexOf('Elizabeth') >= 0; });

assert(srmc && se, 'default facilities exist');
assert(sem.config.clinicalGroupFacilities.C1.length === 1, 'migrated C1 has one site');
assert(
  App.DataModel.sameFacilitySite(sem, sem.config.clinicalGroupFacilities.C1[0], srmc.id),
  'C1 primary is SRMC'
);

var calVet = { id: App.DataModel.uid(), name: 'Cal Vet' };
sem.facilities.push(calVet);
sem.config.clinicalGroupFacilities.C2 = [srmc.id, calVet.id];
App.ClinicalSites.applyPrimarySitesToStudents(sem);

var c2Student = sem.students.find(function (s) { return s.clinicalGroup === 'C2'; });
assert(c2Student, 'C2 student exists');
assert(
  App.DataModel.sameFacilitySite(sem, c2Student.facilityId, srmc.id),
  'C2 student primary site is first in list'
);

App.Scheduler.regenerateAll(sem);

var facSequence = [];
c2Student.schedule.forEach(function (cell, wi) {
  if (!cell || cell.inactive) return;
  if (cell.clinical) {
    facSequence.push({
      week: wi + 1,
      fac: App.ClinicalSites.getStudentFacilityAtWeek(sem, c2Student, wi)
    });
  }
});

assert(facSequence.length >= 4, 'C2 has scheduled clinical weeks');
for (var i = 0; i < facSequence.length; i++) {
  var expected = i % 2 === 0 ? srmc.id : calVet.id;
  assert(
    App.DataModel.sameFacilitySite(sem, facSequence[i].fac, expected),
    'C2 week ' + facSequence[i].week + ' alternates sites (index ' + i + ')'
  );
}

var sessions = App.Scheduler.getExistingClinicalAtFacility(sem, calVet.id, 'none');
assert(sessions.length > 0, 'finds Cal Vet clinical sessions');

var singleSem = App.DataModel.createDefaultSemester();
Object.keys(singleSem.config.clinicalGroupFacilities).forEach(function (g) {
  var facId = App.DataModel.getDefaultFacilityIdForClinicalGroup(g, singleSem.facilities);
  singleSem.config.clinicalGroupFacilities[g] = facId ? [facId] : [];
});
var srmcSingle = singleSem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
App.Scheduler.regenerateAll(singleSem);
var c1 = singleSem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
var allSrmc = c1.schedule.every(function (cell, wi) {
  if (!cell || !cell.clinical) return true;
  return App.DataModel.sameFacilitySite(
    singleSem,
    App.ClinicalSites.getStudentFacilityAtWeek(singleSem, c1, wi),
    srmcSingle.id
  );
});
assert(allSrmc, 'single-site group uses one facility on all clinical weeks');

assert(!App.ClinicalSites.groupUsesWeekRanges(sem, 'C1'), 'C1 has no week ranges by default');

var rangeSem = App.DataModel.createDefaultSemester();
App.DataModel.migrateClinicalGroupFacilities(rangeSem);
App.CalendarEngine.rebuildWeeks(rangeSem);
var srmcR = rangeSem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
var calVetR = { id: App.DataModel.uid(), name: 'Cal Vet' };
rangeSem.facilities.push(calVetR);
rangeSem.config.clinicalGroupFacilities.C2 = [calVetR.id, srmcR.id];
rangeSem.config.clinicalGroupSiteWeeks.C2 = [
  { facilityId: calVetR.id, startWeekIndex: 3, endWeekIndex: 5 },
  { facilityId: srmcR.id, startWeekIndex: 6, endWeekIndex: 14 }
];
App.ClinicalSites.normalizeGroupSiteWeeks(rangeSem);
assert(App.ClinicalSites.groupUsesWeekRanges(rangeSem, 'C2'), 'C2 week ranges enabled');
assert(
  App.DataModel.sameFacilitySite(rangeSem, App.ClinicalSites.resolveFacilityForWeek(rangeSem, 'C2', 4, 0), calVetR.id),
  'week 5 resolves to Cal Vet'
);
assert(
  App.DataModel.sameFacilitySite(rangeSem, App.ClinicalSites.resolveFacilityForWeek(rangeSem, 'C2', 9, 0), srmcR.id),
  'week 10 resolves to SRMC'
);
assert(
  App.DataModel.sameFacilitySite(rangeSem, App.ClinicalSites.resolveFacilityForWeek(rangeSem, 'C2', 2, 0), calVetR.id),
  'gap week uses primary site (Cal Vet first in list)'
);
var gapWarnings = App.ClinicalSites.findGroupSiteWeekGaps(rangeSem, 'C2');
assert(gapWarnings.indexOf(2) >= 0 || gapWarnings.indexOf(15) >= 0, 'reports gap weeks outside ranges');

App.Scheduler.regenerateAll(rangeSem);
var c2r = rangeSem.students.find(function (s) { return s.clinicalGroup === 'C2'; });
var w5cell = c2r.schedule[4];
if (w5cell && w5cell.clinical) {
  assert(
    App.DataModel.sameFacilitySite(rangeSem, w5cell.facilityId, calVetR.id),
    'regenerated week 5 clinical at Cal Vet'
  );
}
var w10cell = c2r.schedule[9];
if (w10cell && w10cell.clinical) {
  assert(
    App.DataModel.sameFacilitySite(rangeSem, w10cell.facilityId, srmcR.id),
    'regenerated week 10 clinical at SRMC'
  );
}

rangeSem.config.clinicalGroupSiteWeeks.C2 = [
  { facilityId: calVetR.id, startWeekIndex: 3, endWeekIndex: 8 },
  { facilityId: srmcR.id, startWeekIndex: 7, endWeekIndex: 14 }
];
var overlapWarn = App.ClinicalSites.validateGroupSiteWeeks(rangeSem, 'C2').warnings;
assert(overlapWarn.length > 0, 'overlapping ranges produce warning');

var planNotes = App.ClinicalSites.getSiteWeekPlanNotes(rangeSem);
assert(planNotes.length > 0, 'site week plan notes include overlap/gap info');

console.log('\nClinical sites: ' + passed + ' passed, ' + failed + ' failed');if (failed > 0) process.exit(1);
