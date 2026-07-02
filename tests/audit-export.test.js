/* eslint-disable no-console */
'use strict';

var harness = require('./_harness');
harness.loadCore();
harness.load('js/audit.js');
harness.load('js/audit-snapshot.js');
harness.load('js/audit-export.js');

var App = harness.App;
App.notifyChange = App.notifyChange || function () {};

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
  sem.meta.courseId = 'REGN15P';
  App.CalendarEngine.rebuildWeeks(sem);
  App.Scheduler.regenerateAll(sem);
  return sem;
}

// ---------------------------------------------------------------- makeup log
var sem = makeSemester();
sem.students.forEach(function (s) { s.makeups = []; });
var srmc = sem.facilities.find(function (f) { return /shasta/i.test(f.name); });
var s0 = sem.students[0];
var s1 = sem.students[1];
var s2 = sem.students[2];
s0.makeups = [{
  id: 'm1', weekIndex: 7, type: 'clinical', facilityId: srmc.id,
  joinedDay: 'Tue', hostGroup: 'C2', overload: false,
  appliedAt: '2026-05-01T10:00:00.000Z', appliedByName: 'Admin A'
}];
s1.makeups = [{
  id: 'm2', weekIndex: 17, type: 'clinical', week18Fallback: true, facilityId: srmc.id
}];
s2.makeups = [{
  id: 'm3', weekIndex: 9, type: 'sim', simNum: 3, overload: true, clinicalConflict: true
}];

var rows = App.AuditExport.buildMakeupLogRows(sem);
assert(rows.length === 3, 'one row per makeup record (got ' + rows.length + ')');

var joinRow = rows.find(function (r) { return r.studentName === s0.name; });
assert(joinRow && joinRow.week === 8, 'clinical join row uses 1-based week');
assert(joinRow.type === 'Clinical', 'clinical join row typed Clinical');
assert(joinRow.joinedDay === 'Tue' && joinRow.hostGroup === 'C2', 'join day and host group captured');
assert(joinRow.site === (srmc.shortName || srmc.name), 'row uses facility shortName');
assert(joinRow.contentTags.indexOf('MS') >= 0, 'row carries facility contentTags');
assert(joinRow.appliedByName === 'Admin A', 'provenance appliedByName included');

var w18Row = rows.find(function (r) { return r.studentName === s1.name; });
assert(w18Row && w18Row.week18Fallback === true, 'week-18 fallback flagged');

var simRow = rows.find(function (r) { return r.studentName === s2.name; });
assert(simRow && simRow.type === 'Simulation' && simRow.simNum === 3, 'sim row typed with sim number');
assert(simRow.clinicalConflict === true && simRow.overload === true, 'sim conflict + overload flags kept');

// ------------------------------------------------- requirements summary
var summary = App.AuditExport.buildRequirementsSummary(sem);
assert(summary.length === sem.students.length, 'summary covers every student');
var validation = App.Validator.validateAll(sem);
summary.forEach(function (r) {
  var student = sem.students.find(function (s) { return s.name === r.studentName; });
  var stats = App.DataModel.countStats(student);
  if (r.clinicals !== stats.clinicals || r.sims !== stats.sims) {
    assert(false, 'summary counts match countStats for ' + r.studentName);
  }
  var v = validation.students[student.id];
  if (r.met !== !!(v && v.valid)) {
    assert(false, 'summary met flag matches validator for ' + r.studentName);
  }
});
assert(true, 'summary counts and met flags match Validator/countStats');

// sorted by name
for (var i = 1; i < summary.length; i++) {
  if (summary[i - 1].studentName.localeCompare(summary[i].studentName) > 0) {
    assert(false, 'requirements summary sorted by student name');
    break;
  }
}
assert(true, 'requirements summary sorted');

// ------------------------------------------------------------- pdf filename
sem.meta.semesterSeason = 'fall';
sem.meta.semesterYear = 2026;
assert(App.AuditExport.suggestedPdfName(sem, 2) === 'Fall-2026-REGN15P-Audit-v2.pdf',
  'suggested PDF name follows {Season}-{Year}-{courseId}-Audit-v{n}.pdf');

// ------------------------------------------------ legacy facility migration
var legacy = {
  id: 'legacy1',
  meta: { semesterName: 'Spring 2025', finalized: true },
  config: App.DataModel.defaultConfig(),
  facilities: [
    { id: 'f1', name: 'Shasta Regional Medical Center' },
    { id: 'f2', name: 'Some Unknown Hospital' }
  ],
  students: [{
    id: 's1', name: 'Legacy Student', clinicalGroup: 'C1', simGroup: 'SG1',
    schedule: [], absences: [],
    makeups: [{ weekIndex: 4, type: 'clinical' }]
  }]
};
var migrated = App.DataModel.migrateSemester(JSON.parse(JSON.stringify(legacy)));

migrated.facilities.forEach(function (f) {
  if (!Array.isArray(f.contentTags) || !f.contentTags.length) {
    assert(false, 'facility ' + f.name + ' gets contentTags');
  }
});
assert(true, 'all migrated facilities have contentTags');
var unknownFac = migrated.facilities.find(function (f) { return /unknown/i.test(f.name); });
assert(unknownFac && unknownFac.contentTags.join(',') === 'MS',
  'legacy facility without tags defaults to ["MS"]');
var knownFac = migrated.facilities.find(function (f) { return /shasta/i.test(f.name); });
assert(knownFac && knownFac.siteId === 'site_srmc', 'known facility matched to site library by name');
assert(knownFac.shortName === 'SRMC', 'matched facility inherits library shortName');

// ---------------------------------------------------- audit meta migration
assert(migrated.meta.auditPhase === 'active', 'finalized:true migrates to auditPhase active');
assert(migrated.meta.courseId === '', 'legacy semester gets empty courseId');
assert(migrated.meta.leadFaculty && migrated.meta.leadFaculty.name === '', 'leadFaculty backfilled');
assert(migrated.meta.makeupAttestation && migrated.meta.makeupAttestation.attestedAt === null,
  'makeupAttestation backfilled unattested');
assert(migrated.meta.auditExport && migrated.meta.auditExport.exportVersion === 0,
  'auditExport backfilled at version 0');
assert(migrated.meta.lock && migrated.meta.lock.lockedAt === null, 'never auto-locked on migration');
assert(migrated.students.length === 1 && migrated.students[0].name === 'Legacy Student',
  'no student data loss in migration');
var legacyMakeup = migrated.students[0].makeups[0];
assert(!!legacyMakeup.id, 'legacy makeup gets id backfilled');
assert(legacyMakeup.appliedAt === null, 'legacy makeup keeps appliedAt null');

var unfinalized = App.DataModel.migrateSemester({
  id: 'legacy2',
  meta: { semesterName: 'Fall 2025' },
  config: App.DataModel.defaultConfig(),
  students: []
});
assert(unfinalized.meta.auditPhase === 'setup', 'non-finalized legacy semester migrates to setup');

// ------------------------------------------------------- course defaults
['REGN15P', 'REGN25P', 'REGN35P-36P', 'REGN48P'].forEach(function (courseId) {
  var course = App.CourseDefaults.get(courseId);
  assert(course && course.courseId === courseId, 'course defaults exist for ' + courseId);
  var target = App.DataModel.createDefaultSemester();
  App.CourseDefaults.applyToSemester(target, courseId);
  assert(target.meta.courseId === courseId, 'applyToSemester sets courseId ' + courseId);
  assert(target.config && target.config.clinicalGroups.length > 0,
    'applyToSemester leaves a valid config for ' + courseId);
});

// ------------------------------------------------------------ audit gating
var gated = makeSemester();
assert(App.Audit.getPhase(gated) === 'setup', 'new semester starts in setup');
assert(App.Audit.canEdit(gated, 'setup'), 'setup phase is editable');
assert(App.Audit.transitionError(gated, 'active') !== null,
  'cannot open semester without lead faculty');
gated.meta.leadFaculty.name = 'Lead Faculty';
assert(App.Audit.transitionError(gated, 'active') === null, 'open allowed with lead faculty');
assert(App.Audit.setPhase(gated, 'active'), 'setup -> active');
assert(App.Audit.setPhase(gated, 'locked') === false, 'active -> locked rejected');
assert(App.Audit.setPhase(gated, 'makeup_review'), 'active -> makeup_review');
assert(App.Audit.canEdit(gated, 'makeup'), 'makeup_review still editable');
assert(App.Audit.transitionError(gated, 'audit_exported') !== null,
  'export blocked before attestation');
gated.meta.makeupAttestation = {
  attestedAt: new Date().toISOString(), attestedByName: 'Lead Faculty',
  attestedByEmail: '', notes: ''
};
assert(App.Audit.setPhase(gated, 'audit_exported'), 'attested review -> audit_exported');
assert(!App.Audit.canEdit(gated, 'setup'), 'audit_exported blocks setup edits');
assert(!App.Audit.canEdit(gated, 'makeup'), 'audit_exported blocks makeup edits');
assert(!App.Audit.canEdit(gated, 'masterCell'), 'audit_exported blocks master cell edits');
assert(App.Audit.transitionError(gated, 'locked') !== null, 'lock blocked before export recorded');
gated.meta.auditExport = {
  exportedAt: new Date().toISOString(), exportedByName: 'Admin',
  snapshotHash: 'abc', appVersion: 'test', exportVersion: 1
};
assert(App.Audit.setPhase(gated, 'locked', { actorName: 'Admin' }), 'exported -> locked');
assert(App.Audit.isLocked(gated), 'locked semester reports isLocked');
assert(gated.meta.lock.lockedByName === 'Admin', 'lock records actor');
assert(App.Audit.setPhase(gated, 'active') === false, 'locked is terminal');

console.log('\nAudit export tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
